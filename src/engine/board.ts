/**
 * CATAN: New Energies — Board Topology & Graph Geometry
 *
 * Implements the 19 pointy-top axial hex grid (3-4-5-4-3 layout),
 * 54 intersections, 72 path edges, 9 coastal harbors, cutout slots,
 * and the 2-path distance rule graph validator.
 */

import {
  Board,
  CutoutSlot,
  EdgeId,
  Harbor,
  Hex,
  HexCoord,
  HexId,
  HexTileConfig,
  Intersection,
  NodeId,
  PathEdge,
  PlayerId,
  PowerPlantType,
  ResourceType,
} from './types';

// ============================================================================
// Canonical 19 Axial Hex Coordinates (3-4-5-4-3 layout)
// ============================================================================

export const CANONICAL_HEX_COORDS: readonly HexCoord[] = [
  // Row 0 (r = -2, 3 hexes)
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },

  // Row 1 (r = -1, 4 hexes)
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },

  // Row 2 (r = 0, 5 hexes)
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },

  // Row 3 (r = 1, 4 hexes)
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },

  // Row 4 (r = 2, 3 hexes)
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 },
] as const;

export const FIRST_GAME_HEX_CONFIGS: readonly HexTileConfig[] = [
  // Row 0
  { terrain: 'hills', numberDisc: 2 },
  { terrain: 'pasture', numberDisc: 3 },
  { terrain: 'forest', numberDisc: 10 },

  // Row 1
  { terrain: 'fields', numberDisc: 4 },
  { terrain: 'mountains', numberDisc: 6 },
  { terrain: 'fields', numberDisc: 5 },
  { terrain: 'hills', numberDisc: 8 },

  // Row 2
  { terrain: 'desert', numberDisc: null }, // Environmental Inspector starts here
  { terrain: 'pasture', numberDisc: 9 },
  { terrain: 'hills', numberDisc: 11 },
  { terrain: 'pasture', numberDisc: 4 },
  { terrain: 'forest', numberDisc: 12 },

  // Row 3
  { terrain: 'pasture', numberDisc: 6 },
  { terrain: 'mountains', numberDisc: 3 },
  { terrain: 'mountains', numberDisc: 9 },
  { terrain: 'fields', numberDisc: 10 },

  // Row 4
  { terrain: 'forest', numberDisc: 5 },
  { terrain: 'fields', numberDisc: 8 },
  { terrain: 'forest', numberDisc: 11 },
] as const;

// 6 Pointy-Top Hexagon Corner Offsets in Discrete Integer Lattice (u, v)
// Center: u0 = 2q + r, v0 = 3r
const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -2],  // Corner 0: North
  [1, -1],  // Corner 1: North-East
  [1, 1],   // Corner 2: South-East
  [0, 2],   // Corner 3: South
  [-1, 1],  // Corner 4: South-West
  [-1, -1], // Corner 5: North-West
] as const;

// 9 Coastal Harbors Specification
interface HarborSpec {
  id: number;
  type: 'generic' | ResourceType;
  ratio: 2 | 3;
  resource: ResourceType | null;
  nodeIds: [NodeId, NodeId];
  edgeId: EdgeId;
}

const HARBOR_SPECS: readonly HarborSpec[] = [
  { id: 0, type: 'natural_fiber', ratio: 2, resource: 'natural_fiber', nodeIds: [1, 4], edgeId: 2 },
  { id: 1, type: 'generic', ratio: 3, resource: null, nodeIds: [2, 6], edgeId: 5 },
  { id: 2, type: 'food', ratio: 2, resource: 'food', nodeIds: [15, 20], edgeId: 22 },
  { id: 3, type: 'steel', ratio: 2, resource: 'steel', nodeIds: [37, 42], edgeId: 53 },
  { id: 4, type: 'generic', ratio: 3, resource: null, nodeIds: [50, 53], edgeId: 71 },
  { id: 5, type: 'lumber', ratio: 2, resource: 'lumber', nodeIds: [48, 51], edgeId: 67 },
  { id: 6, type: 'generic', ratio: 3, resource: null, nodeIds: [38, 43], edgeId: 54 },
  { id: 7, type: 'generic', ratio: 3, resource: null, nodeIds: [21, 27], edgeId: 33 },
  { id: 8, type: 'brick', ratio: 2, resource: 'brick', nodeIds: [7, 11], edgeId: 10 },
] as const;

