import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../setup';
import { clampGF, computePlayerLF, computeTrueTotalLF, getDrawCountForGF } from '../footprint';
import { getDistanceBetweenNodes } from '../board';
import { TOTAL_RESOURCES_PER_TYPE, TOTAL_SCIENCE_CARDS } from '../config';
import { ResourceType } from '../types';
import { legalActions } from '../actions';
import { applyAction } from '../reducer';

describe('Game Setup & Footprint — SET-01..SET-04, GF-01, GF-02', () => {
  describe('SET-01: First Game Fixed Setup (4P & 3P)', () => {
    it('initializes 4P First Game with exact layout, 12 GF, and 3 VP per player', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 100 });

      expect(state.playerCount).toBe(4);
      expect(state.playerOrder).toEqual(['orange', 'purple', 'pink', 'blue']);
      expect(state.phase).toBe('EventPhase');
      expect(state.currentTurn).toBe(1);

      // Verify 19 hexes in 3-4-5-4-3 layout
      expect(state.board.hexes).toHaveLength(19);
      const rows = [-2, -1, 0, 1, 2].map((r) =>
        state.board.hexes.filter((h) => h.coord.r === r).length
      );
      expect(rows).toEqual([3, 4, 5, 4, 3]);

      // Inspector on Desert (-2, 0)
      const desert = state.board.hexes.find((h) => h.terrain === 'desert')!;
      expect(desert).toBeDefined();
      expect(desert.coord).toEqual({ q: -2, r: 0 });
      expect(desert.hasInspector).toBe(true);

      // Verify all 4 players have 1 Town, 1 City, 2 Roads, 3 VP, 3 LF
      for (const pid of state.playerOrder) {
        const p = state.players[pid]!;
        expect(p.townsBuilt).toBe(1);
        expect(p.citiesBuilt).toBe(1);
        expect(p.roadsBuilt).toBe(2);
        expect(p.townsInReserve).toBe(4);
        expect(p.citiesInReserve).toBe(3);
        expect(p.roadsInReserve).toBe(10);
        expect(p.victoryPoints).toBe(3);
        expect(p.localFootprint).toBe(3);
        expect(p.energy).toBe(0);
      }

      // Verify 2-path distance rule between all 8 starting settlements
      const settlementNodes: number[] = [];
      state.board.intersections.forEach((node) => {
        if (node.building !== null) settlementNodes.push(node.id);
      });
      expect(settlementNodes).toHaveLength(8);

      for (let i = 0; i < settlementNodes.length; i++) {
        for (let j = i + 1; j < settlementNodes.length; j++) {
          const dist = getDistanceBetweenNodes(
            state.board,
            settlementNodes[i]!,
            settlementNodes[j]!
          );
          expect(dist).toBeGreaterThanOrEqual(2);
        }
      }

      // Starting Global Footprint = 12
      expect(state.trueTotalLF).toBe(12);
      expect(state.clampedGF).toBe(12);
    });

    it('initializes 3P First Game omitting Blue, starting with 9 GF', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 3, seed: 100 });

      expect(state.playerCount).toBe(3);
      expect(state.playerOrder).toEqual(['orange', 'purple', 'pink']);
      expect(state.players['blue']).toBeUndefined();

      // Exactly 6 settlements placed (3 towns + 3 cities)
      const settlementNodes = state.board.intersections.filter((n) => n.building !== null);
      expect(settlementNodes).toHaveLength(6);
      expect(settlementNodes.every((n) => n.building!.playerId !== 'blue')).toBe(true);

      // Starting GF = 9
      expect(state.trueTotalLF).toBe(9);
      expect(state.clampedGF).toBe(9);
    });
  });

  describe('SET-02: Standard Variable Snake Draft Setup', () => {
    it('initializes Standard Game with random hexes, spiral discs, and SetupDraft phase', () => {
      const state = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 42 });

      expect(state.setupMode).toBe('standard');
      expect(state.phase).toBe('SetupDraft');
      expect(state.currentTurn).toBe(0);

      // Verify exactly 1 Desert with null disc and Inspector
      const deserts = state.board.hexes.filter((h) => h.terrain === 'desert');
      expect(deserts).toHaveLength(1);
      expect(deserts[0]!.numberDisc).toBeNull();
      expect(deserts[0]!.hasInspector).toBe(true);

      // Verify all 18 other hexes have number discs
      const nonDeserts = state.board.hexes.filter((h) => h.terrain !== 'desert');
      expect(nonDeserts).toHaveLength(18);
      expect(nonDeserts.every((h) => h.numberDisc !== null)).toBe(true);

      // Players start with 0 pieces built and 0 LF/VP
      for (const pid of state.playerOrder) {
        const p = state.players[pid]!;
        expect(p.townsBuilt).toBe(0);
        expect(p.citiesBuilt).toBe(0);
        expect(p.roadsBuilt).toBe(0);
        expect(p.victoryPoints).toBe(0);
        expect(p.localFootprint).toBe(0);
      }

      // Initial pending decision is for player 0 to place Round 1 settlement
      expect(state.pendingDecisions).toHaveLength(1);
      expect(state.pendingDecisions[0]).toEqual({
        id: 'setup-0',
        type: 'SETUP_PLACE_SETTLEMENT',
        playerId: state.playerOrder[0]!,
        round: 1,
      });
    });

    it('rolls dice to determine who goes first, enforces Round 1 Town (clockwise) and Round 2 City (reverse)', () => {
      // Initialize with setupRoll: true
      let state = createInitialGameState({ setupMode: 'standard', setupRoll: true, playerCount: 4, seed: 777 });
      expect(state.phase).toBe('SetupRoll');
      expect(state.setupRolls).toEqual({});

      // All 4 players roll for setup turn order
      while (state.phase === 'SetupRoll') {
        const actor = state.activePlayerId;
        const legal = legalActions(state, actor);
        expect(legal).toEqual([{ type: 'SETUP_ROLL_DICE', playerId: actor }]);
        state = applyAction(state, legal[0]!);
      }

      // After rolls complete, a winner is established and phase transitions to SetupDraft
      expect(state.phase).toBe('SetupDraft');
      expect(state.setupRollWinner).not.toBeNull();
      const firstPlayer = state.setupRollWinner!;
      expect(state.playerOrder[0]).toBe(firstPlayer);
      expect(state.activePlayerId).toBe(firstPlayer);

      // Verify Round 1: strictly Town + Road in clockwise order
      expect(state.pendingDecisions[0]!.type).toBe('SETUP_PLACE_SETTLEMENT');
      if ('round' in state.pendingDecisions[0]!) {
        expect(state.pendingDecisions[0].round).toBe(1);
      }
      const r1Actions = legalActions(state, firstPlayer);
      expect(r1Actions.every((a) => a.type === 'SETUP_BUILD_TOWN')).toBe(true);

      // Complete Round 1 for all players
      for (let i = 0; i < state.playerCount; i++) {
        const actor = state.pendingDecisions[0]!.playerId;
        if ('round' in state.pendingDecisions[0]!) {
          expect(state.pendingDecisions[0].round).toBe(1);
        }
        const townActs = legalActions(state, actor);
        expect(townActs[0]!.type).toBe('SETUP_BUILD_TOWN');
        state = applyAction(state, townActs[0]!);

        // Next must place connected road
        expect(state.pendingDecisions[0]!.type).toBe('SETUP_PLACE_ROAD');
        const roadActs = legalActions(state, actor);
        expect(roadActs[0]!.type).toBe('SETUP_BUILD_ROAD');
        state = applyAction(state, roadActs[0]!);
      }

      // Round 2 turnaround: last player places second piece, which is strictly a CITY!
      const lastPlayer = state.playerOrder[state.playerCount - 1]!;
      expect(state.activePlayerId).toBe(lastPlayer);
      if ('round' in state.pendingDecisions[0]!) {
        expect(state.pendingDecisions[0].round).toBe(2);
      }
      expect(state.pendingDecisions[0]!.playerId).toBe(lastPlayer);

      const r2Actions = legalActions(state, lastPlayer);
      expect(r2Actions.every((a) => a.type === 'SETUP_BUILD_CITY')).toBe(true);

      // Complete Round 2 for all players (snakes in reverse / anticlockwise)
      for (let i = state.playerCount - 1; i >= 0; i--) {
        const expectedPid = state.playerOrder[i]!;
        const actor = state.pendingDecisions[0]!.playerId;
        expect(actor).toBe(expectedPid);
        if ('round' in state.pendingDecisions[0]!) {
          expect(state.pendingDecisions[0].round).toBe(2);
        }

        const cityActs = legalActions(state, actor);
        expect(cityActs[0]!.type).toBe('SETUP_BUILD_CITY');
        state = applyAction(state, cityActs[0]!);

        // City built: player has 1 city, 1 town, and received starting science
        expect(state.players[actor]!.citiesBuilt).toBe(1);
        expect(state.players[actor]!.townsBuilt).toBe(1);
        expect(state.players[actor]!.science).toBeGreaterThanOrEqual(1);

        // Next must place connected road
        expect(state.pendingDecisions[0]!.type).toBe('SETUP_PLACE_ROAD');
        const roadActs = legalActions(state, actor);
        expect(roadActs[0]!.type).toBe('SETUP_BUILD_ROAD');
        state = applyAction(state, roadActs[0]!);
      }

      // Snake draft complete: transitions to EventPhase on Turn 1!
      expect(state.phase).toBe('EventPhase');
      expect(state.currentTurn).toBe(1);
      expect(state.activePlayerId).toBe(firstPlayer);
    });

    it('lets players draft their own starting pieces on the fixed First Game board', () => {
      const fixed = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 9 });
      let state = createInitialGameState({
        setupMode: 'first',
        placement: 'draft',
        setupRoll: true,
        playerCount: 4,
        seed: 9,
      });

      // Same recommended terrain & number layout, but an empty board waiting for the roll-off
      expect(state.board.hexes.map((h) => [h.terrain, h.numberDisc])).toEqual(
        fixed.board.hexes.map((h) => [h.terrain, h.numberDisc])
      );
      expect(state.phase).toBe('SetupRoll');
      expect(state.board.intersections.every((n) => n.building === null)).toBe(true);
      expect(state.board.edges.every((e) => e.road === null)).toBe(true);
      expect(state.playerOrder.every((pid) => state.players[pid]!.victoryPoints === 0)).toBe(true);

      while (state.phase === 'SetupRoll') {
        state = applyAction(state, legalActions(state, state.activePlayerId)[0]!);
      }

      // Drive the full snake draft: 4 towns clockwise, then 4 cities anticlockwise
      let placements = 0;
      while (state.phase === 'SetupDraft') {
        const actor = state.pendingDecisions[0]!.playerId;
        state = applyAction(state, legalActions(state, actor)[0]!);
        placements++;
      }

      expect(placements).toBe(16);
      expect(state.phase).toBe('EventPhase');
      for (const pid of state.playerOrder) {
        const p = state.players[pid]!;
        expect(p.townsBuilt).toBe(1);
        expect(p.citiesBuilt).toBe(1);
        expect(p.roadsBuilt).toBe(2);
        expect(p.victoryPoints).toBe(3);
        expect(p.science).toBe(1);
      }
      // Every pair of buildings respects the distance rule
      const built = state.board.intersections.filter((n) => n.building !== null).map((n) => n.id);
      for (const a of built) {
        for (const b of built) {
          if (a !== b) expect(getDistanceBetweenNodes(state.board, a, b)).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('ignores fixed placement on the Standard board (always drafted)', () => {
      const state = createInitialGameState({ setupMode: 'standard', placement: 'fixed', seed: 3 });
      expect(state.phase).toBe('SetupDraft');
      expect(state.board.intersections.every((n) => n.building === null)).toBe(true);
    });
  });

  describe('SET-03: Starting Hand Resource & Science Rules', () => {
    it('grants 1 resource per City-adjacent non-desert hex + 1 science, 0 for towns', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 100 });

      // Orange City at node 10 is adjacent to hex 2 (forest) and hex 6 (hills)
      const orange = state.players.orange!;
      expect(orange.resources.lumber).toBe(1);
      expect(orange.resources.brick).toBe(1);
      expect(orange.resources.natural_fiber).toBe(0);
      expect(orange.resources.food).toBe(0);
      expect(orange.resources.steel).toBe(0);
      expect(orange.science).toBe(1);

      // Global conservation check: Hand + Supply == Total
      const resTypes: ResourceType[] = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'];
      for (const res of resTypes) {
        const playerSum = state.playerOrder.reduce(
          (acc, pid) => acc + state.players[pid]!.resources[res],
          0
        );
        expect(playerSum + state.supply.resources[res]).toBe(TOTAL_RESOURCES_PER_TYPE);
      }

      const totalScience = state.playerOrder.reduce(
        (acc, pid) => acc + state.players[pid]!.science,
        0
      );
      expect(totalScience + state.supply.science).toBe(TOTAL_SCIENCE_CARDS);
    });
  });

  describe('SET-04: Event Bag & Green Disc Distribution', () => {
    it('starts with 43 Brown Discs and 0 Green Discs in the bag', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 100 });

      expect(state.eventBag).toHaveLength(43);

      const counts = state.eventBag.reduce((acc, d) => {
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(counts.climateConference).toBe(9);
      expect(counts.rainAndFlooding).toBe(8);
      expect(counts.airPollution).toBe(9);
      expect(counts.productionIncrease).toBe(9);
      expect(counts.environmentalPollution).toBe(8);
      expect(counts.sustainableProduction).toBeUndefined();
      expect(counts.governmentFunding).toBeUndefined();
    });

    it('deals 9 green discs per player (36 total in 4P, 27 in 3P with 9 removed)', () => {
      const state4P = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 100 });
      for (const pid of state4P.playerOrder) {
        expect(state4P.players[pid]!.hiddenGreenDiscs).toHaveLength(9);
      }

      const state3P = createInitialGameState({ setupMode: 'first', playerCount: 3, seed: 100 });
      for (const pid of state3P.playerOrder) {
        expect(state3P.players[pid]!.hiddenGreenDiscs).toHaveLength(9);
      }
    });
  });

  describe('GF-01: Local Footprint Math', () => {
    it('computes exact LF deltas for buildings, upgrades, and plants', () => {
      // Starting player: 1 Town, 1 City = 3 LF
      const dummy = {
        townsBuilt: 1,
        citiesBuilt: 1,
        fossilPlantsBuilt: 0,
        renewablePlantsBuilt: 0,
      };
      expect(computePlayerLF(dummy)).toBe(3);

      // Build a Town (+1 LF)
      dummy.townsBuilt++;
      expect(computePlayerLF(dummy)).toBe(4);

      // Upgrade Town to City: town returned (-1), city built (+2) -> net +1 LF
      dummy.townsBuilt--;
      dummy.citiesBuilt++;
      expect(computePlayerLF(dummy)).toBe(5);

      // Build Fossil Plant (+1 LF)
      dummy.fossilPlantsBuilt++;
      expect(computePlayerLF(dummy)).toBe(6);

      // Demolish Fossil Plant (-1 LF)
      dummy.fossilPlantsBuilt--;
      expect(computePlayerLF(dummy)).toBe(5);

      // Build Renewable Plant (-1 LF)
      dummy.renewablePlantsBuilt++;
      expect(computePlayerLF(dummy)).toBe(4);
    });
  });

  describe('GF-02: Global Footprint Endpoint Clamping & Draw Zones', () => {
    it('clamps GF at 0..28 in 4P while tracking trueTotalLF', () => {
      expect(clampGF(12, 4)).toBe(12);
      expect(clampGF(28, 4)).toBe(28);
      expect(clampGF(32, 4)).toBe(28); // Clamped at upper endpoint
      expect(clampGF(-3, 4)).toBe(0);  // Clamped at lower endpoint

      // Aggregates trueTotalLF accurately
      const players = [
        { localFootprint: 8 },
        { localFootprint: 9 },
        { localFootprint: 8 },
        { localFootprint: 7 },
      ];
      const total = computeTrueTotalLF(players);
      expect(total).toBe(32);
      expect(clampGF(total, 4)).toBe(28);
    });

    it('clamps GF at 0..21 in 3P', () => {
      expect(clampGF(9, 3)).toBe(9);
      expect(clampGF(21, 3)).toBe(21);
      expect(clampGF(25, 3)).toBe(21);
      expect(clampGF(-1, 3)).toBe(0);
    });

    it('maps clamped GF to correct event disc draw counts in 4P and 3P', () => {
      // 4P draw zones
      expect(getDrawCountForGF(0, 4)).toBe(2);
      expect(getDrawCountForGF(5, 4)).toBe(2);
      expect(getDrawCountForGF(6, 4)).toBe(1);
      expect(getDrawCountForGF(12, 4)).toBe(1); // Starting 4P
      expect(getDrawCountForGF(17, 4)).toBe(1);
      expect(getDrawCountForGF(18, 4)).toBe(2);
      expect(getDrawCountForGF(21, 4)).toBe(2);
      expect(getDrawCountForGF(23, 4)).toBe(2);
      expect(getDrawCountForGF(24, 4)).toBe(3);
      expect(getDrawCountForGF(28, 4)).toBe(3);

      // 3P draw zones
      expect(getDrawCountForGF(0, 3)).toBe(2);
      expect(getDrawCountForGF(5, 3)).toBe(2);
      expect(getDrawCountForGF(6, 3)).toBe(1);
      expect(getDrawCountForGF(9, 3)).toBe(1);  // Starting 3P
      expect(getDrawCountForGF(13, 3)).toBe(1);
      expect(getDrawCountForGF(14, 3)).toBe(2);
      expect(getDrawCountForGF(17, 3)).toBe(2);
      expect(getDrawCountForGF(18, 3)).toBe(3);
      expect(getDrawCountForGF(21, 3)).toBe(3);
    });
  });
});
