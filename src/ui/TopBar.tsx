/**
 * CATAN: New Energies — Top bar: brand, whose turn it is, the turn phase stepper,
 * the Global Footprint meter and table tools.
 */

import 'preact/compat';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GameState } from '../engine/types';
import { BrandMark, Icon } from './Icons';
import type { BotSpeedMode } from './Modals';
import { PLAYER_THEMES } from './theme';
import { PlayerEmblemSvg } from './WoodenPiecesSvg';

export const DEFAULT_TABLECLOTH_COLOR = '#7a1c1c';
export const TABLECLOTH_COLOR_KEY = 'catan_new_energies_tablecloth_color_v2';
// The first version stored its (black) default too, so a v1 value of that colour was never a choice
const TABLECLOTH_COLOR_KEY_V1 = 'catan_new_energies_tablecloth_color_v1';
const TABLECLOTH_V1_DEFAULT = '#181a1d';

/** Saved tablecloth colour: v2 if set, else a colour the player picked under v1, else the default. */
export function loadTableclothColor(): string {
  try {
    const stored = localStorage.getItem(TABLECLOTH_COLOR_KEY);
    if (stored) return stored;
    const v1 = localStorage.getItem(TABLECLOTH_COLOR_KEY_V1);
    if (v1 && v1 !== TABLECLOTH_V1_DEFAULT) return v1;
    return DEFAULT_TABLECLOTH_COLOR;
  } catch {
    return DEFAULT_TABLECLOTH_COLOR;
  }
}

export const TABLECLOTH_PRESETS: { color: string; label: string }[] = [
  { color: '#7a1c1c', label: 'Picnic red' },
  { color: '#181a1d', label: 'Classic black' },
  { color: '#133b63', label: 'Ocean blue' },
  { color: '#174f2c', label: 'Forest green' },
];

type StepState = 'done' | 'current' | 'upcoming';

function phaseSteps(state: GameState): { key: string; label: string; state: StepState }[] {
  const setup = state.phase === 'SetupRoll' || state.phase === 'SetupDraft';
  if (setup) {
    const head = state.pendingDecisions[0];
    const round = head && 'round' in head ? head.round : 1;
    const idx = state.phase === 'SetupRoll' ? 0 : round === 1 ? 1 : 2;
    return ['Turn order', 'Towns', 'Cities'].map((label, i) => ({
      key: label,
      label,
      state: i < idx ? 'done' : i === idx ? 'current' : 'upcoming',
    }));
  }
  const order = ['EventPhase', 'ProductionPhase', 'ActionPhase'];
  const idx = state.phase === 'GameEnd' ? 3 : order.indexOf(state.phase);
  return [
    { key: 'EventPhase', label: 'Events' },
    { key: 'ProductionPhase', label: 'Production' },
    { key: 'ActionPhase', label: 'Actions' },
  ].map((s, i) => ({ ...s, state: i < idx ? 'done' : i === idx ? 'current' : 'upcoming' }));
}

function footprintColor(ratio: number): string {
  if (ratio < 0.45) return '#3fbf6a';
  if (ratio < 0.7) return '#ffc83a';
  return '#ef5a3c';
}

export interface TopBarProps {
  state: GameState;
  drawCount: number;
  activeIsBot: boolean;
  activeLabel: string;
  canUndo: boolean;
  onUndo: () => void;
  hasBots: boolean;
  autoplay: boolean;
  onToggleAutoplay: () => void;
  botSpeed: BotSpeedMode;
  onChangeBotSpeed: (speed: BotSpeedMode) => void;
  isMatOpen: boolean;
  onToggleMat: () => void;
  tableclothColor: string;
  onTableclothColorChange: (color: string) => void;
  onOpenLobby: () => void;
  /**
   * Online play: no undo, a connection badge, and "New game" only for the host (it asks first
   * and sends everyone back to the lobby). Leave undefined for offline play.
   */
  online?: { badge: ComponentChildren; onNewGame: (() => void) | null };
}

