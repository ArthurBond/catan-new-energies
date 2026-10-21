import { describe, it, expect } from 'vitest';
import {
  BotConfig,
  BotPersonality,
  chooseBotAction,
  chooseRandomLegalAction,
  getActingPlayerId,
  getPipValue,
  scoreIntersectionForSetup,
} from '../bot';
import { createInitialGameState } from '../../engine/setup';
import { applyAction } from '../../engine/reducer';
import { Mulberry32PRNG } from '../../engine/prng';
import { GameState, PlayerId } from '../../engine/types';

const PERSONALITIES: readonly BotPersonality[] = [
  'Balanced',
  'GreenInnovator',
  'IndustrialExpansionist',
];

function runSimulatedGame(options: {
  playerCount: 3 | 4;
  setupMode: 'first' | 'standard';
  seed: number;
  configs: Record<PlayerId, BotConfig | 'random'>;
  maxActions?: number;
}): {
  finalState: GameState;
  actionCount: number;
} {
  const maxActions = options.maxActions ?? 1500;
  let state = createInitialGameState({
    setupMode: options.setupMode,
    playerCount: options.playerCount,
    seed: options.seed,
  });

  const botPrng = new Mulberry32PRNG(options.seed ^ 0x12345678);
  let actionCount = 0;

  while (state.phase !== 'GameEnd' && state.winner === null && actionCount < maxActions) {
    const actingPlayer = getActingPlayerId(state);
    if (!actingPlayer) break;

    const cfg = options.configs[actingPlayer]!;
    const action =
      cfg === 'random'
        ? chooseRandomLegalAction(state, actingPlayer, botPrng)
        : chooseBotAction(state, actingPlayer, cfg, botPrng);

    state = applyAction(state, action);
    actionCount++;
  }

  return { finalState: state, actionCount };
}

