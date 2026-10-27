/**
 * CATAN: New Energies — Multiplayer State Redaction
 *
 * Implements SEC-01:
 * Hides private information from the client to prevent cheating/leaks:
 * - Opponent unplayed development card identities (only count is visible).
 * - Opponent face-down hidden green discs under renewable plants (only count is visible).
 * - Development deck order in supply (only length is visible).
 * - Event bag order (only length is visible).
 * - PRNG state (seed and calls are hidden).
 * - Tracks `hiddenResourcesCount` (total resource + science cards in hand) and optionally
 *   masks opponent resource/science breakdown when `hideOpponentResources` is enabled.
 * - Identities of development cards bought this turn (`devCardsBoughtThisTurn`) unless the
 *   viewer owns them (other viewers see the placeholder 'hidden').
 * - Log lines that name a private card (`GameEventLog.private`): with hidden hands, each seat gets
 *   the text it may read (`logMessageFor`) and the `private` field is always stripped.
 * - A `null` viewer (spectator / unseated socket) sees every hand redacted.
 * - Once the game is over nothing about the players is hidden any more (see `isGameOver`): every
 *   hand, dev card and face-down green disc is revealed to every viewer, because the final
 *   standings count unrevealed Victory Point cards. The dev deck, event bag and PRNG stay hidden.
 */

import { GameAction, GameEventLog, GameState, PlayerId, PlayerState } from '../engine/types';

export interface RedactOptions {
  hideOpponentResources?: boolean;
}

export interface RedactedPlayerState extends Omit<PlayerState, 'devCards' | 'hiddenGreenDiscs'> {
  devCards: {
    unplayedCount: number;
    unplayed?: string[];
    played: string[];
  };
  hiddenGreenDiscsCount: number;
  hiddenGreenDiscs?: string[];
  hiddenResourcesCount: number;
}

export interface RedactedGameState
  extends Omit<GameState, 'players' | 'supply' | 'prng' | 'eventBag' | 'log'> {
  log: Omit<GameEventLog, 'private'>[];
  players: Record<PlayerId, RedactedPlayerState>;
  supply: Omit<GameState['supply'], 'devDeck'> & {
    devDeckCount: number;
    devDeck?: string[];
  };
  eventBagCount: number;
  eventBag?: string[];
  prng?: undefined;
}

function computeTotalHandCards(p: PlayerState): number {
  return (
    p.resources.lumber +
    p.resources.brick +
    p.resources.natural_fiber +
    p.resources.food +
    p.resources.steel +
    p.science
  );
}

/** True once the game has a winner (or ended on the empty bag): all player secrets are revealed. */
export function isGameOver(state: Pick<GameState, 'phase' | 'winner'>): boolean {
  return state.phase === 'GameEnd' || state.winner !== null;
}

/** Placeholder that replaces dev card ids the viewer is not allowed to see. */
export const HIDDEN_DEV_CARD_ID = 'hidden';

/**
 * The text of a log line for one viewer (null: nobody at the device, or a spectator).
 * Lines without a `private` field read the same for everyone.
 */
export function logMessageFor(entry: GameEventLog, viewerId: PlayerId | null): string {
  if (!entry.private) return entry.message;
  return viewerId !== null && entry.private.playerIds.includes(viewerId)
    ? entry.message
    : entry.private.publicMessage;
}

/** A move as another seat may see it: a supply or harbor trade can leave out the card received. */
export type RedactedGameAction =
  | Exclude<GameAction, { type: 'TRADE_SUPPLY' | 'TRADE_HARBOR' }>
  | Omit<Extract<GameAction, { type: 'TRADE_SUPPLY' }>, 'receive'>
  | Omit<Extract<GameAction, { type: 'TRADE_HARBOR' }>, 'receive'>;

const hasCardType = (v: unknown): boolean => typeof v === 'object' && v !== null && 'cardType' in v;

/**
 * The move that produced a state, as one viewer may see it. With hidden hands another player's
 * private pick (the card taken in a trade, bought with energy, from a Research Grant or from an
 * event) is left out, as it is in the log (`logMessageFor`). Clients only use the move to say what
 * happened.
 */
