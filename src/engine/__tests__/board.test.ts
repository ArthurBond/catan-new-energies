import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBoard,
  isValidDistance,
  getNodesSatisfyingDistanceRule,
  getEmptyIncidentEdges,
  getDistanceBetweenNodes,
  getCutoutsForIntersection,
  isValidCutoutForPlant,
  getHarborsForPlayer,
  getHarborTradeRates,
} from '../board';
import { Board } from '../types';

describe('Board Topology & Graph — TOP-01 & TOP-02', () => {
  let board: Board;

  beforeEach(() => {
    board = createBoard();
  });

  describe('TOP-01: 19 Land Hexes & Axial Grid', () => {
    it('has exactly 19 hexes in a 3-4-5-4-3 layout', () => {
      expect(board.hexes).toHaveLength(19);
      const rows = [-2, -1, 0, 1, 2].map((r) => board.hexes.filter((h) => h.coord.r === r).length);
      expect(rows).toEqual([3, 4, 5, 4, 3]);
    });

    it('contains the exact official terrain distribution', () => {
      const counts = board.hexes.reduce((acc, h) => {
        acc[h.terrain] = (acc[h.terrain] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(counts).toEqual({
        forest: 4,
        hills: 3,
        pasture: 4,
        fields: 4,
        mountains: 3,
        desert: 1,
      });
    });

    it('starts with Environmental Inspector on the Desert and 0 hazards', () => {
      const desert = board.hexes.find((h) => h.terrain === 'desert');
      expect(desert).toBeDefined();
      expect(desert!.numberDisc).toBeNull();
      expect(desert!.hasInspector).toBe(true);

      const nonDesert = board.hexes.filter((h) => h.terrain !== 'desert');
      expect(nonDesert.every((h) => !h.hasInspector)).toBe(true);
      expect(board.hexes.every((h) => !h.hasHazard)).toBe(true);
    });

    it('contains exactly 18 number discs with correct dice frequencies', () => {
      const numbers = board.hexes
        .map((h) => h.numberDisc)
        .filter((n): n is number => n !== null);
      expect(numbers).toHaveLength(18);

      const freq = numbers.reduce((acc, n) => {
        acc[n] = (acc[n] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      expect(freq[2]).toBe(1);
      expect(freq[3]).toBe(2);
      expect(freq[4]).toBe(2);
      expect(freq[5]).toBe(2);
      expect(freq[6]).toBe(2);
      expect(freq[8]).toBe(2);
      expect(freq[9]).toBe(2);
      expect(freq[10]).toBe(2);
      expect(freq[11]).toBe(2);
      expect(freq[12]).toBe(1);
      expect(freq[7]).toBeUndefined(); // 7 never appears on number discs
    });
  });

  describe('TOP-02: 54 Intersections & 72 Path Edges', () => {
    it('has exactly 54 unique intersections and 72 unique edges', () => {
      expect(board.intersections).toHaveLength(54);
      expect(board.edges).toHaveLength(72);
    });

    it('satisfies graph degree invariants and Euler edge relationships', () => {
      const degrees = board.intersections.map((n) => n.adjacentNodeIds.length);
      const degreeCounts = degrees.reduce((acc, d) => {
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      expect(degreeCounts[2]).toBe(18); // 18 coastal tips
      expect(degreeCounts[3]).toBe(36); // 24 interior + 12 coastal

      const coastalEdges = board.edges.filter((e) => e.isCoastal);
      const interiorEdges = board.edges.filter((e) => !e.isCoastal);
      expect(coastalEdges).toHaveLength(30);
      expect(interiorEdges).toHaveLength(42);
    });

    it('forms a fully connected planar graph', () => {
      for (let i = 1; i < 54; i++) {
        expect(getDistanceBetweenNodes(board, 0, i)).toBeGreaterThan(0);
      }
    });

    it('finds empty incident edges for a node', () => {
      const edges = getEmptyIncidentEdges(board, 0);
      expect(edges.length).toBe(board.intersections[0]!.incidentEdgeIds.length);
    });
  });

  describe('TOP-02: 3 Hex Cutouts Per Intersection', () => {
    it('contains exactly 114 total cutout slots across 54 intersections', () => {
      let totalCutouts = 0;
      for (const node of board.intersections) {
        const cutouts = getCutoutsForIntersection(board, node.id);
        expect(cutouts.length).toBe(node.adjacentHexIds.length);
        expect(cutouts.length).toBeGreaterThanOrEqual(1);
        expect(cutouts.length).toBeLessThanOrEqual(3);
        totalCutouts += cutouts.length;
      }
      expect(totalCutouts).toBe(114);
    });

    it('strictly forbids power plant placement on Desert or Sea', () => {
      // Find intersection adjacent to Desert (hex 7)
      const desertNode = board.intersections.find((n) => n.adjacentHexIds.includes(7))!;
      desertNode.building = { playerId: 'blue', type: 'town' };

      const res = isValidCutoutForPlant(board, desertNode.id, 7, 'fossil', 'blue');
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/desert or sea/i);
    });

    it('enforces Town max 1 cutout plant and City max 3 on distinct hexes', () => {
      // Pick interior node 23 adjacent to hexes 4, 8, 9
      const node = board.intersections[23]!;
      node.building = { playerId: 'purple', type: 'town' };

      // 1st plant on Town: valid
      expect(isValidCutoutForPlant(board, 23, 4, 'fossil', 'purple').valid).toBe(true);
      node.powerPlants.push({ playerId: 'purple', type: 'fossil', hexId: 4 });

      // 2nd plant on Town: rejected
      const townSecond = isValidCutoutForPlant(board, 23, 8, 'renewable', 'purple');
      expect(townSecond.valid).toBe(false);
      expect(townSecond.reason).toMatch(/town may only have 1/i);

      // Upgrade Town to City
      node.building.type = 'city';

      // 2nd plant on City on distinct hex 8: valid
      expect(isValidCutoutForPlant(board, 23, 8, 'renewable', 'purple').valid).toBe(true);
      node.powerPlants.push({ playerId: 'purple', type: 'renewable', hexId: 8 });

      // Duplicate plant on already occupied hex 8: rejected
      const cityDup = isValidCutoutForPlant(board, 23, 8, 'fossil', 'purple');
      expect(cityDup.valid).toBe(false);
      expect(cityDup.reason).toMatch(/different hex/i);

      // 3rd plant on distinct hex 9: valid
      expect(isValidCutoutForPlant(board, 23, 9, 'fossil', 'purple').valid).toBe(true);
      node.powerPlants.push({ playerId: 'purple', type: 'fossil', hexId: 9 });

      // 4th plant on City: rejected (capacity cap 3)
      const cityFourth = isValidCutoutForPlant(board, 23, 4, 'renewable', 'purple');
      expect(cityFourth.valid).toBe(false);
    });
  });

  describe('TOP-02: 2-Path Distance Rule', () => {
    it('allows placement on any node when board is empty', () => {
      expect(getNodesSatisfyingDistanceRule(board)).toHaveLength(54);
    });

    it('invalidates placed node and all direct neighbors when town is built', () => {
      expect(isValidDistance(board, 0)).toBe(true);
      board.intersections[0]!.building = { playerId: 'orange', type: 'town' };
      expect(isValidDistance(board, 0)).toBe(false);
      const legal = getNodesSatisfyingDistanceRule(board);
      expect(legal).not.toContain(0);
      for (const neighborId of board.intersections[0]!.adjacentNodeIds) {
        expect(isValidDistance(board, neighborId)).toBe(false);
        expect(legal).not.toContain(neighborId);
      }
      expect(legal.length).toBe(54 - 1 - board.intersections[0]!.adjacentNodeIds.length);
    });

    it('verifies all 8 First Game starting pieces obey the distance rule', () => {
      const startingNodes = [10, 12, 23, 35, 45, 39, 25, 36];
      for (let i = 0; i < startingNodes.length; i++) {
        for (let j = i + 1; j < startingNodes.length; j++) {
          const d = getDistanceBetweenNodes(board, startingNodes[i]!, startingNodes[j]!);
          expect(d).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  describe('TOP-02: 9 Coastal Harbors', () => {
    it('contains exactly 4 generic 3:1 harbors and 5 specialized 2:1 harbors', () => {
      expect(board.harbors).toHaveLength(9);
      const generic = board.harbors.filter((h) => h.type === 'generic');
      const specialized = board.harbors.filter((h) => h.type !== 'generic');
      expect(generic).toHaveLength(4);
      expect(specialized).toHaveLength(5);

      const res = specialized.map((h) => h.resource).sort();
      expect(res).toEqual(['brick', 'food', 'lumber', 'natural_fiber', 'steel']);
    });

    it('binds harbors to exact coastal edges and endpoint intersections', () => {
      for (const harbor of board.harbors) {
        const edge = board.edges[harbor.edgeId]!;
        expect(edge.isCoastal).toBe(true);
        expect(edge.harborId).toBe(harbor.id);
        expect(harbor.nodeIds).toEqual([edge.v1, edge.v2]);
        expect(board.intersections[harbor.nodeIds[0]]!.harborId).toBe(harbor.id);
        expect(board.intersections[harbor.nodeIds[1]]!.harborId).toBe(harbor.id);
      }
    });

    it('correctly calculates player harbor trading ratios', () => {
      // Default: 4:1 for all resources
      expect(getHarborsForPlayer(board, 'pink')).toHaveLength(0);
      expect(getHarborTradeRates(board, 'pink')).toEqual({
        lumber: 4,
        brick: 4,
        natural_fiber: 4,
        food: 4,
        steel: 4,
      });

      // Place town at generic 3:1 harbor (Harbor 1: nodes 2 & 6)
      board.intersections[2]!.building = { playerId: 'pink', type: 'town' };
      expect(getHarborsForPlayer(board, 'pink')).toHaveLength(1);
      expect(getHarborTradeRates(board, 'pink')).toEqual({
        lumber: 3,
        brick: 3,
        natural_fiber: 3,
        food: 3,
        steel: 3,
      });

      // Place city at specialized 2:1 Brick harbor (Harbor 8: nodes 7 & 11)
      board.intersections[7]!.building = { playerId: 'pink', type: 'city' };
      expect(getHarborsForPlayer(board, 'pink')).toHaveLength(2);
      expect(getHarborTradeRates(board, 'pink')).toEqual({
        lumber: 3,
        brick: 2, // Upgraded to 2:1
        natural_fiber: 3,
        food: 3,
        steel: 3,
      });
    });
  });
});
