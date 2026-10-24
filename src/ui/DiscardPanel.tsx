/**
 * CATAN: New Energies — discard on a 7, as a panel docked at the bottom of the table
 *
 * Takes the place of the action dock while a player has to discard. There is no backdrop, so the
 * island stays in view (and can still be panned and zoomed): the player's towns and cities are
 * highlighted on the board and each card shows the rolls that give it, to help pick what to keep.
 */

import 'preact/compat';
import { useState } from 'preact/hooks';
import type { GameAction, GameState, PendingDecision } from '../engine/types';
import './discard-panel.css';
import { BLOCKED_LABEL, CardKey, getProductionNumbers, ProducingNumber, ProductionNumbers } from './productionNumbers';
import { PlayerBadge } from './PlayersRail';
import { CARD_METADATA, PLAYER_THEMES } from './theme';
import { ResourceIconSvg } from './WoodenPiecesSvg';

export type EventDiscardDecision = Extract<PendingDecision, { type: 'EVENT_CARD_CHOICE' }> & {
  event: 'ClimateConferencePenalty';
};

export type DiscardDecision =
  | Extract<PendingDecision, { type: 'DISCARD_ON_SEVEN' }>
  | EventDiscardDecision;

export function isDiscardDecision(
  decision: PendingDecision | null | undefined
): decision is DiscardDecision {
  if (!decision) return false;
  if (decision.type === 'DISCARD_ON_SEVEN') return true;
  if (decision.type === 'EVENT_CARD_CHOICE' && decision.event === 'ClimateConferencePenalty') return true;
  return false;
}

const CARD_ORDER: CardKey[] = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'];

function RollChips({ card, numbers }: { card: CardKey; numbers: ProducingNumber[] }) {
  const meta = CARD_METADATA[card];
  if (numbers.length === 0) {
    return (
      <span
        className="dp-none"
        title={
          card === 'science'
            ? 'Only cities give science, and you have none yet'
            : `None of your towns or cities touch ${meta.label.toLowerCase()}`
        }
      >
        none
      </span>
    );
  }
  const summary = numbers
    .map((n) => (n.blockedBy ? `${n.number} (${BLOCKED_LABEL[n.blockedBy]})` : `${n.number}`))
    .join(', ');
  return (
    <ul className="dp-rolls" aria-label={`Rolls that give you ${meta.label}: ${summary}`}>
      {numbers.map((n) => (
        <li
          key={`${n.number}-${n.blockedBy ?? ''}`}
          className="dp-roll"
          data-number={n.number}
          data-hot={n.number === 6 || n.number === 8 ? 'true' : 'false'}
          data-blocked={n.blockedBy ?? 'none'}
          title={
            n.blockedBy
              ? `${n.number}: ${BLOCKED_LABEL[n.blockedBy]}`
              : `${n.number}: ${n.count} ${n.count === 1 ? 'card' : 'cards'} when rolled`
          }
        >
          {n.number}
          {n.count > 1 && <small>×{n.count}</small>}
        </li>
      ))}
    </ul>
  );
}

