/**
 * CATAN: New Energies — Building Actions Engine
 *
 * Implements:
 * - ACT-01: Road, Town, and City construction/upgrades with exact costs,
 *   reserve tracking, distance rules, and road network connectivity.
 * - ACT-02: Power Plant construction (Fossil and Renewable) enforcing:
 *   - Combined 1-plant-per-turn limit.
 *   - Cutout capacity: Town (1 max), City (3 max, distinct hexes).
 *   - Fossil: +1 LF (no hazard token: hazards only ever come from events).
 *   - Renewable: -1 LF, reveals green event disc into the event bag.
 *   - Warehouse tile construction (2 energy, 1/game, sets hasWarehouse).
 */

import { isValidCutoutForPlant, isValidDistance } from './board';
import { clampGF, computePlayerLF, computeTrueTotalLF } from './footprint';
import { updateLongestRoadAward } from './longest-road';
import {
  EdgeId,
  EventDiscType,
  GameState,
  HexId,
  NodeId,
  PlayerId,
} from './types';

// ============================================================================
// Roads (ACT-01)
// ============================================================================

export function canBuildRoad(
  state: GameState,
  playerId: PlayerId,
  edgeId: EdgeId
): { canBuild: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canBuild: false, reason: 'Can only build roads in ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canBuild: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canBuild: false, reason: 'Unresolved pending decisions exist' };
  }

  const player = state.players[playerId]!;
  if (player.roadsInReserve <= 0) {
    return { canBuild: false, reason: 'No road pieces remaining in reserve' };
  }
  if (player.resources.lumber < 1 || player.resources.brick < 1) {
    return { canBuild: false, reason: 'Insufficient resources (requires 1 lumber, 1 brick)' };
  }

  const edge = state.board.edges[edgeId];
  if (!edge) {
    return { canBuild: false, reason: 'Invalid edge ID' };
  }
  if (edge.road !== null) {
    return { canBuild: false, reason: 'Path already has a road' };
  }

  // Connectivity check:
  // Must connect to player's road, town, or city.
  // Cannot connect through an intersection blocked by an opponent building.
  let isConnected = false;
  for (const nodeId of [edge.v1, edge.v2]) {
    const node = state.board.intersections[nodeId]!;
    if (node.building && node.building.playerId === playerId) {
      isConnected = true;
      break;
    }

    // If intersection has no opponent building, check incident edges for player roads
    const hasOpponentBuilding = node.building && node.building.playerId !== playerId;
    if (!hasOpponentBuilding) {
      for (const incEdgeId of node.incidentEdgeIds) {
        if (incEdgeId !== edgeId && state.board.edges[incEdgeId]?.road?.playerId === playerId) {
          isConnected = true;
          break;
        }
      }
      if (isConnected) break;
    }
  }

  if (!isConnected) {
    return { canBuild: false, reason: 'Road must connect to your existing network' };
  }

  return { canBuild: true };
}

