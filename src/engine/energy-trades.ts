/**
 * CATAN: New Energies — Energy Actions & Trading Engine
 *
 * Implements:
 * - ACT-03: Energy spending actions:
 *   - BUY_CARD (2 energy -> 1 resource or science from supply).
 *   - CLEAN_HAZARD (1 energy -> remove 1 hazard from any hex or building).
 * - ACT-04: Demolish Fossil Plant (1 energy -> remove 1 fossil plant, return to reserve, -1 LF, max 1/turn).
 * - ACT-05: Trading state machine:
 *   - Supply trades (4:1 resource, 3:1 science, 2:1 energy).
 *   - Harbor trades (3:1 generic, 2:1 specialized).
 *   - Domestic P2P trading (active player <-> opponent).
 */

import { ResourceType } from './config';
import { clampGF, computePlayerLF, computeTrueTotalLF } from './footprint';
import {
  GameState,
  HarborId,
  HexId,
  NodeId,
  PlayerId,
} from './types';

// ============================================================================
// Energy Spending Actions (ACT-03, ACT-04)
// ============================================================================

export interface SpendEnergyParams {
  cardType?: ResourceType | 'science';
  hazardTarget?: { kind: 'hex'; id: HexId } | { kind: 'node'; id: NodeId };
  plantTarget?: { nodeId: NodeId; hexId: HexId };
}

export function canSpendEnergy(
  state: GameState,
  playerId: PlayerId,
  usage: 'BUY_CARD' | 'CLEAN_HAZARD' | 'DEMOLISH_PLANT',
  params?: SpendEnergyParams
): { canSpend: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canSpend: false, reason: 'Can only spend energy during ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canSpend: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canSpend: false, reason: 'Unresolved pending decisions exist' };
  }

  const player = state.players[playerId]!;

  if (usage === 'BUY_CARD') {
    if (player.energy < 2) {
      return { canSpend: false, reason: 'Insufficient energy (requires 2 energy tokens)' };
    }
    if (!params?.cardType) {
      return { canSpend: false, reason: 'Must specify card type to buy' };
    }
    if (params.cardType === 'science') {
      if (state.supply.science <= 0) {
        return { canSpend: false, reason: 'Science supply is exhausted' };
      }
    } else {
      if (state.supply.resources[params.cardType] <= 0) {
        return { canSpend: false, reason: `${params.cardType} supply is exhausted` };
      }
    }
    return { canSpend: true };
  }

  if (usage === 'CLEAN_HAZARD') {
    if (player.energy < 1) {
      return { canSpend: false, reason: 'Insufficient energy (requires 1 energy token)' };
    }
    if (!params?.hazardTarget) {
      return { canSpend: false, reason: 'Must specify hazard target' };
    }
    const target = params.hazardTarget;
    if (target.kind === 'hex') {
      const hex = state.board.hexes[target.id];
      if (!hex || !hex.hasHazard) {
        return { canSpend: false, reason: 'Target hex does not have a hazard' };
      }
    } else {
      const node = state.board.intersections[target.id];
      if (!node || !node.hasHazard) {
        return { canSpend: false, reason: 'Target intersection does not have a hazard' };
      }
    }
    return { canSpend: true };
  }

  if (usage === 'DEMOLISH_PLANT') {
    if (state.turnStats.fossilPlantsDemolishedThisTurn >= 1) {
      return { canSpend: false, reason: 'Maximum of 1 fossil plant may be demolished per turn' };
    }
    if (player.energy < 1) {
      return { canSpend: false, reason: 'Insufficient energy (requires 1 energy token)' };
    }
    if (!params?.plantTarget) {
      return { canSpend: false, reason: 'Must specify plant target' };
    }
    const { nodeId, hexId } = params.plantTarget;
    const node = state.board.intersections[nodeId];
    if (!node) {
      return { canSpend: false, reason: 'Invalid intersection ID' };
    }
    const plant = node.powerPlants.find(
      (p) => p.playerId === playerId && p.type === 'fossil' && p.hexId === hexId
    );
    if (!plant) {
      return { canSpend: false, reason: 'No matching fossil power plant found at target' };
    }
    return { canSpend: true };
  }

  return { canSpend: false, reason: 'Unknown energy usage type' };
}

