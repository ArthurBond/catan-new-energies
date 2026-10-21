import { describe, it, expect } from 'vitest';
import { applyAction, IllegalActionError } from '../reducer';
import { legalActions } from '../actions';
import {
  createInitialGameState,
  createInitialSupply,
  dealGreenDiscs,
  createInitialEventBag,
} from '../setup';
import { GameAction, GameState, ResourceType } from '../types';
import { TOTAL_RESOURCES_PER_TYPE, TOTAL_SCIENCE_CARDS } from '../config';
import { Mulberry32PRNG } from '../prng';

/**
 * Asserts strict component conservation across hands and supply bank:
 * - 19 cards for each of the 5 resource types (95 total)
 * - 20 science cards
 * - 5 towns, 4 cities, 12 roads per player
 */
function assertComponentConservation(state: GameState): void {
  const resourceTypes: ResourceType[] = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'];

  // 1. Resource Conservation: Hand + Supply == TOTAL_RESOURCES_PER_TYPE (19) for each type
  for (const res of resourceTypes) {
    const totalInHands = state.playerOrder.reduce(
      (sum, pid) => sum + (state.players[pid]?.resources[res] ?? 0),
      0
    );
    const inSupply = state.supply.resources[res];
    expect(totalInHands + inSupply).toBe(TOTAL_RESOURCES_PER_TYPE);
    expect(inSupply).toBeGreaterThanOrEqual(0);
    expect(inSupply).toBeLessThanOrEqual(TOTAL_RESOURCES_PER_TYPE);
  }

  // 2. Science Conservation: Hand + Supply == TOTAL_SCIENCE_CARDS (20)
  const totalScienceInHands = state.playerOrder.reduce(
    (sum, pid) => sum + (state.players[pid]?.science ?? 0),
    0
  );
  const scienceInSupply = state.supply.science;
  expect(totalScienceInHands + scienceInSupply).toBe(TOTAL_SCIENCE_CARDS);
  expect(scienceInSupply).toBeGreaterThanOrEqual(0);
  expect(scienceInSupply).toBeLessThanOrEqual(TOTAL_SCIENCE_CARDS);

  // 3. Piece Conservation: Built + Reserve == Total Allocation
  for (const pid of state.playerOrder) {
    const p = state.players[pid]!;
    expect(p.townsBuilt + p.townsInReserve).toBe(5);
    expect(p.citiesBuilt + p.citiesInReserve).toBe(4);
    expect(p.roadsBuilt + p.roadsInReserve).toBe(12);
  }
}

