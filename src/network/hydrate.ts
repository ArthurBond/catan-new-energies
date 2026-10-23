/**
 * CATAN: New Energies — turn the server's redacted view back into a `GameState` the UI can render.
 *
 * The server (`server/room.ts`) sends each socket `redactForPlayer(state, me)`: no dev deck, no
 * event bag, no PRNG, and other players' secret cards only as counts. The UI components were
 * written for a full `GameState`, so this adapter fills every hidden list with placeholders of the
 * right length. Never send anything derived from a placeholder back to the server (it re-validates
 * every action anyway), and only use `legalActions` on the result for the viewer's own options.
 */

import type { EventDiscType, GameState, PlayerId, PlayerState } from '../engine/types';
import { HIDDEN_DEV_CARD_ID, type RedactedGameState } from './redact';

/** Stands in for any card or disc the viewer may not see. */
export const PLACEHOLDER_CARD_ID = HIDDEN_DEV_CARD_ID;

/** Stands in for the discs still in the bag (only the count is known). */
export const PLACEHOLDER_EVENT_DISC: EventDiscType = 'climateConference';

/** Extra fields a hydrated player carries; plain `GameState` players never have them. */
export interface HydratedPlayerExtras {
  /** Resource + science cards in hand, as everyone at the table can see. */
  hiddenResourcesCount?: number;
  /** True when `resources` / `science` are blanked out because the hand belongs to someone else. */
  handHidden?: boolean;
}

export type HydratedPlayerState = PlayerState & HydratedPlayerExtras;

function placeholders(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, () => PLACEHOLDER_CARD_ID);
}

/**
 * A renderable `GameState` from the server's view for `viewerId` (null for a spectator).
 * Other players' resource breakdown stays blank; read their hand size with `playerHandCount`.
 */
export function hydrateRedactedState(r: RedactedGameState, viewerId: PlayerId | null): GameState {
  const players = {} as Record<PlayerId, PlayerState>;
  for (const pid of r.playerOrder) {
    const p = r.players[pid];
    if (!p) continue;
    const { devCards, hiddenGreenDiscs, hiddenGreenDiscsCount, hiddenResourcesCount, ...rest } = p;
    const hydrated: HydratedPlayerState = {
      ...rest,
      resources: { ...rest.resources },
      devCards: {
        unplayed: devCards.unplayed ? [...devCards.unplayed] : placeholders(devCards.unplayedCount),
        played: [...devCards.played],
      },
      hiddenGreenDiscs: hiddenGreenDiscs ? [...hiddenGreenDiscs] : placeholders(hiddenGreenDiscsCount),
      hiddenResourcesCount,
      handHidden: pid !== viewerId,
    };
    players[pid] = hydrated;
  }

  const {
    players: _players,
    supply,
    eventBagCount,
    eventBag: _eventBag,
    prng: _prng,
    ...rest
  } = r;
  const { devDeckCount, devDeck: _devDeck, ...restSupply } = supply;

  return {
    ...rest,
    players,
    supply: { ...restSupply, devDeck: placeholders(devDeckCount) },
    eventBag: Array.from({ length: Math.max(0, eventBagCount) }, () => PLACEHOLDER_EVENT_DISC),
    // Only the server rolls; the UI never draws from this.
    prng: { seed: 0, calls: 0 },
  };
}

/** Cards in a player's hand (resources + science), also when the breakdown is hidden. */
export function playerHandCount(p: PlayerState): number {
  const known = (p as HydratedPlayerState).hiddenResourcesCount;
  if (typeof known === 'number') return known;
  return (
    p.resources.lumber +
    p.resources.brick +
    p.resources.natural_fiber +
    p.resources.food +
    p.resources.steel +
    p.science
  );
}

/** True when this player's resource and science breakdown is not known to the viewer. */
export function isHandHidden(p: PlayerState): boolean {
  return (p as HydratedPlayerState).handHidden === true;
}
