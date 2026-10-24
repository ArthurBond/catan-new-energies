/**
 * CATAN: New Energies — which dice rolls give a player which cards
 *
 * Shown while a player picks cards to discard on a 7, so the choice can be an informed one:
 * "my steel only comes on 4 and 10". Mirrors `evaluateProduction` in the engine: a town gives
 * one card of its hex's resource, a city also gives one science, and nothing is given while the
 * hex holds a hazard or the Inspector, or while the building itself is under a hazard.
 */

import { TERRAIN_RESOURCE_MAP } from '../engine/setup';
import type { GameState, HexId, PlayerId, ResourceType } from '../engine/types';

export type CardKey = ResourceType | 'science';

export type BlockedBy = 'hazard' | 'inspector' | 'building';

export const BLOCKED_LABEL: Record<BlockedBy, string> = {
  hazard: 'blocked by a hazard on the hex',
  inspector: 'blocked by the inspector',
  building: 'blocked by a hazard on your building',
};

export interface ProducingNumber {
  /** The dice total on the hex's number disc */
  number: number;
  /** How many cards one such roll gives (one per town or city touching a hex with that number) */
  count: number;
  /** Why a roll of this number gives nothing right now, or null when it pays out */
  blockedBy: BlockedBy | null;
}

export interface ProductionNumbers {
  /** Hexes with a number disc that touch one of the player's towns or cities */
  hexIds: HexId[];
  /** Per card type, the numbers that give it (unblocked first, each group in ascending order) */
  byCard: Record<CardKey, ProducingNumber[]>;
}

const CARD_KEYS: CardKey[] = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'];

export function getProductionNumbers(state: GameState, playerId: PlayerId): ProductionNumbers {
  const { board } = state;
  const hexIds = new Set<HexId>();
  const tally = new Map<CardKey, Map<string, ProducingNumber>>(CARD_KEYS.map((k) => [k, new Map()]));

  const add = (card: CardKey, number: number, blockedBy: BlockedBy | null) => {
    const group = tally.get(card)!;
    const key = `${number}:${blockedBy ?? ''}`;
    const entry = group.get(key);
    if (entry) entry.count++;
    else group.set(key, { number, count: 1, blockedBy });
  };

  for (const node of board.intersections) {
    if (node.building?.playerId !== playerId) continue;
    for (const hexId of node.adjacentHexIds) {
      const hex = board.hexes[hexId]!;
      const resource = TERRAIN_RESOURCE_MAP[hex.terrain];
      if (hex.numberDisc === null || resource === null) continue;
      hexIds.add(hexId);
      const blockedBy: BlockedBy | null = hex.hasHazard
        ? 'hazard'
        : hex.hasInspector
          ? 'inspector'
          : node.hasHazard
            ? 'building'
            : null;
      add(resource, hex.numberDisc, blockedBy);
      if (node.building.type === 'city') add('science', hex.numberDisc, blockedBy);
    }
  }

  const byCard = {} as Record<CardKey, ProducingNumber[]>;
  for (const k of CARD_KEYS) {
    byCard[k] = [...tally.get(k)!.values()].sort(
      (a, b) => Number(a.blockedBy !== null) - Number(b.blockedBy !== null) || a.number - b.number
    );
  }
  return { hexIds: [...hexIds].sort((a, b) => a - b), byCard };
}
