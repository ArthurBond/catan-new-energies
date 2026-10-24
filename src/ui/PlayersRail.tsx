/**
 * CATAN: New Energies — Left rail: one printed player board per seat (score, hand size,
 * energy, footprint, plants) and the table's activity feed.
 */

import 'preact/compat';
import { GameState, PlayerId } from '../engine/types';
import { handCount, humanizeLog, logActor, splitLogNames } from './gameView';
import { Icon } from './Icons';
import type { SeatConfig } from './Modals';
import { PLAYER_THEMES } from './theme';
import { EnergyBoltSvg, PlayerEmblemSvg } from './WoodenPiecesSvg';

const STRATEGY_LABEL: Record<SeatConfig['botStrategy'], string> = {
  Balanced: 'Balanced',
  GreenInnovator: 'Green innovator',
  IndustrialExpansionist: 'Industrialist',
};

export function PlayerBadge({ playerId, size = 22 }: { playerId: PlayerId; size?: number }) {
  const t = PLAYER_THEMES[playerId];
  return (
    <svg width={size} height={size} viewBox="-11 -11 22 22" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle r="10" fill={t.fill} stroke={t.stroke} strokeWidth="1.2" />
      <PlayerEmblemSvg playerId={playerId} cx={0} cy={0} r={5.6} />
    </svg>
  );
}

function seatRole(seat: SeatConfig | undefined, humanCount: number): string {
  if (!seat) return '';
  if (seat.controller === 'human') return humanCount > 1 ? 'Human' : 'You';
  const diff = seat.botDifficulty.charAt(0).toUpperCase() + seat.botDifficulty.slice(1);
  return `Bot · ${STRATEGY_LABEL[seat.botStrategy]}, ${diff.toLowerCase()}`;
}

export interface PlayersRailProps {
  state: GameState;
  seats: Record<PlayerId, SeatConfig>;
  inspectedPlayerId: PlayerId;
  onInspect: (pid: PlayerId) => void;
  /** Online: ready-made caption per seat ("You", "Friend · offline"), replacing the offline wording. */
  roleLabels?: Partial<Record<PlayerId, string>>;
}

export function PlayersRail({ state, seats, inspectedPlayerId, onInspect, roleLabels }: PlayersRailProps) {
  const humanCount = state.playerOrder.filter((pid) => seats[pid]?.controller === 'human').length;
  const recent = state.log.slice(-40).reverse();
  const names = state.playerOrder.map((pid) => ({ pid, name: state.players[pid]!.name }));

  return (
    <aside className="tt-rail" data-testid="left-table-margin" aria-label="Players">
      <div className="tt-players">
        {state.playerOrder.map((pid) => {
          const p = state.players[pid]!;
          const t = PLAYER_THEMES[pid];
          const isTurn = state.activePlayerId === pid && state.phase !== 'GameEnd';
          const holdsRoad = state.longestRoadHolder === pid;
          const holdsClean = state.cleanestEnvironmentHolder === pid;
          return (
            <button
              key={pid}
              type="button"
              className="tt-card tt-player"
              data-testid={`corner-station-${pid}`}
              data-turn={isTurn ? 'true' : 'false'}
              data-inspected={inspectedPlayerId === pid ? 'true' : 'false'}
              onClick={() => onInspect(pid)}
              title={`Show ${p.name}'s player board`}
              style={{ ['--player' as string]: t.fill }}
            >
              <span className="tt-player-name">
                <PlayerBadge playerId={pid} />
                <span>{p.name}</span>
              </span>
              <span className="tt-player-role">
                {roleLabels?.[pid] ?? seatRole(seats[pid], humanCount)}
                {(holdsRoad || holdsClean) && (
                  <>
                    {' · '}
                    <strong style={{ color: 'var(--text)' }}>
                      {[holdsRoad && 'Longest route', holdsClean && 'Cleanest'].filter(Boolean).join(', ')}
                    </strong>
                  </>
                )}
              </span>
              <span className="tt-player-vp" data-testid={`corner-vp-${pid}`}>
                <strong>{p.victoryPoints}</strong>
                <small>points</small>
              </span>
              <span className="tt-player-stats">
                <span className="tt-stat" title="Cards in hand">
                  <Icon name="cards" size={14} />
                  <strong data-testid={`corner-cards-${pid}`}>{handCount(state, pid)}</strong>
                </span>
                <span className="tt-stat" title="Stored energy (max 5)">
                  <svg width="10" height="14" viewBox="-8 -15 16 30" aria-hidden="true">
                    <EnergyBoltSvg scale={0.9} />
                  </svg>
                  <strong>{p.energy}</strong>/5
                </span>
                <span className="tt-stat" title="Local footprint">
                  <Icon name="cloud" size={14} />
                  <strong>{p.localFootprint}</strong>
                </span>
                <span className="tt-stat" title="Renewable / fossil power plants" style={{ marginLeft: 'auto' }}>
                  <span style={{ color: 'var(--leaf)' }}>
                    <Icon name="leaf" size={13} />
                  </span>
                  <strong>{p.renewablePlantsBuilt}</strong>
                  <span style={{ color: '#6b4d36', marginLeft: '3px' }}>
                    <Icon name="factory" size={13} />
                  </span>
                  <strong>{p.fossilPlantsBuilt}</strong>
                </span>
              </span>
              {isTurn && (
                <span className="tt-sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
                  {t.displayColorName}, current turn
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className="tt-card tt-feed" data-testid="game-log" aria-label="Activity">
        <div className="tt-dock-head">
          <span className="tt-card-title">Activity</span>
          <span className="tt-muted" style={{ fontSize: '11.5px' }}>
            {state.log.length} events
          </span>
        </div>
        <div className="tt-feed-list" aria-live="polite">
          {recent.map((entry, idx) => {
            const text = humanizeLog(entry.message);
            if (!text) return null;
            const who = logActor(entry.message, names);
            return (
              <div key={`${entry.timestamp}-${idx}`} className="tt-feed-item">
                <i style={{ background: who ? PLAYER_THEMES[who.pid].fill : 'var(--card-edge-deep)' }} />
                <span>
                  {splitLogNames(text, names).map((seg, n) =>
                    seg.player ? (
                      <b key={n} className="tt-feed-name" style={{ color: PLAYER_THEMES[seg.player.pid].sideFill }}>
                        {seg.text}
                      </b>
                    ) : (
                      seg.text
                    )
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
