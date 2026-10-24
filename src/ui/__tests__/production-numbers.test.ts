import { describe, expect, it } from 'vitest';
import { RESOURCE_TYPES } from '../../engine/config';
import { evaluateProduction } from '../../engine/production';
import { createInitialGameState } from '../../engine/setup';
import type { GameState, PlayerId } from '../../engine/types';
import { applyDevScenario } from '../devScenarios';
import { CardKey, getProductionNumbers } from '../productionNumbers';

const CARDS: CardKey[] = [...RESOURCE_TYPES, 'science'];

function scenarioState(): GameState {
  return applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'discard');
}

/** What one roll of `sum` pays `playerId`, according to the engine itself. */
function enginePayout(state: GameState, playerId: PlayerId, sum: number): Record<CardKey, number> {
  // Any two dice that add up to `sum`
  const die1 = Math.min(6, sum - 1);
  const result = evaluateProduction(state.board, state.players, state.supply, [die1, sum - die1], playerId, state.playerOrder);
  const payout = result.payouts[playerId]!;
  const out = {} as Record<CardKey, number>;
  for (const k of RESOURCE_TYPES) out[k] = payout.resources[k] ?? 0;
  out.science = payout.science;
  return out;
}

function helperPayout(state: GameState, playerId: PlayerId, sum: number): Record<CardKey, number> {
  const { byCard } = getProductionNumbers(state, playerId);
  const out = {} as Record<CardKey, number>;
  for (const k of CARDS) {
    out[k] = byCard[k].filter((n) => n.number === sum && n.blockedBy === null).reduce((acc, n) => acc + n.count, 0);
  }
  return out;
}

describe('getProductionNumbers', () => {
  it('lists the rolls behind each card for the showcase table, blocked ones apart', () => {
    const state = scenarioState();
    const { byCard, hexIds } = getProductionNumbers(state, 'orange');
    // Orange: a city and towns by the hills 2 and 8 (hazard), mountains 6, fields 4, forest 10 ...
    expect(hexIds.length).toBeGreaterThan(0);
    for (const id of hexIds) {
      expect(state.board.hexes[id]!.numberDisc).not.toBeNull();
    }
    const entries = (k: CardKey) => byCard[k].map((n) => `${n.number}${n.blockedBy ? ' blocked' : ''}`);
    expect(entries('brick')).toEqual(['2', '8 blocked']);
    expect(entries('lumber')).toEqual(['10']);
    expect(entries('natural_fiber')).toEqual([]);
    expect(entries('steel')).toEqual(['6']);
    // A hex under the hazard shows why
    expect(byCard.brick.find((n) => n.number === 8)?.blockedBy).toBe('hazard');
  });

  it('only gives science for cities', () => {
    const state = scenarioState();
    const { byCard } = getProductionNumbers(state, 'orange');
    const cities = state.board.intersections.filter((n) => n.building?.playerId === 'orange' && n.building.type === 'city');
    expect(cities.length).toBeGreaterThan(0);
    const numbers = new Set(byCard.science.map((n) => n.number));
    for (const n of numbers) {
      const touched = cities.some((c) => c.adjacentHexIds.some((h) => state.board.hexes[h]!.numberDisc === n));
      expect(touched).toBe(true);
    }
  });

  it('pays exactly what the engine pays, whatever is blocked', () => {
    // Deterministic shuffle of hazards, the inspector and towns turned into cities
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let round = 0; round < 40; round++) {
      const state = scenarioState();
      for (const h of state.board.hexes) {
        h.hasInspector = false;
        h.hasHazard = rnd() < 0.2;
      }
      state.board.hexes[Math.floor(rnd() * 19)]!.hasInspector = true;
      for (const n of state.board.intersections) {
        if (!n.building) continue;
        n.hasHazard = rnd() < 0.25;
        if (rnd() < 0.4) n.building.type = 'city';
      }
      for (const pid of state.playerOrder) {
        for (let sum = 2; sum <= 12; sum++) {
          if (sum === 7) continue;
          expect(helperPayout(state, pid, sum), `${pid} on ${sum}, round ${round}`).toEqual(enginePayout(state, pid, sum));
        }
      }
    }
  });
});