// ============================================================================
// Board Creation & Graph Construction
// ============================================================================

export function createBoard(hexConfigs?: readonly HexTileConfig[]): Board {
  const configs = hexConfigs ?? FIRST_GAME_HEX_CONFIGS;

  // 1. Create 19 Hexes
  const hexes: Hex[] = CANONICAL_HEX_COORDS.map((coord, id) => {
    const config = configs[id]!;
    const isDesert = config.terrain === 'desert';
    return {
      id,
      coord,
      terrain: config.terrain,
      numberDisc: config.numberDisc,
      hasInspector: isDesert, // Inspector starts on Desert
      hasHazard: false,
    };
  });

  // 2. Discover Unique Corner Lattice Points (Intersections)
  interface RawNode {
    u: number;
    v: number;
    adjacentHexIds: HexId[];
  }

  const nodeMap = new Map<string, RawNode>();

  hexes.forEach((hex) => {
    const u0 = 2 * hex.coord.q + hex.coord.r;
    const v0 = 3 * hex.coord.r;

    CORNER_OFFSETS.forEach(([du, dv]) => {
      const u = u0 + du;
      const v = v0 + dv;
      const key = `${u},${v}`;

      let node = nodeMap.get(key);
      if (!node) {
        node = { u, v, adjacentHexIds: [] };
        nodeMap.set(key, node);
      }
      if (!node.adjacentHexIds.includes(hex.id)) {
        node.adjacentHexIds.push(hex.id);
      }
    });
  });

  // Sort nodes deterministically by v ascending, then u ascending (54 nodes: 0..53)
  const sortedRawNodes = Array.from(nodeMap.values()).sort((a, b) => {
    if (a.v !== b.v) return a.v - b.v;
    return a.u - b.u;
  });

  const keyToNodeId = new Map<string, NodeId>();
  sortedRawNodes.forEach((node, index) => {
    keyToNodeId.set(`${node.u},${node.v}`, index);
  });

  // 3. Discover Unique Path Edges
  interface RawEdge {
    v1: NodeId;
    v2: NodeId;
    adjacentHexIds: HexId[];
  }

  const edgeMap = new Map<string, RawEdge>();

  hexes.forEach((hex) => {
    const u0 = 2 * hex.coord.q + hex.coord.r;
    const v0 = 3 * hex.coord.r;

    const cornerNodeIds = CORNER_OFFSETS.map(([du, dv]) => {
      const key = `${u0 + du},${v0 + dv}`;
      return keyToNodeId.get(key)!;
    });

    for (let c = 0; c < 6; c++) {
      const idA = cornerNodeIds[c]!;
      const idB = cornerNodeIds[(c + 1) % 6]!;
      const v1 = Math.min(idA, idB);
      const v2 = Math.max(idA, idB);
      const edgeKey = `${v1}-${v2}`;

      let edge = edgeMap.get(edgeKey);
      if (!edge) {
        edge = { v1, v2, adjacentHexIds: [] };
        edgeMap.set(edgeKey, edge);
      }
      if (!edge.adjacentHexIds.includes(hex.id)) {
        edge.adjacentHexIds.push(hex.id);
      }
    }
  });

  // Sort edges deterministically by v1 ascending, then v2 ascending (72 edges: 0..71)
  const sortedRawEdges = Array.from(edgeMap.values()).sort((a, b) => {
    if (a.v1 !== b.v1) return a.v1 - b.v1;
    return a.v2 - b.v2;
  });

  // Create PathEdge array
  const edges: PathEdge[] = sortedRawEdges.map((raw, id) => ({
    id,
    v1: raw.v1,
    v2: raw.v2,
    adjacentHexIds: raw.adjacentHexIds,
    isCoastal: raw.adjacentHexIds.length === 1,
    road: null,
    harborId: null,
  }));

  // Build node adjacencies from edges
  const adjacentNodeIdsMap = new Map<NodeId, Set<NodeId>>();
  const incidentEdgeIdsMap = new Map<NodeId, EdgeId[]>();

  sortedRawNodes.forEach((_, id) => {
    adjacentNodeIdsMap.set(id, new Set<NodeId>());
    incidentEdgeIdsMap.set(id, []);
  });

  edges.forEach((edge) => {
    adjacentNodeIdsMap.get(edge.v1)!.add(edge.v2);
    adjacentNodeIdsMap.get(edge.v2)!.add(edge.v1);
    incidentEdgeIdsMap.get(edge.v1)!.push(edge.id);
    incidentEdgeIdsMap.get(edge.v2)!.push(edge.id);
  });

  const intersections: Intersection[] = sortedRawNodes.map((raw, id) => ({
    id,
    u: raw.u,
    v: raw.v,
    adjacentHexIds: raw.adjacentHexIds,
    adjacentNodeIds: Array.from(adjacentNodeIdsMap.get(id)!).sort((a, b) => a - b),
    incidentEdgeIds: incidentEdgeIdsMap.get(id)!.sort((a, b) => a - b),
    building: null,
    powerPlants: [],
    hasHazard: false,
    harborId: null,
  }));

  // 4. Bind 9 Harbors
  const harbors: Harbor[] = HARBOR_SPECS.map((spec) => {
    const harbor: Harbor = {
      id: spec.id,
      type: spec.type,
      ratio: spec.ratio,
      resource: spec.resource,
      edgeId: spec.edgeId,
      nodeIds: spec.nodeIds,
    };

    // Mark edge and intersections
    const edge = edges[spec.edgeId]!;
    edge.harborId = spec.id;
    intersections[spec.nodeIds[0]]!.harborId = spec.id;
    intersections[spec.nodeIds[1]]!.harborId = spec.id;

    return harbor;
  });

  return {
    hexes,
    intersections,
    edges,
    harbors,
  };
}

