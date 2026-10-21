/**
 * CATAN: New Energies — Pure Deterministic Action Reducer
 *
 * Implements applyAction(state, action): GameState.
 * Zero side effects, deterministic PRNG tracking, immutable state transitions.
 */

import { isActionEqual, legalActions } from './actions';
import { applyEventDecision } from './event-resolvers';
import { checkPostDecisionEventPhase, stepEventDraw } from './events';
import { clampGF, computePlayerLF, computeTrueTotalLF } from './footprint';
import { Mulberry32PRNG } from './prng';
import { TERRAIN_RESOURCE_MAP } from './setup';
import { GameAction, GameState, PendingDecision } from './types';

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export function applyAction(state: GameState, action: GameAction): GameState {
  // 1. Verify action is legal
  const available = legalActions(state, action.playerId);
  const isLegal = available.some((a) => isActionEqual(a, action));

  if (!isLegal) {
    throw new IllegalActionError(
      `Illegal action ${action.type} for player ${action.playerId} in phase ${state.phase}.`
    );
  }

  // 2. Create immutable copy of state
  const next: GameState = structuredClone(state);

  // 3. Process action
  switch (action.type) {
    case 'SETUP_BUILD_TOWN': {
      const node = next.board.intersections[action.nodeId]!;
      node.building = { playerId: action.playerId, type: 'town' };

      const player = next.players[action.playerId]!;
      player.townsBuilt++;
      player.townsInReserve--;
      player.victoryPoints += 1;
      player.localFootprint = computePlayerLF(player);

      // Recompute global footprint
      next.trueTotalLF = computeTrueTotalLF(next.players);
      next.clampedGF = clampGF(next.trueTotalLF, next.playerCount);

      // Pop settlement decision, push road decision
      next.pendingDecisions.shift();
      const roadDecision: PendingDecision = {
        id: `setup-road-${action.playerId}-1`,
        type: 'SETUP_PLACE_ROAD',
        playerId: action.playerId,
        round: 1,
        connectedToNodeId: action.nodeId,
      };
      next.pendingDecisions.push(roadDecision);

      next.log.push({
        timestamp: next.log.length,
        message: `${player.name} placed starting Town on intersection ${action.nodeId}.`,
      });
      break;
    }

    case 'SETUP_BUILD_ROAD': {
      const edge = next.board.edges[action.edgeId]!;
      edge.road = { playerId: action.playerId };

      const player = next.players[action.playerId]!;
      player.roadsBuilt++;
      player.roadsInReserve--;

      const head = next.pendingDecisions.shift()!;
      const round = head.type === 'SETUP_PLACE_ROAD' ? head.round : 1;

      // Snake draft progression
      const currIdx = next.playerOrder.indexOf(action.playerId);

      if (round === 1) {
        if (currIdx < next.playerCount - 1) {
          // Next player in clockwise order
          const nextPid = next.playerOrder[currIdx + 1]!;
          next.pendingDecisions.push({
            id: `setup-settlement-${nextPid}-1`,
            type: 'SETUP_PLACE_SETTLEMENT',
            playerId: nextPid,
            round: 1,
          });
          next.activePlayerId = nextPid;
        } else {
          // Snake turn-around: last player places City for Round 2
          next.pendingDecisions.push({
            id: `setup-settlement-${action.playerId}-2`,
            type: 'SETUP_PLACE_SETTLEMENT',
            playerId: action.playerId,
            round: 2,
          });
          next.activePlayerId = action.playerId;
        }
      } else {
        // Round 2 (counter-clockwise)
        if (currIdx > 0) {
          const nextPid = next.playerOrder[currIdx - 1]!;
          next.pendingDecisions.push({
            id: `setup-settlement-${nextPid}-2`,
            type: 'SETUP_PLACE_SETTLEMENT',
            playerId: nextPid,
            round: 2,
          });
          next.activePlayerId = nextPid;
        } else {
          // Snake draft complete! Transition to EventPhase
          next.phase = 'EventPhase';
          next.currentTurn = 1;
          next.activePlayerId = next.playerOrder[0]!;
        }
      }

      next.log.push({
        timestamp: next.log.length,
        message: `${player.name} placed starting Road on path ${action.edgeId}.`,
      });
      break;
    }

    case 'SETUP_BUILD_CITY': {
      const node = next.board.intersections[action.nodeId]!;
      node.building = { playerId: action.playerId, type: 'city' };

      const player = next.players[action.playerId]!;
      player.citiesBuilt++;
      player.citiesInReserve--;
      player.victoryPoints += 2;

      // Grant starting hand immediately (R L254-257)
      node.adjacentHexIds.forEach((hId) => {
        const hex = next.board.hexes[hId]!;
        const res = TERRAIN_RESOURCE_MAP[hex.terrain];
        if (res !== null && next.supply.resources[res] > 0) {
          player.resources[res]++;
          next.supply.resources[res]--;
        }
      });

      if (next.supply.science > 0) {
        player.science++;
        next.supply.science--;
      }

      player.localFootprint = computePlayerLF(player);
      next.trueTotalLF = computeTrueTotalLF(next.players);
      next.clampedGF = clampGF(next.trueTotalLF, next.playerCount);

      // Pop settlement decision, push road decision
      next.pendingDecisions.shift();
      const roadDecision: PendingDecision = {
        id: `setup-road-${action.playerId}-2`,
        type: 'SETUP_PLACE_ROAD',
        playerId: action.playerId,
        round: 2,
        connectedToNodeId: action.nodeId,
      };
      next.pendingDecisions.push(roadDecision);

      next.log.push({
        timestamp: next.log.length,
        message: `${player.name} placed starting City on intersection ${action.nodeId}.`,
      });
      break;
    }

    case 'DRAW_EVENT_DISC': {
      stepEventDraw(next);
      break;
    }

    case 'ROLL_DICE': {
      const prng = Mulberry32PRNG.fromState(next.prng);
      const dice = prng.rollDice();
      next.prng = prng.getState();

      next.log.push({
        timestamp: next.log.length,
        message: `${next.players[action.playerId]!.name} rolled ${dice[0] + dice[1]} (${dice[0]}, ${dice[1]}).`,
      });
      next.phase = 'ActionPhase';
      break;
    }

    case 'RESOLVE_PENDING_DECISION': {
      const head = next.pendingDecisions[0];
      if (!head || head.id !== action.decisionId || head.playerId !== action.playerId) {
        throw new IllegalActionError(`Mismatched pending decision ${action.decisionId}`);
      }

      if (
        head.type === 'EVENT_HAZARD_CHOICE' ||
        head.type === 'EVENT_CARD_CHOICE' ||
        head.type === 'EVENT_PRODUCTION_INCREASE'
      ) {
        applyEventDecision(next, head, action.response);
        next.pendingDecisions.shift();
        checkPostDecisionEventPhase(next);
      }
      break;
    }

    case 'END_TURN': {
      const currIdx = next.playerOrder.indexOf(action.playerId);
      const nextIdx = (currIdx + 1) % next.playerCount;
      next.activePlayerId = next.playerOrder[nextIdx]!;
      if (nextIdx === 0) {
        next.currentTurn++;
      }
      next.phase = 'EventPhase';
      next.lockedDrawCount = null;
      next.eventDiscsDrawnThisTurn = 0;
      next.lastDiceRoll = null;
      next.turnStats = {
        powerPlantsBuiltThisTurn: 0,
        fossilPlantsDemolishedThisTurn: 0,
        devCardsBoughtThisTurn: [],
        devCardsPlayedThisTurn: 0,
      };
      next.devCardsBoughtThisTurn = [];
      next.devCardPlayedThisTurn = false;
      next.log.push({
        timestamp: next.log.length,
        message: `${next.players[action.playerId]!.name} ended their turn.`,
      });
      break;
    }

    default:
      throw new IllegalActionError(`Unsupported action type ${(action as GameAction).type}`);
  }

  return next;
}
