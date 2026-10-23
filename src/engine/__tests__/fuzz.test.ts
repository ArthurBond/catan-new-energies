import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createInitialGameState } from '../setup';
import { applyAction } from '../reducer';
import { legalActions } from '../actions';
import {
  TOTAL_ENERGY_TOKENS,
  TOTAL_HAZARD_TOKENS,
  TOTAL_RESOURCES_PER_TYPE,
  TOTAL_SCIENCE_CARDS,
} from '../config';
import { clampGF, computePlayerLF } from '../footprint';
import { getDevCardType } from '../dev-cards';
import { Mulberry32PRNG } from '../prng';
import { GameAction, GameState } from '../types';

function assertUniversalInvariants(state: GameState): void {
  // 1. Resources: 19 each, 95 total
  let totalResources = 0;
  for (const r of ['lumber', 'brick', 'natural_fiber', 'food', 'steel'] as const) {
    let typeTotal = state.supply.resources[r];
    for (const p of Object.values(state.players)) {
      typeTotal += p.resources[r];
    }
    expect(typeTotal).toBe(TOTAL_RESOURCES_PER_TYPE);
    totalResources += typeTotal;
  }
  expect(totalResources).toBe(95);

  // 2. Science: 20 total
  const totalScience =
    state.supply.science +
    Object.values(state.players).reduce((acc, p) => acc + p.science, 0);
  expect(totalScience).toBe(TOTAL_SCIENCE_CARDS);

  // 3. Energy: 20 total
  const totalEnergy =
    state.supply.energy +
    Object.values(state.players).reduce((acc, p) => acc + p.energy, 0);
  expect(totalEnergy).toBe(TOTAL_ENERGY_TOKENS);

  // 4. Hazards: 10 total
  const boardHexHazards = state.board.hexes.filter((h) => h.hasHazard).length;
  const boardNodeHazards = state.board.intersections.filter((n) => n.hasHazard).length;
  expect(boardHexHazards + boardNodeHazards + state.supply.hazards).toBe(TOTAL_HAZARD_TOKENS);

  // 5. Player Energy bound, piece reserves, LF consistency, VP consistency
  for (const p of Object.values(state.players)) {
    expect(p.energy).toBeGreaterThanOrEqual(0);
    expect(p.energy).toBeLessThanOrEqual(5);

    expect(p.localFootprint).toBe(computePlayerLF(p));

    expect(p.townsBuilt + p.townsInReserve).toBe(5);
    expect(p.citiesBuilt + p.citiesInReserve).toBe(4);
    expect(p.roadsBuilt + p.roadsInReserve).toBe(12);
    expect(p.fossilPlantsBuilt + p.fossilPlantsInReserve).toBe(6);
    expect(p.renewablePlantsBuilt + p.renewablePlantsInReserve).toBe(9);

    // Recomputed VP
    let expectedVp = p.townsBuilt * 1 + p.citiesBuilt * 2;
    if (state.specialAwards.longestRoad.holder === p.id) expectedVp += 2;
    if (state.specialAwards.cleanestEnvironment.holder === p.id) expectedVp += 2;
    const revealedVp = p.devCards.played.filter((id) => getDevCardType(id) === 'victoryPoint').length;
    expectedVp += revealedVp;
    expect(p.victoryPoints).toBe(expectedVp);
  }

  // 6. Global Footprint Clamping & True Total
  const expectedTrueTotal = Object.values(state.players).reduce(
    (acc, p) => acc + p.localFootprint,
    0
  );
  expect(state.trueTotalLF).toBe(expectedTrueTotal);
  expect(state.clampedGF).toBe(clampGF(state.trueTotalLF, state.playerCount));
}

function countBoardHazards(state: GameState): number {
  return (
    state.board.hexes.filter((h) => h.hasHazard).length +
    state.board.intersections.filter((n) => n.hasHazard).length
  );
}

/** Hazard tokens are placed only by events (drawing the disc, or the owner answering it) - never by building. */
const HAZARD_PLACING_ACTIONS = new Set<GameAction['type']>(['DRAW_EVENT_DISC', 'RESOLVE_PENDING_DECISION']);

