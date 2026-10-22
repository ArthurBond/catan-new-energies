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
  setupMode: 'first' | 'standard';
  seed: number;
  botSpeed: BotSpeedMode;
  privacyCurtain: boolean;
  roomCode: string;
  seats: Record<PlayerId, SeatConfig>;
}

const MODAL_BACKDROP_STYLE: Record<string, string | number> = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10, 14, 20, 0.78)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
  padding: '16px',
};

const MODAL_CARD_STYLE: Record<string, string | number> = {
  background: 'linear-gradient(180deg, #232830 0%, #171a20 100%)',
  border: '2px solid #454d5c',
  borderRadius: '16px',
  padding: '20px 24px',
  color: '#f0f4f8',
  maxWidth: '680px',
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 50px rgba(0,0,0,0.75)',
};

// ============================================================================
// 1. SETUP / LOBBY MODAL
// ============================================================================

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

  return (
    <div style={MODAL_BACKDROP_STYLE} data-testid="lobby-modal">
      <div style={MODAL_CARD_STYLE}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#f5d11d', letterSpacing: '0.4px' }}>
              CATAN: New Energies — Tabletop Setup
            </h2>
            <p style={{ fontSize: '12.5px', color: '#a0aec0', marginTop: '2px' }}>
              Configure players, AI personalities, setup mode, or join a multi-tab room.
            </p>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#2d333d',
                color: '#e2e8f0',
                border: '1px solid #4a5260',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Resume Game
            </button>
          )}
        </div>

        {/* Row 1: Player Count & Setup Mode & Seed */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(0,0,0,0.28)',
            borderRadius: '12px',
            border: '1px solid #343a44',
          }}
        >
          {/* Player Count */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#cbd5e0', marginBottom: '6px' }}>
              PLAYER COUNT
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {([3, 4] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  data-testid={`lobby-player-count-${cnt}`}
                  onClick={() => onChangeConfig({ ...config, playerCount: cnt })}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    background: config.playerCount === cnt ? '#3676c8' : '#262b33',
                    color: '#ffffff',
                    border: config.playerCount === cnt ? '2px solid #90cdf4' : '1px solid #4a5260',
                  }}
                >
                  {cnt} Players
                </button>
              ))}
            </div>
          </div>

          {/* Setup Mode */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#cbd5e0', marginBottom: '6px' }}>
              BOARD SETUP MODE
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                data-testid="lobby-setup-first"
                onClick={() => onChangeConfig({ ...config, setupMode: 'first' })}
                style={{
                  flex: 1,
                  padding: '7px 8px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: config.setupMode === 'first' ? '#2e8540' : '#262b33',
                  color: '#ffffff',
                  border: config.setupMode === 'first' ? '2px solid #8ce09a' : '1px solid #4a5260',
                }}
              >
                First Game (Fixed)
              </button>
              <button
                type="button"
                data-testid="lobby-setup-standard"
                onClick={() => onChangeConfig({ ...config, setupMode: 'standard' })}
                style={{
                  flex: 1,
                  padding: '7px 8px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: config.setupMode === 'standard' ? '#2e8540' : '#262b33',
                  color: '#ffffff',
                  border: config.setupMode === 'standard' ? '2px solid #8ce09a' : '1px solid #4a5260',
                }}
              >
                Variable Draft
              </button>
            </div>
          </div>

          {/* Deterministic Seed */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#cbd5e0', marginBottom: '6px' }}>
              PRNG SEED
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="number"
                data-testid="lobby-seed-input"
                value={config.seed}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    seed: parseInt((e.target as HTMLInputElement).value, 10) || 42,
                  })
                }
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#181b20',
                  border: '1px solid #4a5260',
                  color: '#ffffff',
                  fontWeight: 700,
                }}
              />
              <button
                type="button"
                onClick={() =>
                  onChangeConfig({ ...config, seed: Math.floor(Math.random() * 99999) + 1 })
                }
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#2d333d',
                  border: '1px solid #4a5260',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                Random
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Player Seats Configuration */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#cbd5e0', marginBottom: '8px' }}>
            PLAYER SEATS & AI PERSONALITIES
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeSeatIds.map((pid) => {
              const seat = config.seats[pid];
              const pTheme = PLAYER_THEMES[pid];

              return (
                <div
                  key={pid}
                  data-testid={`lobby-seat-${pid}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${pTheme.fill}`,
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Color & Emblem */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
                    <svg width="22" height="22" viewBox="-11 -11 22 22">
                      <circle r="10" fill={pTheme.fill} stroke={pTheme.outerHalo} strokeWidth="1.5" />
                      <PlayerEmblemSvg playerId={pid} cx={0} cy={0} r={4.8} />
                    </svg>
                    <input
                      type="text"
                      value={seat.name}
                      onChange={(e) =>
                        onChangeConfig({
                          ...config,
                          seats: {
                            ...config.seats,
                            [pid]: { ...seat, name: (e.target as HTMLInputElement).value },
                          },
                        })
                      }
                      style={{
                        width: '86px',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        background: '#14171c',
                        border: '1px solid #3c424d',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    />
                  </div>

                  {/* Human vs Bot Toggle */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['human', 'bot'] as const).map((ctrl) => (
                      <button
                        key={ctrl}
                        type="button"
                        data-testid={`lobby-seat-${pid}-${ctrl}`}
                        onClick={() =>
                          onChangeConfig({
                            ...config,
                            seats: {
                              ...config.seats,
                              [pid]: { ...seat, controller: ctrl },
                            },
                          })
                        }
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: seat.controller === ctrl ? pTheme.fill : '#252930',
                          color: seat.controller === ctrl ? pTheme.textOnFill : '#a0aec0',
                          border: '1px solid #4a5260',
                        }}
                      >
                        {ctrl === 'human' ? 'Human' : 'AI Bot'}
                      </button>
                    ))}
                  </div>

                  {/* Bot Strategy & Difficulty */}
                  {seat.controller === 'bot' && (
                    <div style={{ display: 'flex', gap: '8px', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <select
                        data-testid={`lobby-seat-${pid}-strategy`}
                        value={seat.botStrategy}
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            seats: {
                              ...config.seats,
                              [pid]: {
                                ...seat,
                                botStrategy: (e.target as HTMLSelectElement).value as BotStrategyName,
                              },
                            },
                          })
                        }
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: '#181b20',
                          color: '#e2e8f0',
                          border: '1px solid #4a5260',
                          fontSize: '11.5px',
                          fontWeight: 700,
                        }}
                      >
                        <option value="Balanced">Balanced</option>
                        <option value="GreenInnovator">Green Innovator (Eco)</option>
                        <option value="IndustrialExpansionist">Industrial Expansionist</option>
                      </select>

                      <select
                        data-testid={`lobby-seat-${pid}-difficulty`}
                        value={seat.botDifficulty}
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            seats: {
                              ...config.seats,
                              [pid]: {
                                ...seat,
                                botDifficulty: (e.target as HTMLSelectElement).value as BotDifficultyName,
                              },
                            },
                          })
                        }
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: '#181b20',
                          color: '#e2e8f0',
                          border: '1px solid #4a5260',
                          fontSize: '11.5px',
                          fontWeight: 700,
                        }}
                      >
                        <option value="easy">Easy</option>
                        <option value="normal">Normal</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 3: Bot Pacing, Privacy Curtain & Multi-Tab Room Sync */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '18px',
            padding: '12px',
            background: 'rgba(0,0,0,0.28)',
            borderRadius: '12px',
            border: '1px solid #343a44',
          }}
        >
          {/* Bot Speed */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#cbd5e0', marginBottom: '6px' }}>
              BOT TURN SPEED
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['normal', 'fast', 'instant'] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  data-testid={`lobby-bot-speed-${spd}`}
                  onClick={() => onChangeConfig({ ...config, botSpeed: spd })}
                  style={{
                    flex: 1,
                    padding: '5px 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: config.botSpeed === spd ? '#3676c8' : '#262b33',
                    color: '#ffffff',
                    border: '1px solid #4a5260',
                    textTransform: 'capitalize',
                  }}
                >
                  {spd}
                </button>
              ))}
            </div>
          </div>

          {/* Hotseat Privacy Curtain */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#cbd5e0', marginBottom: '6px' }}>
              HOTSEAT PRIVACY CURTAIN
            </label>
            <button
              type="button"
              data-testid="lobby-privacy-toggle"
              onClick={() => onChangeConfig({ ...config, privacyCurtain: !config.privacyCurtain })}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
                background: config.privacyCurtain ? '#2e8540' : '#262b33',
                color: '#ffffff',
                border: '1px solid #4a5260',
              }}
            >
              {config.privacyCurtain ? 'Curtain ON (Pass Device)' : 'Curtain OFF (Open Table)'}
            </button>
          </div>

          {/* Multi-Tab / P2P Room Code */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#cbd5e0', marginBottom: '6px' }}>
              MULTI-TAB / ROOM CODE
            </label>
            <input
              type="text"
              placeholder="Optional (e.g. CATAN1)"
              value={config.roomCode}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  roomCode: (e.target as HTMLInputElement).value.toUpperCase(),
                })
              }
              style={{
                width: '100%',
                padding: '5px 10px',
                borderRadius: '6px',
                background: '#181b20',
                border: '1px solid #4a5260',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
              }}
            />
          </div>
        </div>

        {/* Start Game Button */}
        <button
          type="button"
          data-testid="lobby-start-btn"
          onClick={() => onStartGame(config)}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            background: 'linear-gradient(180deg, #f5d11d 0%, #d4a017 100%)',
            color: '#18150b',
            fontWeight: 900,
            fontSize: '15px',
            border: '2px solid #fff3a1',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(245, 209, 29, 0.35)',
          }}
        >
          Launch Tabletop Game
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
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f5d11d' }}>
            Maritime, Supply & Domestic Trade
          </h3>
          <button
            type="button"
            data-testid="close-trade-modal"
            onClick={onClose}
            style={{
              padding: '5px 12px',
              borderRadius: '8px',
              background: '#2d333d',
              color: '#ffffff',
              border: '1px solid #4a5260',
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
              background: tab === 'supply' ? '#3676c8' : '#262b33',
              color: '#ffffff',
              border: '1px solid #4a5260',
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
              background: tab === 'harbor' ? '#3676c8' : '#262b33',
              color: '#ffffff',
              border: '1px solid #4a5260',
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
              background: tab === 'domestic' ? '#3676c8' : '#262b33',
              color: '#ffffff',
              border: '1px solid #4a5260',
            }}
          >
            Domestic P2P Trade
          </button>
        </div>

        {tab === 'supply' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: '#cbd5e0' }}>
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
                          background: supplyGiveType === key ? '#2e8540' : '#252930',
                          color: held >= req ? '#ffffff' : '#718096',
                          border:
                            supplyGiveType === key ? '2px solid #f5d11d' : '1px solid #4a5260',
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
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: '#cbd5e0' }}>
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
                        background: supplyReceiveType === key ? '#3676c8' : '#252930',
                        color: '#ffffff',
                        border:
                          supplyReceiveType === key ? '2px solid #f5d11d' : '1px solid #4a5260',
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
                background: canExecuteSupplyTrade ? '#2e8540' : '#262b33',
                color: canExecuteSupplyTrade ? '#ffffff' : '#718096',
                border: '1px solid #4a5260',
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
              <p style={{ color: '#a0aec0', fontSize: '13px' }}>
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
                        background: selectedHarbor?.id === h.id ? '#3676c8' : '#252930',
                        color: '#ffffff',
                        border: '1px solid #4a5260',
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
                            background: harborGiveRes === r ? '#2e8540' : '#252930',
                            color: '#ffffff',
                            border: '1px solid #4a5260',
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
                            background: harborReceiveType === k ? '#3676c8' : '#252930',
                            color: '#ffffff',
                            border: '1px solid #4a5260',
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
                    background: canExecuteHarborTrade ? '#2e8540' : '#262b33',
                    color: canExecuteHarborTrade ? '#ffffff' : '#718096',
                    border: '1px solid #4a5260',
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
                        domesticTarget === pid ? PLAYER_THEMES[pid].fill : '#252930',
                      color:
                        domesticTarget === pid
                          ? PLAYER_THEMES[pid].textOnFill
                          : '#e2e8f0',
                      border: '1px solid #4a5260',
                      cursor: 'pointer',
                    }}
                  >
                    {state.players[pid]!.name}
                  </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, marginBottom: '6px', color: '#f5d11d' }}>
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
                background: '#3676c8',
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
        <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#f5d11d', marginBottom: '8px' }}>
          Spend 2 Energy Bolts &rarr; Take 1 Card
        </h3>
        <p style={{ fontSize: '12.5px', color: '#cbd5e0', marginBottom: '14px' }}>
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
                    background: avail > 0 ? CARD_METADATA[key].bg : '#252930',
                    color: avail > 0 ? CARD_METADATA[key].textColor : '#718096',
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
            background: '#2d333d',
            color: '#e2e8f0',
            border: '1px solid #4a5260',
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
              background: '#2d333d',
              color: '#ffffff',
              border: '1px solid #4a5260',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>

        <p style={{ fontSize: '12.5px', color: '#cbd5e0', marginBottom: '14px' }}>
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
                  background: cleanupMode === 'INSPECTOR' ? '#2e8540' : '#252930',
                  color: '#ffffff',
                  border: '1px solid #4a5260',
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
                  background: cleanupMode === 'HAZARD' ? '#2e8540' : '#252930',
                  color: '#ffffff',
                  border: '1px solid #4a5260',
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
                        background: selectedInspectorHex === h.id ? '#3676c8' : '#252930',
                        color: '#ffffff',
                        border: '1px solid #4a5260',
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
                    background: '#2e8540',
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
                        background: selectedHazardIdx === idx ? '#3676c8' : '#252930',
                        color: '#ffffff',
                        border: '1px solid #4a5260',
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
                    background: '#2e8540',
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
                        background: grantCard1 === k ? '#3676c8' : '#252930',
                        color: '#ffffff',
                        border: '1px solid #4a5260',
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
                        background: grantCard2 === k ? '#3676c8' : '#252930',
                        color: '#ffffff',
                        border: '1px solid #4a5260',
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
                background: '#3676c8',
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
            <div style={{ fontSize: '12.5px', color: '#e2e8f0' }}>
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
                background: renewableHexes.length > 0 ? '#dfb441' : '#252930',
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
                    background: roadEdge1 === eId ? '#b65c3b' : '#252930',
                    color: '#ffffff',
                    border: '1px solid #4a5260',
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

  // Setup placement decisions are handled directly on the board with a clean top banner
  if (decision.type === 'SETUP_PLACE_SETTLEMENT' || decision.type === 'SETUP_PLACE_ROAD') {
    const pieceLabel =
      decision.type === 'SETUP_PLACE_ROAD'
        ? 'Starting Road'
        : decision.round === 1
          ? 'Starting Town (Round 1)'
          : 'Starting City (Round 2)';

    return (
      <div
        data-testid="pending-decision-banner"
        style={{
          position: 'fixed',
          top: '56px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 120,
          background: 'rgba(20, 25, 34, 0.94)',
          border: `2px solid ${pTheme.fill}`,
          borderRadius: '12px',
          padding: '8px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}
      >
        <svg width="20" height="20" viewBox="-10 -10 20 20">
          <circle r="9" fill={pTheme.fill} stroke={pTheme.outerHalo} strokeWidth="1.5" />
          <PlayerEmblemSvg playerId={decision.playerId} cx={0} cy={0} r={4.5} />
        </svg>
        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff' }}>
          {player.name}: Click a highlighted spot on the board to place your{' '}
          <span style={{ color: '#f5d11d' }}>{pieceLabel}</span>
        </span>
      </div>
    );
  }

  // DISCARD ON 7 MODAL
  if (decision.type === 'DISCARD_ON_SEVEN') {
    const totalSelected = Object.values(discardCounts).reduce((acc, v) => acc + (v || 0), 0);
    const needed = decision.cardsToDiscard;

    return (
      <div style={MODAL_BACKDROP_STYLE} data-testid="pending-decision-modal">
        <div style={{ ...MODAL_CARD_STYLE, maxWidth: '480px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f5d11d', marginBottom: '6px' }}>
            Roll of 7 — {player.name} Must Discard {needed} Card{needed > 1 ? 's' : ''}
          </h3>
          <p style={{ fontSize: '12.5px', color: '#cbd5e0', marginBottom: '12px' }}>
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
              background: totalSelected === needed ? '#c93b2b' : '#262b33',
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
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f5d11d', marginBottom: '8px' }}>
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
                  background: '#2e8540',
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
                    background: '#2d333d',
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
              <p style={{ fontSize: '12.5px', color: '#cbd5e0', marginBottom: '12px' }}>
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
                          background: count > 0 ? CARD_METADATA[k].bg : '#252930',
                          color: count > 0 ? CARD_METADATA[k].textColor : '#718096',
                          border: '1px solid #4a5260',
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
                    background: '#2d333d',
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
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f5d11d', marginBottom: '10px' }}>
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
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f5d11d', marginBottom: '8px' }}>
            Trade Offer for {player.name} from {offerer.name}
          </h3>
          <p style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '12px' }}>
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
                background: '#2e8540',
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
  return (
    <div
      data-testid="pending-decision-banner"
      style={{
        position: 'fixed',
        top: '56px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 120,
        background: 'rgba(20, 25, 34, 0.94)',
        border: `2px solid ${pTheme.fill}`,
        borderRadius: '12px',
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.65)',
      }}
    >
      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff' }}>
        {decision.type === 'MOVE_INSPECTOR' &&
          `${player.name}: Click any highlighted Hex on the board to move the Environmental Inspector!`}
        {decision.type === 'EVENT_HAZARD_CHOICE' &&
          `${player.name} (${decision.source}): Click one of your highlighted buildings on the board to place 1 Hazard Token!`}
        {decision.type === 'EVENT_PRODUCTION_INCREASE' &&
          `${player.name} (Production Increase): Click a highlighted Power Plant cutout on the board for a FREE Fossil Plant + 1 Resource!`}
      </span>
      {decision.type === 'EVENT_PRODUCTION_INCREASE' && (
        <button
          type="button"
          data-testid="pass-production-increase-btn"
          onClick={() =>
            onDispatch({
              type: 'RESOLVE_PENDING_DECISION',
              playerId: decision.playerId,
              decisionId: decision.id,
              response: { pass: true },
            })
          }
          style={{
            padding: '5px 12px',
            borderRadius: '8px',
            background: '#4a5260',
            color: '#ffffff',
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
          }}
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
        <p style={{ fontSize: '13px', color: '#a0aec0', marginBottom: '18px' }}>
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
            color: isCollapse ? '#ff6b6b' : '#f5d11d',
            marginBottom: '6px',
          }}
        >
          {headline}
        </h2>
        <p style={{ fontSize: '13.5px', color: '#cbd5e0', marginBottom: '16px' }}>
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
            <tr style={{ borderBottom: '2px solid #3c424d', color: '#a0aec0', textAlign: 'left' }}>
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
                <tr key={pid} style={{ borderBottom: '1px solid #2d333d' }}>
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
              background: '#2d333d',
              color: '#ffffff',
              fontWeight: 800,
              border: '1px solid #4a5260',
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
              background: '#2e8540',
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
