/**
 * CATAN: New Energies — "Ask for cards" trades
 *
 * The active player asks for specific cards and lets everyone else name their price:
 * 1. `TradeModeSwitch` + `AskForCardsPanel`: the Players tab of the Trade dialog.
 * 2. `TradeRequestReplyPrompt`: a player is asked what they would want for the cards (or passes).
 * 3. `TradeRequestChoicePrompt`: the requester sees every offer together and takes one, or none.
 *
 * The prompts are rendered by `PendingDecisionBanner` (Modals.tsx) for the decisions
 * `TRADE_REQUEST_REPLY` and `TRADE_REQUEST_CHOICE`; the rules live in engine/trade-requests.ts.
 */

import 'preact/compat';
import { useState } from 'preact/hooks';
import { canTakeRequestOffer, type TradeRequestChoice, type TradeRequestReply } from '../engine/trade-requests';
import type { GameAction, GameState, PlayerId, TradeItems } from '../engine/types';
import { handCount } from './gameView';
import { CARD_METADATA, PLAYER_THEMES } from './theme';
import { ENERGY_CARD_STYLE, TRADE_KIND_ORDER, TradeCard, tradeLabel, type TradeKind } from './TradeCard';
import './trade-request.css';
import { EnergyBoltSvg, PlayerEmblemSvg, ResourceIconSvg } from './WoodenPiecesSvg';

const ENERGY_LIMIT = 5;
/** Most of one kind of card that can be asked for or named in a reply. */
const MAX_PER_KIND = 5;

const countOf = (items: TradeItems, kind: TradeKind): number => items[kind] || 0;

/** "1 brick, 2 steel" */
function describeItems(items: TradeItems): string {
  return TRADE_KIND_ORDER.filter((k) => countOf(items, k) > 0)
    .map((k) => `${countOf(items, k)} ${tradeLabel(k)}`)
    .join(', ');
}

/**
 * A headline for what a trade request move just did ("Pink offered 1 brick for 2 steel"), or null
 * if the action is not part of one. `prev` is the state the action was made in.
 */
export function describeTradeRequestMove(prev: GameState, action: GameAction): string | null {
  const name = (pid: PlayerId) => prev.players[pid]?.name ?? pid;
  if (action.type === 'REQUEST_TRADE') return `${name(action.playerId)} asked for ${describeItems(action.ask)}`;
  if (action.type !== 'RESOLVE_PENDING_DECISION') return null;
  const head = prev.pendingDecisions[0];
  const response = (action.response ?? {}) as { want?: TradeItems; takeOfferFrom?: PlayerId };
  if (head?.type === 'TRADE_REQUEST_REPLY') {
    return response.want
      ? `${name(action.playerId)} offered ${describeItems(head.ask)} for ${describeItems(response.want)}`
      : `${name(action.playerId)} passed`;
  }
  if (head?.type === 'TRADE_REQUEST_CHOICE') {
    return response.takeOfferFrom
      ? `${name(action.playerId)} took ${name(response.takeOfferFrom)}�s offer`
      : `${name(action.playerId)} turned down every offer`;
  }
  return null;
}

function heldBy(state: GameState, playerId: PlayerId, kind: TradeKind): number {
  const p = state.players[playerId]!;
  return kind === 'energy' ? p.energy : kind === 'science' ? p.science : p.resources[kind];
}

function PlayerChip({ playerId, size = 28 }: { playerId: PlayerId; size?: number }) {
  const t = PLAYER_THEMES[playerId];
  return (
    <svg width={size} height={size} viewBox="-13 -13 26 26" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle r="12" fill={t.fill} stroke={t.stroke} strokeWidth="1.2" />
      <PlayerEmblemSvg playerId={playerId} cx={0} cy={0} r={6.5} />
    </svg>
  );
}

/** Small pills showing cards: icon, count and name. `short` marks the kinds a player cannot cover. */
function ItemChips({ items, short = [], testId }: { items: TradeItems; short?: TradeKind[]; testId?: string }) {
  return (
    <span className="tr-chips" data-testid={testId}>
      {TRADE_KIND_ORDER.filter((k) => countOf(items, k) > 0).map((k) => {
        const meta = k === 'energy' ? { ...ENERGY_CARD_STYLE, shortLabel: 'Energy' } : CARD_METADATA[k];
        return (
          <span key={k} className="tr-chip" data-kind={k} data-short={short.includes(k) ? 'true' : 'false'}>
            <svg width="22" height="22" viewBox="-14 -14 28 28" aria-hidden="true">
              <circle r="13" fill={meta.bg} opacity={0.5} />
              {k === 'energy' ? <EnergyBoltSvg scale={0.6} /> : <ResourceIconSvg type={k} scale={1} />}
            </svg>
            <b>{countOf(items, k)}×</b> {meta.shortLabel}
          </span>
        );
      })}
    </span>
  );
}

