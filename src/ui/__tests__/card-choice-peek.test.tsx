import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseBotAction } from '../../ai/bot';
import { applyAction } from '../../engine/reducer';
import { createInitialGameState } from '../../engine/setup';
import type { GameState, PendingDecision } from '../../engine/types';
import { applyDevScenario } from '../devScenarios';
import { PendingDecisionBanner, eventChoiceUnhideSub } from '../Modals';
import { TabletopApp } from '../TabletopApp';

const q = (container: ParentNode, testId: string) => container.querySelector(`[data-testid="${testId}"]`);
const click = (el: Element | null) =>
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
const escape = () =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

describe('Hiding a card-choice prompt to look at the board', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    window.history.pushState({}, '', '/');
    vi.useRealTimers();
  });

  const open = (search: string) => {
    window.history.pushState({}, '', search);
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');
  };

  it('opens the next tied player prompt un-hidden', () => {
    open('/?scenario=cardchoicetie&bots=0');
    expect(q(container, 'pending-decision-modal')).not.toBeNull();

    click(q(container, 'peek-board-btn'));
    expect(q(container, 'pending-decision-modal')).toBeNull();
    expect(q(container, 'peeking-card-choice-banner')).not.toBeNull();

    // Back to the prompt, take the reward: the next player's prompt must not inherit the hidden state
    click(q(container, 'banner-unhide-card-choice-btn'));
    click(q(container, 'decision-card-lumber'));
    expect(q(container, 'pending-decision-modal')).not.toBeNull();
    expect(q(container, 'peeking-card-choice-banner')).toBeNull();
    expect(q(container, 'unhide-card-choice-btn')).toBeNull();
  });

  it('puts the prompt back on Escape', () => {
    open('/?scenario=cardchoice&bots=0');
    click(q(container, 'peek-board-btn-bottom'));
    expect(q(container, 'pending-decision-modal')).toBeNull();
    escape();
    expect(q(container, 'pending-decision-modal')).not.toBeNull();
  });

  it('says what waits behind the hidden prompt, per event', () => {
    expect(eventChoiceUnhideSub('GovernmentFunding')).toMatch(/development card/);
    expect(eventChoiceUnhideSub('ClimateConferenceReward')).toMatch(/free card/);
    expect(eventChoiceUnhideSub('SustainableProduction')).toMatch(/free card/);
  });

  it('shows a compact hand count that is not part of the card button', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    state.players.orange.resources.lumber = 3;
    state.supply.resources.lumber = 0;
    const decision: PendingDecision = {
      id: 'cc-1',
      type: 'EVENT_CARD_CHOICE',
      playerId: 'orange',
      event: 'SustainableProduction',
      cardCount: 1,
      isOptional: false,
    };
    act(() => {
      render(<PendingDecisionBanner state={state} decision={decision} onDispatch={() => {}} />, container);
    });
    const badge = q(container, 'in-hand-lumber')!;
    expect(badge.textContent).toBe('×3');
    // Outside the card, so an empty supply (which dims the card) does not dim it
    expect(q(container, 'decision-card-lumber')!.contains(badge)).toBe(false);
    expect(q(container, 'decision-card-lumber')!.getAttribute('data-empty')).toBe('true');
    expect(q(container, 'decision-take-dev-card')).toBeNull();
  });
});

describe('Escape on the steal dialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    window.history.pushState({}, '', '/');
    vi.useRealTimers();
  });

  const scenario = () =>
    applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'moveinspector');

  /** A hex to move the inspector to that has someone to steal from */
  const hexWithVictim = (state: GameState) => {
    for (const h of state.board.hexes) {
      if (h.hasInspector || h.hasHazard) continue;
      const after = applyAction(state, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'orange',
        decisionId: 'dev-move-inspector',
        response: { hexId: h.id },
      });
      if (after.pendingDecisions[0]?.type === 'STEAL_TARGET') return h.id;
    }
    throw new Error('no hex with a victim');
  };

  it('undoes the inspector move for the human who has to choose', () => {
    window.history.pushState({}, '', '/?scenario=moveinspector&bots=0');
    act(() => {
      render(<TabletopApp />, container);
    });
    const hexId = hexWithVictim(scenario());
    click(container.querySelector(`[data-hex="${hexId}"]`));
    expect(container.querySelector('[data-testid^="steal-target-"]')).not.toBeNull();
    expect(q(container, 'cancel-steal-target-btn')).not.toBeNull();

    escape();
    expect(container.querySelector('[data-testid^="steal-target-"]')).toBeNull();
    expect(q(container, 'game-log')!.textContent).not.toContain('moved the Inspector');
  });

  it('leaves a bot move alone', () => {
    // The bot's own move must leave a steal pending, or there is nothing to wrongly undo
    const botMove = chooseBotAction(scenario(), 'orange', { personality: 'Balanced', difficulty: 'Normal' });
    expect(applyAction(scenario(), botMove).pendingDecisions[0]?.type).toBe('STEAL_TARGET');

    vi.useFakeTimers();
    window.history.pushState({}, '', '/?scenario=moveinspector&bots=all');
    act(() => {
      render(<TabletopApp />, container);
    });
    const log = () => q(container, 'game-log')!.textContent ?? '';

    // Let orange (a bot) move the inspector, then stop the clock before it picks someone to steal from
    for (let ms = 0; ms < 10_000 && !log().includes('moved the Inspector'); ms += 50) {
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    expect(log()).toContain('moved the Inspector');
    expect(log()).not.toContain('stole');

    escape();
    expect(log()).toContain('moved the Inspector');
  });
});
