/**
 * CATAN: New Energies — Heuristic AI Bot Engine
 *
 * Implements three distinct strategic personalities:
 * - Balanced: Balances Towns, Cities, Roads, Warehouse, and shifts from Fossil to Renewable as GF rises or Event Bag shrinks.
 * - GreenInnovator: Prioritizes Cities (for Science), Renewable Power Plants (-1 LF), Cleanup/Dev cards, demolishing fossil plants, and maintaining renewable > fossil balance.
 * - IndustrialExpansionist: Prioritizes early Fossil Fuel Power Plants (1 Science), rapid Cities/Towns/Roads, and spending 2 Energy for needed build resources.
 *
 * And three difficulty tiers:
 * - Easy: Mixes 45% random legal actions with noisy evaluation and skips supply-trade lookahead.
 * - Normal: Full heuristic utility evaluation + supply/harbor trade-to-build synthesis.
 * - Hard: Full heuristic + multi-step resource/trade planning, hand-limit compression, and aggressive leader blocking.
 */

import { legalActions } from '../engine/actions';
import { getHarborTradeRates, isValidDistance } from '../engine/board';
import { RESOURCE_TYPES } from '../engine/config';
import { getDevCardType } from '../engine/dev-cards';
import { calculateLongestRoad } from '../engine/longest-road';
import { Mulberry32PRNG } from '../engine/prng';
import { getHandSizeForSeven, isHandBreakdownHidden } from '../engine/production';
import { TERRAIN_RESOURCE_MAP } from '../engine/setup';
import {
  canResolveTradeReply,
  canTakeRequestOffer,
  type TradeRequestChoice,
  type TradeRequestReply,
} from '../engine/trade-requests';
import {
  CleanupOption,
  DevCardPlayParams,
  EdgeId,
  GameAction,
  GameState,
  HexId,
  NodeId,
  PendingDecision,
  PlayerId,
  PlayerState,
  ResourceType,
} from '../engine/types';

export type BotPersonality = 'Balanced' | 'GreenInnovator' | 'IndustrialExpansionist';
export type BotDifficulty = 'Easy' | 'Normal' | 'Hard';

export interface BotConfig {
  personality: BotPersonality;
  difficulty: BotDifficulty;
}

/**
 * Returns the dice pip weight (out of 36) for a given hex number disc.
 * 6/8 -> 5, 5/9 -> 4, 4/10 -> 3, 3/11 -> 2, 2/12 -> 1, null/7 -> 0.
 */
export function getPipValue(numberDisc: number | null): number {
  if (numberDisc === null || numberDisc === 7) return 0;
  return Math.max(0, 6 - Math.abs(7 - numberDisc));
}

/**
 * Returns the player ID that must currently act (either the head pending decision's player
 * or the active turn player), or null if the game has ended.
 */
export function getActingPlayerId(state: GameState): PlayerId | null {
  if (state.phase === 'GameEnd' || state.winner !== null) {
    return null;
  }
  if (state.pendingDecisions.length > 0) {
    return state.pendingDecisions[0]!.playerId;
  }
  return state.activePlayerId;
}

function getFallbackPRNG(state: GameState, playerId: PlayerId): Mulberry32PRNG {
  const playerOffset = state.playerOrder.indexOf(playerId) + 1;
  const derivedSeed =
    (state.prng.seed ^
      Math.imul(state.prng.calls + 1, 0x9e3779b9) ^
      Math.imul(state.log.length + playerOffset, 0x85ebca6b)) >>>
    0;
  return new Mulberry32PRNG(derivedSeed);
}

/**
 * Filters legalActions so non-progressing no-op actions (like PRE_EVENT_PASS when DRAW_EVENT_DISC is available)
 * are excluded.
 */
function getProgressingLegalActions(state: GameState, playerId: PlayerId): GameAction[] {
  const raw = legalActions(state, playerId);
  if (raw.length <= 1) return raw;

  if (state.phase === 'EventPhase' && state.pendingDecisions.length === 0) {
    const hasDraw = raw.some((a) => a.type === 'DRAW_EVENT_DISC');
    if (hasDraw) {
      return raw.filter((a) => a.type !== 'PRE_EVENT_PASS');
    }
  }
  return raw;
}

/**
 * Selects a uniformly random legal action for the given player (excluding no-op PRE_EVENT_PASS).
 */
export function chooseRandomLegalAction(
  state: GameState,
  playerId: PlayerId,
  prng?: Mulberry32PRNG
): GameAction {
  const actions = getProgressingLegalActions(state, playerId);
  if (actions.length === 0) {
    throw new Error(`No legal actions available for player ${playerId} in phase ${state.phase}`);
  }
  const rng = prng ?? getFallbackPRNG(state, playerId);
  return rng.pickRandom(actions);
}

// ============================================================================
// Setup Draft Heuristics
// ============================================================================

function getResourceWeight(res: ResourceType, personality: BotPersonality, round: 1 | 2): number {
  if (personality === 'GreenInnovator') {
    const weights: Record<ResourceType, number> = {
      steel: 1.4,
      food: 1.35,
      natural_fiber: 1.15,
      lumber: 1.05,
      brick: 1.05,
    };
    return weights[res];
  }
  if (personality === 'IndustrialExpansionist') {
    const weights: Record<ResourceType, number> =
      round === 1
        ? { lumber: 1.35, brick: 1.35, food: 1.25, steel: 1.2, natural_fiber: 1.1 }
        : { steel: 1.35, food: 1.35, lumber: 1.25, brick: 1.25, natural_fiber: 1.1 };
    return weights[res];
  }
  const weights: Record<ResourceType, number> = {
    food: 1.3,
    steel: 1.25,
    lumber: 1.2,
    brick: 1.2,
    natural_fiber: 1.15,
  };
  return weights[res];
}

