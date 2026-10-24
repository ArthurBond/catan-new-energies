/**
 * CATAN: New Energies — Challenger 2 Empirical Stress Test Suite (Milestone 1 Iteration 2)
 *
 * Exhaustive empirical verification of:
 * 1. PRNG state restoration & elimination of double-stepping defect
 * 2. Multi-turn stream parity (50 consecutive turns) against uninterrupted reference generator
 * 3. JSON serialization roundtrip & unsigned 32-bit fidelity
 * 4. O(1) performance of Mulberry32PRNG state restoration (< 1 ms with calls: 1,000,000)
 * 5. Component conservation across 100 random setup generations (3P/4P, First Game & Standard Draft)
 * 6. Footprint math, endpoint clamping ([0, 28] in 4P, [0, 21] in 3P), and trueTotalLF tracking
 */

import { describe, expect, it } from 'vitest';
import {
  BROWN_EVENT_DISC_COUNTS,
  PLAYER_PIECE_RESERVES,
  RESOURCE_TYPES,
  TOTAL_BROWN_DISCS,
  TOTAL_DEV_CARDS,
  TOTAL_ENERGY_TOKENS,
  TOTAL_GREEN_DISCS_3P,
  TOTAL_GREEN_DISCS_4P,
  TOTAL_HAZARD_TOKENS,
  TOTAL_RESOURCES_PER_TYPE,
  TOTAL_SCIENCE_CARDS,
} from '../config';
import { legalActions } from '../actions';
import { clampGF, computePlayerLF, computeTrueTotalLF, getDrawCountForGF } from '../footprint';
import { Mulberry32PRNG } from '../prng';
import { applyAction } from '../reducer';
import {
  createInitialEventBag,
  createInitialGameState,
  createInitialSupply,
  dealGreenDiscs,
  STANDARD_TERRAIN_TILES,
} from '../setup';
import { GameState } from '../types';

function assertComponentConservation(state: GameState): void {
  const activePlayers = state.playerOrder.map((pid) => state.players[pid]!);

  // 1. Resource cards conservation (19 per type = 95 total)
  for (const res of RESOURCE_TYPES) {
    const playerSum = activePlayers.reduce((acc, p) => acc + p.resources[res], 0);
    const supplyCount = state.supply.resources[res];
    expect(playerSum + supplyCount).toBe(TOTAL_RESOURCES_PER_TYPE);
  }

  const totalResourcesInGame = RESOURCE_TYPES.reduce((acc, res) => {
    const pSum = activePlayers.reduce((pAcc, p) => pAcc + p.resources[res], 0);
    return acc + pSum + state.supply.resources[res];
  }, 0);
  expect(totalResourcesInGame).toBe(TOTAL_RESOURCES_PER_TYPE * 5); // 95

  // 2. Science cards conservation (20 total)
  const playerScienceSum = activePlayers.reduce((acc, p) => acc + p.science, 0);
  expect(playerScienceSum + state.supply.science).toBe(TOTAL_SCIENCE_CARDS);

  // 3. Energy tokens conservation (20 total)
  const playerEnergySum = activePlayers.reduce((acc, p) => acc + p.energy, 0);
  expect(playerEnergySum + state.supply.energy).toBe(TOTAL_ENERGY_TOKENS);

  // 4. Hazard tokens conservation (10 total)
  let boardHazards = 0;
  state.board.hexes.forEach((hex) => {
    if (hex.hasHazard) boardHazards++;
  });
  state.board.intersections.forEach((node) => {
    if (node.hasHazard) boardHazards++;
  });
  expect(boardHazards + state.supply.hazards).toBe(TOTAL_HAZARD_TOKENS);

  // 5. Brown event discs conservation (43 total in event bag)
  expect(state.eventBag.length).toBe(TOTAL_BROWN_DISCS);
  const brownCounts: Record<string, number> = {};
  for (const disc of state.eventBag) {
    brownCounts[disc] = (brownCounts[disc] ?? 0) + 1;
  }
  expect(brownCounts.climateConference).toBe(BROWN_EVENT_DISC_COUNTS.climateConference);
  expect(brownCounts.rainAndFlooding).toBe(BROWN_EVENT_DISC_COUNTS.rainAndFlooding);
  expect(brownCounts.airPollution).toBe(BROWN_EVENT_DISC_COUNTS.airPollution);
  expect(brownCounts.productionIncrease).toBe(BROWN_EVENT_DISC_COUNTS.productionIncrease);
  expect(brownCounts.environmentalPollution).toBe(BROWN_EVENT_DISC_COUNTS.environmentalPollution);

  // 6. Green event discs conservation (36 in 4P, 27 in 3P)
  const expectedGreenTotal = state.playerCount === 4 ? TOTAL_GREEN_DISCS_4P : TOTAL_GREEN_DISCS_3P;
  const totalHiddenGreen = activePlayers.reduce((acc, p) => acc + p.hiddenGreenDiscs.length, 0);
  expect(totalHiddenGreen).toBe(expectedGreenTotal);
  activePlayers.forEach((p) => {
    expect(p.hiddenGreenDiscs.length).toBe(9);
  });

  // 7. Dev deck conservation (25 total)
  const playerDevCardSum = activePlayers.reduce(
    (acc, p) => acc + p.devCards.unplayed.length + p.devCards.played.length,
    0
  );
  expect(playerDevCardSum + state.supply.devDeck.length).toBe(TOTAL_DEV_CARDS);

  // 8. Player piece conservation
  activePlayers.forEach((p) => {
    expect(p.townsBuilt + p.townsInReserve).toBe(PLAYER_PIECE_RESERVES.towns);
    expect(p.citiesBuilt + p.citiesInReserve).toBe(PLAYER_PIECE_RESERVES.cities);
    expect(p.roadsBuilt + p.roadsInReserve).toBe(PLAYER_PIECE_RESERVES.roads);
    expect(p.fossilPlantsBuilt + p.fossilPlantsInReserve).toBe(PLAYER_PIECE_RESERVES.fossilPlants);
    expect(p.renewablePlantsBuilt + p.renewablePlantsInReserve).toBe(PLAYER_PIECE_RESERVES.renewablePlants);
  });
}

