import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../engine/reducer';
import { createInitialGameState } from '../../engine/setup';
import type { GameState } from '../../engine/types';
import type { LobbyConfig, SeatConfig } from '../Modals';
import { TabletopApp } from '../TabletopApp';

const SAVED_GAME_KEY = 'catan_new_energies_saved_game_v2';

const seat = (playerId: SeatConfig['playerId'], name: string): SeatConfig => ({
  playerId,
  name,
  controller: 'human',
  botStrategy: 'Balanced',
  botDifficulty: 'normal',
});

function hotseatConfig(privacyCurtain: boolean): LobbyConfig {
  return {
    playerCount: 4,
    setupMode: 'first',
    placement: 'fixed',
    seed: 42,
    botSpeed: 'normal',
    privacyCurtain,
    roomCode: '',
    seats: {
      orange: seat('orange', 'Orange'),
      purple: seat('purple', 'Purple'),
      pink: seat('pink', 'Pink'),
      blue: seat('blue', 'Blue'),
    },
  };
}

/** Orange's turn, with one private line from each of Purple and Orange, written by the real engine. */
function stateWithPrivateLines(): GameState {
  let state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
  state.phase = 'ActionPhase';
  state.activePlayerId = 'purple';
  state.players.purple.resources.lumber = 4;
  state = applyAction(state, {
    type: 'TRADE_SUPPLY',
    playerId: 'purple',
    give: { lumber: 4 },
    receive: 'brick',
  });
  state.activePlayerId = 'orange';
  state.players.orange.resources.lumber = 4;
  return applyAction(state, {
    type: 'TRADE_SUPPLY',
    playerId: 'orange',
    give: { lumber: 4 },
    receive: 'steel',
  });
}

describe('hotseat activity feed with hidden hands', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // A plain in-memory store: the saved game is how a test hands the app its starting state
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    vi.unstubAllGlobals();
  });

  const open = (privacyCurtain: boolean) => {
    localStorage.setItem(
      SAVED_GAME_KEY,
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        state: stateWithPrivateLines(),
        config: hotseatConfig(privacyCurtain),
      })
    );
    act(() => {
      render(<TabletopApp />, container);
    });
  };
  const feed = () => container.querySelector('[data-testid="game-log"]')?.textContent ?? '';
  const inspect = (pid: string) =>
    act(() => {
      (container.querySelector(`[data-testid="corner-station-${pid}"]`) as HTMLButtonElement).click();
    });

  it('the acting human reads their own lines; inspecting another seat does not unmask that seat', () => {
    open(true);
    // Orange is acting: Orange's trade is in full, Purple's is not
    expect(feed()).toContain('Orange traded with supply to receive 1 steel.');
    expect(feed()).toContain('Purple traded with supply to receive 1 card.');
    expect(feed()).not.toContain('1 brick');

    inspect('purple');
    expect(container.querySelector('[data-testid="corner-station-purple"]')?.getAttribute('data-inspected')).toBe('true');
    expect(feed()).toContain('Orange traded with supply to receive 1 steel.');
    expect(feed()).toContain('Purple traded with supply to receive 1 card.');
    expect(feed()).not.toContain('1 brick');
  });

  it('inspecting another human seat hides that seat’s hand in the dock', () => {
    open(true);
    expect(container.querySelector('[data-testid="organiser-count-steel"]')).not.toBeNull();
    inspect('purple');
    expect(container.querySelector('[data-testid="organiser-redacted"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="organiser-count-steel"]')).toBeNull();
    // Back on the device's own seat the hand is shown again
    inspect('orange');
    expect(container.querySelector('[data-testid="organiser-count-steel"]')).not.toBeNull();
  });

  it('puts the curtain up for the next human even when a bot played in between', () => {
    vi.useFakeTimers();
    try {
      const config = hotseatConfig(true);
      config.botSpeed = 'instant';
      config.seats.purple = { ...config.seats.purple, controller: 'bot' };
      config.seats.blue = { ...config.seats.blue, controller: 'bot' };
      localStorage.setItem(
        SAVED_GAME_KEY,
        JSON.stringify({ version: 2, savedAt: Date.now(), state: stateWithPrivateLines(), config })
      );
      act(() => {
        render(<TabletopApp />, container);
      });
      const root = () => container.querySelector('[data-acting-player]');
      const curtain = () => container.querySelector('[data-testid="privacy-curtain-modal"]');

      act(() => {
        (container.querySelector('[data-testid="action-end-turn-btn"]') as HTMLButtonElement).click();
      });
      expect(root()?.getAttribute('data-acting-player')).toBe('purple');
      expect(curtain()).toBeNull();

      // Purple (a bot) plays its whole turn, then the device has to go from Orange to Pink
      for (let i = 0; i < 200 && !curtain(); i++) {
        act(() => {
          vi.advanceTimersByTime(50);
        });
      }
      expect(root()?.getAttribute('data-acting-player')).toBe('pink');
      expect(curtain()?.textContent).toContain('Pink');
      expect(feed()).not.toContain('1 steel');
    } finally {
      vi.useRealTimers();
    }
  });

  it('with an open table nothing is redacted', () => {
    open(false);
    inspect('purple');
    expect(container.querySelector('[data-testid="organiser-redacted"]')).toBeNull();
    expect(feed()).toContain('Orange traded with supply to receive 1 steel.');
    expect(feed()).toContain('Purple traded with supply to receive 1 brick.');
  });
});
