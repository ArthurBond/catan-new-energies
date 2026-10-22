/**
 * CATAN: New Energies — Bottom dock: the viewed player's hand, the build palette and the
 * single primary action for the current moment (roll, draw, end turn…).
 */

import 'preact/compat';
import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getDevCardType } from '../engine/dev-cards';
import { DevelopmentCardType, GameAction, GameState, PlayerId, ResourceType } from '../engine/types';
import {
  BuildKind,
  BuildOption,
  CostKey,
  EnergyOption,
  getBuildOptions,
  getEnergyOptions,
  handCount,
  vpCardIdsOf,
} from './gameView';
import { Icon } from './Icons';
import type { ActiveBuildMode } from './PlayerMat';
import { PlayerBadge } from './PlayersRail';
import { CARD_METADATA, DEV_CARD_METADATA, PLAYER_THEMES } from './theme';
import {
  CityPieceSvg,
  EnergyBoltSvg,
  PieceDefs,
  PowerPlantCylinderSvg,
  ResourceIconSvg,
  TownPieceSvg,
} from './WoodenPiecesSvg';

const HAND_ORDER: (ResourceType | 'science')[] = [
  'lumber',
  'brick',
  'natural_fiber',
  'food',
  'steel',
  'science',
];

export interface PrimaryAction {
  label: string;
  sub?: string;
  testId?: string;
  onClick?: () => void;
  /** true = waiting on someone/something else; button is shown but inert */
  disabled: boolean;
}

function CostPip({ k }: { k: CostKey }) {
  if (k === 'energy') {
    return (
      <svg width="12" height="14" viewBox="-8 -15 16 30" aria-hidden="true">
        <EnergyBoltSvg scale={0.95} />
      </svg>
    );
  }
  const meta = CARD_METADATA[k];
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
      <rect x="-6.5" y="-6.5" width="13" height="13" rx="3" fill={meta.cardFill} stroke={meta.border} strokeWidth="1" />
      <ResourceIconSvg type={k} scale={0.5} />
    </svg>
  );
}

function costText(cost: CostKey[]): string {
  const counts = new Map<CostKey, number>();
  for (const k of cost) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts]
    .map(([k, n]) => `${n} ${k === 'natural_fiber' ? 'fiber' : k}`)
    .join(', ');
}

