import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import type { GameState, PlayerId } from '../../engine/types';
import { evaluateEmptyBagVictory } from '../../engine/victory';
import { hydrateRedactedState } from '../../network/hydrate';
import { redactForPlayer } from '../../network/redact';
import { VictoryModal } from '../Modals';

/** A wire round trip, like the server's JSON frames. */
const wire = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** What a browser shows for a finished game: the server's view of `viewer`, hydrated. */
const browserView = (truth: GameState, viewer: PlayerId | null) =>
  hydrateRedactedState(wire(redactForPlayer(truth, viewer, { hideOpponentResources: true })), viewer);

describe('VictoryModal online', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  /** The standings as the dialog prints them: one line per row, in order. */
  function standings(state: GameState): string[] {
    act(() => {
      render(<VictoryModal state={state} onInspectBoard={() => {}} />, container);
    });
    return [...container.querySelectorAll('[role="row"]')].map((row) => row.textContent ?? '');
  }

  function finishedGame(end: 'tenVp' | 'emptyBag'): GameState {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 77 });
    state.players.orange.victoryPoints = end === 'tenVp' ? 10 : 4;
    state.players.orange.renewablePlantsBuilt = 3;
    state.players.purple.victoryPoints = 6;
    state.players.purple.devCards.unplayed = ['dev_victoryPoint_01', 'dev_victoryPoint_02', 'dev_cleanup_03'];
    state.players.purple.renewablePlantsBuilt = 1;
    state.players.pink.victoryPoints = 5;
    state.players.pink.devCards.unplayed = ['dev_victoryPoint_03'];
    if (end === 'tenVp') {
      state.winner = 'orange';
    } else {
      state.eventBag = [];
      state.winner = evaluateEmptyBagVictory(state).winner;
    }
    state.phase = 'GameEnd';
    return state;
  }

  it.each([['tenVp'], ['emptyBag']] as const)(
    'counts every unrevealed Victory Point card in the standings of each seat (%s end)',
    (end) => {
      const truth = finishedGame(end);
      const expected = standings(truth);
      expect(expected).toHaveLength(4);
      // Purple's two secret VP cards make 6 + 2 = 8; pink's one makes 5 + 1 = 6.
      const purpleRow = expected.find((row) => row.includes('Purple'))!;
      const pinkRow = expected.find((row) => row.includes('Pink'))!;
      if (end === 'tenVp') {
        expect(purpleRow).toContain('8VP');
        expect(pinkRow).toContain('6VP');
      } else {
        expect(purpleRow).toContain('8 VP');
        expect(pinkRow).toContain('6 VP');
      }

      for (const viewer of [...truth.playerOrder, null]) {
        expect(standings(browserView(truth, viewer)), `seen from ${viewer ?? 'a spectator'}`).toEqual(expected);
      }
    }
  );
});