export function TopBar({
  state,
  drawCount,
  activeIsBot,
  activeLabel,
  canUndo,
  onUndo,
  hasBots,
  autoplay,
  onToggleAutoplay,
  botSpeed,
  onChangeBotSpeed,
  isMatOpen,
  onToggleMat,
  tableclothColor,
  onTableclothColorChange,
  onOpenLobby,
  online,
}: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const active = state.players[state.activePlayerId]!;
  const theme = PLAYER_THEMES[state.activePlayerId];
  const gfMax = state.playerCount === 4 ? 28 : 21;
  const gfRatio = state.clampedGF / gfMax;
  const isSetup = state.phase === 'SetupRoll' || state.phase === 'SetupDraft';

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  return (
    <header className="tt-topbar" data-testid="status-hud-bar">
      <div className="tt-brand">
        <BrandMark />
        <div className="tt-brand-word">
          New Energies
          <small>A Catan game</small>
        </div>
      </div>

      <div className="tt-turn">
        <span className="tt-turn-round">
          {isSetup ? 'Setup' : state.phase === 'GameEnd' ? 'Game over' : `Turn ${state.currentTurn}`}
        </span>
        <div
          className="tt-turn-chip"
          data-testid="active-turn-pill"
          style={{ background: theme.fill, color: theme.textOnFill }}
        >
          <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true">
            <circle r="10" fill="rgba(0,0,0,0.16)" />
            <PlayerEmblemSvg playerId={state.activePlayerId} cx={0} cy={0} r={6} />
          </svg>
          <span className="tt-turn-name">
            {active.name}
            <span className="tt-btn-label"> · {activeLabel}</span>
          </span>
          {activeIsBot && autoplay && (
            <span className="tt-thinking" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <div className="tt-stepper" data-testid="phase-stepper" aria-label="Turn phases">
          {phaseSteps(state).map((s) => (
            <span
              key={s.key}
              className="tt-step"
              data-state={s.state}
              aria-current={s.state === 'current' ? 'step' : undefined}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="tt-topbar-tools">
        {hasBots && (
          <button
            type="button"
            role="switch"
            aria-checked={autoplay}
            aria-label="Autoplay"
            className="tt-autoplay"
            data-testid="autoplay-toggle"
            data-on={autoplay ? 'true' : 'false'}
            onClick={onToggleAutoplay}
            title={
              autoplay
                ? 'Autoplay is on: bots take their turns by themselves. Turn it off to step them with Next.'
                : 'Autoplay is off: bots wait for you to press Next for each step.'
            }
          >
            <span className="tt-autoplay-knob" aria-hidden="true" />
            <span className="tt-autoplay-label">Autoplay</span>
          </button>
        )}

        <div
          className="tt-gf"
          data-testid="global-metrics-pill"
          title="Global Footprint: the sum of every player's Local Footprint. Higher footprint means more event discs are drawn each turn."
        >
          <div className="tt-gf-label">
            <span>
              Global footprint <strong>{state.clampedGF}</strong>/{gfMax}
            </span>
            <span>
              {drawCount} draw{drawCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="tt-gf-bar">
            <div
              className="tt-gf-fill"
              style={{
                width: `${Math.max(3, gfRatio * 100)}%`,
                background: footprintColor(gfRatio),
              }}
            />
          </div>
        </div>

        {online ? (
          online.badge
        ) : (
          <button
            type="button"
            className="tt-icon-btn"
            data-testid="undo-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo last action"
            aria-label="Undo last action"
          >
            <Icon name="undo" />
          </button>
        )}

        <button
          type="button"
          className="tt-icon-btn"
          data-testid="toggle-player-mat-btn"
          data-active={isMatOpen ? 'true' : 'false'}
          onClick={onToggleMat}
          title={isMatOpen ? 'Hide player board' : 'Show player board'}
        >
          <Icon name="board" />
          <span className="tt-btn-label">Player board</span>
        </button>

        <div ref={settingsRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="tt-icon-btn"
            data-testid="settings-btn"
            data-active={settingsOpen ? 'true' : 'false'}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
            title="Table settings"
            aria-label="Table settings"
          >
            <Icon name="sliders" />
          </button>
          {settingsOpen && (
            <div className="tt-popover" role="dialog" aria-label="Table settings">
              <div className="tt-popover-section">
                <h4>Tablecloth</h4>
                <div className="tt-popover-row" data-testid="tablecloth-color-picker">
                  {TABLECLOTH_PRESETS.map((preset) => (
                    <button
                      key={preset.color}
                      type="button"
                      className="tt-swatch"
                      data-testid={`tablecloth-preset-${preset.color.slice(1)}`}
                      data-active={tableclothColor.toLowerCase() === preset.color ? 'true' : 'false'}
                      title={preset.label}
                      aria-label={`Tablecloth: ${preset.label}`}
                      onClick={() => onTableclothColorChange(preset.color)}
                      style={{ background: preset.color }}
                    />
                  ))}
                  <label
                    className="tt-swatch"
                    title="Any colour"
                    style={{
                      background:
                        'conic-gradient(#ef5a3c, #ffc83a, #3fbf6a, #1f78c1, #8a4fd1, #ef5a3c)',
                      position: 'relative',
                    }}
                  >
                    <input
                      type="color"
                      data-testid="tablecloth-color-input"
                      aria-label="Tablecloth colour picker"
                      value={tableclothColor}
                      onInput={(e) => onTableclothColorChange((e.target as HTMLInputElement).value)}
                      onChange={(e) => onTableclothColorChange((e.target as HTMLInputElement).value)}
                      style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }}
                    />
                  </label>
                </div>
              </div>
              {hasBots && (
                <div className="tt-popover-section">
                  <h4>Bot speed</h4>
                  <div className="tt-popover-row">
                    {(['normal', 'fast', 'instant'] as BotSpeedMode[]).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        className="tt-icon-btn"
                        data-active={botSpeed === speed ? 'true' : 'false'}
                        onClick={() => onChangeBotSpeed(speed)}
                      >
                        {speed === 'normal' ? 'Relaxed' : speed === 'fast' ? 'Fast' : 'Instant'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {(!online || online.onNewGame) && (
          <button
            type="button"
            className="tt-icon-btn is-primary"
            data-testid={online ? 'online-new-game-btn' : 'open-lobby-btn'}
            onClick={online?.onNewGame ?? onOpenLobby}
          >
            <Icon name="newGame" />
            <span className="tt-btn-label">New game</span>
          </button>
        )}
      </div>
    </header>
  );
}
