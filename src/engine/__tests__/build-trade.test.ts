import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../setup';
import { applyAction } from '../reducer';
import { calculateLongestRoad, updateLongestRoadAward } from '../longest-road';
import { Board, EdgeId, GameState, PlayerId } from '../types';

describe('Building, Trading & Longest Road Engine — ACT-01..ACT-06', () => {
  let state: GameState;
  const activePid: PlayerId = 'orange';

  beforeEach(() => {
    // 4P First Game starts in EventPhase on turn 1
    state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    // Transition to ActionPhase for testing
    state.phase = 'ActionPhase';
  });

  describe('ACT-01: Building Roads, Towns, and Cities', () => {
    it('builds a road with valid connectivity and resource costs', () => {
      state.players[activePid]!.resources.lumber = 2;
      state.players[activePid]!.resources.brick = 2;
      const initialRoadsBuilt = state.players[activePid]!.roadsBuilt;
      const initialRoadsReserve = state.players[activePid]!.roadsInReserve;

      // In 4P first game, Orange has city at node 10, town at node 12
      const emptyEdge = state.board.intersections[10]!.incidentEdgeIds.find(
        (eId) => state.board.edges[eId]!.road === null
      )!;
      expect(emptyEdge).toBeDefined();

      state = applyAction(state, {
        type: 'BUILD_ROAD',
        playerId: activePid,
        edgeId: emptyEdge,
      });

      const player = state.players[activePid]!;
      expect(player.resources.lumber).toBe(1);
      expect(player.resources.brick).toBe(1);
      expect(player.roadsBuilt).toBe(initialRoadsBuilt + 1);
      expect(player.roadsInReserve).toBe(initialRoadsReserve - 1);
      expect(state.board.edges[emptyEdge]!.road).toEqual({ playerId: activePid });
    });

    it('rejects road building without connectivity or insufficient resources', () => {
      state.players[activePid]!.resources.lumber = 0;
      state.players[activePid]!.resources.brick = 0;

      const emptyEdge = state.board.intersections[10]!.incidentEdgeIds.find(
        (eId) => state.board.edges[eId]!.road === null
      )!;

      // Insufficient resources
      expect(() => {
        applyAction(state, {
          type: 'BUILD_ROAD',
          playerId: activePid,
          edgeId: emptyEdge,
        });
      }).toThrow();

      // Give resources but test disconnected edge on opposite side of island
      state.players[activePid]!.resources.lumber = 1;
      state.players[activePid]!.resources.brick = 1;
      const disconnectedEdge = 55;
      if (state.board.edges[disconnectedEdge]!.road === null) {
        expect(() => {
          applyAction(state, {
            type: 'BUILD_ROAD',
            playerId: activePid,
            edgeId: disconnectedEdge,
          });
        }).toThrow();
      }
    });

    it('builds a town adhering to 2-path distance rule and network connectivity', () => {
      state.players[activePid]!.resources.lumber = 3;
      state.players[activePid]!.resources.brick = 3;
      state.players[activePid]!.resources.natural_fiber = 2;
      state.players[activePid]!.resources.food = 2;

      // Find an empty incident edge from node 10 and build road 1
      const emptyEdge1 = state.board.intersections[10]!.incidentEdgeIds.find(
        (eId) => state.board.edges[eId]!.road === null
      )!;
      state = applyAction(state, { type: 'BUILD_ROAD', playerId: activePid, edgeId: emptyEdge1 });

      const e1Obj = state.board.edges[emptyEdge1]!;
      const targetNode1 = e1Obj.v1 === 10 ? e1Obj.v2 : e1Obj.v1;

      // Build road 2 from targetNode1
      const emptyEdge2 = state.board.intersections[targetNode1]!.incidentEdgeIds.find(
        (eId) => state.board.edges[eId]!.road === null
      )!;
      state = applyAction(state, { type: 'BUILD_ROAD', playerId: activePid, edgeId: emptyEdge2 });

      const e2Obj = state.board.edges[emptyEdge2]!;
      const townNode = e2Obj.v1 === targetNode1 ? e2Obj.v2 : e2Obj.v1;

      const initialTownsBuilt = state.players[activePid]!.townsBuilt;
      const initialTownsReserve = state.players[activePid]!.townsInReserve;
      const initialVp = state.players[activePid]!.victoryPoints;
      const initialLf = state.players[activePid]!.localFootprint;

      state = applyAction(state, {
        type: 'BUILD_TOWN',
        playerId: activePid,
        nodeId: townNode,
      });

      const player = state.players[activePid]!;
      expect(player.townsBuilt).toBe(initialTownsBuilt + 1);
      expect(player.townsInReserve).toBe(initialTownsReserve - 1);
      expect(player.victoryPoints).toBe(initialVp + 1);
      expect(player.localFootprint).toBe(initialLf + 1);
      expect(state.board.intersections[townNode]!.building).toEqual({
        playerId: activePid,
        type: 'town',
      });
    });

    it('upgrades Town to City: costs 3 steel + 2 food, net +1 VP, net +1 LF, keeps power plants', () => {
      state.players[activePid]!.resources.steel = 3;
      state.players[activePid]!.resources.food = 2;

      // Town is at node 12 for Orange
      const townNode = state.board.intersections[12]!;
      expect(townNode.building?.type).toBe('town');

      // Attach a power plant to town first
      townNode.powerPlants.push({
        playerId: activePid,
        type: 'fossil',
        hexId: townNode.adjacentHexIds[0]!,
      });

      const initialVp = state.players[activePid]!.victoryPoints;
      const initialLf = state.players[activePid]!.localFootprint;
      const initialCitiesBuilt = state.players[activePid]!.citiesBuilt;
      const initialTownsBuilt = state.players[activePid]!.townsBuilt;

      state = applyAction(state, {
        type: 'BUILD_CITY',
        playerId: activePid,
        nodeId: 12,
      });

      const player = state.players[activePid]!;
      expect(state.board.intersections[12]!.building?.type).toBe('city');
      expect(player.resources.steel).toBe(0);
      expect(player.resources.food).toBe(0);
      expect(player.victoryPoints).toBe(initialVp + 1);
      expect(player.localFootprint).toBe(initialLf + 1);
      expect(player.citiesBuilt).toBe(initialCitiesBuilt + 1);
      expect(player.citiesInReserve).toBe(3 - 1);
      expect(player.townsBuilt).toBe(initialTownsBuilt - 1);
      expect(player.townsInReserve).toBe(4 + 1);

      // Verify power plant remains intact
      expect(state.board.intersections[12]!.powerPlants).toHaveLength(1);
      expect(state.board.intersections[12]!.powerPlants[0]!.type).toBe('fossil');
    });
  });

  describe('ACT-02: Building Power Plants & Warehouse', () => {
    it('builds a Fossil Power Plant (+1 LF, 1 science, no hazard token, max 1/turn)', () => {
      state.players[activePid]!.science = 2;

      // City at node 10 has 3 cutouts
      const node = state.board.intersections[10]!;
      const hexId = node.adjacentHexIds[0]!;
      state.board.hexes[hexId]!.hasHazard = false;
      state.board.hexes[hexId]!.hasInspector = false;

      const initialHazardsSupply = state.supply.hazards;
      const initialLf = state.players[activePid]!.localFootprint;

      state = applyAction(state, {
        type: 'BUILD_FOSSIL_PLANT',
        playerId: activePid,
        nodeId: 10,
        hexId,
      });

      const player = state.players[activePid]!;
      expect(player.science).toBe(1);
      expect(player.localFootprint).toBe(initialLf + 1);
      expect(player.fossilPlantsBuilt).toBe(1);
      expect(player.fossilPlantsInReserve).toBe(5);
      // Hazard tokens come only from events: building a plant never places one
      expect(state.board.hexes[hexId]!.hasHazard).toBe(false);
      expect(state.board.intersections[10]!.hasHazard).toBe(false);
      expect(state.supply.hazards).toBe(initialHazardsSupply);
      expect(state.pendingDecisions).toHaveLength(0);
      expect(state.turnStats.powerPlantsBuiltThisTurn).toBe(1);

      // Attempting to build a second plant in the same turn is rejected
      expect(() => {
        applyAction(state, {
          type: 'BUILD_FOSSIL_PLANT',
          playerId: activePid,
          nodeId: 10,
          hexId: node.adjacentHexIds[1]!,
        });
      }).toThrow();
    });

    it('builds a Renewable Power Plant (-1 LF, 3 science, adds green disc to bag)', () => {
      state.players[activePid]!.science = 3;
      state.players[activePid]!.hiddenGreenDiscs = ['climateConference', 'governmentFunding'];

      const node = state.board.intersections[10]!;
      const hexId = node.adjacentHexIds[0]!;

      const initialBagLength = state.eventBag.length;
      const initialLf = state.players[activePid]!.localFootprint;

      state = applyAction(state, {
        type: 'BUILD_RENEWABLE_PLANT',
        playerId: activePid,
        nodeId: 10,
        hexId,
      });

      const player = state.players[activePid]!;
      expect(player.science).toBe(0);
      expect(player.localFootprint).toBe(initialLf - 1);
      expect(player.renewablePlantsBuilt).toBe(1);
      expect(player.renewablePlantsInReserve).toBe(8);
      expect(player.hiddenGreenDiscs).toEqual(['governmentFunding']);
      expect(state.eventBag).toHaveLength(initialBagLength + 1);
      expect(state.eventBag[state.eventBag.length - 1]).toBe('climateConference');
    });

    it('does not reveal which green event disc went into the bag (it is dealt face down)', () => {
      state.players[activePid]!.science = 3;
      state.players[activePid]!.hiddenGreenDiscs = ['governmentFunding'];

      state = applyAction(state, {
        type: 'BUILD_RENEWABLE_PLANT',
        playerId: activePid,
        nodeId: 10,
        hexId: state.board.intersections[10]!.adjacentHexIds[0]!,
      });

      const message = state.log[state.log.length - 1]!.message;
      expect(message).toContain('added a green event disc to the bag');
      // No event name, in any spelling, in the whole log
      const everything = JSON.stringify(state.log).toLowerCase().replace(/[\s_&-]/g, '');
      for (const name of ['governmentfunding', 'climateconference', 'sustainableproduction']) {
        expect(everything).not.toContain(name);
      }
    });

    it('enforces Town 1-cutout vs City 3-cutout limits', () => {
      state.players[activePid]!.science = 5;

      const townNode = state.board.intersections[12]!;
      const hex1 = townNode.adjacentHexIds[0]!;
      const hex2 = townNode.adjacentHexIds[1]!;

      // Build 1st plant on town
      state = applyAction(state, {
        type: 'BUILD_FOSSIL_PLANT',
        playerId: activePid,
        nodeId: 12,
        hexId: hex1,
      });

      // Reset turn plant limit to test cutout capacity
      state.turnStats.powerPlantsBuiltThisTurn = 0;

      // Attempt to build 2nd plant on same town (Town can only hold 1 plant)
      expect(() => {
        applyAction(state, {
          type: 'BUILD_FOSSIL_PLANT',
          playerId: activePid,
          nodeId: 12,
          hexId: hex2,
        });
      }).toThrow();
    });

    it('builds Warehouse for 2 energy', () => {
      const initialEnergySupply = state.supply.energy;
      state.players[activePid]!.energy = 3;
      expect(state.players[activePid]!.hasWarehouse).toBe(false);

      state = applyAction(state, {
        type: 'BUILD_WAREHOUSE',
        playerId: activePid,
      });

      const player = state.players[activePid]!;
      expect(player.hasWarehouse).toBe(true);
      expect(player.energy).toBe(1);
      expect(state.supply.energy).toBe(initialEnergySupply + 2);
    });
  });

  describe('ACT-03 & ACT-04: Energy Spending & Demolition', () => {
    it('spends 2 energy to take 1 resource or science from supply', () => {
      const initialSteel = state.players[activePid]!.resources.steel;
      const initialScience = state.players[activePid]!.science;
      const initialSteelSupply = state.supply.resources.steel;

      state.players[activePid]!.energy = 4;

      state = applyAction(state, {
        type: 'SPEND_ENERGY',
        playerId: activePid,
        usage: 'BUY_CARD',
        params: { cardType: 'steel' },
      });

      let player = state.players[activePid]!;
      expect(player.energy).toBe(2);
      expect(player.resources.steel).toBe(initialSteel + 1);
      expect(state.supply.resources.steel).toBe(initialSteelSupply - 1);

      // Spend 2 energy for science
      const initialScienceSupply = state.supply.science;
      state = applyAction(state, {
        type: 'SPEND_ENERGY',
        playerId: activePid,
        usage: 'BUY_CARD',
        params: { cardType: 'science' },
      });

      player = state.players[activePid]!;
      expect(player.energy).toBe(0);
      expect(player.science).toBe(initialScience + 1);
      expect(state.supply.science).toBe(initialScienceSupply - 1);
    });

    it('spends 1 energy to clean 1 hazard token', () => {
      state.players[activePid]!.energy = 2;

      // Place a hazard on hex 0
      state.board.hexes[0]!.hasHazard = true;
      state.supply.hazards = 9;

      state = applyAction(state, {
        type: 'SPEND_ENERGY',
        playerId: activePid,
        usage: 'CLEAN_HAZARD',
        params: { hazardTarget: { kind: 'hex', id: 0 } },
      });

      const player = state.players[activePid]!;
      expect(player.energy).toBe(1);
      expect(state.board.hexes[0]!.hasHazard).toBe(false);
      expect(state.supply.hazards).toBe(10);
    });

    it('spends 1 energy to demolish a fossil plant (-1 LF, max 1/turn)', () => {
      state.players[activePid]!.energy = 2;
      state.players[activePid]!.fossilPlantsBuilt = 2;
      state.players[activePid]!.fossilPlantsInReserve = 4;
      state.players[activePid]!.localFootprint = 5;

      const node = state.board.intersections[10]!;
      const hexId = node.adjacentHexIds[0]!;
      state.board.intersections[10]!.powerPlants.push({ playerId: activePid, type: 'fossil', hexId });

      state = applyAction(state, {
        type: 'SPEND_ENERGY',
        playerId: activePid,
        usage: 'DEMOLISH_PLANT',
        params: { plantTarget: { nodeId: 10, hexId } },
      });

      const player = state.players[activePid]!;
      expect(player.energy).toBe(1);
      expect(player.fossilPlantsBuilt).toBe(1);
      expect(player.fossilPlantsInReserve).toBe(5);
      expect(player.localFootprint).toBe(4);
      expect(state.board.intersections[10]!.powerPlants).toHaveLength(0);
      expect(state.turnStats.fossilPlantsDemolishedThisTurn).toBe(1);

      // Attempt second demolition in same turn
      expect(() => {
        applyAction(state, {
          type: 'SPEND_ENERGY',
          playerId: activePid,
          usage: 'DEMOLISH_PLANT',
          params: { plantTarget: { nodeId: 10, hexId } },
        });
      }).toThrow();
    });
  });

  describe('ACT-05: Trading Systems (Supply, Harbor, Domestic)', () => {
    it('executes 4:1 resource, 3:1 science, and 2:1 energy supply trades', () => {
      const initialBrick = state.players[activePid]!.resources.brick;
      const initialFood = state.players[activePid]!.resources.food;
      const initialSteel = state.players[activePid]!.resources.steel;

      state.players[activePid]!.resources.lumber = 4;

      // 4:1 lumber for brick
      state = applyAction(state, {
        type: 'TRADE_SUPPLY',
        playerId: activePid,
        give: { lumber: 4 },
        receive: 'brick',
      });

      let player = state.players[activePid]!;
      expect(player.resources.lumber).toBe(0);
      expect(player.resources.brick).toBe(initialBrick + 1);

      // 3:1 science for food
      state.players[activePid]!.science = 3;
      state = applyAction(state, {
        type: 'TRADE_SUPPLY',
        playerId: activePid,
        give: { science: 3 },
        receive: 'food',
      });

      player = state.players[activePid]!;
      expect(player.science).toBe(0);
      expect(player.resources.food).toBe(initialFood + 1);

      // 2:1 energy for steel
      state.players[activePid]!.energy = 2;
      state = applyAction(state, {
        type: 'TRADE_SUPPLY',
        playerId: activePid,
        give: { energy: 2 },
        receive: 'steel',
      });

      player = state.players[activePid]!;
      expect(player.energy).toBe(0);
      expect(player.resources.steel).toBe(initialSteel + 1);
    });

    it('executes generic 3:1 and specialized 2:1 harbor trades', () => {
      const genericHarbor = state.board.harbors.find((h) => h.type === 'generic')!;
      state.board.intersections[genericHarbor.nodeIds[0]]!.building = {
        playerId: activePid,
        type: 'town',
      };

      state.players[activePid]!.resources.food = 3;
      state = applyAction(state, {
        type: 'TRADE_HARBOR',
        playerId: activePid,
        harborId: genericHarbor.id,
        give: { food: 3 },
        receive: 'steel',
      });

      let player = state.players[activePid]!;
      expect(player.resources.food).toBe(0);
      expect(player.resources.steel).toBe(1);

      // Specialized 2:1 harbor
      const lumberHarbor = state.board.harbors.find((h) => h.resource === 'lumber')!;
      state.board.intersections[lumberHarbor.nodeIds[0]]!.building = {
        playerId: activePid,
        type: 'town',
      };

      state.players[activePid]!.resources.lumber = 2;
      state = applyAction(state, {
        type: 'TRADE_HARBOR',
        playerId: activePid,
        harborId: lumberHarbor.id,
        give: { lumber: 2 },
        receive: 'natural_fiber',
      });

      player = state.players[activePid]!;
      expect(player.resources.lumber).toBe(0);
      expect(player.resources.natural_fiber).toBe(1);
    });

    it('conducts domestic player-to-player trade via offer and acceptance', () => {
      state.players['orange']!.resources.lumber = 1;
      state.players['purple']!.resources.brick = 1;

      // Orange offers 1 lumber for 1 brick to Purple
      state = applyAction(state, {
        type: 'OFFER_TRADE',
        playerId: 'orange',
        targetPlayerId: 'purple',
        give: { lumber: 1 },
        want: { brick: 1 },
      });

      expect(state.pendingDecisions).toHaveLength(1);
      const head = state.pendingDecisions[0]!;
      expect(head.type).toBe('DOMESTIC_TRADE_RESPONSE');
      expect(head.playerId).toBe('purple');

      const initialOrangeBrick = state.players['orange']!.resources.brick;
      const initialPurpleLumber = state.players['purple']!.resources.lumber;

      // Purple accepts
      state = applyAction(state, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'purple',
        decisionId: head.id,
        response: { accept: true },
      });

      expect(state.players['orange']!.resources.lumber).toBe(0);
      expect(state.players['orange']!.resources.brick).toBe(initialOrangeBrick + 1);
      expect(state.players['purple']!.resources.brick).toBe(0);
      expect(state.players['purple']!.resources.lumber).toBe(initialPurpleLumber + 1);
      expect(state.pendingDecisions).toHaveLength(0);
    });
  });

  describe('ACT-06: Longest Trade Route & Graph DFS', () => {
    function layConnectedRoads(
      board: Board,
      playerId: PlayerId,
      count: number,
      startNode: number
    ): { placed: EdgeId[]; endNode: number } {
      const placed: EdgeId[] = [];
      let curr = startNode;
      for (let i = 0; i < count; i++) {
        const nextEdgeId = board.intersections[curr]!.incidentEdgeIds.find(
          (eId) => !placed.includes(eId) && board.edges[eId]!.road === null
        );
        if (nextEdgeId === undefined) break;
        board.edges[nextEdgeId]!.road = { playerId };
        placed.push(nextEdgeId);
        const eObj = board.edges[nextEdgeId]!;
        curr = eObj.v1 === curr ? eObj.v2 : eObj.v1;
      }
      return { placed, endNode: curr };
    }

    it('calculates longest road DFS and awards 2 VP at 5 continuous segments', () => {
      for (const e of state.board.edges) e.road = null;
      for (const n of state.board.intersections) n.building = null;

      const { placed: path } = layConnectedRoads(state.board, activePid, 5, 0);
      expect(path).toHaveLength(5);

      const roadLength = calculateLongestRoad(state.board, activePid);
      expect(roadLength).toBe(5);

      const initialVp = state.players[activePid]!.victoryPoints;
      const award = updateLongestRoadAward(state);
      expect(award.newHolder).toBe(activePid);
      expect(award.transferred).toBe(true);
      expect(state.players[activePid]!.victoryPoints).toBe(initialVp + 2);
    });

    it('strictly requires > current holder road length to transfer', () => {
      for (const e of state.board.edges) e.road = null;
      for (const n of state.board.intersections) n.building = null;

      // Orange places 5 continuous roads starting at node 0
      layConnectedRoads(state.board, 'orange', 5, 0);
      updateLongestRoadAward(state);
      expect(state.specialAwards.longestRoad.holder).toBe('orange');
      expect(state.specialAwards.longestRoad.length).toBe(5);

      // Purple places 5 continuous roads starting at node 30 (far away)
      const purpleChain = layConnectedRoads(state.board, 'purple', 5, 30);
      expect(purpleChain.placed).toHaveLength(5);
      const awardTie = updateLongestRoadAward(state);
      // Tie does NOT transfer!
      expect(awardTie.newHolder).toBe('orange');
      expect(awardTie.transferred).toBe(false);

      // Now Purple extends to 6 continuous roads starting from end of chain
      const ext = layConnectedRoads(state.board, 'purple', 1, purpleChain.endNode);
      expect(ext.placed).toHaveLength(1);
      const purpleLength = calculateLongestRoad(state.board, 'purple');
      expect(purpleLength).toBe(6);

      const awardExceed = updateLongestRoadAward(state);
      expect(awardExceed.newHolder).toBe('purple');
      expect(awardExceed.transferred).toBe(true);
    });
  });
});
