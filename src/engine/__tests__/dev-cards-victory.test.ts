import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../setup';
import { applyAction } from '../reducer';
import { evaluateEmptyBagVictory } from '../victory';
import {
  canPlayDevCard,
  canRevealVpCards,
  checkCleanestEnvironment,
  getDevCardType,
} from '../dev-cards';
import { GameState, PlayerId, ResourceType } from '../types';

describe('Development Cards & Dual Victory Engine — DEV-01..DEV-03, VIC-01', () => {
  let state: GameState;
  const activePid: PlayerId = 'orange';

  beforeEach(() => {
    state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 100 });
    state.phase = 'ActionPhase';
  });

  describe('DEV-01: Deck Composition & Card Buying Constraints', () => {
    it('initializes exact 25-card deck with correct card counts', () => {
      // 14 Cleanup, 2 Road Construction, 2 High Yield, 2 Research Grant, 5 Victory Point
      const counts: Record<string, number> = {
        cleanup: 0,
        roadConstruction: 0,
        highYield: 0,
        researchGrant: 0,
        victoryPoint: 0,
      };

      for (const cardId of state.supply.devDeck) {
        const type = getDevCardType(cardId);
        counts[type] = (counts[type] ?? 0) + 1;
      }

      expect(counts.cleanup).toBe(14);
      expect(counts.roadConstruction).toBe(2);
      expect(counts.highYield).toBe(2);
      expect(counts.researchGrant).toBe(2);
      expect(counts.victoryPoint).toBe(5);
      expect(state.supply.devDeck).toHaveLength(25);
    });

    it('buys a dev card for 1 natural fiber, 1 food, 1 steel, and tracks turn bought', () => {
      const player = state.players[activePid]!;
      player.resources.natural_fiber = 2;
      player.resources.food = 2;
      player.resources.steel = 2;

      const initialDeckCount = state.supply.devDeck.length;

      state = applyAction(state, {
        type: 'BUY_DEV_CARD',
        playerId: activePid,
      });

      const updated = state.players[activePid]!;
      expect(updated.resources.natural_fiber).toBe(1);
      expect(updated.resources.food).toBe(1);
      expect(updated.resources.steel).toBe(1);
      expect(updated.devCards.unplayed).toHaveLength(1);
      expect(state.supply.devDeck).toHaveLength(initialDeckCount - 1);

      const boughtCardId = updated.devCards.unplayed[0]!;
      expect(state.devCardsBoughtThisTurn).toContain(boughtCardId);
      expect(state.turnStats.devCardsBoughtThisTurn).toContain(boughtCardId);

      // Attempting to play the newly bought card on the same turn is rejected
      expect(canPlayDevCard(state, activePid, boughtCardId).canPlay).toBe(false);
      expect(() => {
        applyAction(state, {
          type: 'PLAY_DEV_CARD',
          playerId: activePid,
          cardId: boughtCardId,
        });
      }).toThrow();
    });

    it('enforces 1 development card played per turn limit', () => {
      // Give player 2 older cleanup cards
      state.players[activePid]!.devCards.unplayed = ['dev_cleanup_01', 'dev_cleanup_02'];

      // Play 1st card
      state = applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: activePid,
        cardId: 'dev_cleanup_01',
        params: {
          cardType: 'cleanup',
          option: {
            type: 'REMOVE_HAZARD_STEAL',
          },
        },
      });

      expect(state.devCardPlayedThisTurn).toBe(true);
      expect(state.turnStats.devCardsPlayedThisTurn).toBe(1);

      // Attempt to play 2nd card in same turn
      expect(canPlayDevCard(state, activePid, 'dev_cleanup_02').canPlay).toBe(false);
      expect(() => {
        applyAction(state, {
          type: 'PLAY_DEV_CARD',
          playerId: activePid,
          cardId: 'dev_cleanup_02',
          params: {
            cardType: 'cleanup',
            option: { type: 'REMOVE_HAZARD_STEAL' },
          },
        });
      }).toThrow();
    });
  });

  describe('DEV-02: Cleanup Cards & Cleanest Environment Award (2 VP)', () => {
    it('executes Option 1: Move Inspector + Steal from adjacent building owner', () => {
      state.players[activePid]!.devCards.unplayed = ['dev_cleanup_01'];

      // Purple has a city at node 23
      const purpleCityNode = state.board.intersections[23]!;
      const targetHexId = purpleCityNode.adjacentHexIds[0]!;
      const hex = state.board.hexes[targetHexId]!;
      hex.hasHazard = false;
      hex.hasInspector = false;

      // Give Purple cards to steal
      state.players['purple']!.resources.food = 3;

      const initialOrangeCards = state.players[activePid]!.resources.food;

      state = applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: activePid,
        cardId: 'dev_cleanup_01',
        params: {
          cardType: 'cleanup',
          option: {
            type: 'INSPECTOR_MOVE_STEAL',
            newHexId: targetHexId,
            targetPlayerId: 'purple',
          },
        },
      });

      expect(state.board.hexes[targetHexId]!.hasInspector).toBe(true);
      expect(state.players[activePid]!.devCards.played).toContain('dev_cleanup_01');
      expect(state.players[activePid]!.devCards.unplayed).not.toContain('dev_cleanup_01');
      // Verify steal occurred
      const totalOrange =
        state.players[activePid]!.resources.lumber +
        state.players[activePid]!.resources.brick +
        state.players[activePid]!.resources.natural_fiber +
        state.players[activePid]!.resources.food +
        state.players[activePid]!.resources.steel +
        state.players[activePid]!.science;
      expect(totalOrange).toBeGreaterThan(initialOrangeCards);
    });

    it('executes Option 2: Remove 1 Hazard + Steal from player with LF >= activePlayer', () => {
      state.players[activePid]!.devCards.unplayed = ['dev_cleanup_02'];
      state.board.hexes[1]!.hasHazard = true;
      state.supply.hazards = 9;

      // Active player LF is 3
      expect(state.players[activePid]!.localFootprint).toBe(3);
      // Purple has LF 3 (same) and has 2 steel cards
      state.players['purple']!.resources.steel = 2;

      state = applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: activePid,
        cardId: 'dev_cleanup_02',
        params: {
          cardType: 'cleanup',
          option: {
            type: 'REMOVE_HAZARD_STEAL',
            hazardTarget: { kind: 'hex', id: 1 },
            targetPlayerId: 'purple',
          },
        },
      });

      expect(state.board.hexes[1]!.hasHazard).toBe(false);
      expect(state.supply.hazards).toBe(10);
      expect(state.players[activePid]!.devCards.played).toContain('dev_cleanup_02');
    });

    it('awards Cleanest Environment (2 VP) to first player with >= 3 played cleanups', () => {
      state.players[activePid]!.devCards.played = ['dev_cleanup_01', 'dev_cleanup_02'];
      const initialVp = state.players[activePid]!.victoryPoints;

      checkCleanestEnvironment(state, activePid);
      expect(state.cleanestEnvironmentHolder).toBeNull();

      // Add 3rd cleanup card
      state.players[activePid]!.devCards.played.push('dev_cleanup_03');
      checkCleanestEnvironment(state, activePid);

      expect(state.cleanestEnvironmentHolder).toBe(activePid);
      expect(state.players[activePid]!.victoryPoints).toBe(initialVp + 2);
      expect(state.specialAwards.cleanestEnvironment).toEqual({
        holder: activePid,
        cleanupCount: 3,
      });
    });

    it('strictly transfers Cleanest Environment when another player plays MORE cleanups', () => {
      // Orange has 3 cleanups and holds tile
      state.players['orange']!.devCards.played = ['dev_cleanup_01', 'dev_cleanup_02', 'dev_cleanup_03'];
      checkCleanestEnvironment(state, 'orange');
      expect(state.cleanestEnvironmentHolder).toBe('orange');
      const orangeVp = state.players['orange']!.victoryPoints;

      // Purple reaches 3 cleanups (TIE does NOT transfer)
      state.players['purple']!.devCards.played = ['dev_cleanup_04', 'dev_cleanup_05', 'dev_cleanup_06'];
      checkCleanestEnvironment(state, 'purple');
      expect(state.cleanestEnvironmentHolder).toBe('orange');

      // Purple reaches 4 cleanups (STRICT TRANSFER!)
      const purpleVp = state.players['purple']!.victoryPoints;
      state.players['purple']!.devCards.played.push('dev_cleanup_07');
      checkCleanestEnvironment(state, 'purple');

      expect(state.cleanestEnvironmentHolder).toBe('purple');
      expect(state.players['orange']!.victoryPoints).toBe(orangeVp - 2);
      expect(state.players['purple']!.victoryPoints).toBe(purpleVp + 2);
      expect(state.specialAwards.cleanestEnvironment.cleanupCount).toBe(4);
    });
  });

  describe('DEV-03: Progress Cards & Victory Point Cards', () => {
    it('plays Road Construction: builds 2 free roads and is removed from play', () => {
      state.players[activePid]!.devCards.unplayed = ['dev_roadConstruction_01'];

      // Edge from city node 10
      const e1 = state.board.intersections[10]!.incidentEdgeIds.find(
        (eId) => state.board.edges[eId]!.road === null
      )!;
      const e1Obj = state.board.edges[e1]!;
      const nextNode = e1Obj.v1 === 10 ? e1Obj.v2 : e1Obj.v1;
      const e2 = state.board.intersections[nextNode]!.incidentEdgeIds.find(
        (eId) => eId !== e1 && state.board.edges[eId]!.road === null
      )!;

      const initialRoadsBuilt = state.players[activePid]!.roadsBuilt;
      const initialRoadsReserve = state.players[activePid]!.roadsInReserve;

      state = applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: activePid,
        cardId: 'dev_roadConstruction_01',
        params: {
          cardType: 'roadConstruction',
          edge1: e1,
          edge2: e2,
        },
      });

      expect(state.players[activePid]!.roadsBuilt).toBe(initialRoadsBuilt + 2);
      expect(state.players[activePid]!.roadsInReserve).toBe(initialRoadsReserve - 2);
      expect(state.board.edges[e1]!.road).toEqual({ playerId: activePid });
      expect(state.board.edges[e2]!.road).toEqual({ playerId: activePid });
      expect(state.discardedDevCards).toContain('dev_roadConstruction_01');
      expect(state.players[activePid]!.devCards.unplayed).not.toContain('dev_roadConstruction_01');
    });

    it('plays High Yield: takes resources from hexes with renewable plants, ignores hazards', () => {
      state.players[activePid]!.devCards.unplayed = ['dev_highYield_01'];

      // Attach renewable plant on node 10 facing hex 0
      const node = state.board.intersections[10]!;
      const hex0 = node.adjacentHexIds[0]!;
      node.powerPlants.push({ playerId: activePid, type: 'renewable', hexId: hex0 });

      // Put hazard on hex0 to verify High Yield ignores hazards
      state.board.hexes[hex0]!.hasHazard = true;
      state.board.hexes[hex0]!.hasInspector = true;

      const initialResources = { ...state.players[activePid]!.resources };

      state = applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: activePid,
        cardId: 'dev_highYield_01',
        params: {
          cardType: 'highYield',
          hexIds: [hex0],
        },
      });

      expect(state.discardedDevCards).toContain('dev_highYield_01');
      // Verified resource increased
      const res = state.board.hexes[hex0]!.terrain;
      const cardType: ResourceType = res === 'forest' ? 'lumber' : res === 'hills' ? 'brick' : 'natural_fiber';
      expect(state.players[activePid]!.resources[cardType]).toBe(
        initialResources[cardType] + 1
      );
    });

    it('plays Research Grant: takes any 2 cards (resource or science) from supply', () => {
      state.players[activePid]!.devCards.unplayed = ['dev_researchGrant_01'];

      const initialSteel = state.players[activePid]!.resources.steel;
      const initialScience = state.players[activePid]!.science;

      state = applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: activePid,
        cardId: 'dev_researchGrant_01',
        params: {
          cardType: 'researchGrant',
          cards: ['steel', 'science'],
        },
      });

      expect(state.players[activePid]!.resources.steel).toBe(initialSteel + 1);
      expect(state.players[activePid]!.science).toBe(initialScience + 1);
      expect(state.discardedDevCards).toContain('dev_researchGrant_01');
    });

    it('Victory Point cards: held hidden until revealed to win at >= 10 VP', () => {
      state.players[activePid]!.victoryPoints = 8;
      state.players[activePid]!.devCards.unplayed = ['dev_victoryPoint_01', 'dev_victoryPoint_02'];

      // Attempting to reveal only 1 VP card (8 + 1 = 9 < 10) is rejected
      expect(canRevealVpCards(state, activePid, ['dev_victoryPoint_01']).canReveal).toBe(false);
      expect(() => {
        applyAction(state, {
          type: 'REVEAL_VP_CARDS',
          playerId: activePid,
          cardIds: ['dev_victoryPoint_01'],
        });
      }).toThrow();

      // Revealing 2 VP cards brings player to 10 VP (wins game!)
      expect(
        canRevealVpCards(state, activePid, ['dev_victoryPoint_01', 'dev_victoryPoint_02']).canReveal
      ).toBe(true);

      state = applyAction(state, {
        type: 'REVEAL_VP_CARDS',
        playerId: activePid,
        cardIds: ['dev_victoryPoint_01', 'dev_victoryPoint_02'],
      });

      expect(state.players[activePid]!.victoryPoints).toBe(10);
      expect(state.winner).toBe(activePid);
      expect(state.phase).toBe('GameEnd');
    });
  });

  describe('VIC-01: Dual Victory Conditions Evaluator', () => {
    it('Condition 1: >= 10 VP on own turn triggers immediate victory', () => {
      state.players[activePid]!.victoryPoints = 9;

      // Upgrade town to city (+1 VP) -> reaches 10 VP
      state.players[activePid]!.resources.steel = 3;
      state.players[activePid]!.resources.food = 2;

      state = applyAction(state, {
        type: 'BUILD_CITY',
        playerId: activePid,
        nodeId: 12,
      });

      expect(state.players[activePid]!.victoryPoints).toBe(10);
      expect(state.winner).toBe(activePid);
      expect(state.phase).toBe('GameEnd');
    });

    it('Condition 2: Empty Event Bag — Renewable > Fossil eligibility filter and net difference', () => {
      // Empty the bag
      state.eventBag = [];

      // Orange: 6 renewables, 2 fossil -> diff = +4 (Eligible)
      state.players['orange']!.renewablePlantsBuilt = 6;
      state.players['orange']!.fossilPlantsBuilt = 2;

      // Purple: 5 renewables, 3 fossil -> diff = +2 (Eligible)
      state.players['purple']!.renewablePlantsBuilt = 5;
      state.players['purple']!.fossilPlantsBuilt = 3;

      // Pink: 0 renewables, 5 fossil -> diff = -5 (NOT Eligible)
      state.players['pink']!.renewablePlantsBuilt = 0;
      state.players['pink']!.fossilPlantsBuilt = 5;

      const result = evaluateEmptyBagVictory(state);
      expect(result.ended).toBe(true);
      expect(result.condition).toBe('EMPTY_BAG_BALANCE');
      expect(result.winner).toBe('orange');
    });

    it('Condition 2 Tie-Breaker: Total VP including unrevealed VP cards in hand', () => {
      state.eventBag = [];

      // Orange: 4 renewables, 1 fossil -> net diff = +3, public VP = 6, 0 VP cards -> total 6
      state.players['orange']!.renewablePlantsBuilt = 4;
      state.players['orange']!.fossilPlantsBuilt = 1;
      state.players['orange']!.victoryPoints = 6;

      // Purple: 4 renewables, 1 fossil -> net diff = +3, public VP = 5, 2 VP cards in hand -> total 7
      state.players['purple']!.renewablePlantsBuilt = 4;
      state.players['purple']!.fossilPlantsBuilt = 1;
      state.players['purple']!.victoryPoints = 5;
      state.players['purple']!.devCards.unplayed = ['dev_victoryPoint_01', 'dev_victoryPoint_02'];

      const result = evaluateEmptyBagVictory(state);
      expect(result.ended).toBe(true);
      expect(result.winner).toBe('purple'); // Purple wins on total VP (7 > 6)!
    });

    it('Condition 2 Environmental Collapse: when no player has Renewable > Fossil', () => {
      state.eventBag = [];

      // All players have more fossil than renewable
      for (const pid of state.playerOrder) {
        state.players[pid]!.renewablePlantsBuilt = 1;
        state.players[pid]!.fossilPlantsBuilt = 3;
      }

      const result = evaluateEmptyBagVictory(state);
      expect(result.ended).toBe(true);
      expect(result.condition).toBe('ENVIRONMENTAL_COLLAPSE');
      expect(result.winner).toBe('collapse');
    });
  });
});
