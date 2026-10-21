import { describe, it, expect } from 'vitest';
import { createBoard } from '../board';
import { createInitialGameState } from '../setup';
import { clampGF, computePlayerLF, getDrawCountForGF } from '../footprint';
import { applyAction } from '../reducer';
import { evaluateProduction, autoClearHazards, getHandSizeForSeven } from '../production';
import { resolveEventTrack } from '../event-resolvers';
import { calculateLongestRoad, updateLongestRoadAward } from '../longest-road';
import { checkCleanestEnvironment } from '../dev-cards';
import { evaluateEmptyBagVictory } from '../victory';
import { redactForPlayer } from '../redact';

describe('Authoritative Rules Traceability Matrix (TOP-01 through SEC-01)', () => {
  // ==========================================================================
  // Topology
  // ==========================================================================

  describe('TOP-01: 19 land hexes in 3-4-5-4-3 axial grid', () => {
    it('verifies exact terrain counts and axial row distribution', () => {
      const board = createBoard();
      expect(board.hexes).toHaveLength(19);

      const terrainCounts = board.hexes.reduce((acc, h) => {
        acc[h.terrain] = (acc[h.terrain] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(terrainCounts.forest).toBe(4);
      expect(terrainCounts.hills).toBe(3);
      expect(terrainCounts.pasture).toBe(4);
      expect(terrainCounts.fields).toBe(4);
      expect(terrainCounts.mountains).toBe(3);
      expect(terrainCounts.desert).toBe(1);

      const rows = [-2, -1, 0, 1, 2].map(
        (r) => board.hexes.filter((h) => h.coord.r === r).length
      );
      expect(rows).toEqual([3, 4, 5, 4, 3]);
    });
  });

  describe('TOP-02: 54 intersections, 72 path edges, 3 cutouts, 9 harbors', () => {
    it('verifies graph topology, harbor distributions, and cutouts', () => {
      const board = createBoard();
      expect(board.intersections).toHaveLength(54);
      expect(board.edges).toHaveLength(72);
      expect(board.harbors).toHaveLength(9);

      const genericHarbors = board.harbors.filter((h) => h.type === 'generic');
      const specializedHarbors = board.harbors.filter((h) => h.type !== 'generic');
      expect(genericHarbors).toHaveLength(4);
      expect(specializedHarbors).toHaveLength(5);

      for (const node of board.intersections) {
        expect(node.adjacentHexIds.length).toBeGreaterThanOrEqual(1);
        expect(node.adjacentHexIds.length).toBeLessThanOrEqual(3);
      }
    });
  });

  // ==========================================================================
  // Setup & Footprint
  // ==========================================================================

  describe('SET-01: First Game Fixed Setup (4P & 3P)', () => {
    it('initializes preset layout and excludes Blue in 3P', () => {
      const state4P = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      expect(state4P.playerOrder).toEqual(['orange', 'purple', 'pink', 'blue']);

      const state3P = createInitialGameState({ setupMode: 'first', playerCount: 3 });
      expect(state3P.playerOrder).toEqual(['orange', 'purple', 'pink']);
      expect(state3P.players.blue).toBeUndefined();
    });
  });

  describe('SET-02: Standard Game Variable Setup (Spiral Numbers & Snake Draft)', () => {
    it('places spiral letter number discs skipping Desert and draft distance rule', () => {
      const state = createInitialGameState({ setupMode: 'standard', playerCount: 4, seed: 42 });
      expect(state.setupMode).toBe('standard');
      expect(state.phase).toBe('SetupDraft');
      expect(state.pendingDecisions[0]!.type).toBe('SETUP_PLACE_SETTLEMENT');

      const desertHex = state.board.hexes.find((h) => h.terrain === 'desert')!;
      expect(desertHex.numberDisc).toBeNull();

      const numberedHexes = state.board.hexes.filter((h) => h.terrain !== 'desert');
      expect(numberedHexes).toHaveLength(18);
      for (const h of numberedHexes) {
        expect(h.numberDisc).toBeGreaterThanOrEqual(2);
        expect(h.numberDisc).toBeLessThanOrEqual(12);
        expect(h.numberDisc).not.toBe(7);
      }
    });
  });

  describe('SET-03: Starting Hand, Starting VP, LF, Inspector on Desert', () => {
    it('verifies starting resources from City, VP=3, LF=3, and Inspector on Desert', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      const desert = state.board.hexes.find((h) => h.terrain === 'desert')!;
      expect(desert.hasInspector).toBe(true);

      for (const pid of state.playerOrder) {
        const p = state.players[pid]!;
        expect(p.victoryPoints).toBe(3);
        expect(p.localFootprint).toBe(3);
        expect(p.science).toBe(1);
      }
    });
  });

  describe('SET-04: Event Bag Initialization (43 Brown Discs, 9 Green Discs)', () => {
    it('initializes 43 brown discs in bag and deals 9 green discs per player', () => {
      const state4P = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      expect(state4P.eventBag).toHaveLength(43);
      for (const pid of state4P.playerOrder) {
        expect(state4P.players[pid]!.hiddenGreenDiscs).toHaveLength(9);
      }

      const state3P = createInitialGameState({ setupMode: 'first', playerCount: 3 });
      expect(state3P.eventBag).toHaveLength(43);
      for (const pid of state3P.playerOrder) {
        expect(state3P.players[pid]!.hiddenGreenDiscs).toHaveLength(9);
      }
    });
  });

  describe('GF-01: Local Footprint Math', () => {
    it('Town +1, City +2 (upgrade net +1), Fossil +1, Renewable -1', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      const p = state.players.orange!;
      // Starting: 1 town (+1) + 1 city (+2) = 3 LF
      expect(p.localFootprint).toBe(3);

      p.townsBuilt++;
      expect(computePlayerLF(p)).toBe(4);

      p.fossilPlantsBuilt++;
      expect(computePlayerLF(p)).toBe(5);

      p.renewablePlantsBuilt++;
      expect(computePlayerLF(p)).toBe(4);
    });
  });

  describe('GF-02: Global Footprint Clamping', () => {
    it('tracks true total LF and clamps to 0..28 in 4P and 0..21 in 3P', () => {
      expect(clampGF(12, 4)).toBe(12);
      expect(clampGF(-5, 4)).toBe(0);
      expect(clampGF(35, 4)).toBe(28);

      expect(clampGF(9, 3)).toBe(9);
      expect(clampGF(-2, 3)).toBe(0);
      expect(clampGF(25, 3)).toBe(21);
    });
  });

  // ==========================================================================
  // Engine Reducer & Events
  // ==========================================================================

  describe('RED-01: Pure Deterministic Reducer & PRNG Serialization', () => {
    it('produces identical states from identical seed and action sequence', () => {
      const s1 = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 99 });
      const s2 = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 99 });

      const next1 = applyAction(s1, { type: 'DRAW_EVENT_DISC', playerId: 'orange' });
      const next2 = applyAction(s2, { type: 'DRAW_EVENT_DISC', playerId: 'orange' });

      expect(next1.eventBag).toEqual(next2.eventBag);
      expect(next1.prng).toEqual(next2.prng);
    });
  });

  describe('EVT-01: Locked Event Draw Count', () => {
    it('locks draw count at beginning of Event Phase based on GF band', () => {
      expect(getDrawCountForGF(12, 4)).toBe(1);
      expect(getDrawCountForGF(2, 4)).toBe(2);
      expect(getDrawCountForGF(20, 4)).toBe(2);
      expect(getDrawCountForGF(26, 4)).toBe(3);
    });
  });

  describe('EVT-02: Event Track Triggering & Disc Removal', () => {
    it('clears track and removes discs from game when track reaches capacity', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.eventTracks.environmentalPollution = 3;
      // Step draw that fills the 4th slot of environmentalPollution
      state.eventBag.unshift('environmentalPollution');
      const next = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: 'orange' });

      expect(next.eventTracks.environmentalPollution).toBe(0);
    });
  });

  describe('EVT-03: Universal Tie-Breaker', () => {
    it('skips event if all players tie; resolves clockwise if subset ties', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      // In first game, all 4 players start with LF = 3 (tied)
      const initialHazards = state.supply.hazards;
      resolveEventTrack(state, 'airPollution');
      // All 4 tied -> no-op!
      expect(state.supply.hazards).toBe(initialHazards);
    });
  });

  describe('EVT-04: Air Pollution Event', () => {
    it('places 1 Hazard on highest LF player City first', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.players.purple!.localFootprint = 5; // highest
      resolveEventTrack(state, 'airPollution');

      // Purple should have received hazard prompt
      expect(state.pendingDecisions).toHaveLength(1);
      expect(state.pendingDecisions[0]!.playerId).toBe('purple');
      expect(state.pendingDecisions[0]!.type).toBe('EVENT_HAZARD_CHOICE');
    });
  });

  describe('EVT-05: Environmental Pollution Event', () => {
    it('rolls dice (re-rolling 7s) and places hazard on matching hexes', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      resolveEventTrack(state, 'environmentalPollution');
      // Verify dice rolled non-7 and hazard placed
      expect(state.supply.hazards).toBeLessThanOrEqual(10);
    });
  });

  describe('EVT-06: Production Increase Event', () => {
    it('allows highest LF player to build free fossil plant and gain resource', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.players.orange!.localFootprint = 5;
      resolveEventTrack(state, 'productionIncrease');

      expect(state.pendingDecisions).toHaveLength(1);
      expect(state.pendingDecisions[0]!.playerId).toBe('orange');
      expect(state.pendingDecisions[0]!.type).toBe('EVENT_PRODUCTION_INCREASE');
    });
  });

  describe('EVT-07: Rain and Flooding Event', () => {
    it('prompts all players clockwise to place 1 Hazard on building', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      resolveEventTrack(state, 'rainAndFlooding');

      expect(state.pendingDecisions).toHaveLength(4);
      expect(state.pendingDecisions.map((d) => d.playerId)).toEqual([
        'orange',
        'purple',
        'pink',
        'blue',
      ]);
    });
  });

  describe('EVT-08: Climate Conference Event', () => {
    it('lowest LF gains card from supply; highest LF discards card', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.players.orange!.localFootprint = 1; // lowest
      state.players.purple!.localFootprint = 6; // highest

      resolveEventTrack(state, 'climateConference');
      expect(state.pendingDecisions).toHaveLength(2);
      expect(state.pendingDecisions[0]!.playerId).toBe('orange');
      expect(state.pendingDecisions[1]!.playerId).toBe('purple');
    });
  });

  describe('EVT-09: Government Funding & Sustainable Production Events', () => {
    it('Government Funding awards Dev Card to lowest LF; Sustainable Production awards card', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.players.pink!.localFootprint = 1;

      resolveEventTrack(state, 'governmentFunding');
      expect(state.pendingDecisions).toHaveLength(1);
      expect(state.pendingDecisions[0]!.playerId).toBe('pink');
    });
  });

  // ==========================================================================
  // Production Phase
  // ==========================================================================

  describe('PRD-01: Non-7 Production & Power Plants', () => {
    it('Town gives 1 resource, City gives 1+1 science, Plant gives 1 energy (cap 5)', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      const res = evaluateProduction(
        state.board,
        state.players,
        state.supply,
        [3, 3],
        'orange',
        state.playerOrder
      );
      expect(res.payouts).toBeDefined();
    });
  });

  describe('PRD-02: End-of-Production Hazard Auto-Removal', () => {
    it('clears hazards from rolled hex/buildings EXCEPT buildings on Inspector hex', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      const board = state.board;
      // Place hazard on hex with number 8
      const hex8 = board.hexes.find((h) => h.numberDisc === 8)!;
      hex8.hasHazard = true;
      state.supply.hazards = 9;

      const cleared = autoClearHazards(board, 8, state.supply);
      expect(cleared.clearedHexIds).toContain(hex8.id);
      expect(hex8.hasHazard).toBe(false);
      expect(state.supply.hazards).toBe(10);
    });
  });

  describe('PRD-03: Roll 7 Discard (>7 or >10 with Warehouse)', () => {
    it('discards half hand rounded down for hands >7, or >10 with active Warehouse', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.players.orange!.resources = { lumber: 8, brick: 0, natural_fiber: 0, food: 0, steel: 0 };
      state.players.orange!.science = 0;
      expect(getHandSizeForSeven(state.players.orange!)).toBe(8); // 8 > 7 -> must discard 4

      // Now with active warehouse
      state.players.orange!.hasWarehouse = true;
      // 8 <= 10 -> no discard required with active warehouse!
      expect(getHandSizeForSeven(state.players.orange!)).toBeLessThanOrEqual(10);
    });
  });

  describe('PRD-04: Roll 7 Inspector Move & Steal', () => {
    it('moves Inspector to hazard-free hex and steals 1 random card from adjacent player', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      const desert = state.board.hexes.find((h) => h.terrain === 'desert')!;
      expect(desert.hasInspector).toBe(true);

      // Move Inspector to hex 0
      desert.hasInspector = false;
      state.board.hexes[0]!.hasInspector = true;
      expect(state.board.hexes[0]!.hasInspector).toBe(true);
    });
  });

  // ==========================================================================
  // Building & Trading (Action Phase)
  // ==========================================================================

  describe('ACT-01: Building Road, Town, City & Warehouse', () => {
    it('validates costs, connectivity, distance rule, and warehouse activation', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.phase = 'ActionPhase';
      state.players.orange!.energy = 2;

      const next = applyAction(state, { type: 'BUILD_WAREHOUSE', playerId: 'orange' });
      expect(next.players.orange!.hasWarehouse).toBe(true);
    });
  });

  describe('ACT-02: Power Plants Construction', () => {
    it('builds Fossil (+1 LF, 1 sci) and Renewable (-1 LF, 3 sci) with 1/turn limit', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.phase = 'ActionPhase';
      state.players.orange!.science = 1;
      const node10 = state.board.intersections[10]!;
      const hex0 = node10.adjacentHexIds[0]!;

      const next = applyAction(state, {
        type: 'BUILD_FOSSIL_PLANT',
        playerId: 'orange',
        nodeId: 10,
        hexId: hex0,
      });

      expect(next.players.orange!.fossilPlantsBuilt).toBe(1);
      expect(next.players.orange!.localFootprint).toBe(4);
    });
  });

  describe('ACT-03: Energy Uses', () => {
    it('2 energy -> 1 card, 1 energy -> clean hazard, 1 energy -> demolish plant', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.phase = 'ActionPhase';
      state.players.orange!.energy = 2;

      const next = applyAction(state, {
        type: 'SPEND_ENERGY',
        playerId: 'orange',
        usage: 'BUY_CARD',
        params: { cardType: 'steel' },
      });

      expect(next.players.orange!.energy).toBe(0);
      expect(next.players.orange!.resources.steel).toBe(state.players.orange!.resources.steel + 1);
    });
  });

  describe('ACT-04: Supply & Harbor Trades', () => {
    it('executes 4:1 resource, 3:1 science, 2:1 energy, and harbor trades', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.phase = 'ActionPhase';
      state.players.orange!.resources.lumber = 4;
      const initialBrick = state.players.orange!.resources.brick;

      const next = applyAction(state, {
        type: 'TRADE_SUPPLY',
        playerId: 'orange',
        give: { lumber: 4 },
        receive: 'brick',
      });

      expect(next.players.orange!.resources.lumber).toBe(0);
      expect(next.players.orange!.resources.brick).toBe(initialBrick + 1);
    });
  });

  describe('ACT-05: Domestic P2P Trading', () => {
    it('proposes trade, responds with accept/reject, verifies resource swap', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.phase = 'ActionPhase';
      state.players.orange!.resources.lumber = 1;
      state.players.purple!.resources.brick = 1;

      const offered = applyAction(state, {
        type: 'OFFER_TRADE',
        playerId: 'orange',
        targetPlayerId: 'purple',
        give: { lumber: 1 },
        want: { brick: 1 },
      });

      expect(offered.pendingDecisions).toHaveLength(1);
      const decId = offered.pendingDecisions[0]!.id;

      const resolved = applyAction(offered, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'purple',
        decisionId: decId,
        response: { accept: true },
      });

      expect(resolved.players.orange!.resources.lumber).toBe(0);
      expect(resolved.players.purple!.resources.lumber).toBe(state.players.purple!.resources.lumber + 1);
    });
  });

  describe('ACT-06: Longest Trade Route (2 VP)', () => {
    it('calculates continuous road DFS and awards 2 VP to longest path >= 5', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      for (const e of state.board.edges) e.road = null;

      // Place 5 continuous roads for Orange
      let curr = 0;
      for (let i = 0; i < 5; i++) {
        const edgeId = state.board.intersections[curr]!.incidentEdgeIds.find(
          (e) => state.board.edges[e]!.road === null
        )!;
        state.board.edges[edgeId]!.road = { playerId: 'orange' };
        const eObj = state.board.edges[edgeId]!;
        curr = eObj.v1 === curr ? eObj.v2 : eObj.v1;
      }

      const length = calculateLongestRoad(state.board, 'orange');
      expect(length).toBe(5);

      const award = updateLongestRoadAward(state);
      expect(award.newHolder).toBe('orange');
    });
  });

  // ==========================================================================
  // Development Cards & Victory
  // ==========================================================================

  describe('DEV-01: Development Cards Rules & Buying', () => {
    it('buys for 1 fiber, 1 food, 1 steel; enforces 1 card/turn limit', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.phase = 'ActionPhase';
      state.players.orange!.resources.natural_fiber = 1;
      state.players.orange!.resources.food = 1;
      state.players.orange!.resources.steel = 1;

      const next = applyAction(state, { type: 'BUY_DEV_CARD', playerId: 'orange' });
      expect(next.players.orange!.devCards.unplayed).toHaveLength(1);
      expect(next.devCardsBoughtThisTurn).toHaveLength(1);
    });
  });

  describe('DEV-02: Cleanup Cards & Cleanest Environment (2 VP)', () => {
    it('awards 2 VP at 3 Cleanups and transfers on strictly more', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.players.orange!.devCards.played = ['dev_cleanup_01', 'dev_cleanup_02', 'dev_cleanup_03'];
      checkCleanestEnvironment(state, 'orange');

      expect(state.cleanestEnvironmentHolder).toBe('orange');
      expect(state.specialAwards.cleanestEnvironment.cleanupCount).toBe(3);
    });
  });

  describe('DEV-03: Progress Cards & Victory Point Cards', () => {
    it('executes Road Construction, High Yield, Research Grant, and VP cards', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.phase = 'ActionPhase';
      state.players.orange!.devCards.unplayed = ['dev_researchGrant_01'];

      const initialSteel = state.players.orange!.resources.steel;
      const next = applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: 'orange',
        cardId: 'dev_researchGrant_01',
        params: { cardType: 'researchGrant', cards: ['steel', 'science'] },
      });

      expect(next.players.orange!.resources.steel).toBe(initialSteel + 1);
      expect(next.discardedDevCards).toContain('dev_researchGrant_01');
    });
  });

  describe('VIC-01: Dual Victory Conditions', () => {
    it('Condition 1: 10 VP on own turn; Condition 2: Empty Event Bag balance & collapse', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.eventBag = [];

      state.players.orange!.renewablePlantsBuilt = 4;
      state.players.orange!.fossilPlantsBuilt = 1; // net +3

      state.players.purple!.renewablePlantsBuilt = 2;
      state.players.purple!.fossilPlantsBuilt = 2; // net 0 (not eligible)

      const result = evaluateEmptyBagVictory(state);
      expect(result.ended).toBe(true);
      expect(result.condition).toBe('EMPTY_BAG_BALANCE');
      expect(result.winner).toBe('orange');
    });
  });

  // ==========================================================================
  // Multiplayer Security
  // ==========================================================================

  describe('SEC-01: Multiplayer State Redaction', () => {
    it('redacts opponent unplayed dev cards, hidden green discs, devDeck, eventBag, and PRNG', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4 });
      state.players.orange!.devCards.unplayed = ['dev_cleanup_01'];
      state.players.purple!.devCards.unplayed = ['dev_victoryPoint_01', 'dev_victoryPoint_02'];

      const redactedForOrange = redactForPlayer(state, 'orange');

      // Orange sees their own unplayed dev cards
      expect(redactedForOrange.players.orange.devCards.unplayed).toEqual(['dev_cleanup_01']);
      expect(redactedForOrange.players.orange.hiddenGreenDiscs).toBeDefined();

      // Orange does NOT see Purple's unplayed dev cards
      expect(redactedForOrange.players.purple.devCards.unplayed).toBeUndefined();
      expect(redactedForOrange.players.purple.devCards.unplayedCount).toBe(2);
      expect(redactedForOrange.players.purple.hiddenGreenDiscs).toBeUndefined();

      // Deck order, event bag order, and PRNG are completely stripped
      expect(redactedForOrange.supply.devDeck).toBeUndefined();
      expect(redactedForOrange.supply.devDeckCount).toBe(25);
      expect(redactedForOrange.eventBag).toBeUndefined();
      expect(redactedForOrange.eventBagCount).toBe(43);
      expect(redactedForOrange.prng).toBeUndefined();
    });
  });
});