export function applySpendEnergy(
  state: GameState,
  playerId: PlayerId,
  usage: 'BUY_CARD' | 'CLEAN_HAZARD' | 'DEMOLISH_PLANT',
  params?: SpendEnergyParams
): void {
  const check = canSpendEnergy(state, playerId, usage, params);
  if (!check.canSpend) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;

  if (usage === 'BUY_CARD') {
    player.energy -= 2;
    state.supply.energy += 2;
    const card = params!.cardType!;

    if (card === 'science') {
      player.science += 1;
      state.supply.science -= 1;
    } else {
      player.resources[card] += 1;
      state.supply.resources[card] -= 1;
    }

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} spent 2 energy to take 1 ${card} from supply.`,
    });
  } else if (usage === 'CLEAN_HAZARD') {
    player.energy -= 1;
    state.supply.energy += 1;
    const target = params!.hazardTarget!;

    if (target.kind === 'hex') {
      state.board.hexes[target.id]!.hasHazard = false;
    } else {
      state.board.intersections[target.id]!.hasHazard = false;
    }

    state.supply.hazards = Math.min(10, state.supply.hazards + 1);

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} spent 1 energy to clean hazard on ${target.kind} ${target.id}.`,
    });
  } else if (usage === 'DEMOLISH_PLANT') {
    player.energy -= 1;
    state.supply.energy += 1;
    const { nodeId, hexId } = params!.plantTarget!;
    const node = state.board.intersections[nodeId]!;

    const plantIdx = node.powerPlants.findIndex(
      (p) => p.playerId === playerId && p.type === 'fossil' && p.hexId === hexId
    );
    node.powerPlants.splice(plantIdx, 1);

    player.fossilPlantsBuilt -= 1;
    player.fossilPlantsInReserve += 1;

    player.localFootprint = computePlayerLF(player);
    state.trueTotalLF = computeTrueTotalLF(state.players);
    state.clampedGF = clampGF(state.trueTotalLF, state.playerCount);

    state.turnStats.fossilPlantsDemolishedThisTurn += 1;

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} demolished a Fossil Power Plant on hex ${hexId} (-1 LF).`,
    });
  }
}

// ============================================================================
// Supply Trading (ACT-05)
// ============================================================================

export function canTradeSupply(
  state: GameState,
  playerId: PlayerId,
  give: Partial<Record<ResourceType | 'science' | 'energy', number>>,
  receive: ResourceType | 'science'
): { canTrade: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canTrade: false, reason: 'Can only trade during ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canTrade: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canTrade: false, reason: 'Unresolved pending decisions exist' };
  }

  const player = state.players[playerId]!;

  // Supply availability check
  if (receive === 'science') {
    if (state.supply.science <= 0) {
      return { canTrade: false, reason: 'Science supply is empty' };
    }
  } else {
    if (state.supply.resources[receive] <= 0) {
      return { canTrade: false, reason: `${receive} supply is empty` };
    }
  }

  // Exactly one type can be offered
  const offeredKeys = Object.keys(give).filter(
    (k) => (give[k as keyof typeof give] || 0) > 0
  ) as (ResourceType | 'science' | 'energy')[];

  if (offeredKeys.length !== 1) {
    return { canTrade: false, reason: 'Must offer exactly one card/token type in supply trade' };
  }

  const offered = offeredKeys[0]!;
  const amount = give[offered]!;

  if (offered === receive) {
    return { canTrade: false, reason: 'Cannot trade for the same card type given' };
  }

  if (offered === 'energy') {
    if (amount !== 2) {
      return { canTrade: false, reason: 'Supply trade for energy requires exactly 2 energy' };
    }
    if (player.energy < 2) {
      return { canTrade: false, reason: 'Insufficient energy tokens' };
    }
  } else if (offered === 'science') {
    if (amount !== 3) {
      return { canTrade: false, reason: 'Supply trade for science requires exactly 3 science' };
    }
    if (player.science < 3) {
      return { canTrade: false, reason: 'Insufficient science cards' };
    }
  } else {
    // Resource
    if (amount !== 4) {
      return { canTrade: false, reason: 'Standard 4:1 supply trade requires exactly 4 cards' };
    }
    if (player.resources[offered] < 4) {
      return { canTrade: false, reason: `Insufficient ${offered} cards (requires 4)` };
    }
  }

  return { canTrade: true };
}

export function applyTradeSupply(
  state: GameState,
  playerId: PlayerId,
  give: Partial<Record<ResourceType | 'science' | 'energy', number>>,
  receive: ResourceType | 'science'
): void {
  const check = canTradeSupply(state, playerId, give, receive);
  if (!check.canTrade) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;

  for (const [key, count] of Object.entries(give)) {
    if (!count || count <= 0) continue;
    if (key === 'energy') {
      player.energy -= count;
      state.supply.energy += count;
    } else if (key === 'science') {
      player.science -= count;
      state.supply.science += count;
    } else {
      player.resources[key as ResourceType] -= count;
      state.supply.resources[key as ResourceType] += count;
    }
  }

  if (receive === 'science') {
    player.science += 1;
    state.supply.science -= 1;
  } else {
    player.resources[receive] += 1;
    state.supply.resources[receive] -= 1;
  }

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} traded with supply to receive 1 ${receive}.`,
  });
}

