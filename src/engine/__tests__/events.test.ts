import { describe, it, expect } from 'vitest';
import { createInitialGameState, TERRAIN_RESOURCE_MAP } from '../setup';
import { applyAction } from '../reducer';
import { legalActions } from '../actions';
import { lockEventDrawCount, stepEventDraw } from '../events';
import {
  getTiedPlayers,
  resolveAirPollution,
  resolveEnvironmentalPollution,
  resolveProductionIncrease,
  resolveRainAndFlooding,
  resolveClimateConference,
  resolveGovernmentFunding,
  resolveSustainableProduction,
} from '../event-resolvers';

describe('EVT-01: Event Phase Draw Locking & GF Bands', () => {
  it('locks draw count at start of EventPhase and remains immutable despite mid-turn GF shift', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 100 });
    expect(state.phase).toBe('EventPhase');
    expect(state.clampedGF).toBe(12);

    // Initial draw locks draw count
    lockEventDrawCount(state);
    expect(state.lockedDrawCount).toBe(1); // 12 in 4P is starting band (1 disc)

    // Simulate mid-phase GF shift by mutating LF
    state.players.orange.localFootprint += 12; // Increases GF into smog band (24+)
    state.clampedGF = 24;

    // Remaining draw count for the current turn is still locked at 1
    expect(state.lockedDrawCount).toBe(1);
  });

  it('calculates correct starting draw counts for 3P (9 GF -> 1 disc) and 4P (12 GF -> 1 disc)', () => {
    const state4P = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 101 });
    lockEventDrawCount(state4P);
    expect(state4P.lockedDrawCount).toBe(1);

    const state3P = createInitialGameState({ setupMode: 'first', playerCount: 3, seed: 102 });
    lockEventDrawCount(state3P);
    expect(state3P.lockedDrawCount).toBe(1);
  });
});

describe('EVT-02: Track Filling, Clearing and Removal from Play', () => {
  it('triggers event and clears track to 0 when last space is filled', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 103 });
    // Set environmental pollution track to 3 (capacity is 4)
    state.eventTracks.environmentalPollution = 3;
    state.eventBag = ['environmentalPollution', ...state.eventBag];

    const next = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: 'orange' });
    // Track should clear to 0, not retain 4 discs
    expect(next.eventTracks.environmentalPollution).toBe(0);
  });
});

describe('EVT-03: Universal Tie-Breaker Architecture', () => {
  it('returns null (strict no-op) when ALL players are tied on the metric', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 104 });
    // All 4 players start with LF = 3
    const tied = getTiedPlayers(state, (p) => p.localFootprint, 'highest');
    expect(tied).toBeNull();
  });

  it('orders tied players in clockwise sequence starting from active player when strict subset ties', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 105 });
    state.activePlayerId = 'orange'; // Order: orange, purple, pink, blue
    // Give purple and blue highest LF (5), orange and pink lower (3)
    state.players.purple.localFootprint = 5;
    state.players.blue.localFootprint = 5;

    const tied = getTiedPlayers(state, (p) => p.localFootprint, 'highest');
    expect(tied).toEqual(['purple', 'blue']);

    // Change active player to pink -> clockwise distance: blue is 1 step, purple is 3 steps
    state.activePlayerId = 'pink';
    const tiedFromPink = getTiedPlayers(state, (p) => p.localFootprint, 'highest');
    expect(tiedFromPink).toEqual(['blue', 'purple']);
  });
});

describe('EVT-04: Air Pollution Resolver', () => {
  it('is a no-op if all players have identical LF', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 106 });
    resolveAirPollution(state);
    expect(state.pendingDecisions).toHaveLength(0);
  });

  it('requires highest LF player to target City first, falling back to Town if no unhazarded Cities', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 107 });
    state.players.purple.localFootprint = 6; // Purple has highest LF

    resolveAirPollution(state);
    expect(state.pendingDecisions).toHaveLength(1);
    const decision = state.pendingDecisions[0]!;
    expect(decision.type).toBe('EVENT_HAZARD_CHOICE');
    if (decision.type === 'EVENT_HAZARD_CHOICE') {
      expect(decision.playerId).toBe('purple');
      expect(decision.source).toBe('AirPollution');
      expect(decision.targetType).toBe('CityFirst');
    }

    // Legal actions should only contain Purple's City (node 23), NOT Town (node 35)
    const legals = legalActions(state, 'purple');
    expect(legals).toHaveLength(1);
    expect((legals[0] as { response: { nodeId: number } }).response.nodeId).toBe(23); // Purple's city in fixed setup

    // Hazard the city and re-run -> should now target Town (node 35)
    state.pendingDecisions = [];
    state.board.intersections[23]!.hasHazard = true;
    resolveAirPollution(state);
    const legalsTown = legalActions(state, 'purple');
    expect(legalsTown).toHaveLength(1);
    expect((legalsTown[0] as { response: { nodeId: number } }).response.nodeId).toBe(35);
  });
});

describe('EVT-05: Environmental Pollution Resolver', () => {
  it('rolls non-7 sum and places hazard on matching hexes, respecting Inspector and existing hazards', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 108 });
    // Find hex with Inspector (Desert in fixed setup, hex 9)
    const inspectorHex = state.board.hexes.find((h) => h.hasInspector)!;

    // Place Inspector on a numbered hex (hex 0, disc 5)
    inspectorHex.hasInspector = false;
    state.board.hexes[0]!.hasInspector = true;

    // Run resolver
    const initialHazards = state.supply.hazards;
    resolveEnvironmentalPollution(state);

    // Inspector hex (hex 0) should NOT receive a hazard
    expect(state.board.hexes[0]!.hasHazard).toBe(false);

    // Some hex received a hazard, so supply decreased
    expect(state.supply.hazards).toBeLessThan(initialHazards);
  });
});