describe('AI Bot Heuristics & Full-Game Simulations (Task 5.1)', () => {
  describe('Unit Heuristics across Phases & Decisions', () => {
    it('computes accurate dice pip values and scores high-pip diverse setup intersections higher', () => {
      expect(getPipValue(6)).toBe(5);
      expect(getPipValue(8)).toBe(5);
      expect(getPipValue(5)).toBe(4);
      expect(getPipValue(2)).toBe(1);
      expect(getPipValue(null)).toBe(0);

      const state = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 101 });
      const scores = state.board.intersections.map((n) =>
        scoreIntersectionForSetup(state, 'orange', n.id, 1, 'Balanced')
      );
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      expect(maxScore).toBeGreaterThan(minScore + 15);
    });

    it('synthesizes a 4:1 supply trade when it completes a Town or City build in ActionPhase', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 7 });
      state.phase = 'ActionPhase';
      state.activePlayerId = 'orange';

      // Give Orange 2 food and 2 steel (needs 1 more steel for a City) + 4 surplus lumber
      state.players.orange!.resources = {
        lumber: 4,
        brick: 0,
        natural_fiber: 0,
        food: 2,
        steel: 2,
      };

      const action = chooseBotAction(state, 'orange', {
        personality: 'GreenInnovator',
        difficulty: 'Normal',
      });

      expect(action).toEqual({
        type: 'TRADE_SUPPLY',
        playerId: 'orange',
        give: { lumber: 4 },
        receive: 'steel',
      });

      const afterTrade = applyAction(state, action);
      const buildAction = chooseBotAction(afterTrade, 'orange', {
        personality: 'GreenInnovator',
        difficulty: 'Normal',
      });
      expect(buildAction.type).toBe('BUILD_CITY');
    });

    it('targets the leading opponent hex and never own hex on MOVE_INSPECTOR', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 15 });
      state.phase = 'ProductionPhase';
      state.activePlayerId = 'orange';
      state.players.purple!.victoryPoints = 8; // Leader
      state.players.purple!.resources.steel = 2; // Has cards to steal

      state.pendingDecisions = [
        {
          id: 'move-inspector-1',
          type: 'MOVE_INSPECTOR',
          playerId: 'orange',
        },
      ];

      const action = chooseBotAction(state, 'orange', {
        personality: 'Balanced',
        difficulty: 'Hard',
      });

      expect(action.type).toBe('RESOLVE_PENDING_DECISION');
      if (action.type === 'RESOLVE_PENDING_DECISION') {
        const resp = action.response as { hexId: number };
        const chosenHex = state.board.hexes[resp.hexId]!;
        // Verify Orange does not have a building on the chosen hex
        const orangeHasBuilding = state.board.intersections.some(
          (n) => n.adjacentHexIds.includes(chosenHex.id) && n.building?.playerId === 'orange'
        );
        expect(orangeHasBuilding).toBe(false);

        // Verify Purple has a building on the chosen hex
        const purpleHasBuilding = state.board.intersections.some(
          (n) => n.adjacentHexIds.includes(chosenHex.id) && n.building?.playerId === 'purple'
        );
        expect(purpleHasBuilding).toBe(true);
      }
    });

    it('evaluates EVENT_PRODUCTION_INCREASE differently for IndustrialExpansionist vs GreenInnovator', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 21 });
      state.phase = 'EventPhase';
      state.clampedGF = 18; // High GF
      state.pendingDecisions = [
        {
          id: 'prod-inc-orange-1',
          type: 'EVENT_PRODUCTION_INCREASE',
          playerId: 'orange',
          isOptional: true,
        },
      ];

      const indAction = chooseBotAction(state, 'orange', {
        personality: 'IndustrialExpansionist',
        difficulty: 'Normal',
      });
      const greenAction = chooseBotAction(state, 'orange', {
        personality: 'GreenInnovator',
        difficulty: 'Normal',
      });

      expect(indAction.type).toBe('RESOLVE_PENDING_DECISION');
      expect(greenAction.type).toBe('RESOLVE_PENDING_DECISION');
      if (
        indAction.type === 'RESOLVE_PENDING_DECISION' &&
        greenAction.type === 'RESOLVE_PENDING_DECISION'
      ) {
        expect((indAction.response as { build?: boolean }).build).toBe(true);
        expect((greenAction.response as { pass?: boolean }).pass).toBe(true);
      }
    });

    it('declines DOMESTIC_TRADE_RESPONSE when offering player is at 9 VP', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 33 });
      state.phase = 'ActionPhase';
      state.activePlayerId = 'purple';
      state.players.purple!.victoryPoints = 9;
      state.players.purple!.resources.lumber = 2;
      state.players.orange!.resources.steel = 1;

      state.pendingDecisions = [
        {
          id: 'trade-purple-orange-1',
          type: 'DOMESTIC_TRADE_RESPONSE',
          playerId: 'orange',
          offeringPlayerId: 'purple',
          targetPlayerId: 'orange',
          give: { lumber: 2 },
          want: { steel: 1 },
        },
      ];

      const action = chooseBotAction(state, 'orange', {
        personality: 'Balanced',
        difficulty: 'Normal',
      });

      expect(action).toEqual({
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'orange',
        decisionId: 'trade-purple-orange-1',
        response: { accept: false },
      });
    });
  });

  describe('30 Complete 3-Player & 4-Player Game Simulations', () => {
    it('completes 30 full 3P and 4P games across all personalities under 1,500 actions with 0 errors', () => {
      const totalGames = 30;
      let completedCount = 0;
      let tenVpEndings = 0;
      let emptyBagEndings = 0;

      for (let i = 0; i < totalGames; i++) {
        const playerCount: 3 | 4 = i % 2 === 0 ? 4 : 3;
        const setupMode: 'first' | 'standard' = i % 3 === 0 ? 'first' : 'standard';
        const seed = 1000 + i * 37;

        const configs: Record<PlayerId, BotConfig> = {
          orange: {
            personality: PERSONALITIES[i % 3]!,
            difficulty: i % 2 === 0 ? 'Hard' : 'Normal',
          },
          purple: {
            personality: PERSONALITIES[(i + 1) % 3]!,
            difficulty: 'Normal',
          },
          pink: {
            personality: PERSONALITIES[(i + 2) % 3]!,
            difficulty: i % 3 === 0 ? 'Easy' : 'Hard',
          },
          blue: {
            personality: PERSONALITIES[i % 3]!,
            difficulty: 'Normal',
          },
        };

        const { finalState, actionCount } = runSimulatedGame({
          playerCount,
          setupMode,
          seed,
          configs,
          maxActions: 1500,
        });

        expect(finalState.phase).toBe('GameEnd');
        expect(finalState.winner).not.toBeNull();
        expect(actionCount).toBeLessThan(1500);
        completedCount++;

        if (finalState.eventBag.length === 0) {
          emptyBagEndings++;
        } else {
          tenVpEndings++;
        }
      }

      expect(completedCount).toBe(30);
      expect(tenVpEndings + emptyBagEndings).toBe(30);
      // Verify both ending pathways are supported and exercised
      expect(tenVpEndings).toBeGreaterThan(0);
      expect(emptyBagEndings).toBeGreaterThan(0);
    }, 20000);

    it('supports both 10 VP and Empty Event Bag endings in dedicated scenarios', () => {
      // Scenario A: Industrial / Balanced bots racing for 10 VP
      const gameA = runSimulatedGame({
        playerCount: 4,
        setupMode: 'first',
        seed: 42,
        configs: {
          orange: { personality: 'IndustrialExpansionist', difficulty: 'Hard' },
          purple: { personality: 'Balanced', difficulty: 'Hard' },
          pink: { personality: 'GreenInnovator', difficulty: 'Hard' },
          blue: { personality: 'Balanced', difficulty: 'Normal' },
        },
      });
      expect(gameA.finalState.phase).toBe('GameEnd');
      expect(gameA.finalState.winner).not.toBeNull();

      // Scenario B: High GF / shortened Event Bag triggering Empty Bag resolution
      let stateB = createInitialGameState({ setupMode: 'first', playerCount: 3, seed: 88 });
      stateB.eventBag = stateB.eventBag.slice(0, 12);
      const botPrng = new Mulberry32PRNG(88);
      let steps = 0;
      while (stateB.phase !== 'GameEnd' && steps < 500) {
        const pid = getActingPlayerId(stateB)!;
        const action = chooseBotAction(
          stateB,
          pid,
          {
            personality: pid === 'orange' ? 'GreenInnovator' : 'IndustrialExpansionist',
            difficulty: 'Hard',
          },
          botPrng
        );
        stateB = applyAction(stateB, action);
        steps++;
      }
      expect(stateB.phase).toBe('GameEnd');
      expect(stateB.eventBag).toHaveLength(0);
    });

    it('Normal/Hard bots beat Easy/random baseline > 70% in head-to-head games', () => {
      const totalMatches = 24;
      let smartBotWins = 0;
      let decidedMatches = 0;

      for (let i = 0; i < totalMatches; i++) {
        // Rotate which seat the Hard/Normal bot occupies so turn order bias is eliminated
        const seats: PlayerId[] = ['orange', 'purple', 'pink'];
        const smartSeat = seats[i % 3]!;
        const personality = PERSONALITIES[i % 3]!;
        const difficulty = i % 2 === 0 ? 'Hard' : 'Normal';

        const configs: Record<PlayerId, BotConfig | 'random'> = {
          orange:
            smartSeat === 'orange'
              ? { personality, difficulty }
              : i % 2 === 0
                ? { personality: 'Balanced', difficulty: 'Easy' }
                : 'random',
          purple:
            smartSeat === 'purple'
              ? { personality, difficulty }
              : i % 2 === 0
                ? { personality: 'IndustrialExpansionist', difficulty: 'Easy' }
                : 'random',
          pink:
            smartSeat === 'pink'
              ? { personality, difficulty }
              : i % 2 === 0
                ? { personality: 'GreenInnovator', difficulty: 'Easy' }
                : 'random',
          blue: 'random',
        };

        const { finalState } = runSimulatedGame({
          playerCount: 3,
          setupMode: 'standard',
          seed: 5000 + i * 53,
          configs,
          maxActions: 1500,
        });

        expect(finalState.phase).toBe('GameEnd');
        if (finalState.winner && finalState.winner !== 'collapse') {
          decidedMatches++;
          const won = Array.isArray(finalState.winner)
            ? finalState.winner.includes(smartSeat)
            : finalState.winner === smartSeat;
          if (won) {
            smartBotWins++;
          }
        }
      }

      expect(decidedMatches).toBeGreaterThanOrEqual(20);
      const winRate = smartBotWins / decidedMatches;
      // 1 smart bot vs 2 Easy/random bots in 3P has a 33% random expectation; require > 70% win rate!
      expect(winRate).toBeGreaterThan(0.7);
    }, 20000);
  });
});