// ============================================================================
// Harbor Trading (ACT-05)
// ============================================================================

export function canTradeHarbor(
  state: GameState,
  playerId: PlayerId,
  harborId: HarborId,
  give: Partial<Record<ResourceType, number>>,
  receive: ResourceType | 'science'
): { canTrade: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canTrade: false, reason: 'Can only trade during ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canTrade: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canTrade: false, reason: 'Unresolved pending decisions exist' };
  }

  const harbor = state.board.harbors.find((h) => h.id === harborId);
  if (!harbor) {
    return { canTrade: false, reason: 'Invalid harbor ID' };
  }

  // Access check: player must have a settlement on at least one harbor node
  const hasAccess = harbor.nodeIds.some(
    (nId) => state.board.intersections[nId]?.building?.playerId === playerId
  );
  if (!hasAccess) {
    return { canTrade: false, reason: 'You do not have a settlement on this harbor' };
  }

  // Target card availability
  if (receive === 'science') {
    if (state.supply.science <= 0) {
      return { canTrade: false, reason: 'Science supply is empty' };
    }
  } else {
    if (state.supply.resources[receive] <= 0) {
      return { canTrade: false, reason: `${receive} supply is empty` };
    }
  }

  const offeredKeys = Object.keys(give).filter(
    (k) => (give[k as ResourceType] || 0) > 0
  ) as ResourceType[];
  if (offeredKeys.length !== 1) {
    return { canTrade: false, reason: 'Must offer exactly one resource type' };
  }

  const offered = offeredKeys[0]!;
  const amount = give[offered]!;
  const player = state.players[playerId]!;

  if (offered === receive) {
    return { canTrade: false, reason: 'Cannot trade for the same resource type' };
  }

  if (player.resources[offered] < amount) {
    return { canTrade: false, reason: `Insufficient ${offered} cards` };
  }

  if (harbor.type === 'generic') {
    if (amount !== 3) {
      return { canTrade: false, reason: '3:1 generic harbor requires exactly 3 cards' };
    }
  } else {
    // Specialized 2:1
    if (harbor.resource !== offered) {
      return { canTrade: false, reason: `This specialized harbor only accepts ${harbor.resource}` };
    }
    if (amount !== 2) {
      return { canTrade: false, reason: '2:1 specialized harbor requires exactly 2 cards' };
    }
  }

  return { canTrade: true };
}

