import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import { GameAction, GameState } from '../../engine/types';
import { TradeModal } from '../Modals';

function click(container: HTMLElement, testId: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
  expect(el, testId).not.toBeNull();
  act(() => {
    el!.click();
  });
}

function stateWithOrangeOnHarbor(): GameState {
  const state = createInitialGameState({ setupMode: 'first', placement: 'fixed', seed: 42 });
  state.phase = 'ActionPhase';
  const harbor = state.board.harbors.find((h) => h.ratio === 3)!;
  const node = state.board.intersections[harbor.nodeIds[0]]!;
  node.building = { playerId: 'orange', type: 'town' };
  state.players.orange!.resources = { lumber: 4, brick: 0, natural_fiber: 0, food: 0, steel: 2 };
  return state;
}

describe('TradeModal card pickers', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('trades 4 of a resource with the supply and names the trade on the button', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    act(() => {
      render(<TradeModal state={stateWithOrangeOnHarbor()} onDispatch={onDispatch} onClose={() => {}} />, container);
    });

    // Opens on something affordable (4 lumber) and a different card to get
    click(container, 'supply-receive-brick');
    const btn = container.querySelector('[data-testid="execute-supply-trade-btn"]') as HTMLButtonElement;
    expect(btn.textContent).toBe('Give 4 lumber, get 1 brick');
    click(container, 'execute-supply-trade-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'TRADE_SUPPLY',
      playerId: 'orange',
      give: { lumber: 4 },
      receive: 'brick',
    });
  });

  it('trades at a 3:1 harbor the player has built on', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    act(() => {
      render(<TradeModal state={stateWithOrangeOnHarbor()} onDispatch={onDispatch} onClose={() => {}} />, container);
    });

    click(container, 'trade-tab-harbor');
    // Steel (2 held) is not enough for 3:1; lumber is
    expect((container.querySelector('[data-testid="harbor-give-steel"]') as HTMLButtonElement).disabled).toBe(true);
    click(container, 'harbor-give-lumber');
    click(container, 'harbor-receive-food');
    click(container, 'execute-harbor-trade-btn');
    const action = onDispatch.mock.calls[0]![0];
    expect(action).toMatchObject({ type: 'TRADE_HARBOR', playerId: 'orange', give: { lumber: 3 }, receive: 'food' });
  });

  it('builds a player-to-player offer with the steppers', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    act(() => {
      render(<TradeModal state={stateWithOrangeOnHarbor()} onDispatch={onDispatch} onClose={() => {}} />, container);
    });

    click(container, 'trade-tab-domestic');
    const send = () => container.querySelector('[data-testid="send-domestic-offer-btn"]') as HTMLButtonElement;
    expect(send().disabled).toBe(true);

    click(container, 'trade-auto-offer-toggle'); // off: one player only
    click(container, 'domestic-target-pink');
    click(container, 'domestic-give-steel');
    click(container, 'domestic-give-steel');
    click(container, 'domestic-want-food');
    expect(send().textContent).toBe('Offer 2 steel for 1 food to Pink');
    click(container, 'send-domestic-offer-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'OFFER_TRADE',
      playerId: 'orange',
      targetPlayerId: 'pink',
      give: { steel: 2 },
      want: { food: 1 },
    });
  });
});