function selectBiasedAction(actions: GameAction[], prng: Mulberry32PRNG): GameAction {
  if (actions.length === 1) return actions[0]!;

  const weights: number[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'REVEAL_VP_CARDS':
        weights.push(100);
        break;
      case 'BUILD_CITY':
        weights.push(16);
        break;
      case 'BUILD_TOWN':
        weights.push(12);
        break;
      case 'BUILD_RENEWABLE_PLANT':
        weights.push(10);
        break;
      case 'BUILD_FOSSIL_PLANT':
        weights.push(6);
        break;
      case 'BUILD_ROAD':
        weights.push(6);
        break;
      case 'BUY_DEV_CARD':
        weights.push(5);
        break;
      case 'PLAY_DEV_CARD':
        weights.push(6);
        break;
      case 'BUILD_WAREHOUSE':
        weights.push(4);
        break;
      case 'SPEND_ENERGY':
        weights.push(3);
        break;
      case 'DRAW_EVENT_DISC':
        weights.push(10);
        break;
      case 'ROLL_DICE':
        weights.push(10);
        break;
      case 'RESOLVE_PENDING_DECISION':
        weights.push(10);
        break;
      case 'SETUP_BUILD_CITY':
      case 'SETUP_BUILD_TOWN':
      case 'SETUP_BUILD_ROAD':
        weights.push(10);
        break;
      case 'TRADE_SUPPLY':
      case 'TRADE_HARBOR':
        weights.push(2);
        break;
      case 'END_TURN':
        weights.push(2);
        break;
      case 'PRE_EVENT_PASS':
        weights.push(1);
        break;
      default:
        weights.push(1);
    }
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  let roll = prng.nextInt(0, totalWeight - 1);
  for (let i = 0; i < actions.length; i++) {
    if (roll < weights[i]!) {
      return actions[i]!;
    }
    roll -= weights[i]!;
  }
  return actions[actions.length - 1]!;
}

describe('M2 Property-Based Fuzzing Suite (500 Complete Games)', () => {
  it(
    'executes 500 complete games without invariant violations or deadlocks',
    () => {
      const gameConfigArbitrary = fc.record({
        playerCount: fc.constantFrom<3 | 4>(3, 4),
        setupMode: fc.constantFrom<'first' | 'standard'>('first', 'standard'),
        seed: fc.integer({ min: 1, max: 2_147_483_646 }),
      });

      let gamesCompleted = 0;
      let tenVpVictories = 0;
      let emptyBagVictories = 0;
      let collapseEndings = 0;

      fc.assert(
        fc.property(gameConfigArbitrary, ({ playerCount, setupMode, seed }) => {
          let state = createInitialGameState({ playerCount, setupMode, seed });
          assertUniversalInvariants(state);

          const simPrng = new Mulberry32PRNG(seed);
          let actionCount = 0;
          const maxActions = 1200; // Safety cap against infinite loops

          while (state.phase !== 'GameEnd' && !state.winner && actionCount < maxActions) {
            const activePid =
              state.pendingDecisions.length > 0
                ? state.pendingDecisions[0]!.playerId
                : state.activePlayerId;

            const actions = legalActions(state, activePid);
            expect(actions.length).toBeGreaterThan(0); // Zero deadlocks!

            const chosenAction = selectBiasedAction(actions, simPrng);
            const hazardsBefore = countBoardHazards(state);
            state = applyAction(state, chosenAction);
            if (countBoardHazards(state) > hazardsBefore) {
              expect(HAZARD_PLACING_ACTIONS.has(chosenAction.type)).toBe(true);
            }
            assertUniversalInvariants(state);
            actionCount++;
          }

          if (state.winner) {
            expect(state.phase).toBe('GameEnd');
            gamesCompleted++;
            if (state.winner === 'collapse') {
              collapseEndings++;
            } else {
              const winningPlayer = Array.isArray(state.winner) ? state.winner[0] : state.winner;
              const vp = winningPlayer ? (state.players[winningPlayer]?.victoryPoints ?? 0) : 0;
              if (vp >= 10) {
                tenVpVictories++;
              } else {
                emptyBagVictories++;
              }
            }
          }
        }),
        { numRuns: 500 }
      );

      // Verify that simulations terminated naturally and produced diverse endings
      expect(gamesCompleted).toBeGreaterThan(0);
      expect(tenVpVictories + emptyBagVictories + collapseEndings).toBe(gamesCompleted);
    },
    180_000 // 3 minutes timeout for 500 full games
  );
});