export function redactActionFor(
  action: GameAction | null,
  viewerId: PlayerId | null,
  options?: RedactOptions
): RedactedGameAction | null {
  if (!action || !options?.hideOpponentResources || action.playerId === viewerId) return action;
  switch (action.type) {
    case 'TRADE_SUPPLY':
    case 'TRADE_HARBOR': {
      const { receive: _receive, ...rest } = action;
      return rest;
    }
    case 'SPEND_ENERGY': {
      if (!action.params?.cardType) return action;
      const { cardType: _cardType, ...params } = action.params;
      return { ...action, params };
    }
    case 'PLAY_DEV_CARD':
      return hasCardType(action.params) && (action.params as { cardType: unknown }).cardType === 'researchGrant'
        ? { ...action, params: { cardType: 'researchGrant' } }
        : action;
    case 'RESOLVE_PENDING_DECISION':
      // Event card choices answer with { cardType }; trade replies and the rest name no hidden card
      return hasCardType(action.response) ? { ...action, response: {} } : action;
    default:
      return action;
  }
}

export function redactForPlayer(
  state: GameState,
  viewerId: PlayerId | null,
  options?: RedactOptions
): RedactedGameState {
  const cloned: GameState = structuredClone(state);
  const revealAll = isGameOver(cloned);

  const redactedPlayers: Record<PlayerId, RedactedPlayerState> = {
    orange: undefined as unknown as RedactedPlayerState,
    purple: undefined as unknown as RedactedPlayerState,
    pink: undefined as unknown as RedactedPlayerState,
    blue: undefined as unknown as RedactedPlayerState,
  };

  for (const pid of cloned.playerOrder) {
    const p = cloned.players[pid]!;
    const totalHandCards = computeTotalHandCards(p);

    if (pid === viewerId || revealAll) {
      redactedPlayers[pid] = {
        ...p,
        devCards: {
          unplayedCount: p.devCards.unplayed.length,
          unplayed: [...p.devCards.unplayed],
          played: [...p.devCards.played],
        },
        hiddenGreenDiscsCount: p.hiddenGreenDiscs.length,
        hiddenGreenDiscs: [...p.hiddenGreenDiscs],
        hiddenResourcesCount: totalHandCards,
      };
    } else {
      const { hiddenGreenDiscs, ...rest } = p;
      const maskedResources = options?.hideOpponentResources
        ? {
            lumber: 0,
            brick: 0,
            natural_fiber: 0,
            food: 0,
            steel: 0,
          }
        : rest.resources;
      const maskedScience = options?.hideOpponentResources ? 0 : rest.science;

      redactedPlayers[pid] = {
        ...rest,
        resources: maskedResources,
        science: maskedScience,
        devCards: {
          unplayedCount: p.devCards.unplayed.length,
          played: [...p.devCards.played],
        },
        hiddenGreenDiscsCount: hiddenGreenDiscs.length,
        hiddenResourcesCount: totalHandCards,
      };
    }
  }

  // Remove blue if 3P
  if (cloned.playerCount === 3) {
    delete (redactedPlayers as Partial<Record<PlayerId, RedactedPlayerState>>).blue;
  }

  const { devDeck: _unusedDeck, ...restSupply } = cloned.supply;
  const { eventBag: _unusedBag, prng: _unusedPrng, ...restCloned } = cloned;

  // Cards bought this turn are listed by id at the top level; only their owner may see them.
  const viewer = viewerId ? cloned.players[viewerId] : undefined;
  const ownCards = new Set<string>(viewer ? [...viewer.devCards.unplayed, ...viewer.devCards.played] : []);
  const maskBought = (ids: string[]) =>
    ids.map((id) => (revealAll || ownCards.has(id) ? id : HIDDEN_DEV_CARD_ID));

  // The secret card never leaves the server: private lines are cut down to the viewer's text, or
  // to the full text when hands are open (hands not hidden, or the game is over).
  const hideLog = Boolean(options?.hideOpponentResources) && !revealAll;
  const log = restCloned.log.map(({ private: priv, ...entry }) => ({
    ...entry,
    message: hideLog ? logMessageFor({ ...entry, private: priv }, viewerId) : entry.message,
  }));

  const redacted: RedactedGameState = {
    ...restCloned,
    log,
    devCardsBoughtThisTurn: maskBought(restCloned.devCardsBoughtThisTurn),
    turnStats: {
      ...restCloned.turnStats,
      devCardsBoughtThisTurn: maskBought(restCloned.turnStats.devCardsBoughtThisTurn),
    },
    players: redactedPlayers,
    supply: {
      ...restSupply,
      devDeckCount: cloned.supply.devDeck.length,
    },
    eventBagCount: cloned.eventBag.length,
    prng: undefined,
  };

  return redacted;
}

/** View for a socket without a seat: no private hand, deck or bag contents at all. */
export function redactForSpectator(state: GameState, options?: RedactOptions): RedactedGameState {
  return redactForPlayer(state, null, options);
}