describe('Action Reducer & Determinism — RED-01', () => {
  describe('TEST-RED-01-JSON: JSON Round-Trip Equality', () => {
    it('preserves complete JSON equality at initial setup, setup draft, and turn phases', () => {
      // 1. First Game setup
      const state1 = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 100 });
      expect(JSON.parse(JSON.stringify(state1))).toEqual(state1);

      // 2. Standard Game setup
      const state2 = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 200 });
      expect(JSON.parse(JSON.stringify(state2))).toEqual(state2);

      // 3. After turn actions
      const state3 = applyAction(state1, { type: 'DRAW_EVENT_DISC', playerId: 'orange' });
      expect(JSON.parse(JSON.stringify(state3))).toEqual(state3);

      const state4 = applyAction(state3, { type: 'ROLL_DICE', playerId: 'orange' });
      expect(JSON.parse(JSON.stringify(state4))).toEqual(state4);

      const state5 = applyAction(state4, { type: 'END_TURN', playerId: 'orange' });
      expect(JSON.parse(JSON.stringify(state5))).toEqual(state5);
    });
  });

  describe('TEST-RED-01-REPLAY: Deterministic Replay & Component Conservation', () => {
    it('produces identical state bit-for-bit when replaying the same action sequence from seed while conserving components', () => {
      // Simulation of a 4-player standard draft and opening turn
      function runSim(): GameState {
        let state = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 12345 });
        const history: GameAction[] = [];

        // Verify component conservation at initial standard state
        assertComponentConservation(state);

        // Complete 2 rounds of snake draft (8 settlements + 8 roads)
        while (state.phase === 'SetupDraft') {
          const activePid = state.pendingDecisions[0]!.playerId;
          const legal = legalActions(state, activePid);
          expect(legal.length).toBeGreaterThan(0);
          // Pick the first legal action deterministically
          const action = legal[0]!;
          history.push(action);
          state = applyAction(state, action);

          // Assert component conservation after every single draft action
          assertComponentConservation(state);
        }

        expect(state.phase).toBe('EventPhase');
        expect(state.currentTurn).toBe(1);

        // Verify that starting hands were actively distributed to players from supply
        const totalScienceInHands = state.playerOrder.reduce(
          (sum, pid) => sum + state.players[pid]!.science,
          0
        );
        expect(totalScienceInHands).toBe(state.playerCount); // exactly 1 science per player
        expect(state.supply.science).toBe(TOTAL_SCIENCE_CARDS - state.playerCount);

        const totalResourcesInHands = (
          ['lumber', 'brick', 'natural_fiber', 'food', 'steel'] as ResourceType[]
        ).reduce(
          (sum, r) =>
            sum +
            state.playerOrder.reduce(
              (pSum, pid) => pSum + state.players[pid]!.resources[r],
              0
            ),
          0
        );
        expect(totalResourcesInHands).toBeGreaterThan(0);

        // Turn 1: Draw event disc -> Roll dice -> End turn
        const a1: GameAction = { type: 'DRAW_EVENT_DISC', playerId: state.activePlayerId };
        state = applyAction(state, a1);
        assertComponentConservation(state);

        const a2: GameAction = { type: 'ROLL_DICE', playerId: state.activePlayerId };
        state = applyAction(state, a2);
        assertComponentConservation(state);

        const a3: GameAction = { type: 'END_TURN', playerId: state.activePlayerId };
        state = applyAction(state, a3);
        assertComponentConservation(state);

        return state;
      }

      const run1 = runSim();
      const run2 = runSim();

      expect(run1).toEqual(run2);
      expect(run1.prng.calls).toBe(run2.prng.calls);
      expect(run1.board).toEqual(run2.board);
      expect(run1.players).toEqual(run2.players);
      expect(run1.supply).toEqual(run2.supply);
    });
  });

  describe('TEST-RED-01-ILLEGAL: Illegal Action Rejection', () => {
    it('rejects out-of-turn actions', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
      expect(state.activePlayerId).toBe('orange');

      // Purple attempts to draw out of turn
      expect(() => {
        applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: 'purple' });
      }).toThrow(IllegalActionError);
    });

    it('rejects wrong phase actions', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
      expect(state.phase).toBe('EventPhase');

      // Orange attempts to roll dice during EventPhase before drawing disc
      expect(() => {
        applyAction(state, { type: 'ROLL_DICE', playerId: 'orange' });
      }).toThrow(IllegalActionError);

      // Orange attempts to end turn during EventPhase
      expect(() => {
        applyAction(state, { type: 'END_TURN', playerId: 'orange' });
      }).toThrow(IllegalActionError);
    });

    it('rejects distance rule violations during setup draft', () => {
      let state = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 999 });

      // Player 1 places Town on node 0
      state = applyAction(state, { type: 'SETUP_BUILD_TOWN', playerId: 'orange', nodeId: 0 });

      // Player 1 places Road on incident edge
      const edgeId = state.board.intersections[0]!.incidentEdgeIds[0]!;
      state = applyAction(state, { type: 'SETUP_BUILD_ROAD', playerId: 'orange', edgeId });

      // Player 2 is now prompted to place settlement.
      // Neighbor of node 0 is in node 0's adjacentNodeIds
      const neighborNodeId = state.board.intersections[0]!.adjacentNodeIds[0]!;

      // Purple attempts to build on adjacent neighbor (distance 1)
      expect(() => {
        applyAction(state, { type: 'SETUP_BUILD_TOWN', playerId: 'purple', nodeId: neighborNodeId });
      }).toThrow(IllegalActionError);
    });
  });

  describe('TEST-RED-01-PRNG: PRNG State Tracking', () => {
    it('tracks PRNG calls precisely through dice rolls and state transitions', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 777 });
      const initialCalls = state.prng.calls;

      // Draw disc does not increment dice PRNG calls
      const afterDraw = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: 'orange' });
      expect(afterDraw.prng.calls).toBe(initialCalls);

      // Roll dice rolls 2 dice -> 2 nextInt calls
      const afterRoll = applyAction(afterDraw, { type: 'ROLL_DICE', playerId: 'orange' });
      expect(afterRoll.prng.calls).toBe(initialCalls + 2);
    });
  });

  describe('TEST-RED-01-STREAM-PARITY: Multi-Turn PRNG Stream Parity', () => {
    it('maintains bit-for-bit stream parity across 12+ consecutive turns against an un-serialized reference generator', () => {
      const seed = 42;
      let state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed });

      // Un-serialized reference generator initialized with identical seed and setup sequence
      const refPrng = new Mulberry32PRNG(seed);
      const supply = createInitialSupply();
      refPrng.shuffle(supply.devDeck);
      dealGreenDiscs(refPrng, 4);
      createInitialEventBag(refPrng);

      // Reference generator matches state PRNG before turns begin
      expect(state.prng).toEqual(refPrng.getState());

      // Simulate 12 turns (3 complete 4-player cycles around the table)
      const turnsToSimulate = 12;
      for (let t = 0; t < turnsToSimulate; t++) {
        const activePid = state.activePlayerId;

        // 1. Draw Event Disc
        state = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: activePid });

        // Simulate network/storage serialization round-trip before dice roll
        state = JSON.parse(JSON.stringify(state));

        // 2. Roll Dice via reducer (reconstructs PRNG from serialized state)
        state = applyAction(state, { type: 'ROLL_DICE', playerId: activePid });

        // Expected roll from continuous un-serialized reference generator
        const expectedDice = refPrng.rollDice();

        // Extract dice roll from game event log
        const lastLog = state.log[state.log.length - 1]!.message;
        const match = lastLog.match(/rolled \d+ \((\d), (\d)\)/);
        expect(match).not.toBeNull();
        const actualDice = [parseInt(match![1]!, 10), parseInt(match![2]!, 10)];

        // Assert exact dice values match reference generator
        expect(actualDice).toEqual(expectedDice);

        // Assert PRNG internal state and step counts match reference generator exactly
        expect(state.prng.seed).toBe(refPrng.getState().seed);
        expect(state.prng.calls).toBe(refPrng.getState().calls);
        expect(state.prng).toEqual(refPrng.getState());

        // 3. End Turn
        state = applyAction(state, { type: 'END_TURN', playerId: activePid });
      }

      // Assert exactly 24 additional PRNG calls (12 turns * 2 dice) occurred
      expect(state.prng.calls).toBe(refPrng.getState().calls);
    });

    it('restores state in O(1) time without looping', () => {
      const prngState = { seed: 123456789, calls: 500000 };
      const start = performance.now();
      const instance = Mulberry32PRNG.fromState(prngState);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5); // Immediate O(1) reconstruction
      expect(instance.getState()).toEqual(prngState);
    });
  });
});