export function applyBuildRoad(state: GameState, playerId: PlayerId, edgeId: EdgeId): void {
  const check = canBuildRoad(state, playerId, edgeId);
  if (!check.canBuild) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;
  player.resources.lumber -= 1;
  player.resources.brick -= 1;
  state.supply.resources.lumber += 1;
  state.supply.resources.brick += 1;

  const edge = state.board.edges[edgeId]!;
  edge.road = { playerId };
  player.roadsBuilt += 1;
  player.roadsInReserve -= 1;

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} built a Road on path ${edgeId}.`,
  });

  updateLongestRoadAward(state);
}

// ============================================================================
// Towns (ACT-01)
// ============================================================================

export function canBuildTown(
  state: GameState,
  playerId: PlayerId,
  nodeId: NodeId
): { canBuild: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canBuild: false, reason: 'Can only build towns in ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canBuild: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canBuild: false, reason: 'Unresolved pending decisions exist' };
  }

  const player = state.players[playerId]!;
  if (player.townsInReserve <= 0) {
    return { canBuild: false, reason: 'No town pieces remaining in reserve' };
  }
  if (
    player.resources.lumber < 1 ||
    player.resources.brick < 1 ||
    player.resources.natural_fiber < 1 ||
    player.resources.food < 1
  ) {
    return { canBuild: false, reason: 'Insufficient resources (requires 1 lumber, 1 brick, 1 fiber, 1 food)' };
  }

  const node = state.board.intersections[nodeId];
  if (!node) {
    return { canBuild: false, reason: 'Invalid intersection ID' };
  }
  if (node.building !== null) {
    return { canBuild: false, reason: 'Intersection already has a building' };
  }

  // 2-path distance rule
  if (!isValidDistance(state.board, nodeId)) {
    return { canBuild: false, reason: 'Violates 2-path distance rule' };
  }

  // Road connectivity check: must be attached to at least 1 of player's roads
  const hasConnectedRoad = node.incidentEdgeIds.some(
    (eId) => state.board.edges[eId]?.road?.playerId === playerId
  );
  if (!hasConnectedRoad) {
    return { canBuild: false, reason: 'Town must connect to at least one of your roads' };
  }

  return { canBuild: true };
}

export function applyBuildTown(state: GameState, playerId: PlayerId, nodeId: NodeId): void {
  const check = canBuildTown(state, playerId, nodeId);
  if (!check.canBuild) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;
  player.resources.lumber -= 1;
  player.resources.brick -= 1;
  player.resources.natural_fiber -= 1;
  player.resources.food -= 1;
  state.supply.resources.lumber += 1;
  state.supply.resources.brick += 1;
  state.supply.resources.natural_fiber += 1;
  state.supply.resources.food += 1;

  const node = state.board.intersections[nodeId]!;
  node.building = { playerId, type: 'town' };
  player.townsBuilt += 1;
  player.townsInReserve -= 1;
  player.victoryPoints += 1;

  player.localFootprint = computePlayerLF(player);
  state.trueTotalLF = computeTrueTotalLF(state.players);
  state.clampedGF = clampGF(state.trueTotalLF, state.playerCount);

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} built a Town on intersection ${nodeId} (+1 VP, +1 LF).`,
  });

  // Building a town might break an opponent's road network
  updateLongestRoadAward(state);
}

// ============================================================================
// Cities (ACT-01)
// ============================================================================

export function canBuildCity(
  state: GameState,
  playerId: PlayerId,
  nodeId: NodeId
): { canBuild: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canBuild: false, reason: 'Can only upgrade to city in ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canBuild: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canBuild: false, reason: 'Unresolved pending decisions exist' };
  }

  const player = state.players[playerId]!;
  if (player.citiesInReserve <= 0) {
    return { canBuild: false, reason: 'No city pieces remaining in reserve' };
  }
  if (player.resources.steel < 3 || player.resources.food < 2) {
    return { canBuild: false, reason: 'Insufficient resources (requires 3 steel, 2 food)' };
  }

  const node = state.board.intersections[nodeId];
  if (!node || !node.building) {
    return { canBuild: false, reason: 'Target intersection does not have a settlement' };
  }
  if (node.building.playerId !== playerId) {
    return { canBuild: false, reason: 'Settlement does not belong to you' };
  }
  if (node.building.type !== 'town') {
    return { canBuild: false, reason: 'Can only upgrade a Town to a City' };
  }

  return { canBuild: true };
}