function resolvePendingDecisionsForStreamParity(state: GameState): GameState {
  while (state.pendingDecisions.length > 0) {
    const head = state.pendingDecisions[0]!;
    if (head.type === 'MOVE_INSPECTOR') {
      const safeHex =
        state.board.hexes.find(
          (h) =>
            !h.hasHazard &&
            !h.hasInspector &&
            !state.board.intersections.some(
              (n) => n.adjacentHexIds.includes(h.id) && n.building && n.building.playerId !== head.playerId
            )
        ) || state.board.hexes.find((h) => !h.hasHazard && !h.hasInspector)!;

      state = applyAction(state, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: head.playerId,
        decisionId: head.id,
        response: { hexId: safeHex.id },
      });
    } else {
      const actions = legalActions(state, head.playerId);
      if (actions.length > 0) {
        state = applyAction(state, actions[0]!);
      } else {
        break;
      }
    }
  }
  return state;
}

describe('Challenger 2 Empirical Verification: Milestone 1 Iteration 2', () => {
  describe('CHALLENGE 1: Mulberry32PRNG Reconstruction & Double-Stepping Remediation', () => {
    it('eliminates double-stepping: reconstructed generator matches uninterrupted generator bit-for-bit', () => {
      const testSeeds = [0, 1, 42, 1337, 2147483647, 0xdeadbeef, 0xffffffff];
      const stepCounts = [0, 1, 2, 5, 10, 50, 100, 500, 1000];

      for (const seed of testSeeds) {
        for (const initialSteps of stepCounts) {
          const continuousRef = new Mulberry32PRNG(seed);
          for (let i = 0; i < initialSteps; i++) {
            continuousRef.next();
          }

          const savedState = continuousRef.getState();
          expect(savedState.calls).toBe(initialSteps);

          // Reconstruct using static fromState
          const rebuilt = Mulberry32PRNG.fromState(savedState);
          expect(rebuilt.getState()).toEqual(savedState);

          // Assert next 100 values match continuousRef bit-for-bit
          for (let step = 0; step < 100; step++) {
            const expected = continuousRef.next();
            const actual = rebuilt.next();
            expect(actual).toBe(expected);
          }

          expect(rebuilt.getState().calls).toBe(continuousRef.getState().calls);
          expect(rebuilt.getState().seed).toBe(continuousRef.getState().seed);
        }
      }
    });

    it('ensures nextInt, rollDice, shuffle, and pickRandom match reference after reconstruction', () => {
      const seed = 987654321;
      const ref = new Mulberry32PRNG(seed);
      for (let i = 0; i < 47; i++) {
        ref.next();
      }

      const rebuilt = Mulberry32PRNG.fromState(ref.getState());

      // nextInt
      for (let i = 0; i < 20; i++) {
        expect(rebuilt.nextInt(1, 100)).toBe(ref.nextInt(1, 100));
      }

      // rollDice
      for (let i = 0; i < 20; i++) {
        expect(rebuilt.rollDice()).toEqual(ref.rollDice());
      }

      // shuffle
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(rebuilt.shuffle(arr)).toEqual(ref.shuffle(arr));

      // pickRandom
      const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
      for (let i = 0; i < 10; i++) {
        expect(rebuilt.pickRandom(items)).toBe(ref.pickRandom(items));
      }

      expect(rebuilt.getState()).toEqual(ref.getState());
    });
  });

  describe('CHALLENGE 2: Multi-Turn Stream Parity Across 50 Consecutive Turns in applyAction', () => {
    it('preserves bit-for-bit dice stream parity across 50 consecutive turns (4P First Game)', () => {
      const seed = 42;
      let state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed });

      // Build continuous un-serialized reference generator matching setup sequence
      const refPrng = new Mulberry32PRNG(seed);
      const supply = createInitialSupply();
      refPrng.shuffle(supply.devDeck);
      dealGreenDiscs(refPrng, 4);
      createInitialEventBag(refPrng);

      // Verify PRNG states match before turns begin
      expect(state.prng).toEqual(refPrng.getState());
      state.eventBag = Array(300).fill('climateConference');

      const numTurns = 50;
      for (let t = 0; t < numTurns; t++) {
        const activePid = state.activePlayerId;

        // 1. Draw Event Disc
        state = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: activePid });

        // Simulate network/storage serialization roundtrip before dice roll
        state = JSON.parse(JSON.stringify(state));

        // 2. Roll Dice via reducer (reconstructs PRNG from serialized state)
        state = applyAction(state, { type: 'ROLL_DICE', playerId: activePid });

        // Expected roll from uninterrupted reference generator
        const expectedDice = refPrng.rollDice();

        // Extract dice roll from game event log
        const lastLog = state.log[state.log.length - 1]!.message;
        const match = lastLog.match(/rolled \d+ \((\d), (\d)\)/);
        expect(match).not.toBeNull();
        const actualDice = [parseInt(match![1]!, 10), parseInt(match![2]!, 10)];

        expect(actualDice).toEqual(expectedDice);
        expect(state.prng.seed).toBe(refPrng.getState().seed);
        expect(state.prng.calls).toBe(refPrng.getState().calls);
        expect(state.prng).toEqual(refPrng.getState());

        // Re-serialize after roll
        state = JSON.parse(JSON.stringify(state));

        // 3. End Turn
        state = resolvePendingDecisionsForStreamParity(state);
        state = applyAction(state, { type: 'END_TURN', playerId: activePid });
      }

      // Exactly 100 dice calls made across 50 turns (2 dice per roll)
      expect(state.prng.calls).toBe(refPrng.getState().calls);
    });

    it('preserves bit-for-bit dice stream parity across 50 consecutive turns (3P First Game)', () => {
      const seed = 99999;
      let state = createInitialGameState({ setupMode: 'first', playerCount: 3, seed });

      const refPrng = new Mulberry32PRNG(seed);
      const supply = createInitialSupply();
      refPrng.shuffle(supply.devDeck);
      dealGreenDiscs(refPrng, 3);
      createInitialEventBag(refPrng);

      expect(state.prng).toEqual(refPrng.getState());
      state.eventBag = Array(300).fill('climateConference');

      const numTurns = 50;
      for (let t = 0; t < numTurns; t++) {
        const activePid = state.activePlayerId;

        state = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: activePid });
        state = JSON.parse(JSON.stringify(state));

        state = applyAction(state, { type: 'ROLL_DICE', playerId: activePid });
        const expectedDice = refPrng.rollDice();

        const lastLog = state.log[state.log.length - 1]!.message;
        const match = lastLog.match(/rolled \d+ \((\d), (\d)\)/);
        expect(match).not.toBeNull();
        const actualDice = [parseInt(match![1]!, 10), parseInt(match![2]!, 10)];

        expect(actualDice).toEqual(expectedDice);
        expect(state.prng).toEqual(refPrng.getState());

        state = resolvePendingDecisionsForStreamParity(state);
        state = applyAction(state, { type: 'END_TURN', playerId: activePid });
      }

      expect(state.prng.calls).toBe(refPrng.getState().calls);
    });

    it('preserves stream parity across 50 turns after 4P Standard Snake Draft', () => {
      const seed = 777;
      let state = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed });

      // Uninterrupted reference matching standard setup
      const refPrng = new Mulberry32PRNG(seed);
      const supply = createInitialSupply();
      refPrng.shuffle(supply.devDeck);
      dealGreenDiscs(refPrng, 4);
      refPrng.shuffle(STANDARD_TERRAIN_TILES);
      createInitialEventBag(refPrng);

      expect(state.prng).toEqual(refPrng.getState());

      // Complete 16-step snake draft using legal actions
      while (state.phase === 'SetupDraft') {
        const activePid = state.pendingDecisions[0]!.playerId;
        const legal = legalActions(state, activePid);
        expect(legal.length).toBeGreaterThan(0);
        state = applyAction(state, legal[0]!);
      }

      expect(state.phase).toBe('EventPhase');
      // PRNG was not touched during draft, should still match refPrng
      expect(state.prng).toEqual(refPrng.getState());
      state.eventBag = Array(300).fill('climateConference');

      // Now run 50 turns
      for (let t = 0; t < 50; t++) {
        const activePid = state.activePlayerId;
        state = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: activePid });
        state = JSON.parse(JSON.stringify(state));

        state = applyAction(state, { type: 'ROLL_DICE', playerId: activePid });
        const expectedDice = refPrng.rollDice();

        const lastLog = state.log[state.log.length - 1]!.message;
        const match = lastLog.match(/rolled \d+ \((\d), (\d)\)/);
        const actualDice = [parseInt(match![1]!, 10), parseInt(match![2]!, 10)];

        expect(actualDice).toEqual(expectedDice);
        expect(state.prng).toEqual(refPrng.getState());

        state = resolvePendingDecisionsForStreamParity(state);
        state = applyAction(state, { type: 'END_TURN', playerId: activePid });
      }
    });
  });

  describe('CHALLENGE 3: JSON Serialization & Roundtrip Invariant Fidelity', () => {
    it('guarantees bit-for-bit identical PRNG output and uint32 range after JSON roundtrip', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 12345678 });
      const serialized = JSON.stringify(state);
      const parsed = JSON.parse(serialized) as GameState;

      // Assert PRNG state survives deep clone perfectly
      expect(parsed.prng).toEqual(state.prng);
      expect(parsed.prng.seed >>> 0).toBe(parsed.prng.seed);
      expect(parsed.prng.seed).toBeGreaterThanOrEqual(0);
      expect(parsed.prng.seed).toBeLessThanOrEqual(0xffffffff);

      const genOriginal = Mulberry32PRNG.fromState(state.prng);
      const genParsed = Mulberry32PRNG.fromState(parsed.prng);

      for (let i = 0; i < 500; i++) {
        expect(genParsed.next()).toBe(genOriginal.next());
      }
    });

    it('handles boundary seeds and states in JSON serialization', () => {
      const boundaryCases = [
        { seed: 0, calls: 0 },
        { seed: 1, calls: 1 },
        { seed: 0x7fffffff, calls: 500 },
        { seed: 0x80000000, calls: 1000 },
        { seed: 0xffffffff, calls: 1000000 },
      ];

      for (const b of boundaryCases) {
        const json = JSON.stringify(b);
        const restored = JSON.parse(json);
        const prng = Mulberry32PRNG.fromState(restored);
        expect(prng.getState()).toEqual(b);
        const val = prng.next();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe('CHALLENGE 4: O(1) Performance of Mulberry32PRNG State Restoration', () => {
    it('restores from a state with calls: 1,000,000 in < 1 ms', () => {
      const savedState = { seed: 0xfeedbeef, calls: 1000000 };

      // Single call timing
      const start = performance.now();
      const prng = Mulberry32PRNG.fromState(savedState);
      const durationMs = performance.now() - start;

      expect(durationMs).toBeLessThan(1.0); // Strict requirement: < 1 ms
      expect(prng.getState()).toEqual(savedState);
    });

    it('proves O(1) complexity across varying call depths (0, 100, 1M, 1B)', () => {
      const callCounts = [0, 100, 1000, 100000, 1000000, 1000000000];
      const iterations = 10000;

      for (const calls of callCounts) {
        const state = { seed: 12345678, calls };
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          Mulberry32PRNG.fromState(state);
        }
        const totalDuration = performance.now() - start;
        const avgPerCall = totalDuration / iterations;

        // Even 10,000 reconstructions should take < 50ms total (< 0.005ms per call)
        expect(totalDuration).toBeLessThan(50);
        expect(avgPerCall).toBeLessThan(0.01);
      }
    });
  });

  describe('CHALLENGE 5: Component Conservation Across 100 Random Setups', () => {
    it('strictly conserves resources (95), science (20), energy (20), hazards (10), brown discs (43), green discs (36 or 27) across 100 games', () => {
      const modes: Array<{ setupMode: 'first' | 'standard'; playerCount: 3 | 4; startSeed: number }> = [
        { setupMode: 'first', playerCount: 4, startSeed: 1000 },
        { setupMode: 'first', playerCount: 3, startSeed: 2000 },
        { setupMode: 'standard', playerCount: 4, startSeed: 3000 },
        { setupMode: 'standard', playerCount: 3, startSeed: 4000 },
      ];

      let totalGamesTested = 0;

      for (const config of modes) {
        for (let i = 0; i < 25; i++) {
          const seed = config.startSeed + i;
          const state = createInitialGameState({
            setupMode: config.setupMode,
            playerCount: config.playerCount,
            seed,
          });

          assertComponentConservation(state);
          totalGamesTested++;
        }
      }

      expect(totalGamesTested).toBe(100);
    });
  });

  describe('CHALLENGE 6: Footprint Clamping & trueTotalLF Tracking', () => {
    it('verifies initial GF and trueTotalLF for 4P First Game (12), 3P First Game (9), and Standard (0)', () => {
      const state4PFirst = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 1 });
      expect(state4PFirst.trueTotalLF).toBe(12);
      expect(state4PFirst.clampedGF).toBe(12);

      const state3PFirst = createInitialGameState({ setupMode: 'first', playerCount: 3, seed: 2 });
      expect(state3PFirst.trueTotalLF).toBe(9);
      expect(state3PFirst.clampedGF).toBe(9);

      const stateStandard = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 3 });
      expect(stateStandard.trueTotalLF).toBe(0);
      expect(stateStandard.clampedGF).toBe(0);
    });

    it('verifies endpoint clamping: [0, 28] for 4P and [0, 21] for 3P with trueTotalLF tracking', () => {
      // 4P: Clamp to [0, 28]
      expect(clampGF(-100, 4)).toBe(0);
      expect(clampGF(-1, 4)).toBe(0);
      expect(clampGF(0, 4)).toBe(0);
      for (let lf = 0; lf <= 28; lf++) {
        expect(clampGF(lf, 4)).toBe(lf);
      }
      expect(clampGF(28, 4)).toBe(28);
      expect(clampGF(29, 4)).toBe(28);
      expect(clampGF(50, 4)).toBe(28);
      expect(clampGF(1000, 4)).toBe(28);

      // 3P: Clamp to [0, 21]
      expect(clampGF(-100, 3)).toBe(0);
      expect(clampGF(-1, 3)).toBe(0);
      expect(clampGF(0, 3)).toBe(0);
      for (let lf = 0; lf <= 21; lf++) {
        expect(clampGF(lf, 3)).toBe(lf);
      }
      expect(clampGF(21, 3)).toBe(21);
      expect(clampGF(22, 3)).toBe(21);
      expect(clampGF(50, 3)).toBe(21);
      expect(clampGF(1000, 3)).toBe(21);
    });

    it('verifies getDrawCountForGF bands for 4P and 3P', () => {
      // 4P: [0..5] -> 2, [6..17] -> 1, [18..23] -> 2, [24..28] -> 3
      for (let gf = 0; gf <= 5; gf++) expect(getDrawCountForGF(gf, 4)).toBe(2);
      for (let gf = 6; gf <= 17; gf++) expect(getDrawCountForGF(gf, 4)).toBe(1);
      for (let gf = 18; gf <= 23; gf++) expect(getDrawCountForGF(gf, 4)).toBe(2);
      for (let gf = 24; gf <= 28; gf++) expect(getDrawCountForGF(gf, 4)).toBe(3);

      // 3P: [0..5] -> 2, [6..13] -> 1, [14..17] -> 2, [18..21] -> 3
      for (let gf = 0; gf <= 5; gf++) expect(getDrawCountForGF(gf, 3)).toBe(2);
      for (let gf = 6; gf <= 13; gf++) expect(getDrawCountForGF(gf, 3)).toBe(1);
      for (let gf = 14; gf <= 17; gf++) expect(getDrawCountForGF(gf, 3)).toBe(2);
      for (let gf = 18; gf <= 21; gf++) expect(getDrawCountForGF(gf, 3)).toBe(3);
    });

    it('tracks trueTotalLF and clampedGF dynamically during piece construction', () => {
      // Test player LF formula: Towns (+1), Cities (+2), Fossil (+1), Renewable (-1)
      const mockPlayer = {
        townsBuilt: 0,
        citiesBuilt: 0,
        fossilPlantsBuilt: 0,
        renewablePlantsBuilt: 0,
      };

      expect(computePlayerLF(mockPlayer)).toBe(0);

      // 1 Town
      mockPlayer.townsBuilt = 1;
      expect(computePlayerLF(mockPlayer)).toBe(1);

      // + 1 City
      mockPlayer.citiesBuilt = 1;
      expect(computePlayerLF(mockPlayer)).toBe(3); // 1 + 2

      // + 6 Fossil Plants
      mockPlayer.fossilPlantsBuilt = 6;
      expect(computePlayerLF(mockPlayer)).toBe(9); // 3 + 6

      // + 9 Renewable Plants
      mockPlayer.renewablePlantsBuilt = 9;
      expect(computePlayerLF(mockPlayer)).toBe(0); // 9 - 9 = 0

      // All pieces maxed out
      mockPlayer.townsBuilt = 5;
      mockPlayer.citiesBuilt = 4;
      mockPlayer.fossilPlantsBuilt = 6;
      mockPlayer.renewablePlantsBuilt = 0;
      // 5*1 + 4*2 + 6*1 = 5 + 8 + 6 = 19 LF per player
      expect(computePlayerLF(mockPlayer)).toBe(19);

      // 4 players at max LF = 19 * 4 = 76
      const mockPlayers = {
        orange: { localFootprint: 19 },
        purple: { localFootprint: 19 },
        pink: { localFootprint: 19 },
        blue: { localFootprint: 19 },
      };
      const trueTotal = computeTrueTotalLF(mockPlayers);
      expect(trueTotal).toBe(76);
      expect(clampGF(trueTotal, 4)).toBe(28); // Clamped at 28

      // All players at negative LF (e.g. 0 towns, 0 cities, 9 renewables = -9 each)
      const negativePlayers = {
        orange: { localFootprint: -9 },
        purple: { localFootprint: -9 },
        pink: { localFootprint: -9 },
        blue: { localFootprint: -9 },
      };
      const negTotal = computeTrueTotalLF(negativePlayers);
      expect(negTotal).toBe(-36);
      expect(clampGF(negTotal, 4)).toBe(0); // Clamped at 0
    });
  });

  describe('CHALLENGE 7: Adversarial Boundaries, Long-Run Stream Parity & Invariants', () => {
    it('maintains strict uint32 bounds and precision over 1,000,000 consecutive steps', () => {
      const prng = new Mulberry32PRNG(0x1337c0de);
      let minVal = 1;
      let maxVal = 0;
      let allValid = true;
      for (let i = 0; i < 1_000_000; i++) {
        const val = prng.next();
        if (val < 0 || val >= 1 || Number.isNaN(val)) {
          allValid = false;
        }
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      expect(allValid).toBe(true);
      expect(minVal).toBeGreaterThanOrEqual(0);
      expect(maxVal).toBeLessThan(1);
      const finalState = prng.getState();
      expect(finalState.calls).toBe(1_000_000);
      expect(finalState.seed >>> 0).toBe(finalState.seed);
      expect(Number.isInteger(finalState.seed)).toBe(true);
      expect(finalState.seed).toBeGreaterThanOrEqual(0);
      expect(finalState.seed).toBeLessThanOrEqual(0xffffffff);
    });

    it('coerces negative seeds and non-integer seeds into valid 32-bit unsigned uints', () => {
      const prngNeg = new Mulberry32PRNG(-1);
      expect(prngNeg.getState().seed).toBe(0xffffffff);

      const prngFloat = new Mulberry32PRNG(42.999);
      expect(prngFloat.getState().seed).toBe(42);

      const restoredNeg = Mulberry32PRNG.fromState({ seed: -1, calls: 10 });
      expect(restoredNeg.getState().seed).toBe(0xffffffff);
    });

    it('maintains 100 consecutive turns of bit-for-bit stream parity in 4P First Game', () => {
      const seed = 54321;
      let state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed });

      const refPrng = new Mulberry32PRNG(seed);
      const supply = createInitialSupply();
      refPrng.shuffle(supply.devDeck);
      dealGreenDiscs(refPrng, 4);
      createInitialEventBag(refPrng);
      state.eventBag = Array(300).fill('climateConference');

      for (let turn = 0; turn < 100; turn++) {
        const pid = state.activePlayerId;
        state = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: pid });
        state = applyAction(state, { type: 'ROLL_DICE', playerId: pid });
        const expectedDice = refPrng.rollDice();

        const match = state.log[state.log.length - 1]!.message.match(/rolled \d+ \((\d), (\d)\)/);
        const actualDice = [parseInt(match![1]!, 10), parseInt(match![2]!, 10)];
        expect(actualDice).toEqual(expectedDice);
        expect(state.prng).toEqual(refPrng.getState());

        state = resolvePendingDecisionsForStreamParity(state);
        state = applyAction(state, { type: 'END_TURN', playerId: pid });
      }

      expect(state.prng.calls).toBe(refPrng.getState().calls);
      expect(state.currentTurn).toBe(26); // 100 turns / 4 players + 1 = turn 26
    });

    it('conserves components across all 12 steps of 3P Standard Snake Draft and into EventPhase', () => {
      let state = createInitialGameState({ setupMode: 'standard', playerCount: 3, seed: 8888 });
      assertComponentConservation(state);

      while (state.phase === 'SetupDraft') {
        const activePid = state.pendingDecisions[0]!.playerId;
        const legal = legalActions(state, activePid);
        expect(legal.length).toBeGreaterThan(0);
        state = applyAction(state, legal[0]!);
        assertComponentConservation(state);
      }

      expect(state.phase).toBe('EventPhase');
      expect(state.playerOrder.length).toBe(3);
      expect(state.trueTotalLF).toBe(9); // 3 players * (1 Town + 1 City) = 9
      expect(state.clampedGF).toBe(9);

      // Verify that each of the 3 players received exactly 1 starting science card
      for (const pid of state.playerOrder) {
        expect(state.players[pid]!.science).toBe(1);
      }
      expect(state.supply.science).toBe(TOTAL_SCIENCE_CARDS - 3); // 17 remaining
    });
  });
});