export function scoreIntersectionForSetup(
  state: GameState,
  playerId: PlayerId,
  nodeId: NodeId,
  round: 1 | 2,
  personality: BotPersonality
): number {
  const node = state.board.intersections[nodeId];
  if (!node) return -1000;

  const coveredResources = new Set<ResourceType>();
  for (const n of state.board.intersections) {
    if (n.building?.playerId === playerId) {
      for (const hId of n.adjacentHexIds) {
        const hex = state.board.hexes[hId];
        if (hex) {
          const res = TERRAIN_RESOURCE_MAP[hex.terrain];
          if (res) coveredResources.add(res);
        }
      }
    }
  }

  let score = 0;
  let totalPips = 0;
  let productiveHexCount = 0;
  const nodeResources = new Set<ResourceType>();

  for (const hId of node.adjacentHexIds) {
    const hex = state.board.hexes[hId];
    if (!hex) continue;
    const res = TERRAIN_RESOURCE_MAP[hex.terrain];
    const pips = getPipValue(hex.numberDisc);

    if (res !== null && pips > 0) {
      totalPips += pips;
      productiveHexCount++;
      nodeResources.add(res);
      score += pips * getResourceWeight(res, personality, round) * 3.0;
    }
  }

  if (round === 2) {
    const scienceWeight = personality === 'GreenInnovator' ? 2.4 : 1.8;
    score += totalPips * scienceWeight;
    score += productiveHexCount * 3.5;
  } else {
    score += productiveHexCount * 2.0;
  }

  score += nodeResources.size * 3.0;

  for (const res of nodeResources) {
    if (!coveredResources.has(res)) {
      score += 5.0;
    }
  }

  if (round === 2) {
    if (nodeResources.has('lumber') && nodeResources.has('brick')) {
      score += 4.5;
    }
    if (nodeResources.has('steel') && nodeResources.has('food')) {
      score += 5.0;
    }
  }

  if (node.harborId !== null) {
    const harbor = state.board.harbors.find((h) => h.id === node.harborId);
    if (harbor) {
      if (harbor.type === 'generic') {
        score += 2.5;
      } else if (
        harbor.resource &&
        (nodeResources.has(harbor.resource) || coveredResources.has(harbor.resource))
      ) {
        score += 4.0;
      } else {
        score += 1.0;
      }
    }
  }

  return score;
}

function scoreSetupRoad(
  state: GameState,
  playerId: PlayerId,
  edgeId: EdgeId,
  connectedToNodeId: NodeId,
  personality: BotPersonality
): number {
  const edge = state.board.edges[edgeId];
  if (!edge) return -1000;

  const otherNodeId = edge.v1 === connectedToNodeId ? edge.v2 : edge.v1;
  const otherNode = state.board.intersections[otherNodeId];
  if (!otherNode) return -1000;

  let bestExpansionScore = 0;
  for (const nextNodeId of otherNode.adjacentNodeIds) {
    if (nextNodeId === connectedToNodeId) continue;
    if (isValidDistance(state.board, nextNodeId)) {
      const nodeScore = scoreIntersectionForSetup(state, playerId, nextNodeId, 1, personality);
      if (nodeScore > bestExpansionScore) {
        bestExpansionScore = nodeScore;
      }
    }
  }

  const coastalPenalty = edge.isCoastal ? -1.5 : 1.5;
  return bestExpansionScore * 0.5 + coastalPenalty;
}

// ============================================================================
// Target Build & Hand Readiness Evaluation
// ============================================================================

type CardKey = ResourceType | 'science';

interface BuildTargetSpec {
  name: 'city' | 'town' | 'renewablePlant' | 'fossilPlant' | 'road' | 'devCard';
  required: Partial<Record<CardKey, number>>;
  priorityScore: number;
}

interface ActionPhaseContext {
  openTownNodes: NodeId[];
  canPlacePlant: boolean;
  feasibleTargets: BuildTargetSpec[];
  harborRates: Record<ResourceType, number>;
  currentRoadLen: number;
}

function getOpenValidTownNodesOnNetwork(state: GameState, playerId: PlayerId): NodeId[] {
  const result: NodeId[] = [];
  for (const node of state.board.intersections) {
    if (node.building !== null) continue;
    if (!isValidDistance(state.board, node.id)) continue;
    const connected = node.incidentEdgeIds.some(
      (eId) => state.board.edges[eId]?.road?.playerId === playerId
    );
    if (connected) {
      result.push(node.id);
    }
  }
  return result;
}

function hasOpenPlantCutout(state: GameState, playerId: PlayerId): boolean {
  for (const node of state.board.intersections) {
    if (node.building?.playerId !== playerId) continue;
    const maxPlants = node.building.type === 'city' ? 3 : 1;
    if (node.powerPlants.length >= maxPlants) continue;
    for (const hId of node.adjacentHexIds) {
      const hex = state.board.hexes[hId];
      if (!hex || hex.terrain === 'desert' || hex.numberDisc === null) continue;
      if (!node.powerPlants.some((p) => p.hexId === hId)) {
        return true;
      }
    }
  }
  return false;
}

function wantsFossilPlant(state: GameState, player: PlayerState, personality: BotPersonality): boolean {
  if (player.fossilPlantsInReserve <= 0 || state.turnStats.powerPlantsBuiltThisTurn >= 1) {
    return false;
  }
  if (!hasOpenPlantCutout(state, player.id)) return false;

  if (personality === 'GreenInnovator') {
    return false;
  }
  if (personality === 'IndustrialExpansionist') {
    const gfDanger = state.clampedGF >= (state.playerCount === 4 ? 20 : 15);
    return (
      !gfDanger &&
      state.eventBag.length > 26 &&
      player.fossilPlantsBuilt === 0 &&
      player.science < 3
    );
  }
  // Balanced: only very early if no plants yet and < 3 science
  return (
    state.currentTurn <= 4 &&
    player.fossilPlantsBuilt === 0 &&
    player.renewablePlantsBuilt === 0 &&
    player.science < 3 &&
    state.clampedGF < (state.playerCount === 4 ? 15 : 11) &&
    state.eventBag.length > 32
  );
}

