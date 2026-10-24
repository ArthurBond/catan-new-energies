import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import { GameAction, GameState, PlayerId } from '../../engine/types';
import { TradeModal } from '../Modals';
import {
  defaultTradePrefs,
  normaliseTradePrefs,
  rememberedTrade,
  tradeRecipients,
  tradeTurnKey,
} from '../gameView';

function click(container: HTMLElement, testId: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
  expect(el, testId).not.toBeNull();
  act(() => {
    el!.click();
  });
}

function actionPhaseState(): GameState {
  const state = createInitialGameState({ setupMode: 'first', placement: 'fixed', seed: 42 });
  state.phase = 'ActionPhase';
  state.players.orange!.resources = { lumber: 2, brick: 0, natural_fiber: 0, food: 0, steel: 2 };
  return state;
}

describe('TradeModal offering to several players', () => {
  let container: HTMLDivElement;
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)!.textContent;
  const order = () =>
    [...container.querySelectorAll('[data-testid^="offer-order-"]')].map((li) =>
      li.getAttribute('data-testid')!.replace('offer-order-', '')
    );
  const open = (props: Partial<Parameters<typeof TradeModal>[0]> = {}) => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    act(() => {
      render(<TradeModal state={actionPhaseState()} onDispatch={onDispatch} onClose={() => {}} {...props} />, container);
    });
    click(container, 'trade-tab-domestic');
    return onDispatch;
  };
  const chooseSteelForFood = () => {
    click(container, 'domestic-give-steel');
    click(container, 'domestic-want-food');
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('starts with everyone, in the order their turns come after yours', () => {
    open();
    expect(container.querySelector('[data-testid="trade-auto-offer-toggle"]')!.getAttribute('aria-checked')).toBe('true');
    expect(order()).toEqual(['purple', 'pink', 'blue']);
    chooseSteelForFood();
    expect(text('send-domestic-offer-btn')).toBe('Offer 1 steel for 1 food to Purple, then Pink, then Blue');
  });

  it('sends the first player and the rest as the fallback order', () => {
    const onDispatch = open();
    chooseSteelForFood();
    click(container, 'send-domestic-offer-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'OFFER_TRADE',
      playerId: 'orange',
      targetPlayerId: 'purple',
      thenOffer: ['pink', 'blue'],
      give: { steel: 1 },
      want: { food: 1 },
    });
  });

  it('lets you reorder the players and leave some out', () => {
    const onPrefsChange = vi.fn();
    const onDispatch = open({ onPrefsChange });
    click(container, 'offer-down-purple'); // pink, purple, blue
    click(container, 'offer-up-blue'); // pink, blue, purple
    click(container, 'offer-include-blue'); // leave blue out
    expect(order()).toEqual(['pink', 'blue', 'purple']);
    chooseSteelForFood();
    expect(text('send-domestic-offer-btn')).toBe('Offer 1 steel for 1 food to Pink, then Purple');
    click(container, 'send-domestic-offer-btn');
    expect(onDispatch).toHaveBeenCalledWith(expect.objectContaining({ targetPlayerId: 'pink', thenOffer: ['purple'] }));
    expect(onPrefsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ order: ['pink', 'blue', 'purple'], skip: ['blue'] })
    );
  });

  it('cannot send when every player is left out', () => {
    open();
    for (const pid of ['purple', 'pink', 'blue']) click(container, `offer-include-${pid}`);
    chooseSteelForFood();
    const send = container.querySelector('[data-testid="send-domestic-offer-btn"]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.textContent).toBe('Include at least one player to offer to');
  });

  it('reports a sent offer so it can be remembered', () => {
    const onOffered = vi.fn();
    open({ onOffered });
    chooseSteelForFood();
    click(container, 'send-domestic-offer-btn');
    expect(onOffered).toHaveBeenCalledWith({ steel: 1 }, { food: 1 });
  });

  it('comes back with the same offer and order when reopened in the same turn', () => {
    const state = actionPhaseState();
    const remembered = rememberedTrade(state, { turnKey: tradeTurnKey(state), give: { steel: 2 }, want: { food: 1 } });
    const prefs = { ...defaultTradePrefs(state, 'orange'), order: ['blue', 'purple', 'pink'] as PlayerId[] };
    act(() => {
      render(
        <TradeModal state={state} onDispatch={() => {}} onClose={() => {}} remembered={remembered} prefs={prefs} />,
        container
      );
    });
    // Opens straight on the Players tab with the offer filled in
    expect(text('send-domestic-offer-btn')).toBe('Offer 2 steel for 1 food to Blue, then Purple, then Pink');
  });

  it('single-player mode asks just the player you pick', () => {
    const onDispatch = open();
    click(container, 'trade-auto-offer-toggle');
    click(container, 'domestic-target-blue');
    chooseSteelForFood();
    expect(text('send-domestic-offer-btn')).toBe('Offer 1 steel for 1 food to Blue');
    click(container, 'send-domestic-offer-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'OFFER_TRADE',
      playerId: 'orange',
      targetPlayerId: 'blue',
      give: { steel: 1 },
      want: { food: 1 },
    });
  });
});

describe('what a trade remembers', () => {
  it('keeps the offer for the rest of the turn and resets it for the next', () => {
    const state = actionPhaseState();
    const memory = { turnKey: tradeTurnKey(state), give: { steel: 2 }, want: { food: 1 } };
    expect(rememberedTrade(state, memory)).toEqual({ give: { steel: 2 }, want: { food: 1 } });
    expect(rememberedTrade(state, null)).toBeNull();

    // The next player's turn, and orange's next turn, both start a new trade
    expect(rememberedTrade({ ...state, activePlayerId: 'purple' }, memory)).toBeNull();
    expect(rememberedTrade({ ...state, currentTurn: state.currentTurn + 1 }, memory)).toBeNull();
  });

  it('only offers cards you still hold', () => {
    const state = actionPhaseState();
    const memory = { turnKey: tradeTurnKey(state), give: { steel: 5, brick: 1 }, want: { food: 1 } };
    expect(rememberedTrade(state, memory)).toEqual({ give: { steel: 2 }, want: { food: 1 } });
  });

  it('drops players who left the table from a saved order and adds new ones', () => {
    const state = actionPhaseState();
    const prefs = {
      everyone: true,
      order: ['blue', 'ghost'] as PlayerId[],
      skip: ['ghost' as PlayerId],
      single: 'ghost' as PlayerId,
    };
    const fixed = normaliseTradePrefs(state, 'orange', prefs);
    expect(fixed.order).toEqual(['blue', 'purple', 'pink']);
    expect(fixed.skip).toEqual([]);
    expect(fixed.single).toBe('purple');
  });

  it('the default order follows turn order from the player after you', () => {
    const state = actionPhaseState();
    expect(defaultTradePrefs(state, 'pink').order).toEqual(['blue', 'orange', 'purple']);
    expect(tradeRecipients(defaultTradePrefs(state, 'orange'))).toEqual(['purple', 'pink', 'blue']);
  });
});
