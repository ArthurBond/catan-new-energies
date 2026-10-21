import { describe, it, expect } from 'vitest';
import { createInitialGameState, TERRAIN_RESOURCE_MAP } from '../setup';
import { applyAction } from '../reducer';
import { legalActions } from '../actions';
import {
  evaluateProduction,
  autoClearHazards,
  getHandSizeForSeven,
  queueDiscardsOnSeven,
  getEligibleStealVictims,
} from '../production';

describe('PRD-01: Non-7 Production Payouts & Block Checks', () => {
  it('awards 1 resource for town, 1 resource + 1 science for city, and 1 energy for power plant', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 201 });
    // In First Game:
    // Orange has City at node 10, Town at node 12.
    // Attach a power plant to node 10 facing one of its adjacent numbered hexes.
    const cityNode = state.board.intersections[10]!;
    const targetHexId = cityNode.adjacentHexIds.find(
      (hId) => state.board.hexes[hId]!.numberDisc !== null
    )!;
    const targetHex = state.board.hexes[targetHexId]!;
    const rolledNumber = targetHex.numberDisc!;

    cityNode.powerPlants.push({
      playerId: 'orange',
      type: 'fossil',
      hexId: targetHexId,
    });

    state.players.orange.energy = 2; // Below cap of 5

    const res = evaluateProduction(
      state.board,
      state.players,
      state.supply,
      [Math.floor(rolledNumber / 2), rolledNumber - Math.floor(rolledNumber / 2)],
      'orange',
      state.playerOrder
    );

    const orangePayout = res.payouts.orange;
    const expectedRes = TERRAIN_RESOURCE_MAP[targetHex.terrain]!;
    expect(orangePayout.resources[expectedRes]).toBe(1);
    expect(orangePayout.science).toBe(1); // From city
    expect(orangePayout.energy).toBe(1);  // From power plant
  });

  it('yields 0 resources, science, and energy when the rolled hex has a hazard', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 202 });
    const cityNode = state.board.intersections[10]!;
    const targetHexId = cityNode.adjacentHexIds.find(
      (hId) => state.board.hexes[hId]!.numberDisc !== null
    )!;
    const targetHex = state.board.hexes[targetHexId]!;
    const rolledNumber = targetHex.numberDisc!;

    // Block hex with hazard
    targetHex.hasHazard = true;

    cityNode.powerPlants.push({
      playerId: 'orange',
      type: 'fossil',
      hexId: targetHexId,
    });

    const res = evaluateProduction(
      state.board,
      state.players,
      state.supply,
      [Math.floor(rolledNumber / 2), rolledNumber - Math.floor(rolledNumber / 2)],
      'orange',
      state.playerOrder
    );

    const orangePayout = res.payouts.orange;
    const expectedRes = TERRAIN_RESOURCE_MAP[targetHex.terrain]!;
    expect(orangePayout.resources[expectedRes] || 0).toBe(0);
    expect(orangePayout.science).toBe(0);
    expect(orangePayout.energy).toBe(0);
  });

  it('yields 0 resources, science, and energy when the building has a hazard', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 203 });
    const cityNode = state.board.intersections[10]!;
    const targetHexId = cityNode.adjacentHexIds.find(
      (hId) => state.board.hexes[hId]!.numberDisc !== null
    )!;
    const targetHex = state.board.hexes[targetHexId]!;
    const rolledNumber = targetHex.numberDisc!;

    // Block building with hazard
    cityNode.hasHazard = true;

    cityNode.powerPlants.push({
      playerId: 'orange',
      type: 'fossil',
      hexId: targetHexId,
    });

    const res = evaluateProduction(
      state.board,
      state.players,
      state.supply,
      [Math.floor(rolledNumber / 2), rolledNumber - Math.floor(rolledNumber / 2)],
      'orange',
      state.playerOrder
    );

    const orangePayout = res.payouts.orange;
    const expectedRes = TERRAIN_RESOURCE_MAP[targetHex.terrain]!;
    expect(orangePayout.resources[expectedRes] || 0).toBe(0);
    expect(orangePayout.science).toBe(0);
    expect(orangePayout.energy).toBe(0);
  });

  it('enforces 5-energy hard cap on power plant production', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 204 });
    const cityNode = state.board.intersections[10]!;
    const targetHexId = cityNode.adjacentHexIds.find(
      (hId) => state.board.hexes[hId]!.numberDisc !== null
    )!;
    const targetHex = state.board.hexes[targetHexId]!;
    const rolledNumber = targetHex.numberDisc!;

    cityNode.powerPlants.push({
      playerId: 'orange',
      type: 'fossil',
      hexId: targetHexId,
    });

    // Player already at 5 energy
    state.players.orange.energy = 5;

    const res = evaluateProduction(
      state.board,
      state.players,
      state.supply,
      [Math.floor(rolledNumber / 2), rolledNumber - Math.floor(rolledNumber / 2)],
      'orange',
      state.playerOrder
    );

    expect(res.payouts.orange.energy).toBe(0); // Dropped at cap
  });
});