function getFeasibleBuildTargets(
  state: GameState,
  playerId: PlayerId,
  personality: BotPersonality,
  precomputedOpenTownNodes?: NodeId[],
  precomputedCanPlacePlant?: boolean
): BuildTargetSpec[] {
  const player = state.players[playerId]!;
  const targets: BuildTargetSpec[] = [];

  const openTownNodes = precomputedOpenTownNodes ?? getOpenValidTownNodesOnNetwork(state, playerId);
  const canPlacePlant =
    precomputedCanPlacePlant ??
    (state.turnStats.powerPlantsBuiltThisTurn < 1 && hasOpenPlantCutout(state, playerId));

  const needsRenewableForEligibility = player.renewablePlantsBuilt <= player.fossilPlantsBuilt;

  // 1. Renewable Plant — critical if player is not yet eligible for Empty Bag Victory!
  if (canPlacePlant && player.renewablePlantsInReserve > 0) {
    const urgent =
      needsRenewableForEligibility ||
      state.eventBag.length <= 25 ||
      state.clampedGF >= (state.playerCount === 4 ? 16 : 12);
    const priority =
      personality === 'GreenInnovator'
        ? 122
        : urgent
          ? 120
          : 96;
    targets.push({
      name: 'renewablePlant',
      required: { science: 3 },
      priorityScore: priority,
    });
  }

  // 2. City
  if (player.citiesInReserve > 0 && player.townsBuilt > 0) {
    const priority =
      personality === 'GreenInnovator'
        ? 118
        : personality === 'IndustrialExpansionist'
          ? 116
          : 114;
    targets.push({
      name: 'city',
      required: { steel: 3, food: 2 },
      priorityScore: priority,
    });
  }

  // 3. Town
  if (player.townsInReserve > 0 && openTownNodes.length > 0) {
    const priority = personality === 'IndustrialExpansionist' ? 112 : 108;
    targets.push({
      name: 'town',
      required: { lumber: 1, brick: 1, natural_fiber: 1, food: 1 },
      priorityScore: priority,
    });
  }

  // 4. Road
  if (player.roadsInReserve > 0 && (openTownNodes.length === 0 || player.roadsBuilt >= 4)) {
    targets.push({
      name: 'road',
      required: { lumber: 1, brick: 1 },
      priorityScore: openTownNodes.length === 0 ? 86 : 72,
    });
  }

  // 5. Dev Card
  if (state.supply.devDeck.length > 0) {
    const priority = personality === 'GreenInnovator' ? 80 : 70;
    targets.push({
      name: 'devCard',
      required: { natural_fiber: 1, food: 1, steel: 1 },
      priorityScore: priority,
    });
  }

  // 6. Fossil Plant
  if (canPlacePlant && wantsFossilPlant(state, player, personality)) {
    targets.push({
      name: 'fossilPlant',
      required: { science: 1 },
      priorityScore: 68,
    });
  }

  return targets.sort((a, b) => b.priorityScore - a.priorityScore);
}

function getCardCount(
  resources: Record<ResourceType, number>,
  science: number,
  key: CardKey
): number {
  return key === 'science' ? science : resources[key];
}

function computeTargetDeficit(
  resources: Record<ResourceType, number>,
  science: number,
  required: Partial<Record<CardKey, number>>
): number {
  let deficit = 0;
  for (const [k, req] of Object.entries(required)) {
    if (!req || req <= 0) continue;
    const have = getCardCount(resources, science, k as CardKey);
    if (have < req) {
      deficit += req - have;
    }
  }
  return deficit;
}

function computeExchangeablePower(
  rates: Record<ResourceType, number>,
  resources: Record<ResourceType, number>,
  science: number,
  energy: number,
  required: Partial<Record<CardKey, number>>
): number {
  let tradesPossible = 0;

  for (const r of RESOURCE_TYPES) {
    const req = required[r] ?? 0;
    const surplus = Math.max(0, resources[r] - req);
    const rate = rates[r];
    tradesPossible += Math.floor(surplus / rate);
  }

  const sciReq = required.science ?? 0;
  const sciSurplus = Math.max(0, science - sciReq);
  tradesPossible += Math.floor(sciSurplus / 3);

  tradesPossible += Math.floor(energy / 2);
  return tradesPossible;
}

function scoreHandBuildReadiness(
  state: GameState,
  playerId: PlayerId,
  resources: Record<ResourceType, number>,
  science: number,
  personality: BotPersonality
): number {
  const targets = getFeasibleBuildTargets(state, playerId, personality);
  let score = 0;

  for (const t of targets) {
    let totalReq = 0;
    let met = 0;
    for (const [k, req] of Object.entries(t.required)) {
      if (!req || req <= 0) continue;
      totalReq += req;
      const have = getCardCount(resources, science, k as CardKey);
      met += Math.min(req, have);
    }
    if (totalReq > 0) {
      const ratio = met / totalReq;
      score += ratio * ratio * t.priorityScore * 0.45;
      if (met === totalReq) {
        score += t.priorityScore * 0.35;
      }
    }
  }

  for (const r of RESOURCE_TYPES) {
    const cnt = resources[r];
    if (cnt > 0) {
      score += Math.min(cnt, 3) * 2.5;
    }
  }
  const player = state.players[playerId]!;
  const needsRenewable = player.renewablePlantsBuilt <= player.fossilPlantsBuilt;
  score +=
    Math.min(science, 3) *
    (personality === 'GreenInnovator' || needsRenewable ? 7.5 : 4.5);

  return score;
}

// ============================================================================
// Pending Decisions Scoring
// ============================================================================

