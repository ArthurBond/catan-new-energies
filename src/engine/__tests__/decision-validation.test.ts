/**
 * Decisions sent from the UI must be accepted whenever they are legal by the rules, regardless of
 * key order, zero entries, or how many alternative choices exist.
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../reducer';
import { createInitialGameState } from '../setup';
import { GameState } from '../types';

function stateAwaitingDiscard(): GameState {
  const state = createInitialGameState({ setupMode: 'first', placement: 'fixed', seed: 42 });
  const orange = state.players.orange!;
  // 14 cards: discard 7. Far more than 50 distinct ways to do it.
  orange.resources = { lumber: 3, brick: 3, natural_fiber: 2, food: 2, steel: 2 };
  orange.science = 2;
  state.supply.resources.lumber -= 3;
  state.supply.resources.brick -= 3;
  state.supply.resources.natural_fiber -= 2;
  state.supply.resources.food -= 2;
  state.supply.resources.steel -= 2;
  state.supply.science -= 2;
  state.phase = 'ProductionPhase';
  state.lastDiceRoll = [3, 4];
  state.pendingDecisions = [
    { id: 'discard-7-orange-1', type: 'DISCARD_ON_SEVEN', playerId: 'orange', cardsToDiscard: 7 },
  ];
  return state;
}

function actionPhaseState(): GameState {
  const state = createInitialGameState({ setupMode: 'first', placement: 'fixed', seed: 42 });
  state.phase = 'ActionPhase';
  state.players.orange!.resources = { lumber: 2, brick: 2, natural_fiber: 1, food: 1, steel: 3 };
  state.players.orange!.science = 2;
  state.players.orange!.devCards.unplayed = ['dev_researchGrant_01'];
  return state;
}

describe('Other answers from the UI', () => {
  it('accepts production-increase answers regardless of key order', () => {
    const state = createInitialGameState({ setupMode: 'first', placement: 'fixed', seed: 42 });
    state.phase = 'EventPhase';
    const city = state.board.intersections.find(
      (n) => n.building?.playerId === 'orange' && n.building.type === 'city'
    )!;
    const hexId = city.adjacentHexIds.find((h) => state.board.hexes[h]!.numberDisc !== null)!;
    state.pendingDecisions = [
      { id: 'pi-1', type: 'EVENT_PRODUCTION_INCREASE', playerId: 'orange', isOptional: true },
    ];
    const next = applyAction(state, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: 'pi-1',
      response: { hexId, nodeId: city.id, build: true },
    });
    expect(next.board.intersections[city.id]!.powerPlants).toHaveLength(1);
  });

  it('rejects trade offers with negative, fractional or unknown items', () => {
    const state = actionPhaseState();
    const offer = (give: Record<string, number>, want: Record<string, number>) => () =>
      applyAction(state, { type: 'OFFER_TRADE', playerId: 'orange', targetPlayerId: 'purple', give, want });
    expect(offer({ lumber: 1, brick: -1 }, { steel: 1 })).toThrow();
    expect(offer({ lumber: 0.5 }, { steel: 1 })).toThrow();
    expect(offer({ gold: 1 }, { steel: 1 })).toThrow();
    // A normal offer with a zero entry left by the steppers is fine
    expect(offer({ lumber: 1, brick: 0 }, { food: 1 })).not.toThrow();
  });

  it('Research Grant only hands out resource or science cards', () => {
    const state = actionPhaseState();
    expect(() =>
      applyAction(state, {
        type: 'PLAY_DEV_CARD',
        playerId: 'orange',
        cardId: 'dev_researchGrant_01',
        params: { cardType: 'researchGrant', cards: ['energy', 'steel'] },
      })
    ).toThrow();
    const next = applyAction(state, {
      type: 'PLAY_DEV_CARD',
      playerId: 'orange',
      cardId: 'dev_researchGrant_01',
      params: { cardType: 'researchGrant', cards: ['science', 'steel'] },
    });
    expect(next.players.orange!.science).toBe(3);
    expect(next.players.orange!.resources.steel).toBe(4);
  });
});

describe('DISCARD_ON_SEVEN validation', () => {
  it('accepts any legal discard, including combinations late in the enumeration', () => {
    const state = stateAwaitingDiscard();
    // Keep all lumber and brick; give up the rest (a choice the old 50-item list never reached)
    const next = applyAction(state, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: 'discard-7-orange-1',
      response: { cards: { science: 2, steel: 2, food: 2, natural_fiber: 1 } },
    });
    const o = next.players.orange!;
    expect(o.resources).toEqual({ lumber: 3, brick: 3, natural_fiber: 1, food: 0, steel: 0 });
    expect(o.science).toBe(0);
    // Cards go back to the supply
    expect(next.supply.science).toBe(state.supply.science + 2);
    // Discards done: the active player now moves the inspector
    expect(next.pendingDecisions[0]?.type).toBe('MOVE_INSPECTOR');
  });

  it('ignores key order and zero entries the dialog leaves behind', () => {
    const state = stateAwaitingDiscard();
    const next = applyAction(state, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: 'discard-7-orange-1',
      response: { cards: { steel: 2, lumber: 0, brick: 3, food: 0, science: 2, natural_fiber: 0 } },
    });
    expect(next.players.orange!.resources.brick).toBe(0);
    expect(next.players.orange!.resources.lumber).toBe(3);
  });

  it('rejects the wrong number of cards, more than held, negatives and unknown cards', () => {
    const state = stateAwaitingDiscard();
    const send = (cards: Record<string, number>) => () =>
      applyAction(state, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'orange',
        decisionId: 'discard-7-orange-1',
        response: { cards },
      });
    expect(send({ lumber: 3, brick: 3 })).toThrow();
    expect(send({ lumber: 3, brick: 3, food: 2 })).toThrow();
    expect(send({ steel: 4, lumber: 3 })).toThrow();
    expect(send({ lumber: 3, brick: 3, food: 2, steel: -1 })).toThrow();
    expect(send({ lumber: 3, brick: 3, energy: 1 })).toThrow();
    expect(send({ lumber: 3, brick: 3.5, steel: 0.5 })).toThrow();
  });

  it('only the player who must discard can answer', () => {
    const state = stateAwaitingDiscard();
    expect(() =>
      applyAction(state, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'purple',
        decisionId: 'discard-7-orange-1',
        response: { cards: { lumber: 3, brick: 3, food: 1 } },
      })
    ).toThrow();
  });
});