export function applyTradeHarbor(
  state: GameState,
  playerId: PlayerId,
  harborId: HarborId,
  give: Partial<Record<ResourceType, number>>,
  receive: ResourceType | 'science'
): void {
  const check = canTradeHarbor(state, playerId, harborId, give, receive);
  if (!check.canTrade) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;

  for (const [key, count] of Object.entries(give)) {
    if (!count || count <= 0) continue;
    player.resources[key as ResourceType] -= count;
    state.supply.resources[key as ResourceType] += count;
  }

  if (receive === 'science') {
    player.science += 1;
    state.supply.science -= 1;
  } else {
    player.resources[receive] += 1;
    state.supply.resources[receive] -= 1;
  }

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} traded at harbor ${harborId} to receive 1 ${receive}.`,
  });
}

// ============================================================================
// Domestic Trading (ACT-05)
// ============================================================================

export type TradeItems = Partial<Record<ResourceType | 'science' | 'energy', number>>;

const TRADEABLE_ITEMS = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science', 'energy'];

/** Every entry names a real card (or energy) and is a whole, non-negative number. */
export function isWellFormedTradeItems(items: unknown): items is TradeItems {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return false;
  return Object.entries(items as Record<string, unknown>).every(
    ([key, value]) =>
      TRADEABLE_ITEMS.includes(key) &&
      (value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0))
  );
}

export function countTradeItems(items: TradeItems): number {
  let total = 0;
  for (const count of Object.values(items)) {
    total += count || 0;
  }
  return total;
}

export function canOfferTrade(
  state: GameState,
  playerId: PlayerId,
  targetPlayerId: PlayerId | undefined,
  give: TradeItems,
  want: TradeItems
): { canOffer: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canOffer: false, reason: 'Can only trade during ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canOffer: false, reason: 'Only the active player can initiate domestic trades' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canOffer: false, reason: 'Unresolved pending decisions exist' };
  }

  if (!isWellFormedTradeItems(give) || !isWellFormedTradeItems(want)) {
    return { canOffer: false, reason: 'Trades use whole numbers of real cards' };
  }

  const giveCount = countTradeItems(give);
  const wantCount = countTradeItems(want);
  if (giveCount === 0 || wantCount === 0) {
    return { canOffer: false, reason: 'Trades must be mutually beneficial (cannot give for free)' };
  }

  // No identical item types on both sides (R L544-546)
  for (const key of Object.keys(give) as (ResourceType | 'science' | 'energy')[]) {
    if ((give[key] || 0) > 0 && (want[key] || 0) > 0) {
      return { canOffer: false, reason: `Cannot trade ${key} for ${key}` };
    }
  }

  const offeringPlayer = state.players[playerId]!;

  // Check offering player has what they're offering
  for (const [key, count] of Object.entries(give)) {
    if (!count || count <= 0) continue;
    if (key === 'energy') {
      if (offeringPlayer.energy < count) return { canOffer: false, reason: 'Insufficient energy to offer' };
    } else if (key === 'science') {
      if (offeringPlayer.science < count) return { canOffer: false, reason: 'Insufficient science to offer' };
    } else {
      if (offeringPlayer.resources[key as ResourceType] < count) {
        return { canOffer: false, reason: `Insufficient ${key} to offer` };
      }
    }
  }

  // Energy cap check for offering player receiving energy
  if ((want.energy || 0) > 0) {
    if (offeringPlayer.energy + want.energy! - (give.energy || 0) > 5) {
      return { canOffer: false, reason: 'Trade would exceed your 5 energy limit' };
    }
  }

  if (targetPlayerId) {
    if (targetPlayerId === playerId) {
      return { canOffer: false, reason: 'Cannot trade with yourself' };
    }
    const targetPlayer = state.players[targetPlayerId];
    if (!targetPlayer) {
      return { canOffer: false, reason: 'Invalid target player' };
    }
    // Energy cap check for target player receiving energy
    if ((give.energy || 0) > 0) {
      if (targetPlayer.energy + give.energy! - (want.energy || 0) > 5) {
        return { canOffer: false, reason: 'Trade would exceed target player 5 energy limit' };
      }
    }
  }

  return { canOffer: true };
}

export function applyOfferTrade(
  state: GameState,
  playerId: PlayerId,
  targetPlayerId: PlayerId | undefined,
  give: TradeItems,
  want: TradeItems
): void {
  const check = canOfferTrade(state, playerId, targetPlayerId, give, want);
  if (!check.canOffer) {
    throw new Error(check.reason);
  }

  const targets = targetPlayerId
    ? [targetPlayerId]
    : state.playerOrder.filter((pid) => pid !== playerId);

  for (const targetId of targets) {
    state.pendingDecisions.push({
      id: `trade-${playerId}-${targetId}-${state.currentTurn}-${state.pendingDecisions.length}`,
      type: 'DOMESTIC_TRADE_RESPONSE',
      playerId: targetId,
      offeringPlayerId: playerId,
      targetPlayerId: targetId,
      give,
      want,
    });
  }

  state.log.push({
    timestamp: state.log.length,
    message: `${state.players[playerId]!.name} offered a trade.`,
  });
}

export function applyTradeResponse(
  state: GameState,
  decisionId: string,
  accept: boolean
): void {
  const head = state.pendingDecisions.find((d) => d.id === decisionId);
  if (!head || head.type !== 'DOMESTIC_TRADE_RESPONSE') {
    throw new Error(`Invalid domestic trade decision ${decisionId}`);
  }

  // Remove this decision and any related trade decisions from the same offer
  state.pendingDecisions = state.pendingDecisions.filter(
    (d) =>
      !(
        d.type === 'DOMESTIC_TRADE_RESPONSE' &&
        d.offeringPlayerId === head.offeringPlayerId &&
        d.give === head.give &&
        d.want === head.want
      )
  );

  if (!accept) {
    state.log.push({
      timestamp: state.log.length,
      message: `${state.players[head.playerId]!.name} declined the trade offer.`,
    });
    return;
  }

  const offerer = state.players[head.offeringPlayerId]!;
  const responder = state.players[head.targetPlayerId]!;

  // Execute trade: offerer gives 'give', receives 'want'. Responder gives 'want', receives 'give'.
  for (const [key, count] of Object.entries(head.give)) {
    if (!count || count <= 0) continue;
    if (key === 'energy') {
      offerer.energy -= count;
      responder.energy += count;
    } else if (key === 'science') {
      offerer.science -= count;
      responder.science += count;
    } else {
      offerer.resources[key as ResourceType] -= count;
      responder.resources[key as ResourceType] += count;
    }
  }

  for (const [key, count] of Object.entries(head.want)) {
    if (!count || count <= 0) continue;
    if (key === 'energy') {
      responder.energy -= count;
      offerer.energy += count;
    } else if (key === 'science') {
      responder.science -= count;
      offerer.science += count;
    } else {
      responder.resources[key as ResourceType] -= count;
      offerer.resources[key as ResourceType] += count;
    }
  }

  state.log.push({
    timestamp: state.log.length,
    message: `${offerer.name} and ${responder.name} completed a trade.`,
  });
}