describe('EVT-06: Production Increase Resolver', () => {
  it('allows highest LF player to build a free fossil plant and gain a resource even on a hazarded hex', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 109 });
    state.players.orange.localFootprint = 5; // Orange has highest LF

    resolveProductionIncrease(state);
    expect(state.pendingDecisions).toHaveLength(1);
    const decision = state.pendingDecisions[0]!;
    expect(decision.type).toBe('EVENT_PRODUCTION_INCREASE');

    const legals = legalActions(state, 'orange');
    const buildAction = legals.find(
      (a) =>
        a.type === 'RESOLVE_PENDING_DECISION' &&
        (a.response as { build?: boolean })?.build
    )!;
    expect(buildAction).toBeDefined();

    const resp = (buildAction as { response: { hexId: number; nodeId: number } }).response;
    const targetHexId = resp.hexId;
    const targetNodeId = resp.nodeId;

    // Place a hazard on target hex
    state.board.hexes[targetHexId]!.hasHazard = true;

    const expectedRes = TERRAIN_RESOURCE_MAP[state.board.hexes[targetHexId]!.terrain]!;
    const resBefore = state.players.orange.resources[expectedRes] || 0;
    const next = applyAction(state, buildAction);

    // Plant built
    const node = next.board.intersections[targetNodeId]!;
    expect(node.powerPlants.some((p) => p.hexId === targetHexId && p.type === 'fossil')).toBe(true);

    // Footprint is mathematically recomputed: 1 town (1) + 1 city (2) + 1 fossil (1) = 4 LF
    expect(next.players.orange.localFootprint).toBe(4);

    // Resource gained despite hazard on target hex!
    const resAfter = next.players.orange.resources[expectedRes] || 0;
    expect(resAfter).toBe(resBefore + 1);
  });
});

describe('EVT-07: Rain & Flooding Resolver', () => {
  it('prompts all players in clockwise order to place 1 hazard on their building', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 110 });
    resolveRainAndFlooding(state);

    // All 4 players receive a pending decision in order
    expect(state.pendingDecisions).toHaveLength(4);
    expect(state.pendingDecisions.map((d) => d.playerId)).toEqual(['orange', 'purple', 'pink', 'blue']);
    expect(
      state.pendingDecisions.every(
        (d) => d.type === 'EVENT_HAZARD_CHOICE' && d.source === 'RainAndFlooding'
      )
    ).toBe(true);
  });
});

describe('EVT-08: Climate Conference Resolver', () => {
  it('is a no-op if all players are tied on LF', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 111 });
    resolveClimateConference(state);
    expect(state.pendingDecisions).toHaveLength(0);
  });

  it('rewards lowest LF with 1 card choice and penalizes highest LF with 1 discard', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 112 });
    state.players.orange.localFootprint = 1; // Lowest
    state.players.blue.localFootprint = 5;   // Highest

    resolveClimateConference(state);
    expect(state.pendingDecisions).toHaveLength(2);

    const reward = state.pendingDecisions[0]!;
    expect(reward.type).toBe('EVENT_CARD_CHOICE');
    if (reward.type === 'EVENT_CARD_CHOICE') {
      expect(reward.playerId).toBe('orange');
      expect(reward.event).toBe('ClimateConferenceReward');
      expect(reward.isOptional).toBe(true);
    }

    const penalty = state.pendingDecisions[1]!;
    expect(penalty.type).toBe('EVENT_CARD_CHOICE');
    if (penalty.type === 'EVENT_CARD_CHOICE') {
      expect(penalty.playerId).toBe('blue');
      expect(penalty.event).toBe('ClimateConferencePenalty');
      expect(penalty.isOptional).toBe(false);
    }
  });
});

describe('EVT-09: Government Funding & Sustainable Production Resolvers', () => {
  it('grants lowest LF a free development card on Government Funding', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 113 });
    state.players.pink.localFootprint = 1; // Lowest LF

    resolveGovernmentFunding(state);
    expect(state.pendingDecisions).toHaveLength(1);
    expect(state.pendingDecisions[0]!.playerId).toBe('pink');

    const devCardsBefore = state.players.pink.devCards.unplayed.length;
    const next = applyAction(state, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'pink',
      decisionId: state.pendingDecisions[0]!.id,
      response: { take: true },
    });
    expect(next.players.pink.devCards.unplayed.length).toBe(devCardsBefore + 1);
  });

  it('is a no-op on Sustainable Production if all players have 0 renewable plants (total tie)', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 114 });
    resolveSustainableProduction(state);
    expect(state.pendingDecisions).toHaveLength(0);
  });
});

describe('Immediate Empty Bag Game End', () => {
  it('triggers immediate game end when a draw is required and bag is empty', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 115 });
    state.eventBag = []; // Empty bag
    state.lockedDrawCount = 1;
    state.eventDiscsDrawnThisTurn = 0;

    const next = stepEventDraw(state);
    expect(next.phase).toBe('GameEnd');
    expect(next.winner).toBe('collapse'); // In starting state, nobody has renewables > fossil
  });
});
