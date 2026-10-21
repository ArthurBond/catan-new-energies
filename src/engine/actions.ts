/**
 * CATAN: New Energies — Game Actions & Legal Action Generation
 *
 * Implements legalActions(state, playerId) generator for all phases
 * and pending decisions.
 */

import { getEmptyIncidentEdges, getNodesSatisfyingDistanceRule } from './board';
import { GameAction, GameState, PlayerId, PlayerState, ResourceType } from './types';

function generateDiscardChoices(
  player: PlayerState,
  cardsToDiscard: number
): Partial<Record<ResourceType | 'science', number>>[] {
  const cards: (ResourceType | 'science')[] = [];
  const resourceTypes = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'] as const;
  for (const r of resourceTypes) {
    for (let i = 0; i < player.resources[r]; i++) cards.push(r);
  }
  for (let i = 0; i < player.science; i++) cards.push('science');

  if (cards.length < cardsToDiscard) return [];

  const results: Partial<Record<ResourceType | 'science', number>>[] = [];
  const seen = new Set<string>();

  function backtrack(
    startIdx: number,
    current: Partial<Record<ResourceType | 'science', number>>,
    count: number
  ) {
    if (count === cardsToDiscard) {
      const key = JSON.stringify(current);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ ...current });
      }
      return;
    }
    if (results.length >= 50) return;

    for (let i = startIdx; i < cards.length; i++) {
      const card = cards[i]!;
      current[card] = (current[card] || 0) + 1;
      backtrack(i + 1, current, count + 1);
      current[card] = current[card]! - 1;
      if (current[card] === 0) delete current[card];
    }
  }

  backtrack(0, {}, 0);
  return results;
}

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
    case 'REVEAL_VP_CARDS':
      return b.type === a.type && a.cardIds.length === b.cardIds.length && a.cardIds.every((id, idx) => id === b.cardIds[idx]);
    case 'RESOLVE_PENDING_DECISION':
      return (
        b.type === a.type &&
        b.decisionId === a.decisionId &&
        JSON.stringify(a.response) === JSON.stringify(b.response)
      );
    default:
      return false;
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

    if (head.type === 'EVENT_HAZARD_CHOICE') {
      const eligibleNodes: number[] = [];
      if (head.targetType === 'CityFirst') {
        const unhazardedCities = state.board.intersections.filter(
          (n) => n.building?.playerId === playerId && n.building.type === 'city' && !n.hasHazard
        );
        if (unhazardedCities.length > 0) {
          eligibleNodes.push(...unhazardedCities.map((n) => n.id));
        } else {
          const unhazardedTowns = state.board.intersections.filter(
            (n) => n.building?.playerId === playerId && n.building.type === 'town' && !n.hasHazard
          );
          eligibleNodes.push(...unhazardedTowns.map((n) => n.id));
        }
      } else {
        const unhazarded = state.board.intersections.filter(
          (n) => n.building?.playerId === playerId && !n.hasHazard
        );
        eligibleNodes.push(...unhazarded.map((n) => n.id));
      }

      return eligibleNodes.map((nodeId) => ({
        type: 'RESOLVE_PENDING_DECISION',
        playerId,
        decisionId: head.id,
        response: { nodeId },
      }));
    }

    if (head.type === 'EVENT_CARD_CHOICE') {
      const actions: GameAction[] = [];
      const resourceTypes = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'] as const;

      if (head.event === 'ClimateConferenceReward' || head.event === 'SustainableProduction') {
        for (const res of resourceTypes) {
          if (state.supply.resources[res] > 0) {
            actions.push({
              type: 'RESOLVE_PENDING_DECISION',
              playerId,
              decisionId: head.id,
              response: { cardType: res },
            });
          }
        }
        if (state.supply.science > 0) {
          actions.push({
            type: 'RESOLVE_PENDING_DECISION',
            playerId,
            decisionId: head.id,
            response: { cardType: 'science' },
          });
        }
        if (head.isOptional) {
          actions.push({
            type: 'RESOLVE_PENDING_DECISION',
            playerId,
            decisionId: head.id,
            response: { pass: true },
          });
        }
      } else if (head.event === 'ClimateConferencePenalty') {
        const p = state.players[playerId]!;
        for (const res of resourceTypes) {
          if (p.resources[res] > 0) {
            actions.push({
              type: 'RESOLVE_PENDING_DECISION',
              playerId,
              decisionId: head.id,
              response: { cardType: res },
            });
          }
        }
        if (p.science > 0) {
          actions.push({
            type: 'RESOLVE_PENDING_DECISION',
            playerId,
            decisionId: head.id,
            response: { cardType: 'science' },
          });
        }
      } else if (head.event === 'GovernmentFunding') {
        if (state.supply.devDeck.length > 0) {
          actions.push({
            type: 'RESOLVE_PENDING_DECISION',
            playerId,
            decisionId: head.id,
            response: { take: true },
          });
        }
        if (head.isOptional) {
          actions.push({
            type: 'RESOLVE_PENDING_DECISION',
            playerId,
            decisionId: head.id,
            response: { pass: true },
          });
        }
      }

      return actions;
    }

    if (head.type === 'EVENT_PRODUCTION_INCREASE') {
      const actions: GameAction[] = [];
      const player = state.players[playerId]!;

      if (player.fossilPlantsInReserve > 0) {
        for (const node of state.board.intersections) {
          if (node.building?.playerId !== playerId) continue;
          const isTown = node.building.type === 'town';
          const isCity = node.building.type === 'city';

          if (isTown && node.powerPlants.length >= 1) continue;
          if (isCity && node.powerPlants.length >= 3) continue;

          for (const hexId of node.adjacentHexIds) {
            const hex = state.board.hexes[hexId]!;
            if (hex.terrain === 'desert' || hex.numberDisc === null) continue;
            if (node.powerPlants.some((p) => p.hexId === hexId)) continue;

            actions.push({
              type: 'RESOLVE_PENDING_DECISION',
              playerId,
              decisionId: head.id,
              response: { build: true, nodeId: node.id, hexId: hex.id },
            });
          }
        }
      }

      actions.push({
        type: 'RESOLVE_PENDING_DECISION',
        playerId,
        decisionId: head.id,
        response: { pass: true },
      });

      return actions;
    }

    if (head.type === 'DISCARD_ON_SEVEN') {
      const choices = generateDiscardChoices(state.players[playerId]!, head.cardsToDiscard);
      return choices.map((cards) => ({
        type: 'RESOLVE_PENDING_DECISION',
        playerId,
        decisionId: head.id,
        response: { cards },
      }));
    }

    if (head.type === 'MOVE_INSPECTOR') {
      const legalHexes = state.board.hexes.filter((h) => !h.hasHazard && !h.hasInspector);
      return legalHexes.map((h) => ({
        type: 'RESOLVE_PENDING_DECISION',
        playerId,
        decisionId: head.id,
        response: { hexId: h.id },
      }));
    }

    if (head.type === 'STEAL_TARGET') {
      return head.candidatePlayerIds.map((victimId) => ({
        type: 'RESOLVE_PENDING_DECISION',
        playerId,
        decisionId: head.id,
        response: { targetPlayerId: victimId },
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
