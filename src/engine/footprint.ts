/**
 * CATAN: New Energies — Local & Global Footprint Calculations
 *
 * Implements Local Footprint (LF) formula, true total LF aggregation,
 * endpoint-clamped Global Footprint (GF) tracking (0..28 in 4P, 0..21 in 3P),
 * and event disc draw count band lookup.
 */

import { PlayerId, PlayerState } from './types';

export function computePlayerLF(
  player: Pick<PlayerState, 'townsBuilt' | 'citiesBuilt' | 'fossilPlantsBuilt' | 'renewablePlantsBuilt'>
): number {
  return (
    player.townsBuilt * 1 +
    player.citiesBuilt * 2 +
    player.fossilPlantsBuilt * 1 -
    player.renewablePlantsBuilt * 1
  );
}

export function computeTrueTotalLF(
  players: Record<PlayerId, Pick<PlayerState, 'localFootprint'>> | Pick<PlayerState, 'localFootprint'>[]
): number {
  const list = Array.isArray(players) ? players : Object.values(players);
  return list.reduce((acc, p) => acc + p.localFootprint, 0);
}

export function clampGF(trueTotalLF: number, playerCount: 3 | 4): number {
  const maxGF = playerCount === 3 ? 21 : 28;
  return Math.max(0, Math.min(maxGF, trueTotalLF));
}

export function getDrawCountForGF(clampedGF: number, playerCount: 3 | 4): number {
  if (playerCount === 3) {
    if (clampedGF <= 5) return 2;
    if (clampedGF <= 13) return 1;
    if (clampedGF <= 17) return 2;
    return 3;
  } else {
    if (clampedGF <= 5) return 2;
    if (clampedGF <= 17) return 1;
    if (clampedGF <= 23) return 2;
    return 3;
  }
}
