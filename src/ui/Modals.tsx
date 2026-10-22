/**
 * CATAN: New Energies — Interactive Tabletop Modals & Decision Overlays
 *
 * Includes:
 * 1. Setup / Lobby Modal (`[data-testid="lobby-modal"]`)
 * 2. Trade & Supply / Harbor / Domestic P2P Modal (`[data-testid="trade-modal"]`)
 * 3. Energy 2-Bolt Card Picker Modal (`[data-testid="energy-card-modal"]`)
 * 4. Development Card Play Modal (`[data-testid="dev-card-modal"]`)
 * 5. Pending Decision Banner / Modal (`[data-testid="pending-decision-modal"]`)
 * 6. Hotseat Privacy Curtain (`[data-testid="privacy-curtain-modal"]`)
 * 7. Victory / Environmental Collapse Summary Modal (`[data-testid="victory-modal"]`)
 */

import 'preact/compat';
import { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { getHarborsForPlayer } from '../engine/board';
import { RESOURCE_TYPES } from '../engine/config';
import { getHandSizeForSeven } from '../engine/production';
import {
  DevelopmentCardType,
  GameAction,
  GameState,
  HexId,
  PendingDecision,
  PlayerId,
  ResourceType,
} from '../engine/types';
import type { StartingPlacement } from '../engine/setup';
import { evaluateEmptyBagVictory } from '../engine/victory';
import {
  CARD_METADATA,
  DEV_CARD_METADATA,
  PLAYER_THEMES,
  TERRAIN_THEMES,
} from './theme';
import {
  EnergyBoltSvg,
  HazardCogSvg,
  InspectorPawnSvg,
  PieceDefs,
  PlayerEmblemSvg,
  ResourceIconSvg,
} from './WoodenPiecesSvg';

export type BotStrategyName = 'Balanced' | 'GreenInnovator' | 'IndustrialExpansionist';
export type BotDifficultyName = 'easy' | 'normal' | 'hard';
export type BotSpeedMode = 'normal' | 'fast' | 'instant';

export interface SeatConfig {
  playerId: PlayerId;
  name: string;
  controller: 'human' | 'bot';
  botStrategy: BotStrategyName;
  botDifficulty: BotDifficultyName;
}

export interface LobbyConfig {
  playerCount: 3 | 4;
  /** Board layout: fixed beginner layout or shuffled terrain & numbers */
  setupMode: 'first' | 'standard';
  /** Starting pieces: players draft their own, or use the beginner positions (First Game only) */
  placement: StartingPlacement;
  seed: number;
  botSpeed: BotSpeedMode;
  privacyCurtain: boolean;
  roomCode: string;
  seats: Record<PlayerId, SeatConfig>;
}

const MODAL_BACKDROP_STYLE: Record<string, string | number> = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(6, 18, 30, 0.62)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
  padding: '16px',
};

const MODAL_CARD_STYLE: Record<string, string | number> = {
  background: 'var(--ink-800)',
  border: '1px solid rgba(163, 183, 202, 0.2)',
  borderRadius: '18px',
  padding: '20px 24px',
  color: 'var(--ink-100)',
  maxWidth: '680px',
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: 'var(--shadow-ink)',
  animation: 'popIn 220ms var(--ease-out)',
};

// ============================================================================
// 1. SETUP / LOBBY MODAL
// ============================================================================

function LobbyOption({
  testId,
  selected,
  disabled,
  title,
  description,
  badge,
  onSelect,
}: {
  testId: string;
  selected: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  badge?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="lb-option"
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="lb-radio" aria-hidden="true" />
      <span>
        <span className="lb-option-title">
          {title}
          {badge && <span className="lb-badge">{badge}</span>}
        </span>
        <span className="lb-option-desc">{description}</span>
      </span>
    </button>
  );
}

const STRATEGY_OPTIONS: { value: BotStrategyName; label: string }[] = [
  { value: 'Balanced', label: 'Balanced' },
  { value: 'GreenInnovator', label: 'Green innovator' },
  { value: 'IndustrialExpansionist', label: 'Industrialist' },
];