function scorePendingDecisionAction(
  state: GameState,
  playerId: PlayerId,
  decision: PendingDecision,
  action: GameAction,
  config: BotConfig
): number {
  const player = state.players[playerId]!;
  const { personality } = config;

  if (decision.type === 'SETUP_PLACE_SETTLEMENT') {
    if (action.type === 'SETUP_BUILD_TOWN' || action.type === 'SETUP_BUILD_CITY') {
      return scoreIntersectionForSetup(state, playerId, action.nodeId, decision.round, personality);
    }
    return -1000;
  }

  if (decision.type === 'SETUP_PLACE_ROAD') {
    if (action.type === 'SETUP_BUILD_ROAD') {
      return scoreSetupRoad(state, playerId, action.edgeId, decision.connectedToNodeId, personality);
    }
    return -1000;
  }

  if (action.type !== 'RESOLVE_PENDING_DECISION') return -1000;
  const resp = (action.response ?? {}) as Record<string, unknown>;

  if (decision.type === 'EVENT_HAZARD_CHOICE') {
    const nodeId = resp.nodeId as NodeId;
    const node = state.board.intersections[nodeId];
    if (!node) return -1000;

    let productivityLoss = 0;
    let adjacentToInspector = false;

    for (const hId of node.adjacentHexIds) {
      const hex = state.board.hexes[hId];
      if (!hex) continue;
      if (hex.hasInspector) adjacentToInspector = true;
      if (!hex.hasHazard && !hex.hasInspector) {
        productivityLoss += getPipValue(hex.numberDisc);
      }
    }

    if (node.building?.type === 'city') {
      productivityLoss *= 2.2;
    }
    productivityLoss += node.powerPlants.length * 4.0;
    if (adjacentToInspector) {
      productivityLoss += 12.0;
    }

    return 100 - productivityLoss;
  }

  if (decision.type === 'EVENT_CARD_CHOICE') {
    if (decision.event === 'GovernmentFunding') {
      return resp.take ? 100 : -50;
    }

    if (
      decision.event === 'ClimateConferenceReward' ||
      decision.event === 'SustainableProduction'
    ) {
      if (resp.pass) return -100;
      const cardType = resp.cardType as CardKey | undefined;
      if (!cardType) return -50;

      const nextResources = { ...player.resources };
      let nextScience = player.science;
      if (cardType === 'science') {
        nextScience += 1;
      } else {
        nextResources[cardType] += 1;
      }

      return scoreHandBuildReadiness(state, playerId, nextResources, nextScience, personality);
    }

    if (decision.event === 'ClimateConferencePenalty') {
      const cardType = resp.cardType as CardKey | undefined;
      if (!cardType) return -50;

      const nextResources = { ...player.resources };
      let nextScience = player.science;
      if (cardType === 'science') {
        nextScience = Math.max(0, nextScience - 1);
      } else {
        nextResources[cardType] = Math.max(0, nextResources[cardType] - 1);
      }

      return scoreHandBuildReadiness(state, playerId, nextResources, nextScience, personality);
    }
  }

  if (decision.type === 'EVENT_PRODUCTION_INCREASE') {
    if (resp.pass) {
      if (personality === 'IndustrialExpansionist') {
        // Takes free fossil plant unless Event Bag is dangerously close to empty and balance is negative
        return state.eventBag.length <= 12 && player.renewablePlantsBuilt <= player.fossilPlantsBuilt
          ? 120
          : 10;
      }
      if (personality === 'GreenInnovator') {
        const gfHigh = state.clampedGF >= (state.playerCount === 4 ? 15 : 11);
        const hurtsBalance = player.renewablePlantsBuilt <= player.fossilPlantsBuilt + 1;
        const bagLow = state.eventBag.length <= 30;
        return gfHigh || hurtsBalance || bagLow ? 120 : 30;
      }
      const shouldSkip =
        state.clampedGF >= (state.playerCount === 4 ? 16 : 12) ||
        state.eventBag.length <= 26 ||
        player.renewablePlantsBuilt <= player.fossilPlantsBuilt;
      return shouldSkip ? 110 : 35;
    }

    if (resp.build) {
      const hexId = resp.hexId as HexId;
      const hex = state.board.hexes[hexId];
      if (!hex) return -50;
      const pips = getPipValue(hex.numberDisc);
      const res = TERRAIN_RESOURCE_MAP[hex.terrain];
      let resBonus = 0;
      if (res) {
        const nextResources = { ...player.resources, [res]: player.resources[res] + 1 };
        resBonus =
          scoreHandBuildReadiness(state, playerId, nextResources, player.science, personality) -
          scoreHandBuildReadiness(state, playerId, player.resources, player.science, personality);
      }
      return 60 + pips * 4 + resBonus;
    }
  }

  if (decision.type === 'DISCARD_ON_SEVEN') {
    const cards = (resp.cards ?? {}) as Partial<Record<CardKey, number>>;
    const nextResources = { ...player.resources };
    let nextScience = player.science;

    for (const r of RESOURCE_TYPES) {
      nextResources[r] = Math.max(0, nextResources[r] - (cards[r] ?? 0));
    }
    nextScience = Math.max(0, nextScience - (cards.science ?? 0));

    return scoreHandBuildReadiness(state, playerId, nextResources, nextScience, personality);
  }

  if (decision.type === 'MOVE_INSPECTOR') {
    const hexId = resp.hexId as HexId;
    return scoreInspectorTargetHex(state, playerId, hexId, config.difficulty);
  }

  if (decision.type === 'STEAL_TARGET') {
    const targetPlayerId = resp.targetPlayerId as PlayerId;
    const victim = state.players[targetPlayerId];
    if (!victim) return -100;
    const handSize = getHandSizeForSeven(victim);
    const vpWeight = config.difficulty === 'Hard' ? 18 : 12;
    return (
      victim.victoryPoints * vpWeight +
      handSize * 3 +
      (victim.renewablePlantsBuilt - victim.fossilPlantsBuilt) * 4
    );
  }

  if (decision.type === 'DOMESTIC_TRADE_RESPONSE') {
    const accept = Boolean(resp.accept);
    if (!accept) return 50;

    const offerer = state.players[decision.offeringPlayerId];
    if (offerer && offerer.victoryPoints >= 8) {
      return -500;
    }

    const beforeScore = scoreHandBuildReadiness(
      state,
      playerId,
      player.resources,
      player.science,
      personality
    );

    const afterResources = { ...player.resources };
    let afterScience = player.science;

    for (const [k, count] of Object.entries(decision.give)) {
      if (!count || count <= 0 || k === 'energy') continue;
      if (k === 'science') afterScience += count;
      else afterResources[k as ResourceType] += count;
    }
    for (const [k, count] of Object.entries(decision.want)) {
      if (!count || count <= 0 || k === 'energy') continue;
      if (k === 'science') afterScience -= count;
      else afterResources[k as ResourceType] -= count;
    }

    const afterScore = scoreHandBuildReadiness(
      state,
      playerId,
      afterResources,
      afterScience,
      personality
    );

    const delta = afterScore - beforeScore;
    return delta > 6 ? 50 + delta : 20;
  }

  return 0;
}

function scoreInspectorTargetHex(
  state: GameState,
  playerId: PlayerId,
  hexId: HexId,
  difficulty: BotDifficulty
): number {
  const hex = state.board.hexes[hexId];
  if (!hex) return -1000;

  const pips = getPipValue(hex.numberDisc);
  let score = 0;
  let hasOwnBuilding = false;
  let canSteal = false;

  let maxOpponentVp = 0;
  for (const pid of state.playerOrder) {
    if (pid !== playerId) {
      maxOpponentVp = Math.max(maxOpponentVp, state.players[pid]!.victoryPoints);
    }
  }

  for (const node of state.board.intersections) {
    if (!node.adjacentHexIds.includes(hexId) || !node.building) continue;
    const ownerId = node.building.playerId;
    const isCity = node.building.type === 'city';
    const plantsOnHex = node.powerPlants.filter((p) => p.hexId === hexId).length;

    if (ownerId === playerId) {
      hasOwnBuilding = true;
      score -= 250 * (isCity ? 2 : 1) - plantsOnHex * 80;
    } else {
      const opp = state.players[ownerId]!;
      const buildingWeight = isCity ? 2.5 : 1.4;
      const leaderMultiplier =
        opp.victoryPoints === maxOpponentVp
          ? difficulty === 'Hard'
            ? 2.6
            : 2.0
          : 1.0 + opp.victoryPoints * 0.1;

      score += (pips * buildingWeight + plantsOnHex * 3.5) * leaderMultiplier;
      if (getHandSizeForSeven(opp) > 0) {
        canSteal = true;
        score += opp.victoryPoints * 2.5;
      }
    }
  }

  if (canSteal && !hasOwnBuilding) {
    score += 25;
  }
  if (hex.terrain === 'desert') {
    score -= 10;
  }

  return score;
}