function BuildIcon({ kind, playerId }: { kind: BuildKind; playerId: PlayerId }) {
  const t = PLAYER_THEMES[playerId];
  return (
    <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true">
      {kind === 'road' && (
        <g transform="rotate(-30)">
          <rect x="-12" y="-2" width="24" height="8" rx="2" fill={t.sideFill} stroke={t.stroke} strokeWidth="1" />
          <rect x="-12" y="-4" width="24" height="6.5" rx="2" fill={t.fill} stroke={t.stroke} strokeWidth="1" />
        </g>
      )}
      {kind === 'town' && <TownPieceSvg playerId={playerId} cx={0} cy={-1} scale={1} cutoutAngleDeg={-90} showEmblem={false} />}
      {kind === 'city' && <CityPieceSvg playerId={playerId} cx={0} cy={-2} scale={0.88} cutoutAngleDeg={-90} showEmblem={false} />}
      {kind === 'devCard' && (
        <g>
          <rect x="-7" y="-11" width="16" height="22" rx="2.5" fill="#2b5f8f" />
          <rect x="-9" y="-12" width="16" height="22" rx="2.5" fill="#3d7fb8" stroke="#173a5a" strokeWidth="1" />
          <circle cx="-1" cy="-3" r="3.6" fill="#ffd34d" />
          <path d="M -9 4 Q -1 0, 7 4 L 7 8 Q 7 10, 5 10 L -7 10 Q -9 10, -9 8 Z" fill="#2f9a53" />
        </g>
      )}
      {kind === 'fossil' && <PowerPlantCylinderSvg type="fossil" cx={0} cy={-2} r={10} />}
      {kind === 'renewable' && <PowerPlantCylinderSvg type="renewable" cx={0} cy={-2} r={10} />}
      {kind === 'warehouse' && (
        <g>
          <path d="M -12 -1 L 0 -10 L 12 -1 L 12 11 L -12 11 Z" fill="#e9dcc0" stroke="#7b6a4c" strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="-5" y="2" width="10" height="9" fill="#9a7b4f" stroke="#5d4a2c" strokeWidth="1" />
          <path d="M -5 6.5 L 5 6.5" stroke="#5d4a2c" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}

function BuildTile({
  option,
  playerId,
  selected,
  onClick,
}: {
  option: BuildOption;
  playerId: PlayerId;
  selected: boolean;
  onClick: () => void;
}) {
  const tooltip = `${option.label} — costs ${costText(option.cost)}${option.reason ? `. ${option.reason}` : ''}`;
  return (
    <button
      type="button"
      className="tt-build"
      data-testid={`build-${option.kind}`}
      data-selected={selected ? 'true' : 'false'}
      disabled={!option.available}
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={option.mode ? selected : undefined}
    >
      <BuildIcon kind={option.kind} playerId={playerId} />
      <b>{option.label}</b>
      <span className="tt-build-cost">
        {option.cost.map((k, i) => (
          <CostPip key={i} k={k} />
        ))}
      </span>
      {option.remaining !== undefined && (
        <span className="tt-build-left" title={`${option.remaining} left on your board`}>
          {option.remaining}
        </span>
      )}
    </button>
  );
}

function EnergyTile({
  energy,
  options,
  selectedUsage,
  onChoose,
}: {
  energy: number;
  options: EnergyOption[];
  selectedUsage: EnergyOption['usage'] | null;
  onChoose: (usage: EnergyOption['usage']) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const anyAvailable = options.some((o) => o.available);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0, display: 'grid' }}>
      <button
        type="button"
        className="tt-build"
        data-testid="build-energy"
        data-selected={selectedUsage ? 'true' : 'false'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Spend stored energy"
      >
        <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true">
          <EnergyBoltSvg scale={0.95} />
        </svg>
        <b>Energy</b>
        <span className="tt-build-cost" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {energy} stored{anyAvailable ? '' : ''}
        </span>
      </button>
      {open && (
        <div className="tt-popover" style={{ top: 'auto', bottom: 'calc(100% + 8px)', right: 'auto', left: 0, transformOrigin: 'bottom left', width: '250px' }}>
          <h4>Spend energy</h4>
          {options.map((o) => (
            <button
              key={o.usage}
              type="button"
              className="tt-icon-btn"
              data-testid={`energy-option-${o.usage}`}
              data-active={selectedUsage === o.usage ? 'true' : 'false'}
              disabled={!o.available}
              title={o.reason}
              onClick={() => {
                setOpen(false);
                onChoose(o.usage);
              }}
              style={{ width: '100%', justifyContent: 'space-between', marginTop: '6px', height: '36px' }}
            >
              <span>{o.label}</span>
              <span style={{ display: 'inline-flex', gap: '1px' }}>
                {Array.from({ length: o.cost }, (_, i) => (
                  <svg key={i} width="10" height="14" viewBox="-8 -15 16 30" aria-hidden="true">
                    <EnergyBoltSvg scale={0.9} />
                  </svg>
                ))}
              </span>
            </button>
          ))}
          <p style={{ fontSize: '11.5px', color: 'var(--ink-300)', marginTop: '8px', lineHeight: 1.4 }}>
            Power plants make energy on their hex’s number. You can store up to 5.
          </p>
        </div>
      )}
    </div>
  );
}

/** Remembers card counts per player so a card that just arrived can bump. */
function useBumpKeys(playerId: PlayerId, counts: Record<string, number>): Record<string, number> {
  const prev = useRef<{ pid: PlayerId; counts: Record<string, number> } | null>(null);
  const keys = useRef<Record<string, number>>({});
  if (prev.current && prev.current.pid === playerId) {
    for (const k of Object.keys(counts)) {
      if ((counts[k] ?? 0) > (prev.current.counts[k] ?? 0)) keys.current[k] = (keys.current[k] ?? 0) + 1;
    }
  }
  prev.current = { pid: playerId, counts: { ...counts } };
  return keys.current;
}

export interface ActionDockProps {
  state: GameState;
  viewedPlayerId: PlayerId;
  actingPlayerId: PlayerId;
  /** Viewed player is the acting human and nothing is blocking: building is possible */
  canAct: boolean;
  legal: GameAction[];
  redact: boolean;
  activeBuildMode: ActiveBuildMode;
  onSelectBuildMode: (mode: ActiveBuildMode) => void;
  onBuyDevCard: () => void;
  onBuildWarehouse: () => void;
  onOpenEnergyBuyCardModal: () => void;
  onPlayDevCardPrompt: (cardId: string, cardType: DevelopmentCardType) => void;
  onRevealVpCards: (cardIds: string[]) => void;
  onInspect: (pid: PlayerId) => void;
  primary: PrimaryAction;
  canTrade: boolean;
  onOpenTrade: () => void;
  isMatOpen: boolean;
  onToggleMat: () => void;
  drawer?: ComponentChildren;
  /** Replaces the build palette while starting pieces are being placed */
  setupPanel?: ComponentChildren;
}

export function ActionDock({
  state,
  viewedPlayerId,
  actingPlayerId,
  canAct,
  legal,
  redact,
  activeBuildMode,
  onSelectBuildMode,
  onBuyDevCard,
  onBuildWarehouse,
  onOpenEnergyBuyCardModal,
  onPlayDevCardPrompt,
  onRevealVpCards,
  onInspect,
  primary,
  canTrade,
  onOpenTrade,
  isMatOpen,
  onToggleMat,
  drawer,
  setupPanel,
}: ActionDockProps) {
  const p = state.players[viewedPlayerId]!;
  const t = PLAYER_THEMES[viewedPlayerId];
  const counts: Record<string, number> = {
    lumber: p.resources.lumber,
    brick: p.resources.brick,
    natural_fiber: p.resources.natural_fiber,
    food: p.resources.food,
    steel: p.resources.steel,
    science: p.science,
  };
  const bumpKeys = useBumpKeys(viewedPlayerId, counts);
  const hand = handCount(state, viewedPlayerId);
  const handLimit = p.hasWarehouse ? 10 : 7;
  const isActing = viewedPlayerId === actingPlayerId;
  const buildOptions = getBuildOptions(state, viewedPlayerId, isActing ? legal : [], canAct);
  const energyOptions = getEnergyOptions(state, viewedPlayerId, isActing ? legal : [], canAct);

  const isPreEventWindow =
    state.phase === 'EventPhase' && state.eventDiscsDrawnThisTurn === 0 && state.pendingDecisions.length === 0;
  const vpCardIds = vpCardIdsOf(state, viewedPlayerId);
  const canRevealVp =
    isActing && legal.some((a) => a.type === 'REVEAL_VP_CARDS');

  const energyMode: EnergyOption['usage'] | null =
    activeBuildMode === 'CLEAN_HAZARD'
      ? 'CLEAN_HAZARD'
      : activeBuildMode === 'DEMOLISH_PLANT'
        ? 'DEMOLISH_PLANT'
        : null;

  const buildHint = activeBuildMode
    ? activeBuildMode === 'CLEAN_HAZARD'
      ? 'Click a hazard on the board'
      : activeBuildMode === 'DEMOLISH_PLANT'
        ? 'Click one of your fossil plants'
        : 'Click a glowing spot on the board'
    : canAct
      ? 'Choose something to build'
      : state.phase === 'ActionPhase' && !isActing
        ? `${state.players[actingPlayerId]?.name ?? ''} is building`
        : 'Unlocks in the action phase';

  return (
    <footer className="tt-dock" data-testid="bottom-player-dock">
      {drawer}

      {/* Hand */}
      <section className="tt-card tt-dock-panel" aria-label={`${p.name}'s hand`} data-testid="dock-hand">
        <div className="tt-dock-head">
          <span className="tt-card-title">
            <PlayerBadge playerId={viewedPlayerId} size={20} />
            {p.name}’s hand
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 400,
                fontSize: '12px',
                color: hand > handLimit ? 'var(--flare)' : 'var(--text-muted)',
              }}
              title={`On a roll of 7, players holding more than ${handLimit} cards discard half`}
            >
              {hand} / {handLimit}
            </span>
          </span>
          <span className="tt-viewing" role="group" aria-label="Show a player's hand and board">
            {state.playerOrder.map((pid) => (
              <button
                key={pid}
                type="button"
                data-testid={`switch-mat-${pid}`}
                data-active={pid === viewedPlayerId ? 'true' : 'false'}
                onClick={() => onInspect(pid)}
                title={`Show ${state.players[pid]!.name}`}
                aria-label={`Show ${state.players[pid]!.name}`}
                style={{ background: PLAYER_THEMES[pid].fill }}
              />
            ))}
          </span>
        </div>

        {redact ? (
          <div className="tt-hand" data-testid="organiser-redacted" style={{ alignItems: 'center', gap: '12px', minHeight: '64px' }}>
            <svg width="70" height="62" viewBox="-35 -31 70 62" aria-hidden="true">
              {[-14, -5, 4, 13].map((x, i) => (
                <g key={x} transform={`translate(${x}, 2) rotate(${(i - 1.5) * 8})`}>
                  <rect x="-12" y="-19" width="24" height="34" rx="4" fill="#2b5f8f" stroke="#fffdf7" strokeWidth="1.5" />
                  <circle cy="-2" r="5" fill="#3d7fb8" />
                </g>
              ))}
            </svg>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--text)' }}>{hand} cards</strong> and{' '}
              <strong style={{ color: 'var(--text)' }}>{p.devCards.unplayed.length} development cards</strong>
              <br />
              Hidden from other players
            </span>
          </div>
        ) : (
          <div className="tt-hand" role="list">
            {HAND_ORDER.map((k) => {
              const meta = CARD_METADATA[k];
              const count = counts[k] ?? 0;
              return (
                <div
                  key={`${k}-${bumpKeys[k] ?? 0}`}
                  role="listitem"
                  className={`tt-res-card${bumpKeys[k] ? ' is-bump' : ''}`}
                  data-testid={`organiser-slot-${k}`}
                  data-empty={count === 0 ? 'true' : 'false'}
                  data-stacked={count > 1 ? 'true' : 'false'}
                  title={`${meta.label}: ${count}. ${meta.description}`}
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
                  <span className="tt-res-count" data-testid={`organiser-count-${k}`}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="tt-hand-extras">
          <span className="tt-stat" title="Stored energy (max 5)">
            <span className="tt-energy-pips" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <svg key={i} width="11" height="16" viewBox="-8 -15 16 30">
                  <EnergyBoltSvg scale={0.9} empty={i >= p.energy} />
                </svg>
              ))}
            </span>
            <strong style={{ marginLeft: '3px' }}>{p.energy}</strong> energy
          </span>
          {!redact && (
            <span className="tt-devcards" aria-label="Development cards">
              {p.devCards.unplayed.length === 0 && (
                <span style={{ color: 'var(--text-faint)' }}>No development cards</span>
              )}
              {p.devCards.unplayed.map((cardId) => {
                const cType = getDevCardType(cardId);
                const cMeta = DEV_CARD_METADATA[cType];
                const boughtThisTurn =
                  state.devCardsBoughtThisTurn.includes(cardId) ||
                  state.turnStats.devCardsBoughtThisTurn.includes(cardId);
                const canPlayNow =
                  isActing &&
                  (canAct || isPreEventWindow) &&
                  !state.devCardPlayedThisTurn &&
                  !boughtThisTurn &&
                  cType !== 'victoryPoint';
                return (
                  <button
                    key={cardId}
                    type="button"
                    className="tt-devcard"
                    data-testid={`dev-card-${cardId}`}
                    disabled={!canPlayNow}
                    onClick={() => onPlayDevCardPrompt(cardId, cType)}
                    title={`${cMeta.title}: ${cMeta.description}${boughtThisTurn ? ' (bought this turn — play it next turn)' : ''}`}
                    style={{ ['--dev' as string]: cMeta.color }}
                  >
                    <i />
                    {cMeta.title}
                    {boughtThisTurn ? ' · new' : ''}
                  </button>
                );
              })}
              {canRevealVp && (
                <button
                  type="button"
                  className="tt-devcard"
                  data-testid="reveal-vp-cards-btn"
                  onClick={() => onRevealVpCards(vpCardIds)}
                  style={{ ['--dev' as string]: '#c98a00', background: 'var(--volt)' }}
                >
                  Reveal {vpCardIds.length} VP card{vpCardIds.length === 1 ? '' : 's'} and win
                </button>
              )}
            </span>
          )}
        </div>
      </section>

      {/* Build palette (or the setup coach while starting pieces are placed) */}
      {setupPanel ?? (
      <section className="tt-card tt-dock-panel" aria-label="Build" data-testid="dock-build">
        <div className="tt-dock-head">
          <span className="tt-card-title">
            Build
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 400, fontSize: '12px', color: activeBuildMode ? '#9a6a00' : 'var(--text-muted)' }}>
              {buildHint}
            </span>
          </span>
          {activeBuildMode && (
            <button
              type="button"
              className="tt-chip-btn"
              data-testid="cancel-build-mode-btn"
              onClick={() => onSelectBuildMode(null)}
            >
              <Icon name="close" size={12} strokeWidth={2.6} />
              Cancel
            </button>
          )}
        </div>
        <div className="tt-build-grid">
          {buildOptions.map((o) => (
            <BuildTile
              key={o.kind}
              option={o}
              playerId={viewedPlayerId}
              selected={o.mode !== null && activeBuildMode === o.mode}
              onClick={() => {
                if (o.kind === 'devCard') onBuyDevCard();
                else if (o.kind === 'warehouse') onBuildWarehouse();
                else onSelectBuildMode(activeBuildMode === o.mode ? null : o.mode);
              }}
            />
          ))}
          <EnergyTile
            energy={p.energy}
            options={energyOptions}
            selectedUsage={energyMode}
            onChoose={(usage) => {
              if (usage === 'BUY_CARD') onOpenEnergyBuyCardModal();
              else onSelectBuildMode(activeBuildMode === usage ? null : usage);
            }}
          />
        </div>
      </section>
      )}

      {/* Primary action */}
      <section className="tt-card tt-action-panel" aria-label="Turn action">
        <button
          type="button"
          className={`tt-cta${primary.disabled ? '' : ' is-ready'}`}
          data-testid={primary.testId ?? 'primary-action-btn'}
          disabled={primary.disabled}
          onClick={primary.onClick}
        >
          {primary.label}
        </button>
        {primary.sub && <div className="tt-cta-sub">{primary.sub}</div>}
        <div className="tt-secondary-row">
          <button
            type="button"
            className="tt-secondary-btn"
            data-testid="action-open-trade-btn"
            disabled={!canTrade}
            onClick={onOpenTrade}
            title={canTrade ? 'Trade with the supply, a harbor or another player' : 'Trading opens in your action phase'}
          >
            <Icon name="trade" size={15} />
            Trade
          </button>
          <button
            type="button"
            className="tt-secondary-btn"
            data-testid="dock-toggle-mat-btn"
            data-active={isMatOpen ? 'true' : 'false'}
            onClick={onToggleMat}
            aria-expanded={isMatOpen}
            style={{ borderColor: isMatOpen ? undefined : t.fill }}
          >
            <Icon name="board" size={15} />
            Board
          </button>
        </div>
      </section>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <PieceDefs />
      </svg>
    </footer>
  );
}
