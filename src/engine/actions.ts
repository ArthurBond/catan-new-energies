/**
 * CATAN: New Energies — Game Actions & Legal Action Generation
 *
 * Implements legalActions(state, playerId) generator for all phases
 * and pending decisions.
 */

import { getEmptyIncidentEdges, getNodesSatisfyingDistanceRule } from './board';
import {
  canBuildPowerPlant,
  canBuildRoad,
  canBuildTown,
} from './build';
import { RESOURCE_TYPES } from './config';
import {
  canBuyDevCard,
  canRevealVpCards,
  getDevCardType,
  isEdgeConnectedToPlayerNetwork,
} from './dev-cards';
import { getEligibleStealVictims, getHandSizeForSeven, isHandBreakdownHidden } from './production';
import { tradeRequestChoiceActions, tradeRequestReplyActions } from './trade-requests';
import {
  EdgeId,
  GameAction,
  GameState,
  HexId,
  NodeId,
  PlayerId,
  PlayerState,
  ResourceType,
} from './types';

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

const DISCARDABLE_CARDS = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const;

/**
 * Validates a discard-on-7 answer directly against the rules (PRD-03) instead of against an
 * enumerated list: exactly `cardsToDiscard` resource/science cards, whole non-negative numbers,
 * never more of a kind than the player holds. Zero entries and key order are irrelevant.
 */
