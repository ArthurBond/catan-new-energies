import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../engine/reducer';
import { createInitialGameState } from '../../engine/setup';
import type { GameAction, GameState } from '../../engine/types';
import { PendingDecisionBanner, TradeModal } from '../Modals';

const NONE = { lumber: 0, brick: 0, natural_fiber: 0, food: 0, steel: 0 };

function click(container: HTMLElement, testId: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
  expect(el, testId).not.toBeNull();
  act(() => {
    el!.click();
  });
}

const byId = (container: HTMLElement, testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;

/** Orange's turn; Purple and Blue hold a brick, Pink none. */
function tableState(): GameState {
  const state = createInitialGameState({
    setupMode: 'first',
    placement: 'fixed',
    seed: 42,
    playerNames: { orange: 'Orange', purple: 'Purple', pink: 'Pink', blue: 'Blue' },
  });
  state.phase = 'ActionPhase';
  state.activePlayerId = 'orange';
  for (const pid of state.playerOrder) {
    const p = state.players[pid]!;
    p.resources = { ...NONE };
    p.science = 0;
    p.energy = 0;
  }
  state.players.orange!.resources = { ...NONE, steel: 3, food: 2, lumber: 1 };
  state.players.purple!.resources = { ...NONE, brick: 2, steel: 1 };
  state.players.blue!.resources = { ...NONE, brick: 1, food: 1 };
  return state;
}

const answerAs = (s: GameState, response: unknown) => {
  const head = s.pendingDecisions[0]!;
  return applyAction(s, { type: 'RESOLVE_PENDING_DECISION', playerId: head.playerId, decisionId: head.id, response });
};

describe('Trade dialog: Ask for cards', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  const open = (state: GameState, onDispatch: (a: GameAction) => void = () => {}, onClose = () => {}) => {
    act(() => {
      render(<TradeModal state={state} onDispatch={onDispatch} onClose={onClose} />, container);
    });
    click(container, 'trade-tab-domestic');
  };

  it('offers a choice between making an offer and asking for cards, starting on the offer', () => {
    open(tableState());
    expect(byId(container, 'trade-mode-offer')!.getAttribute('data-selected')).toBe('true');
    expect(byId(container, 'trade-mode-ask')!.getAttribute('data-selected')).toBe('false');
    expect(byId(container, 'send-domestic-offer-btn')).not.toBeNull();
    expect(byId(container, 'ask-for-cards-panel')).toBeNull();

    click(container, 'trade-mode-ask');
    expect(byId(container, 'trade-mode-ask')!.getAttribute('data-selected')).toBe('true');
    expect(byId(container, 'ask-for-cards-panel')).not.toBeNull();
    expect(byId(container, 'send-domestic-offer-btn')).toBeNull();
    expect(byId(container, 'trade-auto-offer-toggle')).toBeNull();

    click(container, 'trade-mode-offer');
    expect(byId(container, 'send-domestic-offer-btn')).not.toBeNull();
    expect(byId(container, 'ask-for-cards-panel')).toBeNull();
  });

  it('asks for the chosen cards without saying what is given', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    const onClose = vi.fn();
    open(tableState(), onDispatch, onClose);
    click(container, 'trade-mode-ask');

    const send = () => byId(container, 'send-trade-request-btn')!;
    expect(send().disabled).toBe(true);
    expect(send().textContent).toBe('Choose the cards you want');

    click(container, 'request-ask-brick');
    expect(send().textContent).toBe('Ask everyone for 1 brick');
    click(container, 'request-ask-steel');
    click(container, 'request-ask-steel');
    expect(send().textContent).toBe('Ask everyone for 1 brick, 2 steel');

    click(container, 'send-trade-request-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'REQUEST_TRADE',
      playerId: 'orange',
      ask: { brick: 1, steel: 2 },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('lets you take a card back off the list', () => {
    open(tableState());
    click(container, 'trade-mode-ask');
    click(container, 'request-ask-brick');
    const minus = container.querySelector('[aria-label="One less brick"]') as HTMLButtonElement;
    act(() => minus.click());
    expect(byId(container, 'send-trade-request-btn')!.disabled).toBe(true);
  });

  it('does not let you ask for more energy than you can hold', () => {
    const state = tableState();
    state.players.orange!.energy = 4;
    open(state);
    click(container, 'trade-mode-ask');
    click(container, 'request-ask-energy');
    expect(byId(container, 'request-ask-energy')!.disabled).toBe(true); // one more would be 6
    expect(byId(container, 'send-trade-request-btn')!.textContent).toBe('Ask everyone for 1 energy');
  });

  it('keeps the existing offer flow working in offer mode', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    open(tableState(), onDispatch);
    click(container, 'trade-auto-offer-toggle');
    click(container, 'domestic-target-pink');
    click(container, 'domestic-give-steel');
    click(container, 'domestic-want-food');
    click(container, 'send-domestic-offer-btn');
    expect(onDispatch.mock.calls[0]![0]).toMatchObject({ type: 'OFFER_TRADE', targetPlayerId: 'pink' });
  });
});

describe('Reply prompt: "Orange wants 1 brick. What would you want for it?"', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  function show(state: GameState, onDispatch: (a: GameAction) => void = () => {}) {
    act(() => {
      render(<PendingDecisionBanner state={state} decision={state.pendingDecisions[0]!} onDispatch={onDispatch} />, container);
    });
  }
  const asked = () => applyAction(tableState(), { type: 'REQUEST_TRADE', playerId: 'orange', ask: { brick: 1 } });

  it('names who wants what and whose reply it is', () => {
    show(asked());
    const modal = byId(container, 'pending-decision-modal')!;
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Orange wants 1 brick');
    expect(modal.textContent).toContain('What would you want for it, Purple?');
    expect(byId(container, 'trade-request-reply')!.getAttribute('role')).toBe('dialog');
  });

  it('cannot offer until something is wanted in return, and cannot want the card it gives', () => {
    show(asked());
    expect(byId(container, 'trade-reply-offer-btn')!.disabled).toBe(true);
    expect(byId(container, 'trade-reply-offer-btn')!.textContent).toBe('Choose what you want for it');
    expect(byId(container, 'trade-reply-want-brick')!.disabled).toBe(true);
  });

  it('replies with a counter-offer built from the steppers', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    const state = asked();
    show(state, onDispatch);
    click(container, 'trade-reply-want-steel');
    click(container, 'trade-reply-want-steel');
    expect(byId(container, 'trade-reply-offer-btn')!.textContent).toBe('Offer 1 brick for 2 steel');
    click(container, 'trade-reply-offer-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'purple',
      decisionId: state.pendingDecisions[0]!.id,
      response: { want: { steel: 2 } },
    });
  });

  it('passes', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    const state = asked();
    show(state, onDispatch);
    click(container, 'trade-reply-pass-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'purple',
      decisionId: state.pendingDecisions[0]!.id,
      response: { pass: true },
    });
  });

  it('cannot want more cards than the requester holds (their hand size is public)', () => {
    const state = asked();
    state.players.orange!.resources = { ...NONE, steel: 1, food: 1 }; // two cards
    show(state);
    click(container, 'trade-reply-want-steel');
    click(container, 'trade-reply-want-steel');
    click(container, 'trade-reply-want-food'); // no room left: two cards is all they hold
    // Two cards chosen in total: nothing more can be added, whichever kind
    expect(byId(container, 'trade-reply-want-lumber')!.disabled).toBe(true);
    expect(byId(container, 'trade-reply-want-food')!.disabled).toBe(true);
    expect(byId(container, 'trade-reply-offer-btn')!.textContent).toBe('Offer 1 brick for 2 steel');
  });

  it('starts fresh for the next player who is asked', () => {
    let state = asked();
    show(state);
    click(container, 'trade-reply-want-steel');
    state = answerAs(state, { pass: true });
    expect(state.pendingDecisions[0]).toMatchObject({ playerId: 'blue' });
    show(state);
    expect(byId(container, 'trade-reply-offer-btn')!.disabled).toBe(true);
    expect(container.textContent).toContain('What would you want for it, Blue?');
  });
});

