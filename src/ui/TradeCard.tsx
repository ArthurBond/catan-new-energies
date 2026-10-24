/**
 * CATAN: New Energies — the tappable resource / science / energy card the trade dialogs are built
 * from (the Trade dialog in Modals.tsx and the trade request prompts in TradeRequest.tsx).
 */

import 'preact/compat';
import { ComponentChildren } from 'preact';
import { ResourceType } from '../engine/types';
import { CARD_METADATA } from './theme';
import { EnergyBoltSvg, ResourceIconSvg } from './WoodenPiecesSvg';

export type TradeKind = ResourceType | 'science' | 'energy';

/** Every kind of card a trade can name, in the order they are shown. */
export const TRADE_KIND_ORDER = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science', 'energy'] as const;

export const ENERGY_CARD_STYLE = { cardFill: '#fff6cf', border: '#b8900a', textColor: '#3d2c00', bg: '#ffc83a' };

export function tradeLabel(kind: TradeKind): string {
  if (kind === 'energy') return 'energy';
  return CARD_METADATA[kind].shortLabel.toLowerCase();
}

/** A tappable resource / science / energy card used to compose trades. */
export function TradeCard({
  kind,
  badge,
  caption,
  selected,
  disabled,
  onClick,
  testId,
  footer,
  dim,
}: {
  kind: TradeKind;
  badge: string;
  caption: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
  /** Replaces the caption, e.g. with a stepper */
  footer?: ComponentChildren;
  /** Grey the card out (defaults to `disabled`) */
  dim?: boolean;
}) {
  const meta = kind === 'energy' ? { ...ENERGY_CARD_STYLE, shortLabel: 'Energy' } : CARD_METADATA[kind];
  return (
    <div className="md-card-col">
      <button
        type="button"
        className="tt-res-card md-pick"
        data-testid={testId}
        data-selected={selected ? 'true' : 'false'}
        data-empty={(dim ?? disabled) ? 'true' : 'false'}
        disabled={disabled}
        aria-pressed={selected}
        onClick={onClick}
        style={{
          ['--res-fill' as string]: meta.cardFill,
          ['--res-border' as string]: meta.border,
          ['--res-text' as string]: meta.textColor,
        }}
      >
        <svg width="32" height="32" viewBox="-14 -14 28 28" aria-hidden="true" style={{ marginTop: '-8px' }}>
          <circle r="12" fill={meta.bg} opacity={0.32} />
          {kind === 'energy' ? <EnergyBoltSvg scale={0.62} /> : <ResourceIconSvg type={kind} scale={1.05} />}
        </svg>
        <span className="tt-res-label">{meta.shortLabel}</span>
        <span className="tt-res-count">{badge}</span>
      </button>
      {footer ?? <span style={{ fontSize: '11px', color: 'var(--ink-300)' }}>{caption}</span>}
    </div>
  );
}