export function canResolveDiscard(
  state: GameState,
  playerId: PlayerId,
  decisionId: string,
  response: unknown
): { ok: boolean; reason?: string } {
  const head = state.pendingDecisions[0];
  if (!head || head.type !== 'DISCARD_ON_SEVEN' || head.id !== decisionId || head.playerId !== playerId) {
    return { ok: false, reason: 'No discard is waiting for this player' };
  }
  const cards = (response as { cards?: unknown } | null)?.cards;
  if (!cards || typeof cards !== 'object') return { ok: false, reason: 'Missing cards to discard' };

  const player = state.players[playerId]!;
  let total = 0;
  for (const [key, value] of Object.entries(cards as Record<string, unknown>)) {
    if (!(DISCARDABLE_CARDS as readonly string[]).includes(key)) {
      return { ok: false, reason: `${key} cannot be discarded` };
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return { ok: false, reason: `Invalid number of ${key}` };
    }
    const held = key === 'science' ? player.science : player.resources[key as ResourceType];
    if (value > held) return { ok: false, reason: `Not enough ${key} in hand` };
    total += value;
  }
  if (total !== head.cardsToDiscard) {
    return { ok: false, reason: `Must discard exactly ${head.cardsToDiscard} cards` };
  }
  return { ok: true };
}

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` compare equal. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v
  );
}

export function isActionEqual(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) return false;

  switch (a.type) {
    case 'SETUP_ROLL_DICE':
      return b.type === a.type;
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
      return b.type === a.type && b.cardId === a.cardId && canonicalJson(a.params) === canonicalJson(b.params);
    case 'SPEND_ENERGY':
      return b.type === a.type && b.usage === a.usage && canonicalJson(a.params) === canonicalJson(b.params);
    case 'TRADE_SUPPLY':
      return b.type === a.type && b.receive === a.receive && canonicalJson(a.give) === canonicalJson(b.give);
    case 'TRADE_HARBOR':
      return (
        b.type === a.type &&
        b.harborId === a.harborId &&
        b.receive === a.receive &&
        canonicalJson(a.give) === canonicalJson(b.give)
      );
    case 'OFFER_TRADE':
      return (
        b.type === a.type &&
        b.targetPlayerId === a.targetPlayerId &&
        canonicalJson(a.give) === canonicalJson(b.give) &&
        canonicalJson(a.want) === canonicalJson(b.want)
      );
    case 'REQUEST_TRADE':
      return b.type === a.type && canonicalJson(a.ask) === canonicalJson(b.ask);
    case 'REVEAL_VP_CARDS':
      return b.type === a.type && a.cardIds.length === b.cardIds.length && a.cardIds.every((id, idx) => id === b.cardIds[idx]);
    case 'RESOLVE_PENDING_DECISION':
      return (
        b.type === a.type &&
        b.decisionId === a.decisionId &&
        canonicalJson(a.response) === canonicalJson(b.response)
      );
    default:
      return false;
  }
}

export function generateLegalDevCardPlays(state: GameState, playerId: PlayerId): GameAction[] {
  const actions: GameAction[] = [];
  const player = state.players[playerId];
  if (!player) return actions;

  // Max 1 card per turn (unless VP)
  if (state.devCardPlayedThisTurn || state.turnStats.devCardsPlayedThisTurn >= 1) {
    return actions;
  }

  const seenTypes = new Set<string>();

  for (const cardId of player.devCards.unplayed) {
    // Cannot play card bought on current turn
    if (
      state.devCardsBoughtThisTurn.includes(cardId) ||
      state.turnStats.devCardsBoughtThisTurn.includes(cardId)
    ) {
      continue;
    }

    const cardType = getDevCardType(cardId);
    if (seenTypes.has(cardType)) continue;
    seenTypes.add(cardType);

    if (cardType === 'cleanup') {
      // Option 1: Move Inspector + Steal
      for (const hex of state.board.hexes) {
        if (!hex.hasHazard && !hex.hasInspector) {
          const victims = getEligibleStealVictims(state, hex.id);
          if (victims.length > 0) {
            for (const vid of victims) {
              actions.push({
                type: 'PLAY_DEV_CARD',
                playerId,
                cardId,
                params: {
                  cardType: 'cleanup',
                  option: {
                    type: 'INSPECTOR_MOVE_STEAL',
                    newHexId: hex.id,
                    targetPlayerId: vid,
                  },
                },
              });
            }
          } else {
            actions.push({
              type: 'PLAY_DEV_CARD',
              playerId,
              cardId,
              params: {
                cardType: 'cleanup',
                option: {
                  type: 'INSPECTOR_MOVE_STEAL',
                  newHexId: hex.id,
                },
              },
            });
          }
        }
      }

      // Option 2: Remove Hazard + Steal
      const hazardTargets: ({ kind: 'hex'; id: HexId } | { kind: 'node'; id: NodeId })[] = [];
      for (const h of state.board.hexes) {
        if (h.hasHazard) hazardTargets.push({ kind: 'hex', id: h.id });
      }
      for (const n of state.board.intersections) {
        if (n.hasHazard) hazardTargets.push({ kind: 'node', id: n.id });
      }

      const lfVictims = state.playerOrder.filter(
        (pid) =>
          pid !== playerId &&
          state.players[pid]!.localFootprint >= player.localFootprint &&
          getHandSizeForSeven(state.players[pid]!) > 0
      );

      if (hazardTargets.length > 0) {
        for (const target of hazardTargets) {
          if (lfVictims.length > 0) {
            for (const vid of lfVictims) {
              actions.push({
                type: 'PLAY_DEV_CARD',
                playerId,
                cardId,
                params: {
                  cardType: 'cleanup',
                  option: {
                    type: 'REMOVE_HAZARD_STEAL',
                    hazardTarget: target,
                    targetPlayerId: vid,
                  },
                },
              });
            }
          } else {
            actions.push({
              type: 'PLAY_DEV_CARD',
              playerId,
              cardId,
              params: {
                cardType: 'cleanup',
                option: {
                  type: 'REMOVE_HAZARD_STEAL',
                  hazardTarget: target,
                },
              },
            });
          }
        }
      } else {
        // No hazards on board
        if (lfVictims.length > 0) {
          for (const vid of lfVictims) {
            actions.push({
              type: 'PLAY_DEV_CARD',
              playerId,
              cardId,
              params: {
                cardType: 'cleanup',
                option: {
                  type: 'REMOVE_HAZARD_STEAL',
                  hazardTarget: { kind: 'hex', id: 0 },
                  targetPlayerId: vid,
                },
              },
            });
          }
        } else {
          actions.push({
            type: 'PLAY_DEV_CARD',
            playerId,
            cardId,
            params: {
              cardType: 'cleanup',
              option: {
                type: 'REMOVE_HAZARD_STEAL',
                hazardTarget: { kind: 'hex', id: 0 },
              },
            },
          });
        }
      }
    } else if (cardType === 'roadConstruction') {
      if (player.roadsInReserve >= 1) {
        const connectedEmptyEdges: EdgeId[] = [];
        for (const e of state.board.edges) {
          if (e.road === null && isEdgeConnectedToPlayerNetwork(state.board, playerId, e.id)) {
            connectedEmptyEdges.push(e.id);
          }
        }
        if (player.roadsInReserve === 1) {
          for (const e1 of connectedEmptyEdges) {
            actions.push({
              type: 'PLAY_DEV_CARD',
              playerId,
              cardId,
              params: { cardType: 'roadConstruction', edge1: e1 },
            });
          }
        } else {
          // Up to 2 roads
          for (const e1 of connectedEmptyEdges) {
            let count = 0;
            for (const e2 of state.board.edges) {
              if (
                e2.id !== e1 &&
                e2.road === null &&
                isEdgeConnectedToPlayerNetwork(state.board, playerId, e2.id, [e1])
              ) {
                actions.push({
                  type: 'PLAY_DEV_CARD',
                  playerId,
                  cardId,
                  params: { cardType: 'roadConstruction', edge1: e1, edge2: e2.id },
                });
                count++;
                if (count >= 5) break;
              }
            }
          }
        }
      }
    } else if (cardType === 'highYield') {
      const renewableHexes: HexId[] = [];
      for (const h of state.board.hexes) {
        const hasRenewable = state.board.intersections.some(
          (n) =>
            n.adjacentHexIds.includes(h.id) &&
            n.powerPlants.some(
              (p) => p.playerId === playerId && p.type === 'renewable' && p.hexId === h.id
            )
        );
        if (hasRenewable) {
          renewableHexes.push(h.id);
        }
      }
      if (renewableHexes.length > 0) {
        actions.push({
          type: 'PLAY_DEV_CARD',
          playerId,
          cardId,
          params: { cardType: 'highYield', hexIds: renewableHexes.slice(0, 3) },
        });
      }
    } else if (cardType === 'researchGrant') {
      const availableCards: (ResourceType | 'science')[] = [];
      for (const r of RESOURCE_TYPES) {
        if (state.supply.resources[r] > 0) availableCards.push(r);
      }
      if (state.supply.science > 0) availableCards.push('science');

      for (let i = 0; i < availableCards.length; i++) {
        for (let j = i; j < availableCards.length; j++) {
          const c1 = availableCards[i]!;
          const c2 = availableCards[j]!;
          if (c1 === c2) {
            const sup = c1 === 'science' ? state.supply.science : state.supply.resources[c1];
            if (sup < 2) continue;
          }
          actions.push({
            type: 'PLAY_DEV_CARD',
            playerId,
            cardId,
            params: { cardType: 'researchGrant', cards: [c1, c2] },
          });
        }
      }
    }
  }

  return actions;
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

    if (head.type === 'DOMESTIC_TRADE_RESPONSE') {
      const respOfferer = state.players[head.offeringPlayerId]!;
      const respResponder = state.players[head.targetPlayerId]!;

      let canAccept = true;
      for (const [key, count] of Object.entries(head.want)) {
        if (!count || count <= 0) continue;
        if (key === 'energy') {
          if (respResponder.energy < count) canAccept = false;
        } else if (key === 'science') {
          if (respResponder.science < count) canAccept = false;
        } else {
          if (respResponder.resources[key as ResourceType] < count) canAccept = false;
        }
      }
      // A browser cannot see the offerer's cards; the server checked them when it took the offer.
      for (const [key, count] of Object.entries(head.give)) {
        if (!count || count <= 0 || isHandBreakdownHidden(respOfferer)) continue;
        if (key === 'energy') {
          if (respOfferer.energy < count) canAccept = false;
        } else if (key === 'science') {
          if (respOfferer.science < count) canAccept = false;
        } else {
          if (respOfferer.resources[key as ResourceType] < count) canAccept = false;
        }
      }

      const actions: GameAction[] = [];
      if (canAccept) {
        actions.push({
          type: 'RESOLVE_PENDING_DECISION',
          playerId,
          decisionId: head.id,
          response: { accept: true },
        });
      }
      actions.push({
        type: 'RESOLVE_PENDING_DECISION',
        playerId,
        decisionId: head.id,
        response: { accept: false },
      });
      return actions;
    }

    // Replies are validated against the rules directly; these lists are only a sample of them
    if (head.type === 'TRADE_REQUEST_REPLY') return tradeRequestReplyActions(state, head);
    if (head.type === 'TRADE_REQUEST_CHOICE') return tradeRequestChoiceActions(state, head);

    return [];
  }

  // 2. If no pending decisions, only the active player may take turn phase actions
  if (state.phase === 'SetupRoll') {
    if (state.activePlayerId === playerId || !state.setupRolls?.[playerId]) {
      return [{ type: 'SETUP_ROLL_DICE', playerId }];
    }
    return [];
  }

  if (state.activePlayerId !== playerId) {
    return [];
  }

  if (state.phase === 'EventPhase') {
    const actions: GameAction[] = [];
    actions.push({ type: 'DRAW_EVENT_DISC', playerId });
    if (state.eventDiscsDrawnThisTurn === 0) {
      actions.push({ type: 'PRE_EVENT_PASS', playerId });
      actions.push(...generateLegalDevCardPlays(state, playerId));
    }
    return actions;
  }

  if (state.phase === 'ProductionPhase') {
    return [{ type: 'ROLL_DICE', playerId }];
  }

  if (state.phase === 'ActionPhase') {
    const actions: GameAction[] = [];
    actions.push({ type: 'END_TURN', playerId });

    const player = state.players[playerId]!;

    // 1. Roads
    if (player.roadsInReserve > 0 && player.resources.lumber >= 1 && player.resources.brick >= 1) {
      for (const edge of state.board.edges) {
        if (edge.road === null && canBuildRoad(state, playerId, edge.id).canBuild) {
          actions.push({ type: 'BUILD_ROAD', playerId, edgeId: edge.id });
        }
      }
    }

    // 2. Towns
    if (
      player.townsInReserve > 0 &&
      player.resources.lumber >= 1 &&
      player.resources.brick >= 1 &&
      player.resources.natural_fiber >= 1 &&
      player.resources.food >= 1
    ) {
      for (const node of state.board.intersections) {
        if (node.building === null && canBuildTown(state, playerId, node.id).canBuild) {
          actions.push({ type: 'BUILD_TOWN', playerId, nodeId: node.id });
        }
      }
    }

    // 3. Cities
    if (player.citiesInReserve > 0 && player.resources.steel >= 3 && player.resources.food >= 2) {
      for (const node of state.board.intersections) {
        if (node.building?.playerId === playerId && node.building.type === 'town') {
          actions.push({ type: 'BUILD_CITY', playerId, nodeId: node.id });
        }
      }
    }

    // 4. Power Plants (Combined 1/turn limit)
    if (state.turnStats.powerPlantsBuiltThisTurn < 1) {
      for (const node of state.board.intersections) {
        if (node.building?.playerId !== playerId) continue;
        for (const hexId of node.adjacentHexIds) {
          if (canBuildPowerPlant(state, playerId, node.id, hexId, 'fossil').canBuild) {
            actions.push({ type: 'BUILD_FOSSIL_PLANT', playerId, nodeId: node.id, hexId });
          }
          if (canBuildPowerPlant(state, playerId, node.id, hexId, 'renewable').canBuild) {
            actions.push({ type: 'BUILD_RENEWABLE_PLANT', playerId, nodeId: node.id, hexId });
          }
        }
      }
    }

    // 5. Warehouse
    if (!player.hasWarehouse && player.energy >= 2) {
      actions.push({ type: 'BUILD_WAREHOUSE', playerId });
    }

    // Dev Cards
    if (canBuyDevCard(state, playerId).canBuy) {
      actions.push({ type: 'BUY_DEV_CARD', playerId });
    }

    actions.push(...generateLegalDevCardPlays(state, playerId));

    const vpCardIds = player.devCards.unplayed.filter(
      (cid) => getDevCardType(cid) === 'victoryPoint'
    );
    if (vpCardIds.length > 0 && canRevealVpCards(state, playerId, vpCardIds).canReveal) {
      actions.push({ type: 'REVEAL_VP_CARDS', playerId, cardIds: vpCardIds });
    }

    // 6. Energy Spending Actions
    if (player.energy >= 2) {
      for (const r of RESOURCE_TYPES) {
        if (state.supply.resources[r] > 0) {
          actions.push({
            type: 'SPEND_ENERGY',
            playerId,
            usage: 'BUY_CARD',
            params: { cardType: r },
          });
        }
      }
      if (state.supply.science > 0) {
        actions.push({
          type: 'SPEND_ENERGY',
          playerId,
          usage: 'BUY_CARD',
          params: { cardType: 'science' },
        });
      }
    }

    if (player.energy >= 1) {
      // Clean hazard
      for (const hex of state.board.hexes) {
        if (hex.hasHazard) {
          actions.push({
            type: 'SPEND_ENERGY',
            playerId,
            usage: 'CLEAN_HAZARD',
            params: { hazardTarget: { kind: 'hex', id: hex.id } },
          });
        }
      }
      for (const node of state.board.intersections) {
        if (node.hasHazard) {
          actions.push({
            type: 'SPEND_ENERGY',
            playerId,
            usage: 'CLEAN_HAZARD',
            params: { hazardTarget: { kind: 'node', id: node.id } },
          });
        }
      }

      // Demolish fossil plant (max 1/turn)
      if (state.turnStats.fossilPlantsDemolishedThisTurn < 1) {
        for (const node of state.board.intersections) {
          for (const plant of node.powerPlants) {
            if (plant.playerId === playerId && plant.type === 'fossil') {
              actions.push({
                type: 'SPEND_ENERGY',
                playerId,
                usage: 'DEMOLISH_PLANT',
                params: { plantTarget: { nodeId: node.id, hexId: plant.hexId } },
              });
            }
          }
        }
      }
    }

    // 7. Supply Trades (4:1 resource, 3:1 science, 2:1 energy)
    for (const r of RESOURCE_TYPES) {
      if (player.resources[r] >= 4) {
        for (const target of RESOURCE_TYPES) {
          if (target !== r && state.supply.resources[target] > 0) {
            actions.push({
              type: 'TRADE_SUPPLY',
              playerId,
              give: { [r]: 4 },
              receive: target,
            });
          }
        }
        if (state.supply.science > 0) {
          actions.push({
            type: 'TRADE_SUPPLY',
            playerId,
            give: { [r]: 4 },
            receive: 'science',
          });
        }
      }
    }

    if (player.science >= 3) {
      for (const target of RESOURCE_TYPES) {
        if (state.supply.resources[target] > 0) {
          actions.push({
            type: 'TRADE_SUPPLY',
            playerId,
            give: { science: 3 },
            receive: target,
          });
        }
      }
    }

    if (player.energy >= 2) {
      for (const target of RESOURCE_TYPES) {
        if (state.supply.resources[target] > 0) {
          actions.push({
            type: 'TRADE_SUPPLY',
            playerId,
            give: { energy: 2 },
            receive: target,
          });
        }
      }
      if (state.supply.science > 0) {
        actions.push({
          type: 'TRADE_SUPPLY',
          playerId,
          give: { energy: 2 },
          receive: 'science',
        });
      }
    }

    // 8. Harbor Trades
    for (const harbor of state.board.harbors) {
      const hasAccess = harbor.nodeIds.some(
        (nId) => state.board.intersections[nId]?.building?.playerId === playerId
      );
      if (!hasAccess) continue;

      if (harbor.type === 'generic') {
        for (const r of RESOURCE_TYPES) {
          if (player.resources[r] >= 3) {
            for (const target of RESOURCE_TYPES) {
              if (target !== r && state.supply.resources[target] > 0) {
                actions.push({
                  type: 'TRADE_HARBOR',
                  playerId,
                  harborId: harbor.id,
                  give: { [r]: 3 },
                  receive: target,
                });
              }
            }
            if (state.supply.science > 0) {
              actions.push({
                type: 'TRADE_HARBOR',
                playerId,
                harborId: harbor.id,
                give: { [r]: 3 },
                receive: 'science',
              });
            }
          }
        }
      } else {
        const res = harbor.resource!;
        if (player.resources[res] >= 2) {
          for (const target of RESOURCE_TYPES) {
            if (target !== res && state.supply.resources[target] > 0) {
              actions.push({
                type: 'TRADE_HARBOR',
                playerId,
                harborId: harbor.id,
                give: { [res]: 2 },
                receive: target,
              });
            }
          }
          if (state.supply.science > 0) {
            actions.push({
              type: 'TRADE_HARBOR',
              playerId,
              harborId: harbor.id,
              give: { [res]: 2 },
              receive: 'science',
            });
          }
        }
      }
    }

    return actions;
  }

  return [];
}