// ============================================================================
// Dev Card Play Evaluation
// ============================================================================

function scoreDevCardPlay(
  state: GameState,
  playerId: PlayerId,
  action: Extract<GameAction, { type: 'PLAY_DEV_CARD' }>,
  config: BotConfig
): number {
  const player = state.players[playerId]!;
  const { personality, difficulty } = config;
  const params = action.params as DevCardPlayParams | undefined;
  const cardType = params?.cardType ?? getDevCardType(action.cardId);

  if (cardType === 'cleanup' && params?.cardType === 'cleanup') {
    const playedCleanups = player.devCards.played.filter((id) => getDevCardType(id) === 'cleanup').length;
    const currentMaxCleanups = state.specialAwards.cleanestEnvironment.cleanupCount;
    const claimsAward =
      state.cleanestEnvironmentHolder !== playerId &&
      playedCleanups + 1 >= 3 &&
      (state.cleanestEnvironmentHolder === null || playedCleanups + 1 > currentMaxCleanups);

    if (claimsAward && player.victoryPoints + 2 >= 10) {
      return 10000;
    }

    let baseScore = claimsAward ? 135 : personality === 'GreenInnovator' ? 96 : 86;
    const opt: CleanupOption = params.option;

    if (opt.type === 'INSPECTOR_MOVE_STEAL') {
      const currentInsHex = state.board.hexes.find((h) => h.hasInspector);
      if (currentInsHex) {
        const blocksUs = state.board.intersections.some(
          (n) =>
            n.adjacentHexIds.includes(currentInsHex.id) && n.building?.playerId === playerId
        );
        if (blocksUs) baseScore += 22;
      }
      const hexScore = scoreInspectorTargetHex(state, playerId, opt.newHexId, difficulty);
      if (hexScore < -50) return -100;
      baseScore += hexScore * 0.35;
      if (opt.targetPlayerId) {
        const victim = state.players[opt.targetPlayerId];
        if (victim) baseScore += victim.victoryPoints * 2.5;
      }
      return baseScore;
    } else {
      let cleansOwn = false;
      if (opt.hazardTarget.kind === 'node') {
        const n = state.board.intersections[opt.hazardTarget.id];
        if (n?.hasHazard && n.building?.playerId === playerId) {
          cleansOwn = true;
          baseScore += getPipValue(state.board.hexes[n.adjacentHexIds[0]!]?.numberDisc ?? null) * 3 + 25;
        } else if (n?.hasHazard && n.building && n.building.playerId !== playerId) {
          return -80;
        }
      } else {
        const h = state.board.hexes[opt.hazardTarget.id];
        if (h?.hasHazard) {
          const ownProd = state.board.intersections.filter(
            (n) => n.adjacentHexIds.includes(h.id) && n.building?.playerId === playerId
          ).length;
          const oppProd = state.board.intersections.filter(
            (n) => n.adjacentHexIds.includes(h.id) && n.building && n.building.playerId !== playerId
          ).length;
          if (ownProd > 0) {
            cleansOwn = true;
            baseScore += getPipValue(h.numberDisc) * ownProd * 3 + 15;
          } else if (oppProd > 0) {
            return -60;
          }
        }
      }

      if (opt.targetPlayerId) {
        const victim = state.players[opt.targetPlayerId];
        if (victim) baseScore += victim.victoryPoints * 2.5 + 10;
      } else if (!cleansOwn && !claimsAward) {
        baseScore -= 25;
      }
      return baseScore;
    }
  }

  if (cardType === 'highYield') {
    return state.phase === 'ActionPhase' ? 140 : 115;
  }

  if (cardType === 'researchGrant' && params?.cardType === 'researchGrant') {
    if (state.phase === 'EventPhase') return -10;
    const [c1, c2] = params.cards;
    const nextRes = { ...player.resources };
    let nextSci = player.science;
    if (c1 === 'science') nextSci++;
    else nextRes[c1]++;
    if (c2 === 'science') nextSci++;
    else nextRes[c2]++;

    const readiness = scoreHandBuildReadiness(state, playerId, nextRes, nextSci, personality);
    return 110 + readiness * 0.5;
  }

  if (cardType === 'roadConstruction' && params?.cardType === 'roadConstruction') {
    if (state.phase === 'EventPhase') return -10;
    let score = 115;
    const e1 = state.board.edges[params.edge1];
    if (e1) {
      for (const nId of [e1.v1, e1.v2]) {
        if (isValidDistance(state.board, nId)) {
          score += scoreIntersectionForSetup(state, playerId, nId, 1, personality) * 0.25;
        }
      }
    }
    if (params.edge2 !== undefined) {
      score += 15;
    }
    return score;
  }

  return 50;
}

// ============================================================================
// Action Phase Scoring (Builds, Energy, and Trade Synthesis)
// ============================================================================