// ============================================================================
// Distance Rule & Graph Queries
// ============================================================================

export function isValidDistance(board: Board, nodeId: NodeId): boolean {
  const node = board.intersections[nodeId];
  if (!node || node.building !== null) return false;
  for (const neighborId of node.adjacentNodeIds) {
    if (board.intersections[neighborId]?.building !== null) {
      return false;
    }
  }
  return true;
}

export function getNodesSatisfyingDistanceRule(board: Board): NodeId[] {
  return board.intersections
    .filter((node) => isValidDistance(board, node.id))
    .map((node) => node.id);
}

export function getEmptyIncidentEdges(board: Board, nodeId: NodeId): EdgeId[] {
  const node = board.intersections[nodeId];
  if (!node) return [];
  return node.incidentEdgeIds.filter((edgeId) => board.edges[edgeId]?.road === null);
}

export function getDistanceBetweenNodes(board: Board, startNode: NodeId, endNode: NodeId): number {
  if (startNode === endNode) return 0;

  const visited = new Set<NodeId>([startNode]);
  const queue: [NodeId, number][] = [[startNode, 0]];

  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    if (current === endNode) return dist;

    const node = board.intersections[current];
    if (!node) continue;

    for (const neighborId of node.adjacentNodeIds) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push([neighborId, dist + 1]);
      }
    }
  }

  return -1; // Not reachable (graph is connected so this won't occur)
}

export function getAdjacentHexes(board: Board, nodeId: NodeId): Hex[] {
  const node = board.intersections[nodeId];
  if (!node) return [];
  return node.adjacentHexIds.map((hId) => board.hexes[hId]!).filter(Boolean);
}