export function applyBuildCity(state: GameState, playerId: PlayerId, nodeId: NodeId): void {
  const check = canBuildCity(state, playerId, nodeId);
  if (!check.canBuild) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;
  player.resources.steel -= 3;
  player.resources.food -= 2;
  state.supply.resources.steel += 3;
  state.supply.resources.food += 2;

  const node = state.board.intersections[nodeId]!;
  node.building!.type = 'city';

  player.townsBuilt -= 1;
  player.townsInReserve += 1;
  player.citiesBuilt += 1;
  player.citiesInReserve -= 1;
  player.victoryPoints += 1; // +1 net VP (Town gave 1, City gives 2)

  player.localFootprint = computePlayerLF(player); // +1 net LF
  state.trueTotalLF = computeTrueTotalLF(state.players);
  state.clampedGF = clampGF(state.trueTotalLF, state.playerCount);

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} upgraded Town to City on intersection ${nodeId} (+1 net VP, +1 net LF).`,
  });
}

// ============================================================================
// Power Plants (Fossil & Renewable) (ACT-02)
// ============================================================================

export function canBuildPowerPlant(
  state: GameState,
  playerId: PlayerId,
  nodeId: NodeId,
  hexId: HexId,
  plantType: 'fossil' | 'renewable'
): { canBuild: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canBuild: false, reason: 'Can only build power plants in ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canBuild: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canBuild: false, reason: 'Unresolved pending decisions exist' };
  }

  // Combined 1 power plant per turn limit (R L656)
  if (state.turnStats.powerPlantsBuiltThisTurn >= 1) {
    return { canBuild: false, reason: 'Maximum of 1 power plant may be built per turn' };
  }

  // Validate cutout slot
  const cutoutCheck = isValidCutoutForPlant(state.board, nodeId, hexId, plantType, playerId);
  if (!cutoutCheck.valid) {
    return { canBuild: false, reason: cutoutCheck.reason };
  }

  const player = state.players[playerId]!;

  if (plantType === 'fossil') {
    if (player.fossilPlantsInReserve <= 0) {
      return { canBuild: false, reason: 'No fossil power plants remaining in reserve' };
    }
    if (player.science < 1) {
      return { canBuild: false, reason: 'Insufficient science (requires 1 science card)' };
    }
  } else {
    if (player.renewablePlantsInReserve <= 0) {
      return { canBuild: false, reason: 'No renewable power plants remaining in reserve' };
    }
    if (player.science < 3) {
      return { canBuild: false, reason: 'Insufficient science (requires 3 science cards)' };
    }
  }

  return { canBuild: true };
}

export function applyBuildPowerPlant(
  state: GameState,
  playerId: PlayerId,
  nodeId: NodeId,
  hexId: HexId,
  plantType: 'fossil' | 'renewable'
): void {
  const check = canBuildPowerPlant(state, playerId, nodeId, hexId, plantType);
  if (!check.canBuild) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;
  const node = state.board.intersections[nodeId]!;

  if (plantType === 'fossil') {
    player.science -= 1;
    state.supply.science += 1;

    player.fossilPlantsBuilt += 1;
    player.fossilPlantsInReserve -= 1;
    node.powerPlants.push({ playerId, type: 'fossil', hexId });

    // Building a fossil plant only raises the footprint (R p.15). Hazard tokens come exclusively from
    // events (Air Pollution, Environmental Pollution, Rain & Flooding), never from building.
    player.localFootprint = computePlayerLF(player);
    state.trueTotalLF = computeTrueTotalLF(state.players);
    state.clampedGF = clampGF(state.trueTotalLF, state.playerCount);

    state.turnStats.powerPlantsBuiltThisTurn += 1;

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} built a Fossil Power Plant on hex ${hexId} (+1 LF).`,
    });
  } else {
    // Renewable plant
    player.science -= 3;
    state.supply.science += 3;

    player.renewablePlantsBuilt += 1;
    player.renewablePlantsInReserve -= 1;
    node.powerPlants.push({ playerId, type: 'renewable', hexId });

    // Green event disc taken from under the plant on the player board into the event bag (R p.15).
    // The disc is dealt face down and goes into the bag unseen, so which event it is must never
    // appear in the log (or anywhere else other players can read).
    let discAdded = false;
    if (player.hiddenGreenDiscs.length > 0) {
      const disc = player.hiddenGreenDiscs.shift()!;
      state.eventBag.push(disc as EventDiscType);
      discAdded = true;
    }

    player.localFootprint = computePlayerLF(player);
    state.trueTotalLF = computeTrueTotalLF(state.players);
    state.clampedGF = clampGF(state.trueTotalLF, state.playerCount);

    state.turnStats.powerPlantsBuiltThisTurn += 1;

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} built a Renewable Power Plant on hex ${hexId} (-1 LF${
        discAdded ? ', added a green event disc to the bag' : ''
      }).`,
    });
  }
}

// ============================================================================
// Warehouse (ACT-02)
// ============================================================================

export function canBuildWarehouse(
  state: GameState,
  playerId: PlayerId
): { canBuild: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canBuild: false, reason: 'Can only build warehouse in ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canBuild: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canBuild: false, reason: 'Unresolved pending decisions exist' };
  }

  const player = state.players[playerId]!;
  if (player.hasWarehouse) {
    return { canBuild: false, reason: 'Warehouse already built' };
  }
  if (player.energy < 2) {
    return { canBuild: false, reason: 'Insufficient energy (requires 2 energy tokens)' };
  }

  return { canBuild: true };
}

export function applyBuildWarehouse(state: GameState, playerId: PlayerId): void {
  const check = canBuildWarehouse(state, playerId);
  if (!check.canBuild) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;
  player.energy -= 2;
  state.supply.energy += 2;
  player.hasWarehouse = true;

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} built Warehouse (hand limit raised to 10 on roll of 7).`,
  });
}