function scoreActionPhaseAction(
  state: GameState,
  playerId: PlayerId,
  action: GameAction,
  config: BotConfig,
  ctx: ActionPhaseContext
): number {
  const player = state.players[playerId]!;
  const { personality, difficulty } = config;

  switch (action.type) {
    case 'END_TURN':
      return 0;

    case 'REVEAL_VP_CARDS':
      return 10000;

    case 'BUILD_CITY': {
      if (player.victoryPoints + 1 >= 10) return 9500;
      const node = state.board.intersections[action.nodeId];
      if (!node) return -100;
      let pips = 0;
      for (const hId of node.adjacentHexIds) {
        const hex = state.board.hexes[hId];
        if (hex && hex.terrain !== 'desert') {
          pips += getPipValue(hex.numberDisc);
        }
      }
      const base =
        personality === 'GreenInnovator'
          ? 122
          : personality === 'IndustrialExpansionist'
            ? 118
            : 115;
      const hazardPenalty = node.hasHazard ? -12 : 0;
      return base + pips * 2.5 + hazardPenalty;
    }

    case 'BUILD_TOWN': {
      if (player.victoryPoints + 1 >= 10) return 9500;
      const nodeScore = scoreIntersectionForSetup(state, playerId, action.nodeId, 1, personality);
      const base = personality === 'IndustrialExpansionist' ? 112 : 108;
      return base + nodeScore * 0.4;
    }

    case 'BUILD_RENEWABLE_PLANT': {
      const hex = state.board.hexes[action.hexId];
      const node = state.board.intersections[action.nodeId];
      if (!hex || !node) return -100;
      const pips = getPipValue(hex.numberDisc);
      const unblockedBonus = !hex.hasHazard && !hex.hasInspector && !node.hasHazard ? 12 : 0;

      const alreadyHasRenewableOnHex = state.board.intersections.some((n) =>
        n.powerPlants.some(
          (p) => p.playerId === playerId && p.type === 'renewable' && p.hexId === action.hexId
        )
      );
      const diversityBonus = alreadyHasRenewableOnHex ? 0 : 6;

      const needsRenewableForEligibility = player.renewablePlantsBuilt <= player.fossilPlantsBuilt;
      let base =
        personality === 'GreenInnovator'
          ? 124
          : personality === 'Balanced'
            ? 106
            : 98;

      if (needsRenewableForEligibility) base += 24;
      if (state.eventBag.length <= 22 || state.clampedGF >= (state.playerCount === 4 ? 16 : 12)) {
        base += 15;
      }

      return base + pips * 3.0 + unblockedBonus + diversityBonus;
    }

    case 'BUILD_FOSSIL_PLANT': {
      if (!wantsFossilPlant(state, player, personality)) {
        return -80;
      }
      const hex = state.board.hexes[action.hexId];
      const node = state.board.intersections[action.nodeId];
      if (!hex || !node) return -100;

      const pips = getPipValue(hex.numberDisc);
      let oppPenaltyBonus = 0;
      for (const n of state.board.intersections) {
        if (n.adjacentHexIds.includes(action.hexId) && n.building && n.building.playerId !== playerId) {
          oppPenaltyBonus += n.building.type === 'city' ? 12 : 6;
        }
      }
      const base = personality === 'IndustrialExpansionist' ? 76 : 62;
      return base + pips * 2.0 + oppPenaltyBonus;
    }

    case 'BUILD_ROAD': {
      const holderLen = state.specialAwards.longestRoad.length;
      const canClaimLongestRoad =
        state.longestRoadHolder !== playerId &&
        ctx.currentRoadLen >= 4 &&
        ctx.currentRoadLen + 1 >= Math.max(5, holderLen + 1);

      if (canClaimLongestRoad && player.victoryPoints + 2 >= 10) {
        return 9200;
      }

      const hasSurplusLumberBrick = player.resources.lumber >= 3 && player.resources.brick >= 3;
      if (ctx.openTownNodes.length >= 2 && !canClaimLongestRoad && !hasSurplusLumberBrick) {
        return -25;
      }

      const edge = state.board.edges[action.edgeId];
      if (!edge) return -100;

      let expansionValue = 0;
      for (const nId of [edge.v1, edge.v2]) {
        if (isValidDistance(state.board, nId)) {
          expansionValue = Math.max(
            expansionValue,
            scoreIntersectionForSetup(state, playerId, nId, 1, personality) * 0.45
          );
        }
        const nObj = state.board.intersections[nId];
        if (nObj) {
          for (const nextId of nObj.adjacentNodeIds) {
            if (isValidDistance(state.board, nextId)) {
              expansionValue = Math.max(
                expansionValue,
                scoreIntersectionForSetup(state, playerId, nextId, 1, personality) * 0.3
              );
            }
          }
        }
      }

      let base = ctx.openTownNodes.length === 0 ? 74 : 42;
      if (canClaimLongestRoad) base += 55;
      if (personality === 'IndustrialExpansionist') base += 8;

      return base + expansionValue;
    }

    case 'BUILD_WAREHOUSE': {
      const handSize = getHandSizeForSeven(player);
      if (player.energy >= 4 || (handSize >= 6 && player.energy >= 2)) {
        return personality === 'Balanced' ? 68 : 54;
      }
      return handSize >= 5 ? 35 : -15;
    }

    case 'BUY_DEV_CARD': {
      if (
        player.citiesInReserve > 0 &&
        player.townsBuilt > 0 &&
        player.resources.steel >= 2 &&
        player.resources.food >= 2
      ) {
        return -20;
      }
      const playedCleanups = player.devCards.played.filter((id) => getDevCardType(id) === 'cleanup').length;
      const closeToCleanestAward = playedCleanups >= 2 && state.cleanestEnvironmentHolder !== playerId;
      let base = personality === 'GreenInnovator' ? 76 : 66;
      if (closeToCleanestAward) base += 18;
      return base;
    }

    case 'PLAY_DEV_CARD':
      return scoreDevCardPlay(state, playerId, action, config);

    case 'SPEND_ENERGY': {
      if (action.usage === 'CLEAN_HAZARD') {
        const target = action.params?.hazardTarget;
        if (!target) return -100;
        if (target.kind === 'node') {
          const n = state.board.intersections[target.id];
          if (n?.hasHazard && n.building?.playerId === playerId) {
            let pips = 0;
            for (const hId of n.adjacentHexIds) {
              pips += getPipValue(state.board.hexes[hId]?.numberDisc ?? null);
            }
            return 78 + pips * (n.building.type === 'city' ? 2.5 : 1.5) + n.powerPlants.length * 5;
          }
          return -100;
        } else {
          const h = state.board.hexes[target.id];
          if (!h || !h.hasHazard || h.hasInspector) return -100;
          let ownWeight = 0;
          let oppWeight = 0;
          for (const n of state.board.intersections) {
            if (!n.adjacentHexIds.includes(h.id) || !n.building) continue;
            const w =
              (n.building.type === 'city' ? 2 : 1) +
              n.powerPlants.filter((p) => p.hexId === h.id).length;
            if (n.building.playerId === playerId) ownWeight += w;
            else oppWeight += w;
          }
          if (ownWeight === 0 || oppWeight > ownWeight) return -80;
          return 70 + getPipValue(h.numberDisc) * ownWeight * 2.5;
        }
      }

      if (action.usage === 'DEMOLISH_PLANT') {
        if (state.turnStats.powerPlantsBuiltThisTurn > 0) return -100;

        if (personality === 'GreenInnovator') {
          return 96;
        }
        const needToFixBalance =
          player.renewablePlantsBuilt <= player.fossilPlantsBuilt &&
          (state.eventBag.length <= 28 ||
            state.clampedGF >= (state.playerCount === 4 ? 17 : 13) ||
            player.renewablePlantsBuilt >= 1);
        return needToFixBalance ? 90 : -60;
      }

      if (action.usage === 'BUY_CARD') {
        const cardType = action.params?.cardType;
        if (!cardType) return -100;
        if (difficulty === 'Easy') return -25;
        return scoreTradeOrEnergyBuy(state, playerId, { energy: 2 }, cardType, config, ctx);
      }

      return -50;
    }

    case 'TRADE_HARBOR': {
      if (difficulty === 'Easy') return -25;
      return scoreTradeOrEnergyBuy(state, playerId, action.give, action.receive, config, ctx);
    }

    case 'TRADE_SUPPLY': {
      if (difficulty === 'Easy') return -25;
      return scoreTradeOrEnergyBuy(state, playerId, action.give, action.receive, config, ctx);
    }

    default:
      return -50;
  }
}