/** The seven kinds of card as tappable cards with − / + steppers. */
function CardSteppers({
  counts,
  onChange,
  maxOf,
  testPrefix,
}: {
  counts: TradeItems;
  onChange: (next: TradeItems) => void;
  /** The most of this kind that may be chosen right now (0 greys the card out) */
  maxOf: (kind: TradeKind) => number;
  testPrefix: string;
}) {
  return (
    <div className="md-cards tr-cards">
      {TRADE_KIND_ORDER.map((k) => {
        const cur = countOf(counts, k);
        const max = Math.max(cur, maxOf(k));
        const set = (n: number) => onChange({ ...counts, [k]: Math.max(0, Math.min(max, n)) });
        return (
          <TradeCard
            key={k}
            kind={k}
            testId={`${testPrefix}-${k}`}
            badge={String(cur)}
            caption=""
            selected={cur > 0}
            disabled={cur >= max}
            dim={max === 0}
            onClick={() => set(cur + 1)}
            footer={
              <div className="md-stepper">
                <button type="button" aria-label={`One less ${tradeLabel(k)}`} disabled={cur === 0} onClick={() => set(cur - 1)}>
                  −
                </button>
                <span>{cur}</span>
                <button type="button" aria-label={`One more ${tradeLabel(k)}`} disabled={cur >= max} onClick={() => set(cur + 1)}>
                  +
                </button>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// 1. The Players tab: make an offer, or ask for cards
// ============================================================================

export type TradeMode = 'offer' | 'ask';

export function TradeModeSwitch({ mode, onChange }: { mode: TradeMode; onChange: (mode: TradeMode) => void }) {
  return (
    <div className="tr-mode">
      <div className="lb-segment" role="tablist" aria-label="Kind of trade with players">
        {(
          [
            ['offer', 'Make an offer'],
            ['ask', 'Ask for cards'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            data-testid={`trade-mode-${key}`}
            data-selected={mode === key ? 'true' : 'false'}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="md-sub tr-mode-hint">
        {mode === 'offer'
          ? 'Say what you give and what you want in return.'
          : 'Say what you need, not what you will pay. Everyone who has it names their price.'}
      </p>
    </div>
  );
}

export function AskForCardsPanel({
  state,
  onDispatch,
  onClose,
}: {
  state: GameState;
  onDispatch: (action: GameAction) => void;
  onClose: () => void;
}) {
  const playerId = state.activePlayerId;
  const me = state.players[playerId]!;
  const [ask, setAsk] = useState<TradeItems>({});
  const chosen = describeItems(ask);
  const ready = chosen !== '';

  return (
    <div className="tr-panel" data-testid="ask-for-cards-panel">
      <p className="md-sub" style={{ marginTop: '14px', fontWeight: 700, color: '#ffffff' }}>
        You ask for
        <span style={{ fontWeight: 400, color: 'var(--ink-300)' }}> — up to {MAX_PER_KIND} of each</span>
      </p>
      <CardSteppers
        counts={ask}
        onChange={setAsk}
        testPrefix="request-ask"
        maxOf={(k) => (k === 'energy' ? Math.max(0, Math.min(MAX_PER_KIND, ENERGY_LIMIT - me.energy)) : MAX_PER_KIND)}
      />
      <p className="md-sub tr-how">
        Each other player who holds the cards makes one reply: what they would want from you, or a pass. Then you
        pick the offer you like, or none.
      </p>
      <button
        type="button"
        className="tt-cta"
        data-testid="send-trade-request-btn"
        disabled={!ready}
        style={{ marginTop: '12px' }}
        onClick={() => {
          onDispatch({ type: 'REQUEST_TRADE', playerId, ask });
          onClose();
        }}
      >
        {ready ? `Ask everyone for ${chosen}` : 'Choose the cards you want'}
      </button>
    </div>
  );
}

// ============================================================================
// 2. A player is asked: what would you want for it?
// ============================================================================

export function TradeRequestReplyPrompt({
  state,
  decision,
  onDispatch,
}: {
  state: GameState;
  decision: TradeRequestReply;
  onDispatch: (action: GameAction) => void;
}) {
  const requester = state.players[decision.requestingPlayerId]!;
  const me = state.players[decision.playerId]!;
  const [want, setWant] = useState<TradeItems>({});

  // Only the requester's hand size is public, so that (and their energy) is all that limits the answer
  const cardsHeld = handCount(state, decision.requestingPlayerId);
  const wantedCards = TRADE_KIND_ORDER.filter((k) => k !== 'energy').reduce((n, k) => n + countOf(want, k), 0);
  const maxOf = (k: TradeKind): number => {
    if (countOf(decision.ask, k) > 0) return 0; // the same card cannot be on both sides
    if (k === 'energy') {
      const room = ENERGY_LIMIT - (me.energy - countOf(decision.ask, 'energy'));
      return Math.max(0, Math.min(MAX_PER_KIND, requester.energy, room));
    }
    return Math.max(0, Math.min(MAX_PER_KIND, countOf(want, k) + cardsHeld - wantedCards));
  };
  const chosen = describeItems(want);
  const answer = (response: unknown) =>
    onDispatch({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: decision.playerId,
      decisionId: decision.id,
      response,
    });

  return (
    <div className="tr-backdrop" data-testid="pending-decision-modal">
      <div className="tr-modal" role="dialog" aria-modal="true" aria-labelledby="tr-reply-title" data-testid="trade-request-reply">
        <div className="tr-head">
          <PlayerChip playerId={decision.requestingPlayerId} size={32} />
          <div>
            <h3 className="md-title" id="tr-reply-title">
              {requester.name} wants {describeItems(decision.ask)}
            </h3>
            <p className="md-sub" style={{ marginTop: '2px' }}>
              What would you want for it, {me.name}? You get one reply. {requester.name} holds {cardsHeld} card
              {cardsHeld === 1 ? '' : 's'}.
            </p>
          </div>
        </div>

        <p className="md-sub tr-label">You would give</p>
        <ItemChips items={decision.ask} testId="reply-give" />

        <p className="md-sub tr-label">
          You want from {requester.name}
          <span style={{ fontWeight: 400, color: 'var(--ink-300)' }}> — in return</span>
        </p>
        <CardSteppers counts={want} onChange={setWant} maxOf={maxOf} testPrefix="trade-reply-want" />

        <div className="tr-actions">
          <button
            type="button"
            className="tt-cta"
            data-testid="trade-reply-offer-btn"
            disabled={chosen === ''}
            onClick={() => answer({ want })}
          >
            {chosen === '' ? 'Choose what you want for it' : `Offer ${describeItems(decision.ask)} for ${chosen}`}
          </button>
          <button type="button" className="tt-icon-btn tr-pass" data-testid="trade-reply-pass-btn" onClick={() => answer({ pass: true })}>
            Pass
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. The requester picks an offer
// ============================================================================

export function TradeRequestChoicePrompt({
  state,
  decision,
  onDispatch,
}: {
  state: GameState;
  decision: TradeRequestChoice;
  onDispatch: (action: GameAction) => void;
}) {
  const me = state.players[decision.playerId]!;
  const answer = (response: unknown) =>
    onDispatch({
      type: 'RESOLVE_PENDING_DECISION',
      playerId: decision.playerId,
      decisionId: decision.id,
      response,
    });
  const offers = decision.offers.length;

  return (
    <div className="tr-backdrop" data-testid="pending-decision-modal">
      <div className="tr-modal" role="dialog" aria-modal="true" aria-labelledby="tr-choice-title" data-testid="trade-request-choice">
        <h3 className="md-title" id="tr-choice-title">
          {offers === 1 ? 'An offer' : `${offers} offers`} for {describeItems(decision.ask)}
        </h3>
        <p className="md-sub">Take the one you like, or say no thanks to all of them.</p>

        <ul className="tr-offers">
          {decision.offers.map((offer) => {
            const from = state.players[offer.playerId]!;
            const check = canTakeRequestOffer(state, decision.requestingPlayerId, decision.ask, offer);
            // The cards you would have to give that you do not hold
            const short = TRADE_KIND_ORDER.filter((k) => countOf(offer.want, k) > heldBy(state, me.id, k));
            const reason =
              short.length > 0
                ? short
                    .map((k) => `${countOf(offer.want, k)} ${tradeLabel(k)} (you have ${heldBy(state, me.id, k)})`)
                    .join(', ')
                : (check.reason ?? '');
            return (
              <li key={offer.playerId} data-testid={`request-offer-${offer.playerId}`} data-affordable={check.ok ? 'true' : 'false'}>
                <div className="tr-offer-from">
                  <PlayerChip playerId={offer.playerId} />
                  <span>{from.name}</span>
                </div>
                <div className="tr-deal">
                  <span className="tr-deal-label">You get</span>
                  <ItemChips items={decision.ask} />
                  <span className="tr-deal-label">You give</span>
                  <ItemChips items={offer.want} short={check.ok ? [] : short} />
                </div>
                <div className="tr-offer-take">
                  <button
                    type="button"
                    className="tt-cta"
                    data-testid={`accept-request-offer-${offer.playerId}`}
                    disabled={!check.ok}
                    onClick={() => answer({ takeOfferFrom: offer.playerId })}
                  >
                    Take this offer
                  </button>
                  {!check.ok && (
                    <span className="tr-reason" data-testid={`request-offer-reason-${offer.playerId}`}>
                      {short.length > 0 ? `You need ${reason}` : reason}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <button type="button" className="tt-icon-btn tr-pass tr-no-thanks" data-testid="decline-request-offers-btn" onClick={() => answer({ decline: true })}>
          No thanks
        </button>
      </div>
    </div>
  );
}