export function LobbyModal({
  config,
  onChangeConfig,
  onStartGame,
  onClose,
  canClose,
}: {
  config: LobbyConfig;
  onChangeConfig: (next: LobbyConfig) => void;
  onStartGame: (cfg: LobbyConfig) => void;
  onClose?: () => void;
  canClose?: boolean;
}) {
  const activeSeatIds: PlayerId[] =
    config.playerCount === 4
      ? ['orange', 'purple', 'pink', 'blue']
      : ['orange', 'purple', 'pink'];
  const fixedAllowed = config.setupMode === 'first';
  const placement = fixedAllowed ? config.placement : 'draft';
  const updateSeat = (pid: PlayerId, patch: Partial<SeatConfig>) =>
    onChangeConfig({ ...config, seats: { ...config.seats, [pid]: { ...config.seats[pid], ...patch } } });

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="lobby-modal">
      <div
        className="lb-sheet"
        data-testid="setup-lobby"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lobby-title"
      >
        <div className="lb-head">
          <div>
            <h2 id="lobby-title">New game</h2>
            <p>Choose who is playing and how the island is set up.</p>
          </div>
          {canClose && (
            <button type="button" className="tt-icon-btn" onClick={onClose}>
              Back to the table
            </button>
          )}
        </div>

        <div className="lb-section">
          <div className="lb-section-head">
            <h3>Players</h3>
            <div className="lb-segment" role="group" aria-label="Number of players">
              {([3, 4] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  data-testid={`lobby-player-count-${cnt}`}
                  data-selected={config.playerCount === cnt ? 'true' : 'false'}
                  onClick={() => onChangeConfig({ ...config, playerCount: cnt })}
                >
                  {cnt} players
                </button>
              ))}
            </div>
          </div>
          <div className="lb-seats">
            {activeSeatIds.map((pid) => {
              const seat = config.seats[pid];
              const pTheme = PLAYER_THEMES[pid];
              return (
                <div
                  key={pid}
                  className="lb-seat"
                  data-testid={`lobby-seat-${pid}`}
                  style={{ ['--player' as string]: pTheme.fill }}
                >
                  <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
                    <circle r="12" fill={pTheme.fill} stroke={pTheme.stroke} strokeWidth="1.2" />
                    <PlayerEmblemSvg playerId={pid} cx={0} cy={0} r={6.5} />
                  </svg>
                  <input
                    type="text"
                    className="lb-input"
                    aria-label={`${pTheme.displayColorName} player name`}
                    value={seat.name}
                    maxLength={16}
                    onInput={(e) => updateSeat(pid, { name: (e.target as HTMLInputElement).value })}
                  />
                  <div className="lb-segment" role="group" aria-label="Controlled by">
                    {(['human', 'bot'] as const).map((ctrl) => (
                      <button
                        key={ctrl}
                        type="button"
                        data-testid={`lobby-seat-${pid}-${ctrl}`}
                        data-selected={seat.controller === ctrl ? 'true' : 'false'}
                        onClick={() => updateSeat(pid, { controller: ctrl })}
                      >
                        {ctrl === 'human' ? 'Human' : 'Bot'}
                      </button>
                    ))}
                  </div>
                  {seat.controller === 'bot' ? (
                    <div className="lb-bot">
                      <select
                        className="lb-input"
                        data-testid={`lobby-seat-${pid}-strategy`}
                        aria-label="Bot strategy"
                        value={seat.botStrategy}
                        onChange={(e) =>
                          updateSeat(pid, { botStrategy: (e.target as HTMLSelectElement).value as BotStrategyName })
                        }
                      >
                        {STRATEGY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="lb-input"
                        data-testid={`lobby-seat-${pid}-difficulty`}
                        aria-label="Bot difficulty"
                        value={seat.botDifficulty}
                        onChange={(e) =>
                          updateSeat(pid, {
                            botDifficulty: (e.target as HTMLSelectElement).value as BotDifficultyName,
                          })
                        }
                      >
                        <option value="easy">Easy</option>
                        <option value="normal">Normal</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  ) : (
                    <span className="lb-bot lb-muted">Plays on this device</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lb-columns">
          <div className="lb-section">
            <h3>Island</h3>
            <LobbyOption
              testId="lobby-setup-first"
              selected={config.setupMode === 'first'}
              title="Beginner layout"
              description="The recommended terrain and numbers from the rulebook."
              onSelect={() => onChangeConfig({ ...config, setupMode: 'first' })}
            />
            <LobbyOption
              testId="lobby-setup-standard"
              selected={config.setupMode === 'standard'}
              title="Random island"
              description="Shuffled terrain, numbers laid along the spiral."
              onSelect={() => onChangeConfig({ ...config, setupMode: 'standard', placement: 'draft' })}
            />
          </div>
          <div className="lb-section">
            <h3>Starting pieces</h3>
            <LobbyOption
              testId="lobby-placement-draft"
              selected={placement === 'draft'}
              title="Players place them"
              badge="Recommended"
              description="Roll for order, place a town each, then a city each in reverse."
              onSelect={() => onChangeConfig({ ...config, placement: 'draft' })}
            />
            <LobbyOption
              testId="lobby-placement-fixed"
              selected={placement === 'fixed'}
              disabled={!fixedAllowed}
              title="Beginner positions"
              description={
                fixedAllowed
                  ? 'Start with the town and city shown in the rulebook.'
                  : 'Only available on the beginner layout.'
              }
              onSelect={() => onChangeConfig({ ...config, placement: 'fixed' })}
            />
          </div>
        </div>

        <details className="lb-more">
          <summary>More options</summary>
          <div className="lb-more-grid">
            <div className="lb-field">
              <span>Bot speed</span>
              <div className="lb-segment" role="group" aria-label="Bot speed">
                {(['normal', 'fast', 'instant'] as const).map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    data-testid={`lobby-bot-speed-${spd}`}
                    data-selected={config.botSpeed === spd ? 'true' : 'false'}
                    onClick={() => onChangeConfig({ ...config, botSpeed: spd })}
                  >
                    {spd === 'normal' ? 'Relaxed' : spd === 'fast' ? 'Fast' : 'Instant'}
                  </button>
                ))}
              </div>
            </div>
            <div className="lb-field">
              <span>Pass-the-device curtain</span>
              <div className="lb-segment" role="group" aria-label="Privacy curtain">
                {[false, true].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    data-testid={on ? 'lobby-privacy-toggle' : undefined}
                    data-selected={config.privacyCurtain === on ? 'true' : 'false'}
                    onClick={() => onChangeConfig({ ...config, privacyCurtain: on })}
                  >
                    {on ? 'Hide hands' : 'Open table'}
                  </button>
                ))}
              </div>
            </div>
            <label className="lb-field">
              <span>Seed</span>
              <span style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="number"
                  className="lb-input"
                  data-testid="lobby-seed-input"
                  value={config.seed}
                  onChange={(e) =>
                    onChangeConfig({ ...config, seed: parseInt((e.target as HTMLInputElement).value, 10) || 42 })
                  }
                />
                <button
                  type="button"
                  className="tt-icon-btn"
                  onClick={() => onChangeConfig({ ...config, seed: Math.floor(Math.random() * 99999) + 1 })}
                >
                  Shuffle
                </button>
              </span>
            </label>
            <label className="lb-field">
              <span>Room code for other tabs</span>
              <input
                type="text"
                className="lb-input"
                placeholder="Optional, e.g. CATAN1"
                value={config.roomCode}
                onInput={(e) =>
                  onChangeConfig({ ...config, roomCode: (e.target as HTMLInputElement).value.toUpperCase() })
                }
              />
            </label>
          </div>
        </details>

        <button
          type="button"
          className="tt-cta is-ready"
          data-testid="start-game-btn"
          onClick={() => onStartGame({ ...config, placement })}
        >
          Start game
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 2. TRADE & SUPPLY / HARBOR / DOMESTIC P2P MODAL
// ============================================================================

type TradeKind = ResourceType | 'science' | 'energy';

const ENERGY_CARD_STYLE = { cardFill: '#fff6cf', border: '#b8900a', textColor: '#3d2c00', bg: '#ffc83a' };

function tradeLabel(kind: TradeKind): string {
  if (kind === 'energy') return 'energy';
  return CARD_METADATA[kind].shortLabel.toLowerCase();
}

/** A tappable resource / science / energy card used to compose trades. */
function TradeCard({
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

export function TradeModal({
  state,
  onDispatch,
  onClose,
}: {
  state: GameState;
  onDispatch: (action: GameAction) => void;
  onClose: () => void;
}) {
  const playerId = state.activePlayerId;
  const player = state.players[playerId]!;
  const playerHarbors = getHarborsForPlayer(state.board, playerId);

  const [tab, setTab] = useState<'supply' | 'harbor' | 'domestic'>('supply');
  // Start on something the player can actually afford to give, and a different card to get
  const [supplyGiveType, setSupplyGiveType] = useState<ResourceType | 'science' | 'energy'>(
    () =>
      (['lumber', 'brick', 'natural_fiber', 'food', 'steel'] as ResourceType[]).find(
        (r) => player.resources[r] >= 4
      ) ?? (player.science >= 3 ? 'science' : player.energy >= 2 ? 'energy' : 'lumber')
  );
  const [supplyReceiveType, setSupplyReceiveType] = useState<ResourceType | 'science'>(() =>
    supplyGiveType === 'science' ? 'lumber' : 'science'
  );

  const [selectedHarborId, setSelectedHarborId] = useState<number>(
    playerHarbors[0]?.id ?? 0
  );
  const [harborGiveRes, setHarborGiveRes] = useState<ResourceType>('lumber');
  const [harborReceiveType, setHarborReceiveType] = useState<ResourceType | 'science'>('science');

  const [domesticTarget, setDomesticTarget] = useState<PlayerId>(
    state.playerOrder.find((p) => p !== playerId) ?? 'purple'
  );
  const [domesticGive, setDomesticGive] = useState<
    Partial<Record<ResourceType | 'science' | 'energy', number>>
  >({});
  const [domesticWant, setDomesticWant] = useState<
    Partial<Record<ResourceType | 'science' | 'energy', number>>
  >({});

  const requiredSupplyAmount =
    supplyGiveType === 'energy' ? 2 : supplyGiveType === 'science' ? 3 : 4;
  const currentSupplyGiveHeld =
    supplyGiveType === 'energy'
      ? player.energy
      : supplyGiveType === 'science'
        ? player.science
        : player.resources[supplyGiveType];

  const canExecuteSupplyTrade =
    supplyGiveType !== supplyReceiveType &&
    currentSupplyGiveHeld >= requiredSupplyAmount &&
    (supplyReceiveType === 'science'
      ? state.supply.science > 0
      : state.supply.resources[supplyReceiveType] > 0);

  const selectedHarbor = playerHarbors.find((h) => h.id === selectedHarborId) ?? playerHarbors[0];
  const effectiveHarborGive: ResourceType =
    selectedHarbor?.resource ?? harborGiveRes;
  const requiredHarborAmount = selectedHarbor?.ratio ?? 3;
  const canExecuteHarborTrade =
    Boolean(selectedHarbor) &&
    effectiveHarborGive !== harborReceiveType &&
    player.resources[effectiveHarborGive] >= requiredHarborAmount &&
    (harborReceiveType === 'science'
      ? state.supply.science > 0
      : state.supply.resources[harborReceiveType] > 0);

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="trade-modal">
      <div style={MODAL_CARD_STYLE}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px' }}>
          <h3 className="md-title">Trade</h3>
          <div className="lb-segment" role="tablist" aria-label="Trade with" style={{ marginLeft: 'auto' }}>
            {(
              [
                ['supply', 'Supply'],
                ['harbor', `Harbors${playerHarbors.length ? ` (${playerHarbors.length})` : ''}`],
                ['domestic', 'Players'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                data-testid={`trade-tab-${key}`}
                data-selected={tab === key ? 'true' : 'false'}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="tt-icon-btn" data-testid="close-trade-modal" onClick={onClose}>
            Close
          </button>
        </div>

        {tab === 'supply' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p className="md-sub" style={{ marginTop: 0, fontWeight: 700, color: '#ffffff' }}>
              You give
              <span style={{ fontWeight: 400, color: 'var(--ink-300)' }}>
                {' '}
                — 4 of one resource, 3 science or 2 energy
              </span>
            </p>
            <div className="md-cards" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: '8px' }}>
              {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science', 'energy'] as const).map((key) => {
                const req = key === 'energy' ? 2 : key === 'science' ? 3 : 4;
                const held =
                  key === 'energy' ? player.energy : key === 'science' ? player.science : player.resources[key];
                return (
                  <TradeCard
                    key={key}
                    kind={key}
                    testId={`supply-give-${key}`}
                    badge={`${req}×`}
                    caption={`have ${held}`}
                    selected={supplyGiveType === key}
                    disabled={held < req}
                    onClick={() => setSupplyGiveType(key)}
                  />
                );
              })}
            </div>

            <p className="md-sub" style={{ marginTop: '14px', fontWeight: 700, color: '#ffffff' }}>
              You get
              <span style={{ fontWeight: 400, color: 'var(--ink-300)' }}> — one card of your choice</span>
            </p>
            <div className="md-cards" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: '8px' }}>
              {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map((key) => {
                const left = key === 'science' ? state.supply.science : state.supply.resources[key];
                return (
                  <TradeCard
                    key={key}
                    kind={key}
                    testId={`supply-receive-${key}`}
                    badge="1"
                    caption={`${left} left`}
                    selected={supplyReceiveType === key}
                    disabled={left === 0 || key === supplyGiveType}
                    onClick={() => setSupplyReceiveType(key)}
                  />
                );
              })}
            </div>

            <button
              type="button"
              className="tt-cta"
              data-testid="execute-supply-trade-btn"
              disabled={!canExecuteSupplyTrade}
              style={{ marginTop: '16px' }}
              onClick={() => {
                onDispatch({
                  type: 'TRADE_SUPPLY',
                  playerId,
                  give: { [supplyGiveType]: requiredSupplyAmount },
                  receive: supplyReceiveType,
                });
                onClose();
              }}
            >
              {canExecuteSupplyTrade
                ? `Give ${requiredSupplyAmount} ${tradeLabel(supplyGiveType)}, get 1 ${tradeLabel(supplyReceiveType)}`
                : currentSupplyGiveHeld < requiredSupplyAmount
                  ? `You need ${requiredSupplyAmount} ${tradeLabel(supplyGiveType)} to trade`
                  : 'Pick a different card to get'}
            </button>
          </div>
        )}

        {tab === 'harbor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {playerHarbors.length === 0 || !selectedHarbor ? (
              <p className="md-sub">
                Build a town or city on a harbor to trade there at 3:1 (any harbor) or 2:1 (a resource
                harbor).
              </p>
            ) : (
              <>
                {playerHarbors.length > 1 && (
                  <div className="lb-segment" role="group" aria-label="Harbor" style={{ alignSelf: 'flex-start', marginBottom: '6px' }}>
                    {playerHarbors.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        data-selected={selectedHarbor.id === h.id ? 'true' : 'false'}
                        onClick={() => setSelectedHarborId(h.id)}
                      >
                        {h.ratio}:1 {h.resource ? CARD_METADATA[h.resource].shortLabel.toLowerCase() : 'any'}
                      </button>
                    ))}
                  </div>
                )}
                <p className="md-sub" style={{ marginTop: 0, fontWeight: 700, color: '#ffffff' }}>
                  You give
                  <span style={{ fontWeight: 400, color: 'var(--ink-300)' }}>
                    {' '}
                    — {selectedHarbor.ratio} {selectedHarbor.resource ? tradeLabel(selectedHarbor.resource) : 'of one resource'} at
                    this {selectedHarbor.ratio}:1 harbor
                  </span>
                </p>
                <div className="md-cards" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: '8px' }}>
                  {RESOURCE_TYPES.map((r) => (
                    <TradeCard
                      key={r}
                      kind={r}
                      testId={`harbor-give-${r}`}
                      badge={`${selectedHarbor.ratio}×`}
                      caption={`have ${player.resources[r]}`}
                      selected={effectiveHarborGive === r}
                      disabled={
                        (selectedHarbor.resource !== null && selectedHarbor.resource !== r) ||
                        player.resources[r] < selectedHarbor.ratio
                      }
                      onClick={() => setHarborGiveRes(r)}
                    />
                  ))}
                </div>

                <p className="md-sub" style={{ marginTop: '14px', fontWeight: 700, color: '#ffffff' }}>
                  You get
                  <span style={{ fontWeight: 400, color: 'var(--ink-300)' }}> — one card of your choice</span>
                </p>
                <div className="md-cards" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: '8px' }}>
                  {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map((k) => {
                    const left = k === 'science' ? state.supply.science : state.supply.resources[k];
                    return (
                      <TradeCard
                        key={k}
                        kind={k}
                        testId={`harbor-receive-${k}`}
                        badge="1"
                        caption={`${left} left`}
                        selected={harborReceiveType === k}
                        disabled={left === 0 || k === effectiveHarborGive}
                        onClick={() => setHarborReceiveType(k)}
                      />
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="tt-cta"
                  data-testid="execute-harbor-trade-btn"
                  disabled={!canExecuteHarborTrade}
                  style={{ marginTop: '16px' }}
                  onClick={() => {
                    onDispatch({
                      type: 'TRADE_HARBOR',
                      playerId,
                      harborId: selectedHarbor.id,
                      give: { [effectiveHarborGive]: requiredHarborAmount },
                      receive: harborReceiveType,
                    });
                    onClose();
                  }}
                >
                  {canExecuteHarborTrade
                    ? `Give ${requiredHarborAmount} ${tradeLabel(effectiveHarborGive)}, get 1 ${tradeLabel(harborReceiveType)}`
                    : player.resources[effectiveHarborGive] < requiredHarborAmount
                      ? `You need ${requiredHarborAmount} ${tradeLabel(effectiveHarborGive)} to trade here`
                      : 'Pick a different card to get'}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'domestic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span className="md-sub" style={{ marginTop: 0, fontWeight: 700, color: '#ffffff' }}>
                Offer to
              </span>
              <div className="lb-segment" role="group" aria-label="Trade partner">
                {state.playerOrder
                  .filter((p) => p !== playerId)
                  .map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      data-testid={`domestic-target-${pid}`}
                      data-selected={domesticTarget === pid ? 'true' : 'false'}
                      onClick={() => setDomesticTarget(pid)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                        <circle r="6.5" fill={PLAYER_THEMES[pid].fill} />
                      </svg>
                      {state.players[pid]!.name}
                    </button>
                  ))}
              </div>
            </div>

            {(
              [
                ['give', 'You offer', domesticGive, setDomesticGive],
                ['want', 'You ask for', domesticWant, setDomesticWant],
              ] as const
            ).map(([side, title, counts, setCounts]) => (
              <div key={side}>
                <p className="md-sub" style={{ marginTop: '14px', fontWeight: 700, color: '#ffffff' }}>
                  {title}
                </p>
                <div className="md-cards" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: '8px' }}>
                  {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science', 'energy'] as const).map((k) => {
                    const held = k === 'energy' ? player.energy : k === 'science' ? player.science : player.resources[k];
                    const max = side === 'give' ? held : 5;
                    const cur = counts[k] || 0;
                    const set = (n: number) => setCounts({ ...counts, [k]: Math.max(0, Math.min(max, n)) });
                    return (
                      <TradeCard
                        key={k}
                        kind={k}
                        testId={`domestic-${side}-${k}`}
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
              </div>
            ))}

            {(() => {
              const describe = (c: Partial<Record<TradeKind, number>>) =>
                (Object.entries(c) as [TradeKind, number][])
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${n} ${tradeLabel(k)}`)
                  .join(', ');
              const give = describe(domesticGive);
              const want = describe(domesticWant);
              const ready = give !== '' && want !== '';
              return (
                <button
                  type="button"
                  className="tt-cta"
                  data-testid="send-domestic-offer-btn"
                  disabled={!ready}
                  style={{ marginTop: '16px' }}
                  onClick={() => {
                    onDispatch({
                      type: 'OFFER_TRADE',
                      playerId,
                      targetPlayerId: domesticTarget,
                      give: domesticGive,
                      want: domesticWant,
                    });
                    onClose();
                  }}
                >
                  {ready
                    ? `Offer ${give} for ${want}`
                    : 'Choose what you offer and what you ask for'}
                </button>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 3. ENERGY 2-BOLT BUY CARD MODAL
// ============================================================================

export function EnergyBuyCardModal({
  state,
  onDispatch,
  onClose,
}: {
  state: GameState;
  onDispatch: (action: GameAction) => void;
  onClose: () => void;
}) {
  const playerId = state.activePlayerId;

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="energy-card-modal">
      <div style={{ ...MODAL_CARD_STYLE, maxWidth: '460px' }}>
        <h3 className="md-title" style={{ marginBottom: '8px' }}>
          Spend 2 energy for a card
        </h3>
        <p style={{ fontSize: '12.5px', color: 'var(--ink-100)', marginBottom: '14px' }}>
          Choose any 1 Resource or Science card from the global supply:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
          {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map(
            (key) => {
              const avail =
                key === 'science' ? state.supply.science : state.supply.resources[key];
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`energy-buy-${key}`}
                  disabled={avail <= 0}
                  onClick={() => {
                    onDispatch({
                      type: 'SPEND_ENERGY',
                      playerId,
                      usage: 'BUY_CARD',
                      params: { cardType: key },
                    });
                    onClose();
                  }}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    background: avail > 0 ? CARD_METADATA[key].bg : 'var(--ink-700)',
                    color: avail > 0 ? CARD_METADATA[key].textColor : 'var(--ink-300)',
                    border: `2px solid ${CARD_METADATA[key].border}`,
                    fontWeight: 900,
                    fontSize: '12px',
                    cursor: avail > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  {CARD_METADATA[key].label} ({avail})
                </button>
              );
            }
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '8px',
            background: 'var(--ink-700)',
            color: 'var(--ink-100)',
            border: '1px solid rgba(163, 183, 202, 0.28)',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 4. DEVELOPMENT CARD PLAY MODAL
// ============================================================================

export type DevBoardTarget = 'road' | 'inspector' | 'hazard';

function DevOption({
  testId,
  title,
  body,
  disabled,
  onClick,
  icon,
}: {
  testId: string;
  title: string;
  body: string;
  disabled?: boolean;
  onClick: () => void;
  icon: ComponentChildren;
}) {
  return (
    <button type="button" className="lb-option" data-testid={testId} disabled={disabled} onClick={onClick}
      style={{ gridTemplateColumns: '40px 1fr', alignItems: 'center' }}>
      <span aria-hidden="true">{icon}</span>
      <span>
        <span className="lb-option-title">{title}</span>
        <span className="lb-option-desc">{body}</span>
      </span>
    </button>
  );
}

export function DevCardPlayModal({
  state,
  cardId,
  cardType,
  onDispatch,
  onClose,
  onStartBoardTargeting,
}: {
  state: GameState;
  cardId: string;
  cardType: DevelopmentCardType;
  onDispatch: (action: GameAction) => void;
  onClose: () => void;
  /** Hands the rest of the card over to the board (pick paths, a hex or a hazard there) */
  onStartBoardTargeting?: (target: DevBoardTarget) => void;
}) {
  const playerId = state.activePlayerId;
  const meta = DEV_CARD_METADATA[cardType];
  const hasHazards =
    state.board.hexes.some((h) => h.hasHazard) || state.board.intersections.some((n) => n.hasHazard);

  const [grantCard1, setGrantCard1] = useState<ResourceType | 'science'>('science');
  const [grantCard2, setGrantCard2] = useState<ResourceType | 'science'>('science');

  // High Yield: hexes where this player has a renewable plant
  const renewableHexes: HexId[] = state.board.hexes
    .filter((h) =>
      state.board.intersections.some(
        (n) =>
          n.adjacentHexIds.includes(h.id) &&
          n.powerPlants.some((p) => p.playerId === playerId && p.type === 'renewable' && p.hexId === h.id)
      )
    )
    .map((h) => h.id);

  const startOnBoard = (target: DevBoardTarget) => {
    onStartBoardTargeting?.(target);
    onClose();
  };

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="dev-card-modal">
      <div style={{ ...MODAL_CARD_STYLE, maxWidth: '560px' }} role="dialog" aria-modal="true" aria-labelledby="dev-card-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h3
            id="dev-card-title"
            className="md-title"
            style={{ boxShadow: `inset 0 -3px 0 ${meta.color}`, display: 'inline-block', paddingBottom: '2px' }}
          >
            Play {meta.title}
          </h3>
          <button type="button" className="tt-icon-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="md-sub" style={{ marginBottom: '14px' }}>
          {meta.description}
        </p>

        {cardType === 'cleanup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <DevOption
              testId="cleanup-option-inspector"
              title="Move the inspector"
              body="Pick a hex on the board, then take a card from a player with a building there."
              onClick={() => startOnBoard('inspector')}
              icon={
                <svg width="40" height="40" viewBox="-20 -24 40 44">
                  <InspectorPawnSvg cx={0} cy={0} scale={0.95} />
                </svg>
              }
            />
            <DevOption
              testId="cleanup-option-hazard"
              title="Remove a hazard"
              body={
                hasHazards
                  ? 'Pick a hazard on the board, then take a card from a player whose footprint is at least yours.'
                  : 'There are no hazards on the board right now.'
              }
              disabled={!hasHazards}
              onClick={() => startOnBoard('hazard')}
              icon={
                <svg width="40" height="40" viewBox="-20 -20 40 40">
                  <PieceDefs />
                  <HazardCogSvg cx={0} cy={-1} r={16} />
                </svg>
              }
            />
          </div>
        )}

        {cardType === 'roadConstruction' && (
          <button type="button" className="tt-cta" data-testid="road-construction-start" onClick={() => startOnBoard('road')}>
            Place the roads on the board
          </button>
        )}

        {cardType === 'researchGrant' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(
              [
                ['First card', grantCard1, setGrantCard1, 'grant1'],
                ['Second card', grantCard2, setGrantCard2, 'grant2'],
              ] as const
            ).map(([label, value, setValue, key]) => (
              <div key={key}>
                <p className="md-sub" style={{ marginTop: key === 'grant1' ? 0 : '12px', fontWeight: 700, color: '#ffffff' }}>
                  {label}
                </p>
                <div className="md-cards" style={{ marginTop: '8px' }}>
                  {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map((k) => {
                    const left = k === 'science' ? state.supply.science : state.supply.resources[k];
                    return (
                      <TradeCard
                        key={k}
                        kind={k}
                        testId={`${key}-${k}`}
                        badge="1"
                        caption={`${left} left`}
                        selected={value === k}
                        disabled={left === 0}
                        onClick={() => setValue(k)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="tt-cta"
              data-testid="confirm-play-research-grant"
              style={{ marginTop: '16px' }}
              onClick={() => {
                onDispatch({
                  type: 'PLAY_DEV_CARD',
                  playerId,
                  cardId,
                  params: { cardType: 'researchGrant', cards: [grantCard1, grantCard2] },
                });
                onClose();
              }}
            >
              Take {tradeLabel(grantCard1)} and {tradeLabel(grantCard2)}
            </button>
          </div>
        )}

        {cardType === 'highYield' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {renewableHexes.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {renewableHexes.slice(0, 3).map((id) => {
                  const hex = state.board.hexes[id]!;
                  return (
                    <span key={id} className="tt-hexchip" style={{ color: 'var(--text)' }}>
                      <i style={{ background: TERRAIN_THEMES[hex.terrain].primaryFill }} />
                      {TERRAIN_THEMES[hex.terrain].resourceLabel}
                      {hex.numberDisc !== null ? ` · ${hex.numberDisc}` : ''}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="md-sub">Build a renewable power plant first — this card harvests from their hexes.</p>
            )}
            <button
              type="button"
              className="tt-cta"
              data-testid="confirm-play-high-yield"
              disabled={renewableHexes.length === 0}
              onClick={() => {
                onDispatch({
                  type: 'PLAY_DEV_CARD',
                  playerId,
                  cardId,
                  params: { cardType: 'highYield', hexIds: renewableHexes.slice(0, 3) },
                });
                onClose();
              }}
            >
              {renewableHexes.length > 0
                ? `Collect from ${Math.min(3, renewableHexes.length)} hex${Math.min(3, renewableHexes.length) === 1 ? '' : 'es'}`
                : 'Nothing to harvest yet'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Take a card from…" when a Clean Up card leaves more than one possible victim. */
export function StealChooserModal({
  state,
  victims,
  onChoose,
  onCancel,
}: {
  state: GameState;
  victims: PlayerId[];
  onChoose: (pid: PlayerId) => void;
  onCancel: () => void;
}) {
  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="steal-chooser">
      <div style={{ ...MODAL_CARD_STYLE, maxWidth: '420px' }} role="dialog" aria-modal="true" aria-labelledby="steal-title">
        <h3 className="md-title" id="steal-title">
          Take a card from…
        </h3>
        <p className="md-sub">You take one card at random from their hand.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
          {victims.map((pid) => {
            const t = PLAYER_THEMES[pid];
            return (
              <button
                key={pid}
                type="button"
                className="lb-option"
                data-testid={`steal-from-${pid}`}
                onClick={() => onChoose(pid)}
                style={{ gridTemplateColumns: '28px 1fr auto', alignItems: 'center', boxShadow: `inset 4px 0 0 ${t.fill}` }}
              >
                <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
                  <circle r="12" fill={t.fill} stroke={t.stroke} strokeWidth="1.2" />
                  <PlayerEmblemSvg playerId={pid} cx={0} cy={0} r={6.5} />
                </svg>
                <span className="lb-option-title">{state.players[pid]!.name}</span>
                <span className="lb-option-desc" style={{ marginTop: 0 }}>
                  {getHandSizeForSeven(state.players[pid]!)} cards
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="tt-icon-btn" onClick={onCancel} style={{ marginTop: '14px', width: '100%', height: '38px' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 5. PENDING DECISION FLOATING BANNER / MODAL
// ============================================================================

export function PendingDecisionBanner({
  state,
  decision,
  onDispatch,
}: {
  state: GameState;
  decision: PendingDecision;
  onDispatch: (action: GameAction) => void;
}) {
  const player = state.players[decision.playerId]!;
  const pTheme = PLAYER_THEMES[decision.playerId];

  const [discardCounts, setDiscardCounts] = useState<
    Partial<Record<ResourceType | 'science', number>>
  >({});

  // Setup placements are guided by the setup coach in the dock and happen on the board
  if (decision.type === 'SETUP_PLACE_SETTLEMENT' || decision.type === 'SETUP_PLACE_ROAD') {
    return null;
  }

  // DISCARD ON 7 MODAL
  if (decision.type === 'DISCARD_ON_SEVEN') {
    const totalSelected = Object.values(discardCounts).reduce((acc, v) => acc + (v || 0), 0);
    const needed = decision.cardsToDiscard;
    const limit = player.hasWarehouse ? 10 : 7;

    return (
      <div style={MODAL_BACKDROP_STYLE} data-testid="pending-decision-modal">
        <div style={{ ...MODAL_CARD_STYLE, maxWidth: '560px' }} role="dialog" aria-modal="true" aria-labelledby="discard-title">
          <h3 className="md-title" id="discard-title">
            Seven! {player.name} discards {needed} card{needed > 1 ? 's' : ''}
          </h3>
          <p className="md-sub">
            Anyone holding more than {limit} cards gives up half, rounded down. Tap cards to choose
            which ones go back to the supply.
          </p>

          <div className="md-cards">
            {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map((k) => {
              const held = k === 'science' ? player.science : player.resources[k];
              const cur = discardCounts[k] || 0;
              const meta = CARD_METADATA[k];
              const canAdd = cur < held && totalSelected < needed;
              return (
                <div key={k} className="md-card-col">
                  <button
                    type="button"
                    className="tt-res-card md-pick"
                    data-testid={`discard-card-${k}`}
                    data-empty={held - cur === 0 ? 'true' : 'false'}
                    disabled={!canAdd}
                    onClick={() => setDiscardCounts({ ...discardCounts, [k]: Math.min(held, cur + 1) })}
                    aria-label={`Discard one ${meta.label} (${held - cur} left in hand)`}
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
                    <span className="tt-res-count">{held - cur}</span>
                  </button>
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
                </div>
              );
            })}
          </div>

          <div className="md-progress" aria-hidden="true">
            <div style={{ width: `${(totalSelected / needed) * 100}%` }} />
          </div>

          <button
            type="button"
            className="tt-cta"
            data-testid="confirm-discard-btn"
            disabled={totalSelected !== needed}
            onClick={() => {
              onDispatch({
                type: 'RESOLVE_PENDING_DECISION',
                playerId: decision.playerId,
                decisionId: decision.id,
                response: { cards: discardCounts },
              });
              setDiscardCounts({});
            }}
          >
            {totalSelected === needed
              ? `Discard ${needed} card${needed > 1 ? 's' : ''}`
              : `Choose ${needed - totalSelected} more`}
          </button>
        </div>
      </div>
    );
  }

  // EVENT_CARD_CHOICE MODAL
  if (decision.type === 'EVENT_CARD_CHOICE') {
    const isPenalty = decision.event === 'ClimateConferencePenalty';
    const isGov = decision.event === 'GovernmentFunding';
    const copy: Record<typeof decision.event, { title: string; body: string }> = {
      ClimateConferenceReward: {
        title: `Climate Conference: ${player.name} is rewarded`,
        body: 'Lowest local footprint at the table. Take one free card from the supply.',
      },
      ClimateConferencePenalty: {
        title: `Climate Conference: ${player.name} pays up`,
        body: 'Highest local footprint at the table. Discard one card from your hand.',
      },
      GovernmentFunding: {
        title: `Government Funding for ${player.name}`,
        body: 'Lowest local footprint at the table. Take a free development card.',
      },
      SustainableProduction: {
        title: `Sustainable Production: ${player.name} benefits`,
        body: 'Most renewable power plants at the table. Take one free card from the supply.',
      },
    };

    return (
      <div style={MODAL_BACKDROP_STYLE} data-testid="pending-decision-modal">
        <div style={{ ...MODAL_CARD_STYLE, maxWidth: '520px' }} role="dialog" aria-modal="true" aria-labelledby="event-choice-title">
          <h3 className="md-title" id="event-choice-title">
            {copy[decision.event].title}
          </h3>
          <p className="md-sub">{copy[decision.event].body}</p>

          {isGov ? (
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                className="tt-cta"
                data-testid="decision-take-dev-card"
                onClick={() =>
                  onDispatch({
                    type: 'RESOLVE_PENDING_DECISION',
                    playerId: decision.playerId,
                    decisionId: decision.id,
                    response: { take: true },
                  })
                }
              >
                Take a development card
              </button>
              {decision.isOptional && (
                <button
                  type="button"
                  className="tt-icon-btn"
                  style={{ height: 'auto' }}
                  onClick={() =>
                    onDispatch({
                      type: 'RESOLVE_PENDING_DECISION',
                      playerId: decision.playerId,
                      decisionId: decision.id,
                      response: { pass: true },
                    })
                  }
                >
                  Pass
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="md-cards">
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map((k) => {
                  const count = isPenalty
                    ? k === 'science'
                      ? player.science
                      : player.resources[k]
                    : k === 'science'
                      ? state.supply.science
                      : state.supply.resources[k];
                  const meta = CARD_METADATA[k];

                  return (
                    <div key={k} className="md-card-col">
                      <button
                        type="button"
                        className="tt-res-card md-pick"
                        data-testid={`decision-card-${k}`}
                        data-empty={count <= 0 ? 'true' : 'false'}
                        disabled={count <= 0}
                        onClick={() =>
                          onDispatch({
                            type: 'RESOLVE_PENDING_DECISION',
                            playerId: decision.playerId,
                            decisionId: decision.id,
                            response: { cardType: k },
                          })
                        }
                        aria-label={`${isPenalty ? 'Discard' : 'Take'} ${meta.label} (${count} ${isPenalty ? 'in hand' : 'in supply'})`}
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
                        <span className="tt-res-count">{count}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="md-sub" style={{ marginTop: '10px' }}>
                {isPenalty ? 'Numbers show the cards in your hand.' : 'Numbers show what is left in the supply.'}
              </p>
              {decision.isOptional && (
                <button
                  type="button"
                  className="tt-icon-btn"
                  style={{ width: '100%', height: '38px', marginTop: '8px' }}
                  onClick={() =>
                    onDispatch({
                      type: 'RESOLVE_PENDING_DECISION',
                      playerId: decision.playerId,
                      decisionId: decision.id,
                      response: { pass: true },
                    })
                  }
                >
                  Pass
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // STEAL_TARGET MODAL
  if (decision.type === 'STEAL_TARGET') {
    return (
      <div style={MODAL_BACKDROP_STYLE} data-testid="pending-decision-modal">
        <div style={{ ...MODAL_CARD_STYLE, maxWidth: '420px' }}>
          <h3 className="md-title" style={{ marginBottom: '10px' }}>
            Take a card from…
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {decision.candidatePlayerIds.map((vid) => (
              <button
                key={vid}
                type="button"
                data-testid={`steal-target-${vid}`}
                onClick={() =>
                  onDispatch({
                    type: 'RESOLVE_PENDING_DECISION',
                    playerId: decision.playerId,
                    decisionId: decision.id,
                    response: { targetPlayerId: vid },
                  })
                }
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  background: PLAYER_THEMES[vid].fill,
                  color: PLAYER_THEMES[vid].textOnFill,
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Steal 1 Card from {state.players[vid]!.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // DOMESTIC_TRADE_RESPONSE MODAL
  if (decision.type === 'DOMESTIC_TRADE_RESPONSE') {
    const offerer = state.players[decision.offeringPlayerId]!;
    return (
      <div style={MODAL_BACKDROP_STYLE} data-testid="pending-decision-modal">
        <div style={{ ...MODAL_CARD_STYLE, maxWidth: '460px' }}>
          <h3 className="md-title" style={{ marginBottom: '8px' }}>
            {offerer.name} offers {player.name} a trade
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ink-100)', marginBottom: '12px' }}>
            {offerer.name} offers:{' '}
            <strong>
              {Object.entries(decision.give)
                .filter(([, c]) => (c || 0) > 0)
                .map(([k, c]) => `${c}x ${k}`)
                .join(', ')}
            </strong>{' '}
            in exchange for your{' '}
            <strong>
              {Object.entries(decision.want)
                .filter(([, c]) => (c || 0) > 0)
                .map(([k, c]) => `${c}x ${k}`)
                .join(', ')}
            </strong>
            .
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              data-testid="accept-trade-btn"
              onClick={() =>
                onDispatch({
                  type: 'RESOLVE_PENDING_DECISION',
                  playerId: decision.playerId,
                  decisionId: decision.id,
                  response: { accept: true },
                })
              }
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                background: 'var(--leaf)',
                color: '#ffffff',
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Accept Trade
            </button>
            <button
              type="button"
              data-testid="decline-trade-btn"
              onClick={() =>
                onDispatch({
                  type: 'RESOLVE_PENDING_DECISION',
                  playerId: decision.playerId,
                  decisionId: decision.id,
                  response: { accept: false },
                })
              }
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                background: '#c93b2b',
                color: '#ffffff',
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Board-interactive decisions (MOVE_INSPECTOR, EVENT_HAZARD_CHOICE, EVENT_PRODUCTION_INCREASE)
  const sourceLabel =
    decision.type === 'EVENT_HAZARD_CHOICE'
      ? decision.source === 'AirPollution'
        ? 'Air pollution'
        : 'Rain & flooding'
      : null;
  const prompt =
    decision.type === 'MOVE_INSPECTOR'
      ? {
          title: `${player.name}, move the inspector`,
          body: 'Click a glowing hex. You may then take a card from a player with a building there.',
        }
      : decision.type === 'EVENT_HAZARD_CHOICE'
        ? {
            title: `${sourceLabel}: ${player.name} places a hazard`,
            body: 'Click one of your glowing buildings. It stops producing until the hazard clears.',
          }
        : {
            title: `Production increase: a free fossil plant for ${player.name}`,
            body: 'Click a glowing spot next to your town or city, or pass.',
          };

  return (
    <div
      data-testid="pending-decision-banner"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '62px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 120,
        width: 'min(560px, calc(100vw - 32px))',
        background: 'var(--ink-800)',
        color: 'var(--ink-100)',
        borderRadius: '14px',
        padding: '10px 14px 10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: `inset 5px 0 0 ${pTheme.fill}, var(--shadow-ink)`,
        animation: 'toastIn 220ms var(--ease-out)',
      }}
    >
      <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle r="12" fill={pTheme.fill} stroke={pTheme.stroke} strokeWidth="1.2" />
        <PlayerEmblemSvg playerId={decision.playerId} cx={0} cy={0} r={6.5} />
      </svg>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '15px',
            color: '#ffffff',
          }}
        >
          {prompt.title}
        </span>
        <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--ink-300)', marginTop: '1px' }}>
          {prompt.body}
        </span>
      </span>
      {decision.type === 'EVENT_PRODUCTION_INCREASE' && (
        <button
          type="button"
          className="tt-icon-btn"
          data-testid="pass-production-increase-btn"
          onClick={() =>
            onDispatch({
              type: 'RESOLVE_PENDING_DECISION',
              playerId: decision.playerId,
              decisionId: decision.id,
              response: { pass: true },
            })
          }
        >
          Pass
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 6. HOTSEAT PRIVACY CURTAIN MODAL
// ============================================================================

export function PrivacyCurtainModal({
  nextPlayerId,
  nextPlayerName,
  onReady,
}: {
  nextPlayerId: PlayerId;
  nextPlayerName: string;
  onReady: () => void;
}) {
  const pTheme = PLAYER_THEMES[nextPlayerId];
  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="privacy-curtain-modal">
      <div style={{ ...MODAL_CARD_STYLE, maxWidth: '440px', textAlign: 'center' }}>
        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
          <svg width="48" height="48" viewBox="-24 -24 48 48">
            <circle r="21" fill={pTheme.fill} stroke={pTheme.outerHalo} strokeWidth="2.5" />
            <PlayerEmblemSvg playerId={nextPlayerId} cx={0} cy={0} r={10} />
          </svg>
        </div>
        <h2 className="md-title" style={{ fontSize: '26px', marginBottom: '8px' }}>
          Pass the device to {nextPlayerName}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--ink-300)', marginBottom: '18px' }}>
          Private Resource, Science, and Development cards are hidden until you are ready.
        </p>
        <button
          type="button"
          data-testid="privacy-curtain-ready-btn"
          onClick={onReady}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            background: pTheme.fill,
            color: pTheme.textOnFill,
            fontWeight: 900,
            fontSize: '15px',
            border: '2px solid #ffffff',
            cursor: 'pointer',
          }}
        >
          I am {nextPlayerName} — Reveal My Hand
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 7. VICTORY / ENVIRONMENTAL COLLAPSE SUMMARY MODAL
// ============================================================================

export function VictoryModal({
  state,
  onInspectBoard,
  onOpenLobby,
}: {
  state: GameState;
  onInspectBoard: () => void;
  onOpenLobby: () => void;
}) {
  const emptyBagEval = evaluateEmptyBagVictory(state);
  const isCollapse = state.winner === 'collapse';
  const isEmptyBagEnd = state.eventBag.length === 0;
  const winners: PlayerId[] = Array.isArray(state.winner)
    ? state.winner
    : state.winner && state.winner !== 'collapse'
      ? [state.winner]
      : [];

  let headline = 'Game over';
  let subheadline = '';
  if (isCollapse) {
    headline = 'Environmental collapse';
    subheadline =
      'The event bag ran out while nobody had more renewable than fossil fuel plants. Everyone loses.';
  } else if (winners.length > 1) {
    headline = `${winners.map((id) => state.players[id]?.name).join(' & ')} share the win`;
    subheadline = 'The event bag ran out and they tied on the best clean-energy balance.';
  } else if (winners.length === 1) {
    const w = state.players[winners[0]!]!;
    headline = `${w.name} wins!`;
    subheadline = isEmptyBagEnd
      ? `The event bag ran out and ${w.name} had the best balance of renewable over fossil fuel plants.`
      : `${w.name} reached ${w.victoryPoints} victory points on their turn.`;
  }

  const band = winners.length === 1 ? PLAYER_THEMES[winners[0]!] : null;
  const scores = emptyBagEval.details.scores;
  // When the bag runs out the game is decided by renewable-over-fossil balance, not points
  const decidedByBalance =
    isCollapse || (isEmptyBagEnd && !winners.some((pid) => scores[pid]!.totalVp >= 10));
  const rankKey = (pid: PlayerId): number[] => [
    winners.includes(pid) ? 1 : 0,
    ...(decidedByBalance ? [scores[pid]!.netRenewable, scores[pid]!.totalVp] : [scores[pid]!.totalVp]),
  ];
  const standings = [...state.playerOrder].sort((a, b) => {
    const ka = rankKey(a);
    const kb = rankKey(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i]! - ka[i]!;
    return 0;
  });
  const topVp = Math.max(10, ...standings.map((pid) => scores[pid]!.totalVp));
  const topNet = Math.max(1, ...standings.map((pid) => Math.abs(scores[pid]!.netRenewable)));

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="victory-modal">
      <div
        style={{ ...MODAL_CARD_STYLE, maxWidth: '600px', padding: 0, overflow: 'hidden' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="victory-title"
      >
        <div
          style={{
            padding: '22px 24px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: isCollapse
              ? 'linear-gradient(135deg, #5b2a22, #3a1d1a)'
              : band
                ? `linear-gradient(135deg, ${band.fill}, ${band.sideFill})`
                : 'linear-gradient(135deg, var(--leaf), var(--leaf-deep))',
            color: band ? band.textOnFill : '#ffffff',
          }}
        >
          <svg width="56" height="56" viewBox="-28 -28 56 56" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle r="26" fill="rgba(255,255,255,0.22)" />
            {isCollapse ? (
              <path
                d="M -13 6 C -18 6, -20 1, -17 -3 C -17 -9, -10 -12, -6 -9 C -3 -15, 7 -15, 9 -8 C 15 -9, 19 -3, 16 3 C 18 6, 15 9, 11 9 Z"
                fill="#9aa0a6"
                stroke="#3a3d42"
                strokeWidth="2"
              />
            ) : (
              <g>
                <path d="M -12 -15 L 12 -15 L 10 2 C 8 9, -8 9, -10 2 Z" fill="#ffc83a" stroke="#6b4b00" strokeWidth="2" strokeLinejoin="round" />
                <path d="M -12 -11 C -20 -11, -20 -1, -10 0 M 12 -11 C 20 -11, 20 -1, 10 0" fill="none" stroke="#6b4b00" strokeWidth="2.2" />
                <rect x="-3" y="7" width="6" height="7" fill="#e3a312" stroke="#6b4b00" strokeWidth="1.6" />
                <rect x="-9" y="14" width="18" height="5" rx="1.5" fill="#ffc83a" stroke="#6b4b00" strokeWidth="1.8" />
                <path d="M -1.5 -10 L 4 -10 L 0.5 -4 L 4.5 -4 L -3.5 5 L -1 -1.5 L -4.5 -1.5 Z" fill="#fffdf7" />
              </g>
            )}
          </svg>
          <div style={{ minWidth: 0 }}>
            <h2
              id="victory-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '30px',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
              }}
            >
              {headline}
            </h2>
            <p style={{ fontSize: '13.5px', marginTop: '6px', lineHeight: 1.4, opacity: 0.9 }}>{subheadline}</p>
          </div>
        </div>

        <div style={{ padding: '16px 24px 20px' }}>
          <div role="table" aria-label="Final standings" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {standings.map((pid, idx) => {
              const p = state.players[pid]!;
              const sc = emptyBagEval.details.scores[pid]!;
              const pTheme = PLAYER_THEMES[pid];
              const isWinner = winners.includes(pid);
              return (
                <div
                  key={pid}
                  role="row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '22px 1fr 210px auto',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    background: isWinner ? 'rgba(255, 200, 58, 0.1)' : 'rgba(255,255,255,0.04)',
                    boxShadow: `inset 4px 0 0 ${pTheme.fill}`,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--ink-300)' }}>{idx + 1}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true">
                      <circle r="10" fill={pTheme.fill} stroke={pTheme.stroke} strokeWidth="1.2" />
                      <PlayerEmblemSvg playerId={pid} cx={0} cy={0} r={5.6} />
                    </svg>
                    <span style={{ fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                  </span>
                  <span role="cell" title={`${sc.totalVp} victory points, ${sc.netRenewable} clean-energy balance`}>
                    <span style={{ display: 'block', height: '6px', borderRadius: '999px', background: 'var(--ink-950)', overflow: 'hidden' }}>
                      <span
                        style={{
                          display: 'block',
                          height: '100%',
                          width: `${Math.min(
                            100,
                            decidedByBalance
                              ? (Math.max(0, sc.netRenewable) / topNet) * 100
                              : (sc.totalVp / topVp) * 100
                          )}%`,
                          background: pTheme.fill,
                          borderRadius: '999px',
                        }}
                      />
                    </span>
                    <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--ink-300)', marginTop: '3px' }}>
                      {decidedByBalance ? `${sc.totalVp} VP · ` : ''}
                      {sc.renewableBuilt} renewable · {sc.fossilBuilt} fossil · footprint {sc.localFootprint}
                    </span>
                  </span>
                  <span
                    role="cell"
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', color: '#ffffff', textAlign: 'right' }}
                  >
                    {decidedByBalance ? `${sc.netRenewable > 0 ? '+' : ''}${sc.netRenewable}` : sc.totalVp}
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-300)', marginLeft: '3px' }}>
                      {decidedByBalance ? 'balance' : 'VP'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button
              type="button"
              className="tt-icon-btn"
              data-testid="victory-inspect-board-btn"
              onClick={onInspectBoard}
              style={{ height: '50px', flex: '0 0 auto', padding: '0 18px' }}
            >
              Look at the board
            </button>
            <button type="button" className="tt-cta is-ready" data-testid="victory-new-game-btn" onClick={onOpenLobby}>
              New game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