function scoreTradeOrEnergyBuy(
  state: GameState,
  playerId: PlayerId,
  give: Partial<Record<ResourceType | 'science' | 'energy', number>>,
  receive: ResourceType | 'science',
  config: BotConfig,
  ctx: ActionPhaseContext
): number {
  const player = state.players[playerId]!;
  const { personality, difficulty } = config;

  const giveEntries = Object.entries(give).filter(([, v]) => v && v > 0);
  if (giveEntries.length !== 1) return -100;
  const [giveKey, giveAmount] = giveEntries[0]! as [ResourceType | 'science' | 'energy', number];

  if (giveKey === 'science' && (personality === 'GreenInnovator' || player.renewablePlantsBuilt <= player.fossilPlantsBuilt)) {
    return -100;
  }

  let bestScore = -60;

  for (const target of ctx.feasibleTargets) {
    const reqReceive = target.required[receive] ?? 0;
    const haveReceive = getCardCount(player.resources, player.science, receive);

    if (haveReceive >= reqReceive) continue;

    if (giveKey !== 'energy') {
      const reqGive = target.required[giveKey] ?? 0;
      const haveGive = getCardCount(player.resources, player.science, giveKey);
      if (haveGive - giveAmount < reqGive) {
        continue;
      }
    }

    const deficitBefore = computeTargetDeficit(player.resources, player.science, target.required);
    const deficitAfter = deficitBefore - 1;

    const nextRes = { ...player.resources };
    let nextSci = player.science;
    let nextEnergy = player.energy;

    if (giveKey === 'energy') nextEnergy -= giveAmount;
    else if (giveKey === 'science') nextSci -= giveAmount;
    else nextRes[giveKey] -= giveAmount;

    if (receive === 'science') nextSci += 1;
    else nextRes[receive] += 1;

    const remainingTrades = computeExchangeablePower(
      ctx.harborRates,
      nextRes,
      nextSci,
      nextEnergy,
      target.required
    );

    const efficiencyBonus = (4 - giveAmount) * 3;
    const industrialEnergyBonus =
      giveKey === 'energy' && personality === 'IndustrialExpansionist' ? 8 : 0;

    if (deficitAfter === 0) {
      const score = target.priorityScore * 0.82 + efficiencyBonus + industrialEnergyBonus;
      if (score > bestScore) bestScore = score;
    } else if (deficitAfter <= remainingTrades) {
      const score = target.priorityScore * 0.76 + efficiencyBonus + industrialEnergyBonus;
      if (score > bestScore) bestScore = score;
    } else if (difficulty === 'Hard' || target.name === 'renewablePlant') {
      const handSize = getHandSizeForSeven(player);
      const handLimit = player.hasWarehouse ? 10 : 7;
      const needsRenewableUrgently =
        target.name === 'renewablePlant' && player.renewablePlantsBuilt <= player.fossilPlantsBuilt;
      if (handSize > handLimit || (giveKey === 'energy' && player.energy >= 4) || needsRenewableUrgently) {
        const score = target.priorityScore * 0.6 + efficiencyBonus;
        if (score > bestScore) bestScore = score;
      }
    }
  }

  return bestScore;
}

// ============================================================================
// Trade requests: "I need a brick, name your price"
// ============================================================================

type TradeItems = Partial<Record<CardKey | 'energy', number>>;

const REQUESTABLE_CARDS: CardKey[] = [...RESOURCE_TYPES, 'science'];

function tradeItemCount(items: TradeItems): number {
  return Object.values(items).reduce((sum, n) => sum + (n ?? 0), 0);
}

/** The hand after paying `lose` and collecting `gain` (energy is not part of a hand's readiness). */
function handAfterSwap(player: PlayerState, lose: TradeItems, gain: TradeItems) {
  const resources = { ...player.resources };
  let science = player.science;
  for (const k of REQUESTABLE_CARDS) {
    const change = (gain[k] ?? 0) - (lose[k] ?? 0);
    if (k === 'science') science += change;
    else resources[k] += change;
  }
  return { resources, science };
}

/**
 * Answers "Orange wants 1 brick": offer it for something the requester holds if that leaves this
 * bot's hand better placed for what it is building, else pass. Never asks for a card the requester
 * does not hold (when their hand can be seen). Harder or more industrial bots want a premium.
 */
