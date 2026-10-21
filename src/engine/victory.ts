/**
 * CATAN: New Energies — Dual Victory Conditions Engine
 *
 * Implements:
 * 1. Condition 1: >= 10 Victory Points on own turn (immediate win).
 * 2. Condition 2: Empty Event Bag resolution (only players with Renewable > Fossil eligible,
 *    greatest difference wins, total VP tie-break including unrevealed VP cards, most renewables,
 *    lowest LF, or Environmental Collapse if no eligible players).
 */

import { GameState, PlayerId } from './types';

export interface VictoryResult {
  ended: boolean;
  condition: 'TEN_VP' | 'EMPTY_BAG_BALANCE' | 'ENVIRONMENTAL_COLLAPSE' | null;
  winner: PlayerId | 'collapse' | PlayerId[] | null;
  details: {
    eligiblePlayerIds: PlayerId[];
    scores: Record<
      PlayerId,
      {
        publicVp: number;
        totalVp: number;
        renewableBuilt: number;
        fossilBuilt: number;
        netRenewable: number;
        localFootprint: number;
      }
    >;
  };
}

export function evaluateEmptyBagVictory(state: GameState): VictoryResult {
  const playerIds = state.playerOrder;
  const scores: Record<PlayerId, VictoryResult['details']['scores'][PlayerId]> = {} as Record<
    PlayerId,
    VictoryResult['details']['scores'][PlayerId]
  >;

  for (const pid of playerIds) {
    const p = state.players[pid]!;
    const unrevealedVp = p.devCards.unplayed.filter(
      (id) => id.startsWith('dev_victoryPoint') || id.includes('victoryPoint')
    ).length;

    scores[pid] = {
      publicVp: p.victoryPoints,
      totalVp: p.victoryPoints + unrevealedVp,
      renewableBuilt: p.renewablePlantsBuilt,
      fossilBuilt: p.fossilPlantsBuilt,
      netRenewable: p.renewablePlantsBuilt - p.fossilPlantsBuilt,
      localFootprint: p.localFootprint,
    };
  }

  // 1. Eligibility filter: strictly more renewables than fossil plants (R L836-844)
  const eligible = playerIds.filter((pid) => scores[pid]!.netRenewable > 0);

  // 2. Collapse check: if no players are eligible, all players lose! (R L851-854)
  if (eligible.length === 0) {
    return {
      ended: true,
      condition: 'ENVIRONMENTAL_COLLAPSE',
      winner: 'collapse',
      details: { eligiblePlayerIds: [], scores },
    };
  }

  // 3. Greatest net renewable difference (Renewables - Fossil)
  const maxNet = Math.max(...eligible.map((pid) => scores[pid]!.netRenewable));
  const tiedNet = eligible.filter((pid) => scores[pid]!.netRenewable === maxNet);

  if (tiedNet.length === 1) {
    return {
      ended: true,
      condition: 'EMPTY_BAG_BALANCE',
      winner: tiedNet[0]!,
      details: { eligiblePlayerIds: eligible, scores },
    };
  }

  // 4. Tie-breaker 1: Highest total Victory Points (including unrevealed VP cards in hand)
  const maxVp = Math.max(...tiedNet.map((pid) => scores[pid]!.totalVp));
  const tiedVp = tiedNet.filter((pid) => scores[pid]!.totalVp === maxVp);

  if (tiedVp.length === 1) {
    return {
      ended: true,
      condition: 'EMPTY_BAG_BALANCE',
      winner: tiedVp[0]!,
      details: { eligiblePlayerIds: eligible, scores },
    };
  }

  // 5. Tie-breaker 2: Most Renewable Plants Built
  const maxRenewable = Math.max(...tiedVp.map((pid) => scores[pid]!.renewableBuilt));
  const tiedRenewable = tiedVp.filter((pid) => scores[pid]!.renewableBuilt === maxRenewable);

  if (tiedRenewable.length === 1) {
    return {
      ended: true,
      condition: 'EMPTY_BAG_BALANCE',
      winner: tiedRenewable[0]!,
      details: { eligiblePlayerIds: eligible, scores },
    };
  }

  // 6. Tie-breaker 3: Lowest Local Footprint
  const minLf = Math.min(...tiedRenewable.map((pid) => scores[pid]!.localFootprint));
  const finalWinners = tiedRenewable.filter((pid) => scores[pid]!.localFootprint === minLf);

  return {
    ended: true,
    condition: 'EMPTY_BAG_BALANCE',
    winner: finalWinners.length === 1 ? finalWinners[0]! : finalWinners,
    details: { eligiblePlayerIds: eligible, scores },
  };
}

/**
 * Check if the active player has reached 10 VP on their own turn.
 */
export function checkOwnTurnVictory(state: GameState): GameState {
  if (state.phase === 'GameEnd' || state.winner !== null) {
    return state;
  }

  const activePlayer = state.players[state.activePlayerId];
  if (!activePlayer) return state;

  if (activePlayer.victoryPoints >= 10) {
    state.winner = state.activePlayerId;
    state.phase = 'GameEnd';
    state.log.push({
      timestamp: state.log.length,
      message: `${activePlayer.name} has achieved ${activePlayer.victoryPoints} Victory Points on their turn and wins the game!`,
    });
  }

  return state;
}