export function DiscardPanel({
  state,
  decision,
  production,
  hidden,
  onDispatch,
}: {
  state: GameState;
  decision: DiscardDecision;
  /** What the player's buildings produce; worked out here when the parent has not already */
  production?: ProductionNumbers;
  /** Hotseat privacy curtain is up: show no cards */
  hidden?: boolean;
  onDispatch: (action: GameAction) => void;
}) {
  const isEvent = decision.type === 'EVENT_CARD_CHOICE';
  const player = state.players[decision.playerId]!;
  const pTheme = PLAYER_THEMES[decision.playerId];
  const [discardCounts, setDiscardCounts] = useState<Partial<Record<CardKey, number>>>({});

  const rolls = (production ?? getProductionNumbers(state, decision.playerId)).byCard;
  const totalSelected = Object.values(discardCounts).reduce((acc, v) => acc + (v || 0), 0);
  const needed = isEvent ? decision.cardCount : decision.cardsToDiscard;
  const limit = player.hasWarehouse ? 10 : 7;
  const ready = totalSelected === needed;

  const confirm = () => {
    // Send only the cards actually chosen (no zero entries)
    const cards = Object.fromEntries(Object.entries(discardCounts).filter(([, n]) => (n ?? 0) > 0));
    onDispatch({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: decision.playerId,
      decisionId: decision.id,
      response: { cards },
    });
    setDiscardCounts({});
  };

  return (
    <section
      className="dp-panel"
      data-testid="pending-decision-modal"
      role="group"
      aria-labelledby="discard-title"
      style={{ ['--dp-accent' as string]: pTheme.fill }}
    >
      <div className="dp-info">
        <div className="dp-head">
          <PlayerBadge playerId={decision.playerId} size={26} />
          <h3 className="dp-title" id="discard-title">
            {isEvent
              ? `Climate Conference: ${player.name} discards 1 card`
              : `Seven! ${player.name} discards ${needed} card${needed > 1 ? 's' : ''}`}
          </h3>
        </div>
        <p className="dp-sub">
          {isEvent
            ? 'Highest local footprint at the table. Tap the card you wish to discard.'
            : `Hand limit is ${limit}, so half goes back to the supply. Tap cards to choose which.`}
        </p>
        <p className="dp-hint">
          Numbers under a card are the rolls that give it to you. Your towns and cities glow on the board.
        </p>
      </div>

      {hidden ? (
        <div className="dp-cards dp-cards-hidden" data-testid="discard-hidden">
          Your cards stay hidden until you take the device.
        </div>
      ) : (
        <div className="dp-cards">
          {CARD_ORDER.map((k) => {
            const held = k === 'science' ? player.science : player.resources[k];
            const cur = discardCounts[k] || 0;
            const meta = CARD_METADATA[k];
            const countLeft = isEvent ? held : held - cur;
            const canAdd = isEvent ? held > 0 && !hidden : cur < held && totalSelected < needed;

            const handleCardClick = () => {
              if (isEvent) {
                if (held > 0 && !hidden) {
                  onDispatch({
                    type: 'RESOLVE_PENDING_DECISION',
                    playerId: decision.playerId,
                    decisionId: decision.id,
                    response: { cardType: k },
                  });
                }
              } else {
                setDiscardCounts({ ...discardCounts, [k]: Math.min(held, cur + 1) });
              }
            };

            return (
              <div key={k} className="dp-col">
                <button
                  type="button"
                  className="tt-res-card md-pick dp-pick"
                  data-testid={`discard-card-${k}`}
                  data-empty={countLeft === 0 ? 'true' : 'false'}
                  disabled={!canAdd}
                  onClick={handleCardClick}
                  aria-label={
                    isEvent
                      ? `Discard one ${meta.label} (${held} in hand)`
                      : `Discard one ${meta.label} (${countLeft} left in hand)`
                  }
                  style={{
                    ['--res-fill' as string]: meta.cardFill,
                    ['--res-border' as string]: meta.border,
                    ['--res-text' as string]: meta.textColor,
                  }}
                >
                  <svg width="32" height="32" viewBox="-14 -14 28 28" aria-hidden="true" style={{ marginTop: '-8px' }}>
                    <circle r="12" fill={meta.bg} opacity={0.32} />
                    <ResourceIconSvg type={k} scale={1.05} />
                  </svg>
                  <span className="tt-res-label">{meta.shortLabel}</span>
                  <span className="tt-res-count" data-testid={`discard-held-${k}`}>
                    {countLeft}
                  </span>
                </button>
                {!isEvent && (
                  <div className="md-stepper">
                    <button
                      type="button"
                      aria-label={`Keep one ${meta.label}`}
                      disabled={cur === 0}
                      onClick={() => setDiscardCounts({ ...discardCounts, [k]: Math.max(0, cur - 1) })}
                    >
                      −
                    </button>
                    <span aria-live="polite">{cur}</span>
                    <button
                      type="button"
                      aria-label={`Discard one ${meta.label}`}
                      disabled={!canAdd}
                      onClick={() => setDiscardCounts({ ...discardCounts, [k]: Math.min(held, cur + 1) })}
                    >
                      +
                    </button>
                  </div>
                )}
                <div className="dp-rolls-slot" data-testid={`discard-rolls-${k}`}>
                  <RollChips card={k} numbers={rolls[k]} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="dp-action">
        {isEvent ? (
          <>
            <div className="dp-progress-label">
              {hidden ? `${needed} to discard` : 'Tap a card to discard'}
            </div>
            <p className="dp-hint" style={{ textAlign: 'center', margin: 0 }}>
              1 tap to discard
            </p>
          </>
        ) : (
          <>
            <div className="dp-progress-label" aria-hidden="true">
              {hidden ? `${needed} to discard` : `${totalSelected} of ${needed} chosen`}
            </div>
            <div className="dp-progress" aria-hidden="true">
              <div style={{ width: `${hidden ? 0 : (totalSelected / needed) * 100}%` }} />
            </div>
            <button
              type="button"
              className={`tt-cta dp-confirm${ready ? ' is-ready' : ''}`}
              data-testid="confirm-discard-btn"
              disabled={!ready || hidden}
              onClick={confirm}
            >
              {ready ? `Discard ${needed} card${needed > 1 ? 's' : ''}` : `Choose ${needed - totalSelected} more`}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