export function getAdjacentNodes(board: Board, nodeId: NodeId): NodeId[] {
  return board.intersections[nodeId]?.adjacentNodeIds ?? [];
}

export function getIncidentEdges(board: Board, nodeId: NodeId): EdgeId[] {
  return board.intersections[nodeId]?.incidentEdgeIds ?? [];
}

export function getEdgeBetweenNodes(board: Board, nodeA: NodeId, nodeB: NodeId): EdgeId | null {
  const node = board.intersections[nodeA];
  if (!node) return null;
  for (const edgeId of node.incidentEdgeIds) {
    const edge = board.edges[edgeId]!;
    if ((edge.v1 === nodeA && edge.v2 === nodeB) || (edge.v1 === nodeB && edge.v2 === nodeA)) {
      return edgeId;
    }
  }
  return null;
}

// ============================================================================
// Cutouts & Power Plants
// ============================================================================

export function getCutoutsForIntersection(board: Board, nodeId: NodeId): CutoutSlot[] {
  const node = board.intersections[nodeId];
  if (!node) return [];

  return node.adjacentHexIds.map((hexId) => {
    const plant = node.powerPlants.find((p) => p.hexId === hexId) ?? null;
    return {
      nodeId,
      hexId,
      plant,
    };
  });
}

export function isValidCutoutForPlant(
  board: Board,
  nodeId: NodeId,
  hexId: HexId,
  _plantType: PowerPlantType,
  playerId: PlayerId
): { valid: boolean; reason?: string } {
  const node = board.intersections[nodeId];
  if (!node || !node.building) {
    return { valid: false, reason: 'No settlement at target intersection' };
  }
  if (node.building.playerId !== playerId) {
    return { valid: false, reason: 'Settlement does not belong to active player' };
  }
  if (!node.adjacentHexIds.includes(hexId)) {
    return { valid: false, reason: `Hex ${hexId} is not adjacent to intersection ${nodeId}` };
  }
  const hex = board.hexes[hexId];
  if (!hex || hex.terrain === 'desert' || hex.numberDisc === null) {
    return { valid: false, reason: 'Power plants cannot be built on desert or sea' };
  }
  if (node.building.type === 'town') {
    if (node.powerPlants.length >= 1) {
      return { valid: false, reason: 'A Town may only have 1 power plant' };
    }
  } else if (node.building.type === 'city') {
    if (node.powerPlants.length >= 3) {
      return { valid: false, reason: 'A City may have at most 3 power plants' };
    }
    const alreadyHasPlantOnHex = node.powerPlants.some((p) => p.hexId === hexId);
    if (alreadyHasPlantOnHex) {
      return { valid: false, reason: 'City power plants must each face a different hex' };
    }
  }
  return { valid: true };
}

// ============================================================================
// Harbor Queries & Trade Rates
// ============================================================================

export function getHarborsForPlayer(board: Board, playerId: PlayerId): Harbor[] {
  return board.harbors.filter((h) => {
    const nodeA = board.intersections[h.nodeIds[0]];
    const nodeB = board.intersections[h.nodeIds[1]];
    return (
      (nodeA?.building !== null && nodeA?.building?.playerId === playerId) ||
      (nodeB?.building !== null && nodeB?.building?.playerId === playerId)
    );
  });
}

export function getHarborTradeRates(board: Board, playerId: PlayerId): Record<ResourceType, number> {
  const playerHarbors = getHarborsForPlayer(board, playerId);
  const rates: Record<ResourceType, number> = {
    lumber: 4,
    brick: 4,
    natural_fiber: 4,
    food: 4,
    steel: 4,
  };

  const hasGenericHarbor = playerHarbors.some((h) => h.type === 'generic');
  if (hasGenericHarbor) {
    for (const res of Object.keys(rates) as ResourceType[]) {
      rates[res] = 3;
    }
  }

  for (const h of playerHarbors) {
    if (h.resource !== null && h.ratio === 2) {
      rates[h.resource] = 2;
    }
  }

  return rates;
}
