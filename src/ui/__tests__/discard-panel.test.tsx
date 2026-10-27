import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import type { GameAction } from '../../engine/types';
import { applyDevScenario } from '../devScenarios';
import { DiscardPanel, type DiscardDecision } from '../DiscardPanel';
import { getProductionNumbers } from '../productionNumbers';
import { TabletopApp } from '../TabletopApp';

describe('Discard on a 7: docked panel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  const scenario = () =>
    applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'discard');
  const decision: DiscardDecision = { id: 'dev-discard', type: 'DISCARD_ON_SEVEN', playerId: 'orange', cardsToDiscard: 6 };

  it('replaces the dock instead of covering the table, and lights up the producing hexes', () => {
    window.history.pushState({}, '', '/?scenario=discard&bots=0');
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');

    const panel = container.querySelector('[data-testid="pending-decision-modal"]')!;
    expect(panel).not.toBeNull();
    expect(container.querySelector('[data-testid="bottom-player-dock"]')?.contains(panel)).toBe(true);
    // No backdrop element, and the hand/build dock panels give way to it
    expect(container.querySelector('[data-testid="dock-hand"]')).toBeNull();
    expect(container.querySelector('[data-testid="dock-build"]')).toBeNull();

    const expected = getProductionNumbers(scenario(), 'orange').hexIds;
    const lit = [...container.querySelectorAll('[data-testid^="hex-yours-"]')].map((el) =>
      Number(el.getAttribute('data-testid')!.replace('hex-yours-', ''))
    );
    expect(lit.sort((a, b) => a - b)).toEqual(expected);
    expect(container.querySelectorAll('[data-testid^="hex-dimmed-"]').length).toBe(19 - expected.length);
  });

  it('shows the numbers that give each card, the blocked ones struck out', () => {
    const state = scenario();
    act(() => {
      render(<DiscardPanel state={state} decision={decision} onDispatch={() => {}} />, container);
    });
    const chips = (card: string) =>
      [...container.querySelectorAll(`[data-testid="discard-rolls-${card}"] li`)].map(
        (li) => `${li.getAttribute('data-number')}${li.getAttribute('data-blocked') === 'none' ? '' : ' blocked'}`
      );
    expect(chips('brick')).toEqual(['2', '8 blocked']);
    expect(chips('lumber')).toEqual(['10']);
    expect(chips('steel')).toEqual(['6']);
    expect(container.querySelector('[data-testid="discard-rolls-natural_fiber"]')?.textContent).toBe('none');
  });

  it('sends only the cards picked, and only when the count is right', () => {
    const state = scenario();
    const dispatch = vi.fn<(a: GameAction) => void>();
    act(() => {
      render(<DiscardPanel state={state} decision={decision} onDispatch={dispatch} />, container);
    });
    const click = (testId: string) =>
      act(() => {
        (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
      });
    const confirm = () => container.querySelector('[data-testid="confirm-discard-btn"]') as HTMLButtonElement;

    for (const card of ['steel', 'steel', 'science', 'food', 'food']) click(`discard-card-${card}`);
    expect(confirm().disabled).toBe(true);
    click('discard-card-lumber');
    expect(confirm().disabled).toBe(false);
    click('confirm-discard-btn');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: 'dev-discard',
      response: { cards: { steel: 2, science: 1, food: 2, lumber: 1 } },
    });
  });

  it('shows no cards while the hotseat privacy curtain is up', () => {
    const state = scenario();
    act(() => {
      render(<DiscardPanel state={state} decision={decision} hidden onDispatch={() => {}} />, container);
    });
    expect(container.querySelector('[data-testid="discard-hidden"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="discard-card-"]').length).toBe(0);
    expect((container.querySelector('[data-testid="confirm-discard-btn"]') as HTMLButtonElement).disabled).toBe(true);
  });

  describe('Event discard: Climate Conference penalty', () => {
    const eventDecision: DiscardDecision = {
      id: 'dev-event-discard',
      type: 'EVENT_CARD_CHOICE',
      playerId: 'orange',
      event: 'ClimateConferencePenalty',
      cardCount: 1,
      isOptional: false,
    };

    it('docks into the bottom dock without modal backdrop and illuminates player hexes', () => {
      window.history.pushState({}, '', '/?scenario=eventdiscard&bots=0');
      act(() => {
        render(<TabletopApp />, container);
      });
      window.history.pushState({}, '', '/');

      const panel = container.querySelector('[data-testid="pending-decision-modal"]')!;
      expect(panel).not.toBeNull();
      expect(container.querySelector('[data-testid="bottom-player-dock"]')?.contains(panel)).toBe(true);

      // Verify no full-screen modal backdrop exists
      expect(panel.classList.contains('dp-panel')).toBe(true);
      expect(panel.closest('[style*="position: fixed"]')).toBeNull();

      // Hand and build palettes give way to docked discard panel
      expect(container.querySelector('[data-testid="dock-hand"]')).toBeNull();
      expect(container.querySelector('[data-testid="dock-build"]')).toBeNull();

      // Player producing hexes are highlighted on the board
      const expected = getProductionNumbers(
        applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'eventdiscard'),
        'orange'
      ).hexIds;
      const lit = [...container.querySelectorAll('[data-testid^="hex-yours-"]')].map((el) =>
        Number(el.getAttribute('data-testid')!.replace('hex-yours-', ''))
      );
      expect(lit.sort((a, b) => a - b)).toEqual(expected);
    });

    it('resolves immediately with a single click and omits steppers and confirm button', () => {
      const state = applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'eventdiscard');
      const dispatch = vi.fn<(a: GameAction) => void>();
      act(() => {
        render(<DiscardPanel state={state} decision={eventDecision} onDispatch={dispatch} />, container);
      });

      // Steppers and multi-card confirm button are absent
      expect(container.querySelectorAll('.md-stepper').length).toBe(0);
      expect(container.querySelector('[data-testid="confirm-discard-btn"]')).toBeNull();

      // Prompt explains 1 tap discard
      expect(container.querySelector('.dp-title')?.textContent).toContain('Climate Conference: Orange discards 1 card');
      expect(container.querySelector('.dp-action')?.textContent).toBe('Tap a card to discard');

      // Tapping an available card (e.g. food) immediately resolves with { cardType: 'food' }
      const foodBtn = container.querySelector('[data-testid="discard-card-food"]') as HTMLButtonElement;
      expect(foodBtn.disabled).toBe(false);
      act(() => {
        foodBtn.click();
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'orange',
        decisionId: 'dev-event-discard',
        response: { cardType: 'food' },
      });
    });

    it('disables cards with zero count', () => {
      const state = applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'eventdiscard');
      state.players.orange!.resources.natural_fiber = 0;
      act(() => {
        render(<DiscardPanel state={state} decision={eventDecision} onDispatch={() => {}} />, container);
      });

      const fiberBtn = container.querySelector('[data-testid="discard-card-natural_fiber"]') as HTMLButtonElement;
      expect(fiberBtn.disabled).toBe(true);
      expect(fiberBtn.getAttribute('data-empty')).toBe('true');
    });
  });
});