describe('PRD-02: End-of-Production Hazard Auto-Clear', () => {
  it('clears hazards from rolled hex and adjacent buildings simultaneously', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 205 });
    const targetHex = state.board.hexes.find((h) => h.numberDisc === 6)!;
    const adjacentNode = state.board.intersections.find(
      (n) => n.adjacentHexIds.includes(targetHex.id) && n.building !== null
    )!;

    targetHex.hasHazard = true;
    adjacentNode.hasHazard = true;
    state.supply.hazards = 8;

    const cleared = autoClearHazards(state.board, 6, state.supply);

    expect(targetHex.hasHazard).toBe(false);
    expect(adjacentNode.hasHazard).toBe(false);
    expect(cleared.clearedHexIds).toContain(targetHex.id);
    expect(cleared.clearedNodeIds).toContain(adjacentNode.id);
    expect(state.supply.hazards).toBe(10); // Returned to supply
  });

  it('preserves hazard on buildings when the Inspector is on that rolled hex', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 206 });
    const targetHex = state.board.hexes.find((h) => h.numberDisc === 8)!;
    const adjacentNode = state.board.intersections.find(
      (n) => n.adjacentHexIds.includes(targetHex.id) && n.building !== null
    )!;

    // Move Inspector to this hex
    const oldInspectorHex = state.board.hexes.find((h) => h.hasInspector);
    if (oldInspectorHex) oldInspectorHex.hasInspector = false;
    targetHex.hasInspector = true;

    adjacentNode.hasHazard = true;
    state.supply.hazards = 9;

    const cleared = autoClearHazards(state.board, 8, state.supply);

    // Building hazard must NOT be cleared because Inspector is present!
    expect(adjacentNode.hasHazard).toBe(true);
    expect(cleared.clearedNodeIds).not.toContain(adjacentNode.id);
    expect(state.supply.hazards).toBe(9);
  });
});

describe('PRD-03: Roll of 7 Discard Mechanics', () => {
  it('excludes dev cards and energy tokens from hand count', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 207 });
    const p = state.players.orange;
    p.resources = { lumber: 3, brick: 2, natural_fiber: 1, food: 1, steel: 0 }; // 7 cards
    p.science = 0;
    p.energy = 5; // Energy should NOT count
    p.devCards.unplayed = ['cleanup', 'cleanup']; // Dev cards should NOT count

    expect(getHandSizeForSeven(p)).toBe(7);
  });

  it('queues discard of floor(hand/2) for hand > 7, and respects active Warehouse limit of 10', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 208 });

    // Clear starting hands
    for (const p of Object.values(state.players)) {
      p.resources = { lumber: 0, brick: 0, natural_fiber: 0, food: 0, steel: 0 };
      p.science = 0;
    }

    // Orange has 8 cards (no warehouse) -> discards floor(8/2) = 4
    state.players.orange.resources.lumber = 8;

    // Purple has 8 cards + active Warehouse -> limit 10, discards 0
    state.players.purple.resources.lumber = 8;
    state.players.purple.hasWarehouse = true;

    // Pink has 11 cards + active Warehouse -> discards floor(11/2) = 5
    state.players.pink.resources.lumber = 11;
    state.players.pink.hasWarehouse = true;

    // Blue has 7 cards (no warehouse) -> limit 7, discards 0
    state.players.blue.resources.lumber = 7;

    queueDiscardsOnSeven(state);

    expect(state.pendingDecisions).toHaveLength(2);
    const d0 = state.pendingDecisions[0]!;
    expect(d0.type).toBe('DISCARD_ON_SEVEN');
    if (d0.type === 'DISCARD_ON_SEVEN') {
      expect(d0.playerId).toBe('orange');
      expect(d0.cardsToDiscard).toBe(4);
    }

    const d1 = state.pendingDecisions[1]!;
    expect(d1.type).toBe('DISCARD_ON_SEVEN');
    if (d1.type === 'DISCARD_ON_SEVEN') {
      expect(d1.playerId).toBe('pink');
      expect(d1.cardsToDiscard).toBe(5);
    }
  });
});

describe('PRD-04: Roll of 7 Inspector Movement and Card Steal', () => {
  it('moves Inspector to hazard-free hex and steals 1 random card from adjacent building owner', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 209 });
    state.phase = 'ProductionPhase';

    // Purple has cards
    state.players.purple.resources.lumber = 2;
    state.players.purple.science = 1;

    // Choose target hex adjacent to Purple's city (node 23)
    const targetHexId = state.board.intersections[23]!.adjacentHexIds[0]!;

    // Check victims
    const victims = getEligibleStealVictims(state, targetHexId);
    expect(victims).toContain('purple');

    // Simulate move inspector decision
    state.pendingDecisions = [
      { id: 'move-test', type: 'MOVE_INSPECTOR', playerId: 'orange' },
    ];

    const next1 = applyAction(state, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: 'move-test',
      response: { hexId: targetHexId },
    });

    expect(next1.board.hexes[targetHexId]!.hasInspector).toBe(true);
    expect(next1.pendingDecisions).toHaveLength(1);
    expect(next1.pendingDecisions[0]!.type).toBe('STEAL_TARGET');

    // Orange selects purple
    const purpleCardsBefore =
      next1.players.purple.resources.lumber +
      next1.players.purple.science;
    const orangeCardsBefore =
      next1.players.orange.resources.lumber +
      next1.players.orange.science;

    const next2 = applyAction(next1, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: next1.pendingDecisions[0]!.id,
      response: { targetPlayerId: 'purple' },
    });

    const purpleCardsAfter =
      next2.players.purple.resources.lumber +
      next2.players.purple.science;
    const orangeCardsAfter =
      next2.players.orange.resources.lumber +
      next2.players.orange.science;

    expect(purpleCardsAfter).toBe(purpleCardsBefore - 1);
    expect(orangeCardsAfter).toBe(orangeCardsBefore + 1);
    expect(next2.phase).toBe('ActionPhase');
  });

  it('cannot move Inspector to a hex with a Hazard token', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 210 });
    state.board.hexes[0]!.hasHazard = true;

    state.pendingDecisions = [
      { id: 'move-hazard', type: 'MOVE_INSPECTOR', playerId: 'orange' },
    ];

    const legals = legalActions(state, 'orange');
    const legalHexIds = legals.map(
      (a) => (a as { response: { hexId: number } }).response.hexId
    );
    expect(legalHexIds).not.toContain(0);
  });
});