function chooseTradeRequestReply(
  state: GameState,
  playerId: PlayerId,
  head: TradeRequestReply,
  config: BotConfig,
  rng: Mulberry32PRNG
): GameAction {
  const answer = (response: unknown): GameAction => ({
    type: 'RESOLVE_PENDING_DECISION',
    playerId,
    decisionId: head.id,
    response,
  });
  const pass = answer({ pass: true });
  const { personality, difficulty } = config;
  const player = state.players[playerId]!;
  const requester = state.players[head.requestingPlayerId]!;

  // Keep energy, and never help someone who is close to winning
  if ((head.ask.energy ?? 0) > 0) return pass;
  if (requester.victoryPoints >= (difficulty === 'Hard' ? 7 : 8)) return pass;

  const seen = !isHandBreakdownHidden(requester);
  const handSize = getHandSizeForSeven(requester);
  const before = scoreHandBuildReadiness(state, playerId, player.resources, player.science, personality);
  const premium = difficulty === 'Hard' || personality === 'IndustrialExpansionist' ? 1 : 0;
  const target = tradeItemCount(head.ask) + premium;
  const minGain = difficulty === 'Hard' ? 3 : difficulty === 'Easy' ? -4 : 0;

  const heldByRequester = (k: CardKey) => (k === 'science' ? requester.science : requester.resources[k]);
  const candidates: TradeItems[] = [];
  const open = REQUESTABLE_CARDS.filter((k) => (head.ask[k] ?? 0) === 0 && (!seen || heldByRequester(k) > 0));
  // Roughly fair: never more cards back than asked for plus the premium
  for (const k of open) {
    for (let n = 1; n <= target; n++) {
      if (seen ? heldByRequester(k) >= n : handSize >= n) candidates.push({ [k]: n });
    }
  }
  if (target >= 2) {
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) candidates.push({ [open[i]!]: 1, [open[j]!]: 1 });
    }
  }

  let best: { want: TradeItems; score: number } | null = null;
  for (const want of candidates) {
    if (!canResolveTradeReply(state, playerId, head.id, { want }).ok) continue;
    const hand = handAfterSwap(player, head.ask, want);
    const gain = scoreHandBuildReadiness(state, playerId, hand.resources, hand.science, personality) - before;
    if (gain <= minGain) continue;
    let score = gain - Math.abs(tradeItemCount(want) - target) * 4;
    if (difficulty === 'Easy') score += (rng.next() - 0.5) * 12;
    if (!best || score > best.score) best = { want, score };
  }
  return best ? answer({ want: best.want }) : pass;
}

/**
 * Picks among the offers made to a bot that asked for cards: the one that leaves its hand best
 * placed, if any improves it, never one from a player about to win; else turns them all down.
 */
function chooseTradeRequestChoice(
  state: GameState,
  playerId: PlayerId,
  head: TradeRequestChoice,
  config: BotConfig
): GameAction {
  const answer = (response: unknown): GameAction => ({
    type: 'RESOLVE_PENDING_DECISION',
    playerId,
    decisionId: head.id,
    response,
  });
  const { personality, difficulty } = config;
  const player = state.players[playerId]!;
  const before = scoreHandBuildReadiness(state, playerId, player.resources, player.science, personality);

  let best: { from: PlayerId; gain: number } | null = null;
  for (const offer of head.offers) {
    if (!canTakeRequestOffer(state, playerId, head.ask, offer).ok) continue;
    if (state.players[offer.playerId]!.victoryPoints >= 8) continue;
    const hand = handAfterSwap(player, offer.want, head.ask);
    const energyChange = ((head.ask.energy ?? 0) - (offer.want.energy ?? 0)) * 4;
    const gain =
      scoreHandBuildReadiness(state, playerId, hand.resources, hand.science, personality) - before + energyChange;
    if (!best || gain > best.gain) best = { from: offer.playerId, gain };
  }
  if (best && best.gain > (difficulty === 'Hard' ? 3 : 0)) return answer({ takeOfferFrom: best.from });
  return answer({ decline: true });
}

// ============================================================================
// Main Entry Point: chooseBotAction
// ============================================================================

export function chooseBotAction(
  state: GameState,
  playerId: PlayerId,
  config: BotConfig,
  prng?: Mulberry32PRNG
): GameAction {
  const actions = getProgressingLegalActions(state, playerId);
  if (actions.length === 0) {
    throw new Error(`No legal actions available for player ${playerId} in phase ${state.phase}`);
  }

  // Trade requests are answered from the whole rules, not from the sample `legalActions` lists
  const requestHead = state.pendingDecisions[0];
  if (requestHead?.playerId === playerId) {
    if (requestHead.type === 'TRADE_REQUEST_REPLY') {
      return chooseTradeRequestReply(state, playerId, requestHead, config, prng ?? getFallbackPRNG(state, playerId));
    }
    if (requestHead.type === 'TRADE_REQUEST_CHOICE') {
      return chooseTradeRequestChoice(state, playerId, requestHead, config);
    }
  }

  if (actions.length === 1) {
    return actions[0]!;
  }

  const rng = prng ?? getFallbackPRNG(state, playerId);

  if (config.difficulty === 'Easy' && rng.next() < 0.45) {
    return rng.pickRandom(actions);
  }

  if (state.pendingDecisions.length > 0) {
    const head = state.pendingDecisions[0]!;
    let bestAction = actions[0]!;
    let bestScore = -Infinity;

    for (const action of actions) {
      let score = scorePendingDecisionAction(state, playerId, head, action, config);
      if (config.difficulty === 'Easy') {
        score += (rng.next() - 0.5) * 35;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    return bestAction;
  }

  if (state.phase === 'EventPhase') {
    let bestAction = actions[0]!;
    let bestScore = -Infinity;

    for (const action of actions) {
      let score = 0;
      if (action.type === 'DRAW_EVENT_DISC') {
        score = 90;
      } else if (action.type === 'PLAY_DEV_CARD') {
        score = scoreDevCardPlay(state, playerId, action, config);
      } else {
        score = -100;
      }

      if (config.difficulty === 'Easy') {
        score += (rng.next() - 0.5) * 30;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    return bestAction;
  }

  if (state.phase === 'ProductionPhase') {
    return actions[0]!;
  }

  if (state.phase === 'ActionPhase') {
    const openTownNodes = getOpenValidTownNodesOnNetwork(state, playerId);
    const canPlacePlant =
      state.turnStats.powerPlantsBuiltThisTurn < 1 && hasOpenPlantCutout(state, playerId);
    const hasBuildRoadCandidate = actions.some((a) => a.type === 'BUILD_ROAD');

    const ctx: ActionPhaseContext = {
      openTownNodes,
      canPlacePlant,
      feasibleTargets: getFeasibleBuildTargets(
        state,
        playerId,
        config.personality,
        openTownNodes,
        canPlacePlant
      ),
      harborRates: getHarborTradeRates(state.board, playerId),
      currentRoadLen: hasBuildRoadCandidate ? calculateLongestRoad(state.board, playerId) : 0,
    };

    let bestAction = actions[0]!;
    let bestScore = -Infinity;

    for (const action of actions) {
      let score = scoreActionPhaseAction(state, playerId, action, config, ctx);
      if (config.difficulty === 'Easy' && action.type !== 'END_TURN') {
        score += (rng.next() - 0.5) * 35;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    return bestAction;
  }

  return actions[0]!;
}
