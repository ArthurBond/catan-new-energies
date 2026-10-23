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
 * - A `null` viewer (spectator / unseated socket) sees every hand redacted.
 */

import { GameState, PlayerId, PlayerState } from '../engine/types';

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
  extends Omit<GameState, 'players' | 'supply' | 'prng' | 'eventBag'> {
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

/** Placeholder that replaces dev card ids the viewer is not allowed to see. */
export const HIDDEN_DEV_CARD_ID = 'hidden';

export function redactForPlayer(
  state: GameState,
  viewerId: PlayerId | null,
  options?: RedactOptions
): RedactedGameState {
  const cloned: GameState = structuredClone(state);

  const redactedPlayers: Record<PlayerId, RedactedPlayerState> = {
    orange: undefined as unknown as RedactedPlayerState,
    purple: undefined as unknown as RedactedPlayerState,
    pink: undefined as unknown as RedactedPlayerState,
    blue: undefined as unknown as RedactedPlayerState,
  };

  for (const pid of cloned.playerOrder) {
    const p = cloned.players[pid]!;
    const totalHandCards = computeTotalHandCards(p);

    if (pid === viewerId) {
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
  const maskBought = (ids: string[]) => ids.map((id) => (ownCards.has(id) ? id : HIDDEN_DEV_CARD_ID));

  const redacted: RedactedGameState = {
    ...restCloned,
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
