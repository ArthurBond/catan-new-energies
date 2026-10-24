/**
 * CATAN: New Energies — Pure Deterministic Action Reducer
 *
 * Implements applyAction(state, action): GameState.
 * Zero side effects, deterministic PRNG tracking, immutable state transitions.
 */

import { canResolveDiscard, isActionEqual, legalActions } from './actions';
import {
  applyBuildCity,
  applyBuildPowerPlant,
  applyBuildRoad,
  applyBuildTown,
  applyBuildWarehouse,
} from './build';
import {
  applyBuyDevCard,
  applyPlayDevCard,
  applyRevealVpCards,
  canPlayDevCard,
  canRevealVpCards,
} from './dev-cards';
import {
  applyOfferTrade,
  applySpendEnergy,
  applyTradeHarbor,
  applyTradeResponse,
  applyTradeSupply,
  canOfferTrade,
} from './energy-trades';
import { applyEventDecision } from './event-resolvers';
import {
  applyRequestTrade,
  applyTradeRequestChoice,
  applyTradeRequestReply,
  canRequestTrade,
  canResolveTradeChoice,
  canResolveTradeReply,
} from './trade-requests';
import { checkPostDecisionEventPhase, stepEventDraw } from './events';
import { clampGF, computePlayerLF, computeTrueTotalLF } from './footprint';
import { Mulberry32PRNG } from './prng';
import {
  applyProductionPayouts,
  autoClearHazards,
  evaluateProduction,
  executeStealCard,
  getEligibleStealVictims,
  promptMoveInspector,
  queueDiscardsOnSeven,
} from './production';
import { TERRAIN_RESOURCE_MAP } from './setup';
import { GameAction, GameState, HexId, PendingDecision, PlayerId, ResourceType } from './types';
import { checkOwnTurnVictory } from './victory';

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export function applyAction(state: GameState, action: GameAction): GameState {
  // 1. Verify action is legal
  const available = legalActions(state, action.playerId);
  let isLegal = available.some((a) => isActionEqual(a, action));

  if (!isLegal && action.type === 'OFFER_TRADE') {
    isLegal = canOfferTrade(
      state,
      action.playerId,
      action.targetPlayerId,
      action.give,
      action.want
    ).canOffer;
  }
  if (!isLegal && action.type === 'REQUEST_TRADE') {
    const request = canRequestTrade(state, action.playerId, action.ask);
    if (!request.canRequest) throw new IllegalActionError(request.reason ?? 'Illegal trade request');
    isLegal = true;
  }
  if (!isLegal && action.type === 'PLAY_DEV_CARD') {
    isLegal = canPlayDevCard(state, action.playerId, action.cardId, action.params).canPlay;
  }
  if (!isLegal && action.type === 'REVEAL_VP_CARDS') {
    isLegal = canRevealVpCards(state, action.playerId, action.cardIds).canReveal;
  }
  // Discards are validated against the rules directly; legalActions only lists a sample of them
  if (!isLegal && action.type === 'RESOLVE_PENDING_DECISION') {
    const discard = canResolveDiscard(state, action.playerId, action.decisionId, action.response);
    if (discard.ok) {
      isLegal = true;
    } else if (state.pendingDecisions[0]?.type === 'DISCARD_ON_SEVEN') {
      throw new IllegalActionError(discard.reason ?? 'Illegal discard');
    }
  }
  // Trade request replies and choices are validated the same way (any valid reply is allowed)
  if (!isLegal && action.type === 'RESOLVE_PENDING_DECISION') {
    const head = state.pendingDecisions[0];
    const check =
      head?.type === 'TRADE_REQUEST_REPLY'
        ? canResolveTradeReply(state, action.playerId, action.decisionId, action.response)
        : head?.type === 'TRADE_REQUEST_CHOICE'
          ? canResolveTradeChoice(state, action.playerId, action.decisionId, action.response)
          : null;
    if (check) {
      if (!check.ok) throw new IllegalActionError(check.reason ?? 'Illegal trade request answer');
      isLegal = true;
    }
  }

  if (!isLegal) {
    throw new IllegalActionError(
      `Illegal action ${action.type} for player ${action.playerId} in phase ${state.phase}.`
    );
  }

  // 2. Create immutable copy of state
  const next: GameState = structuredClone(state);

  // 3. Process action
  switch (action.type) {
    case 'SETUP_ROLL_DICE': {
      const prng = new Mulberry32PRNG(next.prng.seed, next.prng.calls);
      const [die1, die2] = prng.rollDice();
      next.prng = prng.getState();

      if (!next.setupRolls) next.setupRolls = {};
      next.setupRolls[action.playerId] = [die1, die2];
      next.lastDiceRoll = [die1, die2];

      const player = next.players[action.playerId]!;
      const rollSum = die1 + die2;

      // Find who still needs to roll in this round of setup roll
      const remaining = next.playerOrder.filter((pid) => !next.setupRolls![pid]);

      if (remaining.length > 0) {
        next.activePlayerId = remaining[0]!;
        next.log.push({
          timestamp: next.log.length,
          message: `${player.name} rolled ${rollSum} (${die1} + ${die2}) for setup turn order.`,
        });
      } else {
        // All players have rolled; evaluate highest roll
        const scores = next.playerOrder.map((pid) => ({
          pid,
          sum: next.setupRolls![pid]![0] + next.setupRolls![pid]![1],
        }));
        const maxSum = Math.max(...scores.map((s) => s.sum));
        const winners = scores.filter((s) => s.sum === maxSum).map((s) => s.pid);

        if (winners.length === 1) {
          const winnerId = winners[0]!;
          next.setupRollWinner = winnerId;

          // Reorder playerOrder starting with winner and proceeding clockwise
          const winnerIdx = next.playerOrder.indexOf(winnerId);
          next.playerOrder = [
            ...next.playerOrder.slice(winnerIdx),
            ...next.playerOrder.slice(0, winnerIdx),
          ];

          next.phase = 'SetupDraft';
          next.activePlayerId = winnerId;
          next.pendingDecisions = [
            { id: 'setup-0', type: 'SETUP_PLACE_SETTLEMENT', playerId: winnerId, round: 1 },
          ];

          next.log.push({
            timestamp: next.log.length,
            message: `${player.name} rolled ${rollSum} (${die1} + ${die2}). ${next.players[winnerId]!.name} rolled highest (${maxSum}) and goes first! Round 1: Place first Town & Road.`,
          });
        } else {
          // Tie between multiple players; clear rolls only for tied players
          for (const pid of winners) {
            delete next.setupRolls![pid];
          }
          next.activePlayerId = winners[0]!;
          const tiedNames = winners.map((pid) => next.players[pid]!.name).join(' and ');
          next.log.push({
            timestamp: next.log.length,
            message: `${player.name} rolled ${rollSum} (${die1} + ${die2}). Tie between ${tiedNames} (${maxSum})! Tied players reroll.`,
          });
        }
      }
      break;
    }

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
          // The turn-order roll-off is not a production roll; start turn 1 with clear dice
          next.lastDiceRoll = null;
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

    case 'PRE_EVENT_PASS': {
      next.log.push({
        timestamp: next.log.length,
        message: `${next.players[action.playerId]!.name} passed pre-event development card window.`,
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
      next.lastDiceRoll = dice;
      const sum = dice[0] + dice[1];

      next.log.push({
        timestamp: next.log.length,
        message: `${next.players[action.playerId]!.name} rolled ${sum} (${dice[0]}, ${dice[1]}).`,
      });

      if (sum !== 7) {
        const prod = evaluateProduction(
          next.board,
          next.players,
          next.supply,
          dice,
          action.playerId,
          next.playerOrder
        );
        applyProductionPayouts(next, prod);
        const cleared = autoClearHazards(next.board, sum, next.supply);
        // The roll clears hazards by itself, so say so: it must not look like another action did it
        for (const hexId of cleared.clearedHexIds) {
          const hex = next.board.hexes[hexId]!;
          next.log.push({
            timestamp: next.log.length,
            message: `The roll of ${sum} cleared the hazard on hex ${hex.id} (${hex.terrain} #${hex.numberDisc}).`,
          });
        }
        for (const nodeId of cleared.clearedNodeIds) {
          const building = next.board.intersections[nodeId]!.building;
          next.log.push({
            timestamp: next.log.length,
            message: `The roll of ${sum} cleared the hazard on ${building ? `${next.players[building.playerId]!.name}'s ${building.type}` : 'a building'}.`,
          });
        }
        next.phase = 'ActionPhase';
      } else {
        // Roll of 7
        queueDiscardsOnSeven(next);
        if (next.pendingDecisions.length === 0) {
          promptMoveInspector(next);
        }
      }
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
      } else if (head.type === 'DISCARD_ON_SEVEN') {
        const resp = action.response as {
          cards: Partial<Record<ResourceType | 'science', number>>;
        };
        const player = next.players[action.playerId]!;
        let totalCount = 0;
        const resList = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'] as const;

        for (const r of resList) {
          const count = resp.cards[r] || 0;
          if (count > player.resources[r]) {
            throw new IllegalActionError(`Cannot discard more ${r} than held in hand`);
          }
          player.resources[r] -= count;
          next.supply.resources[r] += count;
          totalCount += count;
        }

        const scienceCount = resp.cards.science || 0;
        if (scienceCount > player.science) {
          throw new IllegalActionError('Cannot discard more science than held in hand');
        }
        player.science -= scienceCount;
        next.supply.science += scienceCount;
        totalCount += scienceCount;

        if (totalCount !== head.cardsToDiscard) {
          throw new IllegalActionError(
            `Must discard exactly ${head.cardsToDiscard} cards, got ${totalCount}`
          );
        }

        next.log.push({
          timestamp: next.log.length,
          message: `${player.name} discarded ${totalCount} cards on roll of 7.`,
        });

        next.pendingDecisions.shift();
        if (next.pendingDecisions.length === 0) {
          promptMoveInspector(next);
        }
      } else if (head.type === 'MOVE_INSPECTOR') {
        const resp = action.response as { hexId: HexId };
        const hex = next.board.hexes[resp.hexId];
        if (!hex || hex.hasHazard || hex.hasInspector) {
          throw new IllegalActionError('Cannot move Inspector to a hazarded or current hex');
        }

        const oldHex = next.board.hexes.find((h) => h.hasInspector);
        if (oldHex) oldHex.hasInspector = false;
        hex.hasInspector = true;

        next.log.push({
          timestamp: next.log.length,
          message: `${next.players[action.playerId]!.name} moved the Inspector to hex ${hex.id} (${hex.terrain} #${hex.numberDisc}).`,
        });

        next.pendingDecisions.shift();

        const victims = getEligibleStealVictims(next, resp.hexId);
        if (victims.length === 0) {
          next.phase = 'ActionPhase';
        } else {
          next.pendingDecisions.push({
            id: `steal-${next.currentTurn}`,
            type: 'STEAL_TARGET',
            playerId: action.playerId,
            candidatePlayerIds: victims,
            hexId: resp.hexId,
          });
        }
      } else if (head.type === 'STEAL_TARGET') {
        const resp = action.response as { targetPlayerId: PlayerId };
        if (!head.candidatePlayerIds.includes(resp.targetPlayerId)) {
          throw new IllegalActionError('Invalid victim selected for steal');
        }

        executeStealCard(next, action.playerId, resp.targetPlayerId);
        next.pendingDecisions.shift();
        next.phase = 'ActionPhase';
      } else if (head.type === 'DOMESTIC_TRADE_RESPONSE') {
        const resp = action.response as { accept: boolean };
        applyTradeResponse(next, head.id, resp.accept);
      } else if (head.type === 'TRADE_REQUEST_REPLY') {
        applyTradeRequestReply(next, head.id, action.response);
      } else if (head.type === 'TRADE_REQUEST_CHOICE') {
        applyTradeRequestChoice(next, head.id, action.response);
      }
      break;
    }

    case 'BUILD_ROAD': {
      applyBuildRoad(next, action.playerId, action.edgeId);
      break;
    }

    case 'BUILD_TOWN': {
      applyBuildTown(next, action.playerId, action.nodeId);
      checkOwnTurnVictory(next);
      break;
    }

    case 'BUILD_CITY': {
      applyBuildCity(next, action.playerId, action.nodeId);
      checkOwnTurnVictory(next);
      break;
    }

    case 'BUILD_FOSSIL_PLANT': {
      applyBuildPowerPlant(next, action.playerId, action.nodeId, action.hexId, 'fossil');
      break;
    }

    case 'BUILD_RENEWABLE_PLANT': {
      applyBuildPowerPlant(next, action.playerId, action.nodeId, action.hexId, 'renewable');
      break;
    }

    case 'BUILD_WAREHOUSE': {
      applyBuildWarehouse(next, action.playerId);
      break;
    }

    case 'BUY_DEV_CARD': {
      applyBuyDevCard(next, action.playerId);
      break;
    }

    case 'PLAY_DEV_CARD': {
      applyPlayDevCard(next, action.playerId, action.cardId, action.params);
      break;
    }

    case 'REVEAL_VP_CARDS': {
      applyRevealVpCards(next, action.playerId, action.cardIds);
      break;
    }

    case 'SPEND_ENERGY': {
      applySpendEnergy(next, action.playerId, action.usage, action.params);
      break;
    }

    case 'TRADE_SUPPLY': {
      applyTradeSupply(next, action.playerId, action.give, action.receive);
      break;
    }

    case 'TRADE_HARBOR': {
      applyTradeHarbor(next, action.playerId, action.harborId, action.give, action.receive);
      break;
    }

    case 'OFFER_TRADE': {
      applyOfferTrade(next, action.playerId, action.targetPlayerId, action.give, action.want, action.thenOffer);
      break;
    }

    case 'REQUEST_TRADE': {
      applyRequestTrade(next, action.playerId, action.ask);
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
