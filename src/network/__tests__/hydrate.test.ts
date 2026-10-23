import { describe, expect, it } from 'vitest';
import { getActingPlayerId } from '../../ai/bot';
import { legalActions } from '../../engine/actions';
import { applyAction } from '../../engine/reducer';
import { createInitialGameState } from '../../engine/setup';
import type { GameState } from '../../engine/types';
import { handCount } from '../../ui/gameView';
import {
  hydrateRedactedState,
  isHandHidden,
  PLACEHOLDER_CARD_ID,
  playerHandCount,
} from '../hydrate';
import { redactForPlayer, redactForSpectator } from '../redact';

/** A wire round trip, like the server's JSON frames. */
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function richState(playerCount: 3 | 4 = 4): GameState {
  const state = createInitialGameState({ setupMode: 'first', playerCount, seed: 321 });
  state.players.orange.devCards.unplayed = ['dev_cleanup_01', 'dev_victoryPoint_01'];
  state.players.purple.devCards.unplayed = ['dev_researchGrant_01'];
  state.players.purple.hiddenGreenDiscs = ['g1', 'g2'];
  state.players.orange.hiddenGreenDiscs = ['g3'];
  state.players.orange.resources = { lumber: 2, brick: 1, natural_fiber: 0, food: 1, steel: 0 };
  state.players.orange.science = 1;
  state.players.purple.resources = { lumber: 0, brick: 3, natural_fiber: 1, food: 0, steel: 2 };
  state.players.purple.science = 2;
  return state;
}

describe('hydrateRedactedState', () => {
  it('fills hidden lists with placeholders of the right length', () => {
    const truth = richState();
    const view = hydrateRedactedState(
      wire(redactForPlayer(truth, 'orange', { hideOpponentResources: true })),
      'orange'
    );

    expect(view.supply.devDeck).toHaveLength(truth.supply.devDeck.length);
    expect(view.supply.devDeck.every((id) => id === PLACEHOLDER_CARD_ID)).toBe(true);
    expect(view.eventBag).toHaveLength(truth.eventBag.length);
    expect(view.prng).toEqual({ seed: 0, calls: 0 });

    // My own secrets are real
    expect(view.players.orange.devCards.unplayed).toEqual(['dev_cleanup_01', 'dev_victoryPoint_01']);
    expect(view.players.orange.hiddenGreenDiscs).toEqual(['g3']);
    expect(view.players.orange.resources).toEqual(truth.players.orange.resources);
    expect(isHandHidden(view.players.orange)).toBe(false);

    // Other players only by count
    expect(view.players.purple.devCards.unplayed).toEqual([PLACEHOLDER_CARD_ID]);
    expect(view.players.purple.hiddenGreenDiscs).toEqual([PLACEHOLDER_CARD_ID, PLACEHOLDER_CARD_ID]);
    expect(view.players.purple.resources).toEqual({ lumber: 0, brick: 0, natural_fiber: 0, food: 0, steel: 0 });
    expect(isHandHidden(view.players.purple)).toBe(true);
    expect(playerHandCount(view.players.purple)).toBe(8);
    expect(handCount(view, 'purple')).toBe(8);
    expect(handCount(view, 'orange')).toBe(5);
  });

  it('keeps 3-player games without a blue seat and spectators without any hand', () => {
    const truth = richState(3);
    const view = hydrateRedactedState(wire(redactForSpectator(truth, { hideOpponentResources: true })), null);
    expect(view.players.blue).toBeUndefined();
    expect(view.playerOrder).toEqual(truth.playerOrder);
    for (const pid of view.playerOrder) {
      expect(isHandHidden(view.players[pid])).toBe(true);
      expect(view.players[pid].devCards.unplayed).toHaveLength(truth.players[pid].devCards.unplayed.length);
    }
  });

  it('gives legal actions for the viewer, and the server accepts them, through a game opening', () => {
    let truth = createInitialGameState({ setupMode: 'standard', placement: 'draft', playerCount: 4, seed: 9, setupRoll: true });
    // Play the roll-off and every opening placement from each acting player's own view.
    for (let step = 0; step < 40 && truth.phase !== 'EventPhase'; step++) {
      const actor = getActingPlayerId(truth)!;
      const view = hydrateRedactedState(wire(redactForPlayer(truth, actor, { hideOpponentResources: true })), actor);
      const options = legalActions(view, actor);
      expect(options.length).toBeGreaterThan(0);
      truth = applyAction(truth, options[0]!);
    }
    expect(truth.phase).toBe('EventPhase');
    // After setup, the viewer's options (draw a disc, dev cards...) still come out without throwing.
    // Opponents' hidden dev cards are placeholders; the viewer's own options must not touch them.
    const actor = truth.activePlayerId;
    for (const pid of truth.playerOrder) truth.players[pid].devCards.unplayed = ['dev_cleanup_07'];
    const view = hydrateRedactedState(wire(redactForPlayer(truth, actor, { hideOpponentResources: true })), actor);
    expect(() => legalActions(view, actor)).not.toThrow();
  });
});