describe('Choice prompt: every offer, take one or say no thanks', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  function show(state: GameState, onDispatch: (a: GameAction) => void = () => {}) {
    act(() => {
      render(<PendingDecisionBanner state={state} decision={state.pendingDecisions[0]!} onDispatch={onDispatch} />, container);
    });
  }
  /** Orange asked for a brick; Purple wants 2 steel, Blue wants 2 food (Orange holds 3 steel, 2 food). */
  function choice(): GameState {
    let s = applyAction(tableState(), { type: 'REQUEST_TRADE', playerId: 'orange', ask: { brick: 1 } });
    s = answerAs(s, { want: { steel: 2 } });
    s = answerAs(s, { want: { food: 2 } });
    return s;
  }

  it('lists every offer together with what you get and what you give', () => {
    const state = choice();
    show(state);
    expect(state.pendingDecisions[0]!.type).toBe('TRADE_REQUEST_CHOICE');
    const modal = byId(container, 'trade-request-choice')!;
    expect(modal.textContent).toContain('2 offers for 1 brick');
    for (const pid of ['purple', 'blue']) {
      const row = byId(container, `request-offer-${pid}`)!;
      expect(row.getAttribute('data-affordable')).toBe('true');
      expect(row.textContent).toContain('You get');
      expect(row.textContent).toContain('1× Brick');
      expect(byId(container, `accept-request-offer-${pid}`)!.disabled).toBe(false);
    }
    expect(byId(container, 'request-offer-purple')!.textContent).toContain('2× Steel');
    expect(byId(container, 'request-offer-blue')!.textContent).toContain('2× Food');
  });

  it('accepts the chosen offer', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    const state = choice();
    show(state, onDispatch);
    click(container, 'accept-request-offer-blue');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: state.pendingDecisions[0]!.id,
      response: { takeOfferFrom: 'blue' },
    });
  });

  it('says no thanks to all of them', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    const state = choice();
    show(state, onDispatch);
    click(container, 'decline-request-offers-btn');
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: state.pendingDecisions[0]!.id,
      response: { decline: true },
    });
  });

  it('greys out an offer you cannot afford and will not accept it', () => {
    const onDispatch = vi.fn<(a: GameAction) => void>();
    const state = choice();
    state.players.orange!.resources.steel = 1; // Purple's offer costs 2 steel
    show(state, onDispatch);
    const row = byId(container, 'request-offer-purple')!;
    expect(row.getAttribute('data-affordable')).toBe('false');
    expect(byId(container, 'accept-request-offer-purple')!.disabled).toBe(true);
    expect(byId(container, 'request-offer-reason-purple')!.textContent).toBe('You need 2 steel (you have 1)');
    expect(row.querySelector('.tr-chip[data-short="true"]')).not.toBeNull();
    click(container, 'accept-request-offer-purple');
    expect(onDispatch).not.toHaveBeenCalled();
    // The affordable offer and No thanks still work
    expect(byId(container, 'accept-request-offer-blue')!.disabled).toBe(false);
  });

  it('shows a single offer in the singular', () => {
    let s = applyAction(tableState(), { type: 'REQUEST_TRADE', playerId: 'orange', ask: { brick: 1 } });
    s = answerAs(s, { pass: true });
    s = answerAs(s, { want: { food: 1 } });
    show(s);
    expect(byId(container, 'trade-request-choice')!.textContent).toContain('An offer for 1 brick');
  });
});
