import { describe, it, expect } from 'vitest';
import { applyAction, IllegalActionError } from '../reducer';
import { legalActions } from '../actions';
import { createInitialGameState } from '../setup';
import { GameAction, GameState } from '../types';

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

  describe('TEST-RED-01-REPLAY: Deterministic Replay', () => {
    it('produces identical state bit-for-bit when replaying the same action sequence from seed', () => {
      // Simulation of a 4-player standard draft and opening turn
      function runSim(): GameState {
        let state = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 12345 });
        const history: GameAction[] = [];

        // Complete 2 rounds of snake draft (8 settlements + 8 roads)
        while (state.phase === 'SetupDraft') {
          const activePid = state.pendingDecisions[0]!.playerId;
          const legal = legalActions(state, activePid);
          expect(legal.length).toBeGreaterThan(0);
          // Pick the first legal action deterministically
          const action = legal[0]!;
          history.push(action);
          state = applyAction(state, action);
        }

        expect(state.phase).toBe('EventPhase');
        expect(state.currentTurn).toBe(1);

        // Turn 1: Draw event disc -> Roll dice -> End turn
        const a1: GameAction = { type: 'DRAW_EVENT_DISC', playerId: state.activePlayerId };
        state = applyAction(state, a1);

        const a2: GameAction = { type: 'ROLL_DICE', playerId: state.activePlayerId };
        state = applyAction(state, a2);

        const a3: GameAction = { type: 'END_TURN', playerId: state.activePlayerId };
        state = applyAction(state, a3);

        return state;
      }

      const run1 = runSim();
      const run2 = runSim();

      expect(run1).toEqual(run2);
      expect(run1.prng.calls).toBe(run2.prng.calls);
      expect(run1.board).toEqual(run2.board);
      expect(run1.players).toEqual(run2.players);
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
});
