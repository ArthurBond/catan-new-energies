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
import { useState } from 'preact/hooks';
import { getHarborsForPlayer } from '../engine/board';
import { RESOURCE_TYPES } from '../engine/config';
import { isEdgeConnectedToPlayerNetwork } from '../engine/dev-cards';
import { getEligibleStealVictims, getHandSizeForSeven } from '../engine/production';
import {
  DevelopmentCardType,
  DevCardPlayParams,
  EdgeId,
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
} from './theme';
import { PlayerEmblemSvg } from './WoodenPiecesSvg';

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
  const [supplyGiveType, setSupplyGiveType] = useState<ResourceType | 'science' | 'energy'>('lumber');
  const [supplyReceiveType, setSupplyReceiveType] = useState<ResourceType | 'science'>('science');

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--volt)' }}>
            Maritime, Supply & Domestic Trade
          </h3>
          <button
            type="button"
            data-testid="close-trade-modal"
            onClick={onClose}
            style={{
              padding: '5px 12px',
              borderRadius: '8px',
              background: 'var(--ink-700)',
              color: '#ffffff',
              border: '1px solid rgba(163, 183, 202, 0.28)',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Close
          </button>
        </div>

        {/* Mode Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button
            type="button"
            data-testid="trade-tab-supply"
            onClick={() => setTab('supply')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              fontWeight: 800,
              cursor: 'pointer',
              background: tab === 'supply' ? 'var(--sea)' : 'var(--ink-700)',
              color: '#ffffff',
              border: '1px solid rgba(163, 183, 202, 0.28)',
            }}
          >
            Supply Trade (4:1 / 3:1 Sci / 2:1 ⚡)
          </button>
          <button
            type="button"
            data-testid="trade-tab-harbor"
            onClick={() => setTab('harbor')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              fontWeight: 800,
              cursor: 'pointer',
              background: tab === 'harbor' ? 'var(--sea)' : 'var(--ink-700)',
              color: '#ffffff',
              border: '1px solid rgba(163, 183, 202, 0.28)',
            }}
          >
            Harbors ({playerHarbors.length})
          </button>
          <button
            type="button"
            data-testid="trade-tab-domestic"
            onClick={() => setTab('domestic')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              fontWeight: 800,
              cursor: 'pointer',
              background: tab === 'domestic' ? 'var(--sea)' : 'var(--ink-700)',
              color: '#ffffff',
              border: '1px solid rgba(163, 183, 202, 0.28)',
            }}
          >
            Domestic P2P Trade
          </button>
        </div>

        {tab === 'supply' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: 'var(--ink-100)' }}>
                1. GIVE TO SUPPLY (4 Resource, 3 Science, or 2 Energy):
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science', 'energy'] as const).map(
                  (key) => {
                    const req = key === 'energy' ? 2 : key === 'science' ? 3 : 4;
                    const held =
                      key === 'energy'
                        ? player.energy
                        : key === 'science'
                          ? player.science
                          : player.resources[key];
                    const label =
                      key === 'energy' ? 'Energy ⚡' : CARD_METADATA[key].shortLabel;

                    return (
                      <button
                        key={key}
                        type="button"
                        data-testid={`supply-give-${key}`}
                        onClick={() => setSupplyGiveType(key)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: 'pointer',
                          background: supplyGiveType === key ? 'var(--leaf)' : 'var(--ink-700)',
                          color: held >= req ? '#ffffff' : 'var(--ink-300)',
                          border:
                            supplyGiveType === key ? '2px solid var(--volt)' : '1px solid rgba(163, 183, 202, 0.28)',
                        }}
                      >
                        {req}x {label} (Have {held})
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: 'var(--ink-100)' }}>
                2. RECEIVE 1 CARD FROM SUPPLY:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map(
                  (key) => (
                    <button
                      key={key}
                      type="button"
                      data-testid={`supply-receive-${key}`}
                      onClick={() => setSupplyReceiveType(key)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: supplyReceiveType === key ? 'var(--sea)' : 'var(--ink-700)',
                        color: '#ffffff',
                        border:
                          supplyReceiveType === key ? '2px solid var(--volt)' : '1px solid rgba(163, 183, 202, 0.28)',
                      }}
                    >
                      1x {CARD_METADATA[key].label}
                    </button>
                  )
                )}
              </div>
            </div>

            <button
              type="button"
              data-testid="execute-supply-trade-btn"
              disabled={!canExecuteSupplyTrade}
              onClick={() => {
                onDispatch({
                  type: 'TRADE_SUPPLY',
                  playerId,
                  give: { [supplyGiveType]: requiredSupplyAmount },
                  receive: supplyReceiveType,
                });
                onClose();
              }}
              style={{
                padding: '10px',
                borderRadius: '8px',
                fontWeight: 900,
                background: canExecuteSupplyTrade ? 'var(--leaf)' : 'var(--ink-700)',
                color: canExecuteSupplyTrade ? '#ffffff' : 'var(--ink-300)',
                border: '1px solid rgba(163, 183, 202, 0.28)',
                cursor: canExecuteSupplyTrade ? 'pointer' : 'not-allowed',
              }}
            >
              Execute Supply Trade
            </button>
          </div>
        )}

        {tab === 'harbor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {playerHarbors.length === 0 ? (
              <p style={{ color: 'var(--ink-300)', fontSize: '13px' }}>
                You do not currently have a Town or City on any coastal Harbor intersection.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {playerHarbors.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSelectedHarborId(h.id)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        fontWeight: 800,
                        background: selectedHarbor?.id === h.id ? 'var(--sea)' : 'var(--ink-700)',
                        color: '#ffffff',
                        border: '1px solid rgba(163, 183, 202, 0.28)',
                        cursor: 'pointer',
                      }}
                    >
                      Harbor #{h.id} ({h.ratio}:1 {h.resource ? CARD_METADATA[h.resource].shortLabel : 'Generic'})
                    </button>
                  ))}
                </div>

                {selectedHarbor?.type === 'generic' && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>
                      Give 3 of Resource:
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {RESOURCE_TYPES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setHarborGiveRes(r)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            background: harborGiveRes === r ? 'var(--leaf)' : 'var(--ink-700)',
                            color: '#ffffff',
                            border: '1px solid rgba(163, 183, 202, 0.28)',
                            cursor: 'pointer',
                          }}
                        >
                          3x {CARD_METADATA[r].shortLabel} (Have {player.resources[r]})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>
                    Receive 1 Card:
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map(
                      (k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setHarborReceiveType(k)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            background: harborReceiveType === k ? 'var(--sea)' : 'var(--ink-700)',
                            color: '#ffffff',
                            border: '1px solid rgba(163, 183, 202, 0.28)',
                            cursor: 'pointer',
                          }}
                        >
                          1x {CARD_METADATA[k].shortLabel}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canExecuteHarborTrade}
                  onClick={() => {
                    if (!selectedHarbor) return;
                    onDispatch({
                      type: 'TRADE_HARBOR',
                      playerId,
                      harborId: selectedHarbor.id,
                      give: { [effectiveHarborGive]: requiredHarborAmount },
                      receive: harborReceiveType,
                    });
                    onClose();
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    fontWeight: 900,
                    background: canExecuteHarborTrade ? 'var(--leaf)' : 'var(--ink-700)',
                    color: canExecuteHarborTrade ? '#ffffff' : 'var(--ink-300)',
                    border: '1px solid rgba(163, 183, 202, 0.28)',
                    cursor: canExecuteHarborTrade ? 'pointer' : 'not-allowed',
                  }}
                >
                  Execute Harbor Trade
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'domestic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800 }}>Trade With Opponent:</span>
              {state.playerOrder
                .filter((p) => p !== playerId)
                .map((pid) => (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => setDomesticTarget(pid)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontWeight: 800,
                      background:
                        domesticTarget === pid ? PLAYER_THEMES[pid].fill : 'var(--ink-700)',
                      color:
                        domesticTarget === pid
                          ? PLAYER_THEMES[pid].textOnFill
                          : 'var(--ink-100)',
                      border: '1px solid rgba(163, 183, 202, 0.28)',
                      cursor: 'pointer',
                    }}
                  >
                    {state.players[pid]!.name}
                  </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, marginBottom: '6px', color: 'var(--volt)' }}>
                  YOU OFFER:
                </div>
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science', 'energy'] as const).map(
                  (k) => {
                    const maxHeld =
                      k === 'energy'
                        ? player.energy
                        : k === 'science'
                          ? player.science
                          : player.resources[k];
                    const cur = domesticGive[k] || 0;
                    return (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                        <span>{k === 'energy' ? 'Energy ⚡' : CARD_METADATA[k].shortLabel} ({maxHeld})</span>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setDomesticGive({ ...domesticGive, [k]: Math.max(0, cur - 1) })
                            }
                            style={{ padding: '1px 6px', cursor: 'pointer' }}
                          >
                            -
                          </button>
                          <span style={{ minWidth: '16px', textAlign: 'center', fontWeight: 800 }}>{cur}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setDomesticGive({ ...domesticGive, [k]: Math.min(maxHeld, cur + 1) })
                            }
                            style={{ padding: '1px 6px', cursor: 'pointer' }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, marginBottom: '6px', color: '#8ce09a' }}>
                  YOU REQUEST:
                </div>
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science', 'energy'] as const).map(
                  (k) => {
                    const cur = domesticWant[k] || 0;
                    return (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                        <span>{k === 'energy' ? 'Energy ⚡' : CARD_METADATA[k].shortLabel}</span>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setDomesticWant({ ...domesticWant, [k]: Math.max(0, cur - 1) })
                            }
                            style={{ padding: '1px 6px', cursor: 'pointer' }}
                          >
                            -
                          </button>
                          <span style={{ minWidth: '16px', textAlign: 'center', fontWeight: 800 }}>{cur}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setDomesticWant({ ...domesticWant, [k]: Math.min(5, cur + 1) })
                            }
                            style={{ padding: '1px 6px', cursor: 'pointer' }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            <button
              type="button"
              data-testid="send-domestic-offer-btn"
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
              style={{
                padding: '10px',
                borderRadius: '8px',
                fontWeight: 900,
                background: 'var(--sea)',
                color: '#ffffff',
                border: '1px solid #90cdf4',
                cursor: 'pointer',
              }}
            >
              Send Domestic Trade Offer
            </button>
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
        <h3 style={{ fontSize: '17px', fontWeight: 900, color: 'var(--volt)', marginBottom: '8px' }}>
          Spend 2 Energy Bolts &rarr; Take 1 Card
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

export function DevCardPlayModal({
  state,
  cardId,
  cardType,
  onDispatch,
  onClose,
}: {
  state: GameState;
  cardId: string;
  cardType: DevelopmentCardType;
  onDispatch: (action: GameAction) => void;
  onClose: () => void;
}) {
  const playerId = state.activePlayerId;
  const player = state.players[playerId]!;
  const meta = DEV_CARD_METADATA[cardType];

  // Cleanup state
  const [cleanupMode, setCleanupMode] = useState<'INSPECTOR' | 'HAZARD'>('INSPECTOR');
  const legalInspectorHexes = state.board.hexes.filter((h) => !h.hasHazard && !h.hasInspector);
  const [selectedInspectorHex, setSelectedInspectorHex] = useState<HexId>(
    legalInspectorHexes[0]?.id ?? 0
  );

  // Hazard targets for Cleanup Option 2
  const hazardTargets: { kind: 'hex' | 'node'; id: number; label: string }[] = [];
  for (const h of state.board.hexes) {
    if (h.hasHazard) {
      hazardTargets.push({ kind: 'hex', id: h.id, label: `Hex #${h.id} (${h.terrain})` });
    }
  }
  for (const n of state.board.intersections) {
    if (n.hasHazard) {
      hazardTargets.push({
        kind: 'node',
        id: n.id,
        label: `Intersection #${n.id} (${n.building?.type ?? 'settlement'})`,
      });
    }
  }
  const [selectedHazardIdx, setSelectedHazardIdx] = useState(0);

  // Research Grant state
  const [grantCard1, setGrantCard1] = useState<ResourceType | 'science'>('science');
  const [grantCard2, setGrantCard2] = useState<ResourceType | 'science'>('science');

  // Road Construction connected edges
  const connectedEdges: EdgeId[] = state.board.edges
    .filter((e) => e.road === null && isEdgeConnectedToPlayerNetwork(state.board, playerId, e.id))
    .map((e) => e.id);
  const [roadEdge1, setRoadEdge1] = useState<EdgeId>(connectedEdges[0] ?? 0);

  // High Yield eligible renewable hexes
  const renewableHexes: HexId[] = state.board.hexes
    .filter((h) =>
      state.board.intersections.some(
        (n) =>
          n.adjacentHexIds.includes(h.id) &&
          n.powerPlants.some(
            (p) => p.playerId === playerId && p.type === 'renewable' && p.hexId === h.id
          )
      )
    )
    .map((h) => h.id);

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="dev-card-modal">
      <div style={{ ...MODAL_CARD_STYLE, maxWidth: '540px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: meta.color }}>
            Play {meta.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'var(--ink-700)',
              color: '#ffffff',
              border: '1px solid rgba(163, 183, 202, 0.28)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>

        <p style={{ fontSize: '12.5px', color: 'var(--ink-100)', marginBottom: '14px' }}>
          {meta.description}
        </p>

        {cardType === 'cleanup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCleanupMode('INSPECTOR')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  background: cleanupMode === 'INSPECTOR' ? 'var(--leaf)' : 'var(--ink-700)',
                  color: '#ffffff',
                  border: '1px solid rgba(163, 183, 202, 0.28)',
                  cursor: 'pointer',
                }}
              >
                Option A: Move Inspector & Steal
              </button>
              <button
                type="button"
                onClick={() => setCleanupMode('HAZARD')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  background: cleanupMode === 'HAZARD' ? 'var(--leaf)' : 'var(--ink-700)',
                  color: '#ffffff',
                  border: '1px solid rgba(163, 183, 202, 0.28)',
                  cursor: 'pointer',
                }}
              >
                Option B: Remove Hazard & Steal (&ge; LF)
              </button>
            </div>

            {cleanupMode === 'INSPECTOR' ? (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>
                  Select Target Hex for Inspector:
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {legalInspectorHexes.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSelectedInspectorHex(h.id)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: selectedInspectorHex === h.id ? 'var(--sea)' : 'var(--ink-700)',
                        color: '#ffffff',
                        border: '1px solid rgba(163, 183, 202, 0.28)',
                        cursor: 'pointer',
                      }}
                    >
                      Hex #{h.id} ({h.terrain} {h.numberDisc ?? ''})
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="confirm-play-cleanup"
                  onClick={() => {
                    const victims = getEligibleStealVictims(state, selectedInspectorHex);
                    const params: DevCardPlayParams = {
                      cardType: 'cleanup',
                      option: {
                        type: 'INSPECTOR_MOVE_STEAL',
                        newHexId: selectedInspectorHex,
                        targetPlayerId: victims[0],
                      },
                    };
                    onDispatch({ type: 'PLAY_DEV_CARD', playerId, cardId, params });
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'var(--leaf)',
                    color: '#ffffff',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Confirm Move Inspector & Steal
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>
                  {hazardTargets.length > 0
                    ? 'Select Hazard Token to Remove:'
                    : 'No Hazard Tokens on board (will still steal from player with >= LF if available):'}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {hazardTargets.map((t, idx) => (
                    <button
                      key={`${t.kind}-${t.id}`}
                      type="button"
                      onClick={() => setSelectedHazardIdx(idx)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: selectedHazardIdx === idx ? 'var(--sea)' : 'var(--ink-700)',
                        color: '#ffffff',
                        border: '1px solid rgba(163, 183, 202, 0.28)',
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="confirm-play-cleanup-hazard"
                  onClick={() => {
                    const target = hazardTargets[selectedHazardIdx] ?? {
                      kind: 'hex' as const,
                      id: 0,
                    };
                    const lfVictims = state.playerOrder.filter(
                      (pid) =>
                        pid !== playerId &&
                        state.players[pid]!.localFootprint >= player.localFootprint &&
                        getHandSizeForSeven(state.players[pid]!) > 0
                    );
                    const params: DevCardPlayParams = {
                      cardType: 'cleanup',
                      option: {
                        type: 'REMOVE_HAZARD_STEAL',
                        hazardTarget: { kind: target.kind, id: target.id },
                        targetPlayerId: lfVictims[0],
                      },
                    };
                    onDispatch({ type: 'PLAY_DEV_CARD', playerId, cardId, params });
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'var(--leaf)',
                    color: '#ffffff',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Confirm Remove Hazard & Steal
                </button>
              </div>
            )}
          </div>
        )}

        {cardType === 'researchGrant' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>First Free Card:</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setGrantCard1(k)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        background: grantCard1 === k ? 'var(--sea)' : 'var(--ink-700)',
                        color: '#ffffff',
                        border: '1px solid rgba(163, 183, 202, 0.28)',
                        cursor: 'pointer',
                      }}
                    >
                      {CARD_METADATA[k].shortLabel}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>Second Free Card:</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setGrantCard2(k)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        background: grantCard2 === k ? 'var(--sea)' : 'var(--ink-700)',
                        color: '#ffffff',
                        border: '1px solid rgba(163, 183, 202, 0.28)',
                        cursor: 'pointer',
                      }}
                    >
                      {CARD_METADATA[k].shortLabel}
                    </button>
                  )
                )}
              </div>
            </div>

            <button
              type="button"
              data-testid="confirm-play-research-grant"
              onClick={() => {
                onDispatch({
                  type: 'PLAY_DEV_CARD',
                  playerId,
                  cardId,
                  params: { cardType: 'researchGrant', cards: [grantCard1, grantCard2] },
                });
                onClose();
              }}
              style={{
                padding: '10px',
                borderRadius: '8px',
                background: 'var(--sea)',
                color: '#ffffff',
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Take 2 Cards ({CARD_METADATA[grantCard1].shortLabel} + {CARD_METADATA[grantCard2].shortLabel})
            </button>
          </div>
        )}

        {cardType === 'highYield' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-100)' }}>
              Eligible hexes with your Renewable Power Plants:{' '}
              {renewableHexes.length > 0
                ? renewableHexes.map((id) => `Hex #${id} (${state.board.hexes[id]!.terrain})`).join(', ')
                : 'None currently built'}
            </div>
            <button
              type="button"
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
              style={{
                padding: '10px',
                borderRadius: '8px',
                background: renewableHexes.length > 0 ? '#dfb441' : 'var(--ink-700)',
                color: '#1e190d',
                fontWeight: 900,
                border: 'none',
                cursor: renewableHexes.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Harvest High Yield Resources
            </button>
          </div>
        )}

        {cardType === 'roadConstruction' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800 }}>
              Select First Road Path Edge:
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {connectedEdges.map((eId) => (
                <button
                  key={eId}
                  type="button"
                  onClick={() => setRoadEdge1(eId)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '6px',
                    fontWeight: 800,
                    background: roadEdge1 === eId ? '#b65c3b' : 'var(--ink-700)',
                    color: '#ffffff',
                    border: '1px solid rgba(163, 183, 202, 0.28)',
                    cursor: 'pointer',
                  }}
                >
                  Path #{eId}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={connectedEdges.length === 0}
              onClick={() => {
                const secondEdge = state.board.edges.find(
                  (e) =>
                    e.id !== roadEdge1 &&
                    e.road === null &&
                    isEdgeConnectedToPlayerNetwork(state.board, playerId, e.id, [roadEdge1])
                )?.id;
                onDispatch({
                  type: 'PLAY_DEV_CARD',
                  playerId,
                  cardId,
                  params: {
                    cardType: 'roadConstruction',
                    edge1: roadEdge1,
                    ...(player.roadsInReserve >= 2 && secondEdge !== undefined
                      ? { edge2: secondEdge }
                      : {}),
                  },
                });
                onClose();
              }}
              style={{
                padding: '10px',
                borderRadius: '8px',
                background: '#b65c3b',
                color: '#ffffff',
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Place Free Road(s)
            </button>
          </div>
        )}
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

    return (
      <div style={MODAL_BACKDROP_STYLE} data-testid="pending-decision-modal">
        <div style={{ ...MODAL_CARD_STYLE, maxWidth: '480px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--volt)', marginBottom: '6px' }}>
            Roll of 7 — {player.name} Must Discard {needed} Card{needed > 1 ? 's' : ''}
          </h3>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-100)', marginBottom: '12px' }}>
            Selected: {totalSelected} / {needed}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
            {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map(
              (k) => {
                const held = k === 'science' ? player.science : player.resources[k];
                if (held === 0) return null;
                const cur = discardCounts[k] || 0;

                return (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 10px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: '13px' }}>
                      {CARD_METADATA[k].label} (In hand: {held})
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setDiscardCounts({ ...discardCounts, [k]: Math.max(0, cur - 1) })
                        }
                        style={{ padding: '3px 10px', cursor: 'pointer', fontWeight: 900 }}
                      >
                        -
                      </button>
                      <span style={{ fontWeight: 900, minWidth: '20px', textAlign: 'center' }}>
                        {cur}
                      </span>
                      <button
                        type="button"
                        disabled={cur >= held || totalSelected >= needed}
                        onClick={() =>
                          setDiscardCounts({ ...discardCounts, [k]: Math.min(held, cur + 1) })
                        }
                        style={{ padding: '3px 10px', cursor: 'pointer', fontWeight: 900 }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              }
            )}
          </div>

          <button
            type="button"
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
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              fontWeight: 900,
              background: totalSelected === needed ? '#c93b2b' : 'var(--ink-700)',
              color: '#ffffff',
              border: 'none',
              cursor: totalSelected === needed ? 'pointer' : 'not-allowed',
            }}
          >
            Confirm Discard ({totalSelected}/{needed})
          </button>
        </div>
      </div>
    );
  }

  // EVENT_CARD_CHOICE MODAL
  if (decision.type === 'EVENT_CARD_CHOICE') {
    const isPenalty = decision.event === 'ClimateConferencePenalty';
    const isGov = decision.event === 'GovernmentFunding';

    return (
      <div style={MODAL_BACKDROP_STYLE} data-testid="pending-decision-modal">
        <div style={{ ...MODAL_CARD_STYLE, maxWidth: '480px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--volt)', marginBottom: '8px' }}>
            Event Decision — {player.name} ({decision.event})
          </h3>

          {isGov ? (
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                data-testid="decision-take-dev-card"
                onClick={() =>
                  onDispatch({
                    type: 'RESOLVE_PENDING_DECISION',
                    playerId: decision.playerId,
                    decisionId: decision.id,
                    response: { take: true },
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
                Take 1 Free Development Card
              </button>
              {decision.isOptional && (
                <button
                  type="button"
                  onClick={() =>
                    onDispatch({
                      type: 'RESOLVE_PENDING_DECISION',
                      playerId: decision.playerId,
                      decisionId: decision.id,
                      response: { pass: true },
                    })
                  }
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    background: 'var(--ink-700)',
                    color: '#ffffff',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Pass
                </button>
              )}
            </div>
          ) : (
            <>
              <p style={{ fontSize: '12.5px', color: 'var(--ink-100)', marginBottom: '12px' }}>
                {isPenalty
                  ? 'Climate Conference Penalty: Choose 1 card from your hand to discard:'
                  : 'Choose 1 free card from the global supply:'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const).map(
                  (k) => {
                    const count = isPenalty
                      ? k === 'science'
                        ? player.science
                        : player.resources[k]
                      : k === 'science'
                        ? state.supply.science
                        : state.supply.resources[k];

                    return (
                      <button
                        key={k}
                        type="button"
                        data-testid={`decision-card-${k}`}
                        disabled={count <= 0}
                        onClick={() =>
                          onDispatch({
                            type: 'RESOLVE_PENDING_DECISION',
                            playerId: decision.playerId,
                            decisionId: decision.id,
                            response: { cardType: k },
                          })
                        }
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          fontWeight: 800,
                          background: count > 0 ? CARD_METADATA[k].bg : 'var(--ink-700)',
                          color: count > 0 ? CARD_METADATA[k].textColor : 'var(--ink-300)',
                          border: '1px solid rgba(163, 183, 202, 0.28)',
                          cursor: count > 0 ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {CARD_METADATA[k].shortLabel} ({count})
                      </button>
                    );
                  }
                )}
              </div>
              {decision.isOptional && (
                <button
                  type="button"
                  onClick={() =>
                    onDispatch({
                      type: 'RESOLVE_PENDING_DECISION',
                      playerId: decision.playerId,
                      decisionId: decision.id,
                      response: { pass: true },
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    background: 'var(--ink-700)',
                    color: '#ffffff',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
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
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--volt)', marginBottom: '10px' }}>
            Environmental Inspector — Choose Steal Victim
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
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--volt)', marginBottom: '8px' }}>
            Trade Offer for {player.name} from {offerer.name}
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
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', marginBottom: '8px' }}>
          Pass Device to {nextPlayerName}
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

  let headline = 'Victory!';
  let subheadline = '';

  if (isCollapse) {
    headline = 'Total Environmental Collapse!';
    subheadline =
      'The Event Bag emptied while no player had more Renewable Power Plants than Fossil Fuel Power Plants. All players lose!';
  } else if (Array.isArray(state.winner)) {
    const names = state.winner.map((id) => state.players[id]?.name).join(' & ');
    headline = `Shared Sustainable Victory: ${names}!`;
    subheadline = 'The Event Bag emptied and tied players triumphed on Renewable Energy Balance!';
  } else if (state.winner && state.winner !== 'collapse') {
    const wPlayer = state.players[state.winner]!;
    headline = `${wPlayer.name} Wins CATAN: New Energies!`;
    subheadline = isEmptyBagEnd
      ? `${wPlayer.name} triumphed via Sustainable Renewable Energy Balance when the Event Bag emptied!`
      : `${wPlayer.name} achieved ${wPlayer.victoryPoints} Victory Points on their turn!`;
  }

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="victory-modal">
      <div style={MODAL_CARD_STYLE}>
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 900,
            color: isCollapse ? '#ff6b6b' : 'var(--volt)',
            marginBottom: '6px',
          }}
        >
          {headline}
        </h2>
        <p style={{ fontSize: '13.5px', color: 'var(--ink-100)', marginBottom: '16px' }}>
          {subheadline}
        </p>

        {/* Comparison Table */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '18px',
            fontSize: '12.5px',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(163, 183, 202, 0.22)', color: 'var(--ink-300)', textAlign: 'left' }}>
              <th style={{ padding: '8px' }}>Player</th>
              <th style={{ padding: '8px' }}>Total VP</th>
              <th style={{ padding: '8px' }}>Renewables</th>
              <th style={{ padding: '8px' }}>Fossil</th>
              <th style={{ padding: '8px' }}>Net Eco</th>
              <th style={{ padding: '8px' }}>Footprint (LF)</th>
            </tr>
          </thead>
          <tbody>
            {state.playerOrder.map((pid) => {
              const p = state.players[pid]!;
              const sc = emptyBagEval.details.scores[pid]!;
              const pTheme = PLAYER_THEMES[pid];

              return (
                <tr key={pid} style={{ borderBottom: '1px solid var(--ink-700)' }}>
                  <td style={{ padding: '8px', fontWeight: 800, color: pTheme.fill }}>
                    {p.name}
                  </td>
                  <td style={{ padding: '8px', fontWeight: 900 }}>{sc.totalVp} VP</td>
                  <td style={{ padding: '8px', color: '#8ce09a', fontWeight: 800 }}>
                    {sc.renewableBuilt}
                  </td>
                  <td style={{ padding: '8px', color: '#d09b72', fontWeight: 800 }}>
                    {sc.fossilBuilt}
                  </td>
                  <td
                    style={{
                      padding: '8px',
                      fontWeight: 900,
                      color: sc.netRenewable > 0 ? '#8ce09a' : '#fc8181',
                    }}
                  >
                    {sc.netRenewable > 0 ? `+${sc.netRenewable}` : sc.netRenewable}
                  </td>
                  <td style={{ padding: '8px' }}>{sc.localFootprint} LF</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            data-testid="victory-inspect-board-btn"
            onClick={onInspectBoard}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              background: 'var(--ink-700)',
              color: '#ffffff',
              fontWeight: 800,
              border: '1px solid rgba(163, 183, 202, 0.28)',
              cursor: 'pointer',
            }}
          >
            Inspect Final Board
          </button>
          <button
            type="button"
            data-testid="victory-new-game-btn"
            onClick={onOpenLobby}
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
            New Tabletop Game
          </button>
        </div>
      </div>
    </div>
  );
}
