/**
 * CATAN: New Energies — Setup guidance
 *
 * - Roll-off overlay: everyone rolls two dice, the highest roll places first.
 * - Setup coach: tells the current player what to place, shows the snake-draft order
 *   (towns clockwise, then cities back anticlockwise) and previews what a hovered
 *   corner would produce before it is clicked.
 */

import 'preact/compat';
import { GameState, NodeId, PlayerId } from '../engine/types';
import { describeIntersection, getSetupProgress } from './gameView';
import type { SeatConfig } from './Modals';
import { PlayerBadge } from './PlayersRail';
import { DieFaceSvg } from './TableRail';
import { CARD_METADATA, PLAYER_THEMES, TERRAIN_THEMES } from './theme';
import { CityPieceSvg, TownPieceSvg } from './WoodenPiecesSvg';

export function SetupRollOff({
  state,
  canRoll,
  actingPlayerId,
  onRoll,
}: {
  state: GameState;
  canRoll: boolean;
  actingPlayerId: PlayerId;
  onRoll: () => void;
}) {
  return (
    <div className="tt-ink tt-rolloff" data-testid="setup-roll-overlay" role="dialog" aria-label="Roll for turn order">
      <h2>Who goes first?</h2>
      <p>
        Everyone rolls both dice. The highest roll places the first town, and the last player
        places two pieces in a row when the order turns around for cities.
      </p>
      <div className="tt-rolloff-grid" style={{ gridTemplateColumns: `repeat(${state.playerCount}, 1fr)` }}>
        {state.playerOrder.map((pid) => {
          const roll = state.setupRolls?.[pid];
          const isCur = state.activePlayerId === pid;
          return (
            <div key={pid} className="tt-rolloff-seat" data-current={isCur ? 'true' : 'false'}>
              <PlayerBadge playerId={pid} size={26} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: PLAYER_THEMES[pid].highlight }}>
                {state.players[pid]!.name}
              </span>
              {roll ? (
                <>
                  <span style={{ display: 'flex', gap: '3px' }}>
                    <DieFaceSvg value={roll[0]} variant="cream" size={24} />
                    <DieFaceSvg value={roll[1]} variant="green" size={24} />
                  </span>
                  <strong>{roll[0] + roll[1]}</strong>
                </>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--ink-300)', minHeight: '52px', display: 'flex', alignItems: 'center' }}>
                  {isCur ? 'Rolling next' : 'Waiting'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {canRoll ? (
        <button
          type="button"
          className="tt-cta is-ready"
          data-testid="setup-roll-dialog-btn"
          onClick={onRoll}
          style={{ maxWidth: '280px', margin: '0 auto' }}
        >
          Roll the dice · {state.players[actingPlayerId]?.name}
        </button>
      ) : (
        <p style={{ marginTop: 0 }}>
          {state.players[state.activePlayerId]?.name} is rolling…
        </p>
      )}
    </div>
  );
}

function PieceGlyph({ piece, playerId, size = 22 }: { piece: 'town' | 'city'; playerId: PlayerId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-16 -16 32 32" aria-hidden="true">
      {piece === 'town' ? (
        <TownPieceSvg playerId={playerId} cx={0} cy={-1.5} scale={1.15} cutoutAngleDeg={-90} showEmblem={false} />
      ) : (
        <CityPieceSvg playerId={playerId} cx={0} cy={-2.5} scale={0.95} cutoutAngleDeg={-90} showEmblem={false} />
      )}
    </svg>
  );
}

export function SetupCoach({
  state,
  seats,
  hoveredNodeId,
}: {
  state: GameState;
  seats: Record<PlayerId, SeatConfig>;
  hoveredNodeId: NodeId | null;
}) {
  const progress = getSetupProgress(state);
  if (!progress.playerId || !progress.piece) return null;

  const pid = progress.playerId;
  const name = state.players[pid]!.name;
  const isBot = seats[pid]?.controller === 'bot';
  const piece = progress.piece;
  const n = state.playerOrder.length;

  let title: string;
  let body: string;
  if (isBot) {
    title = progress.placingRoad
      ? `${name} is laying a road`
      : `${name} is choosing a spot for a ${piece}`;
    body = 'Watch the board — it places in a moment.';
  } else if (progress.placingRoad) {
    title = `${name}, connect a road to your ${piece}`;
    body = `Pick a glowing path leading away from your new ${piece}.`;
  } else if (piece === 'town') {
    title = `${name}, place your starting town`;
    body = 'Pick a glowing corner. More dots under the numbers means more production.';
  } else {
    title = `${name}, place your starting city`;
    body = 'Your city collects your starting hand: one card per touching hex, plus 1 science.';
  }

  const preview =
    hoveredNodeId !== null && !progress.placingRoad && !isBot
      ? describeIntersection(state.board, hoveredNodeId)
      : null;

  return (
    <section className="tt-card tt-dock-panel tt-coach" data-testid="setup-coach" role="status" aria-live="polite">
      <div className="tt-coach-head">
        <PieceGlyph piece={piece} playerId={pid} size={34} />
        <div style={{ minWidth: 0 }}>
          <div className="tt-coach-title">{title}</div>
          <div className="tt-coach-body">{body}</div>
        </div>
      </div>

      {!isBot && !progress.placingRoad && (
        <div className="tt-coach-preview" data-testid="setup-preview">
          {preview ? (
            <>
              {preview.hexes.map((h, i) => (
                <span key={i} className="tt-hexchip">
                  <i style={{ background: TERRAIN_THEMES[h.terrain].primaryFill }} />
                  {h.resource ? CARD_METADATA[h.resource].shortLabel : 'Desert'}
                  {h.numberDisc !== null && (
                    <span
                      style={{
                        color: h.numberDisc === 6 || h.numberDisc === 8 ? 'var(--flare)' : 'var(--text-muted)',
                      }}
                    >
                      {h.numberDisc}
                    </span>
                  )}
                </span>
              ))}
              <span style={{ color: 'var(--text-muted)' }}>
                {preview.totalPips} dot{preview.totalPips === 1 ? '' : 's'} of production
                {preview.harbor ? ` · ${preview.harbor}` : ''}
              </span>
              {piece === 'city' && (
                <span style={{ fontWeight: 700 }}>
                  Starting hand:{' '}
                  {preview.startingCards.length > 0
                    ? preview.startingCards.map((r) => CARD_METADATA[r].shortLabel.toLowerCase()).join(', ')
                    : 'no resources'}{' '}
                  + 1 science
                </span>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>Hover a corner to see what it produces.</span>
          )}
        </div>
      )}

      <div className="tt-snake" aria-label="Placement order">
        {progress.steps.map((step, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i === n && (
              <span className="tt-snake-turn" aria-hidden="true">
                then back
              </span>
            )}
            <span
              className="tt-snake-step"
              data-state={step.state}
              title={`${state.players[step.playerId]!.name}: ${step.piece}${step.state === 'done' ? ' (placed)' : ''}`}
            >
              <PieceGlyph piece={step.piece} playerId={step.playerId} size={20} />
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
