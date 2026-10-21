/**
 * CATAN: New Energies — Game Actions & Legal Action Generation
 *
 * Implements legalActions(state, playerId) generator for all phases
 * and pending decisions.
 */

import { getEmptyIncidentEdges, getNodesSatisfyingDistanceRule } from './board';
import { GameAction, GameState, PlayerId } from './types';

export function isActionEqual(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) return false;

  switch (a.type) {
    case 'SETUP_BUILD_TOWN':
    case 'SETUP_BUILD_CITY':
      return b.type === a.type && b.nodeId === a.nodeId;
    case 'SETUP_BUILD_ROAD':
      return b.type === a.type && b.edgeId === a.edgeId;
    case 'PRE_EVENT_PASS':
    case 'DRAW_EVENT_DISC':
    case 'ROLL_DICE':
    case 'END_TURN':
      return b.type === a.type;
    case 'BUILD_ROAD':
      return b.type === a.type && b.edgeId === a.edgeId;
    case 'BUILD_TOWN':
    case 'BUILD_CITY':
      return b.type === a.type && b.nodeId === a.nodeId;
    case 'BUILD_FOSSIL_PLANT':
    case 'BUILD_RENEWABLE_PLANT':
      return b.type === a.type && b.nodeId === a.nodeId && b.hexId === a.hexId;
    case 'BUILD_WAREHOUSE':
    case 'BUY_DEV_CARD':
      return b.type === a.type;
    case 'PLAY_DEV_CARD':
      return b.type === a.type && b.cardId === a.cardId;
    case 'SPEND_ENERGY':
      return b.type === a.type && b.usage === a.usage;
    case 'TRADE_SUPPLY':
      return b.type === a.type && b.receive === a.receive;
    case 'TRADE_HARBOR':
      return b.type === a.type && b.harborId === a.harborId && b.receive === a.receive;
    case 'OFFER_TRADE':
      return b.type === a.type && b.targetPlayerId === a.targetPlayerId;
    case 'RESOLVE_PENDING_DECISION':
      return b.type === a.type && b.decisionId === a.decisionId;
  }
}

export function legalActions(state: GameState, playerId: PlayerId): GameAction[] {
  // 1. If there are pending decisions, only the player addressed by the head decision may act
  if (state.pendingDecisions.length > 0) {
    const head = state.pendingDecisions[0]!;
    if (head.playerId !== playerId) {
      return []; // Must wait for active player to resolve decision
    }

    if (head.type === 'SETUP_PLACE_SETTLEMENT') {
      const isRound1 = head.round === 1;
      const validNodes = getNodesSatisfyingDistanceRule(state.board);
      return validNodes.map((nodeId) =>
        isRound1
          ? { type: 'SETUP_BUILD_TOWN', playerId, nodeId }
          : { type: 'SETUP_BUILD_CITY', playerId, nodeId }
      );
    }

    if (head.type === 'SETUP_PLACE_ROAD') {
      const incidentEdges = getEmptyIncidentEdges(state.board, head.connectedToNodeId);
      return incidentEdges.map((edgeId) => ({
        type: 'SETUP_BUILD_ROAD',
        playerId,
        edgeId,
      }));
    }

    return [];
  }

  // 2. If no pending decisions, only the active player may take turn phase actions
  if (state.activePlayerId !== playerId) {
    return [];
  }

  if (state.phase === 'EventPhase') {
    return [{ type: 'DRAW_EVENT_DISC', playerId }];
  }

  if (state.phase === 'ProductionPhase') {
    return [{ type: 'ROLL_DICE', playerId }];
  }

  if (state.phase === 'ActionPhase') {
    const actions: GameAction[] = [];
    actions.push({ type: 'END_TURN', playerId });
    return actions;
  }

  return [];
}
