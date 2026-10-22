/**
 * CATAN: New Energies — Right rail: the components lying beside the board
 * (cloth event bag, dice tray, supply stacks, special award tiles).
 */

import 'preact/compat';
import { GameState, PlayerId, ResourceType } from '../engine/types';
import { CARD_METADATA, PLAYER_THEMES } from './theme';
import { EnergyBoltSvg, HazardCogSvg, PieceDefs, ResourceIconSvg } from './WoodenPiecesSvg';

const PIP_COORDS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-5.5, -5.5],
    [5.5, 5.5],
  ],
  3: [
    [-5.5, -5.5],
    [0, 0],
    [5.5, 5.5],
  ],
  4: [
    [-5.5, -5.5],
    [5.5, -5.5],
    [-5.5, 5.5],
    [5.5, 5.5],
  ],
  5: [
    [-5.5, -5.5],
    [5.5, -5.5],
    [0, 0],
    [-5.5, 5.5],
    [5.5, 5.5],
  ],
  6: [
    [-5.5, -6],
    [5.5, -6],
    [-5.5, 0],
    [5.5, 0],
    [-5.5, 6],
    [5.5, 6],
  ],
};

/** A pipped die: cream (first die) or green (second die), as in the box. */
export function DieFaceSvg({
  value,
  variant,
  size = 38,
}: {
  value: number;
  variant: 'cream' | 'green';
  size?: number;
}) {
  const face = variant === 'cream' ? '#f6f1e3' : '#3f9a3f';
  const side = variant === 'cream' ? '#cfc4a6' : '#24642a';
  const pip = variant === 'cream' ? '#24272c' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="-19 -19 38 38" role="img" aria-label={`Die showing ${value}`}>
      <rect x="-15" y="-13" width="31" height="31" rx="7" fill="rgba(0,0,0,0.4)" />
      <rect x="-16" y="-16" width="31" height="31" rx="7" fill={side} />
      <rect x="-16" y="-17" width="31" height="29" rx="7" fill={face} />
      {(PIP_COORDS[value] ?? PIP_COORDS[1]!).map(([px, py], idx) => (
        <circle key={idx} cx={px - 0.5} cy={py - 2.5} r={2.6} fill={pip} />
      ))}
    </svg>
  );
}

function BagIllustration({ discs }: { discs: number }) {
  return (
    <svg width="50" height="54" viewBox="-30 -32 60 64" aria-hidden="true">
      <ellipse cx="2" cy="27" rx="22" ry="4" fill="rgba(0,0,0,0.18)" />
      <path
        d="M -13 -16 C -22 -6, -26 12, -18 22 C -10 30, 12 30, 20 22 C 27 12, 22 -6, 13 -16 Z"
        fill="#efe7d4"
        stroke="#9d8e6f"
        strokeWidth="1.6"
      />
      <path d="M -10 -4 C -14 8, -12 18, -6 24" stroke="#d8ccb2" strokeWidth="2" fill="none" />
      <path
        d="M -14 -17 C -6 -12, 6 -12, 14 -17 L 12 -22 C 4 -19, -4 -19, -12 -22 Z"
        fill="#e4d9c0"
        stroke="#9d8e6f"
        strokeWidth="1.4"
      />
      <path d="M -11 -18 C -4 -14, 4 -14, 11 -18" stroke="#7a6243" strokeWidth="2" fill="none" />
      <path d="M 9 -16 C 14 -12, 18 -14, 20 -20" stroke="#7a6243" strokeWidth="1.6" fill="none" />
      {/* Brown event discs peeking out */}
      {discs > 0 && (
        <g>
          <ellipse cx="-4" cy="-23" rx="6.5" ry="2.6" fill="#7b5236" stroke="#3d2716" strokeWidth="1" />
          <ellipse cx="5" cy="-24.5" rx="6" ry="2.4" fill="#2f8f47" stroke="#13421f" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}

function MiniCardStack({ type, count }: { type: ResourceType | 'science'; count: number }) {
  const meta = CARD_METADATA[type];
  const layers = count === 0 ? 0 : count > 12 ? 3 : count > 4 ? 2 : 1;
  return (
    <svg width="28" height="33" viewBox="-17 -20 34 40" aria-hidden="true">
      {count === 0 ? (
        <rect x="-12" y="-16" width="24" height="32" rx="4" fill="none" stroke="#c4b79b" strokeDasharray="3 2" />
      ) : (
        Array.from({ length: layers }, (_, i) => (
          <rect
            key={i}
            x={-12 + (layers - 1 - i) * 1.6}
            y={-16 + (layers - 1 - i) * -1.6 + (layers - 1) * 1.6}
            width="24"
            height="32"
            rx="4"
            fill={meta.cardFill}
            stroke={meta.border}
            strokeWidth="1.3"
          />
        ))
      )}
      <g opacity={count === 0 ? 0.35 : 1} transform={`translate(${(layers - 1) * 0}, ${(layers - 1) * 1.6})`}>
        <circle r="8.5" fill={meta.bg} opacity={0.35} />
        <ResourceIconSvg type={type} scale={0.9} />
      </g>
    </svg>
  );
}

export interface TableRailProps {
  state: GameState;
  drawCount: number;
  canDrawEventDisc: boolean;
  onDrawEventDisc: () => void;
  canRoll: boolean;
  onRoll: () => void;
  rollAnimKey: number | null;
  producingCount: number;
}

export function TableRail({
  state,
  drawCount,
  canDrawEventDisc,
  onDrawEventDisc,
  canRoll,
  onRoll,
  rollAnimKey,
  producingCount,
}: TableRailProps) {
  const dice = state.lastDiceRoll;
  const sum = dice ? dice[0] + dice[1] : null;
  const isSetupRoll = state.phase === 'SetupRoll';
  const showsProductionRoll = dice !== null && !isSetupRoll && state.phase !== 'SetupDraft';

  let diceCaption: string;
  if (canRoll) diceCaption = isSetupRoll ? 'Roll for turn order' : 'Roll for production';
  else if (isSetupRoll || state.phase === 'SetupDraft') diceCaption = 'Highest roll placed first';
  else if (sum === 7) diceCaption = 'Seven: the inspector moves';
  else if (showsProductionRoll) diceCaption = `${producingCount} hex${producingCount === 1 ? '' : 'es'} produced`;
  else diceCaption = 'Rolled in the production phase';

  const award = (
    testId: string,
    title: string,
    holder: PlayerId | null,
    detail: string,
    icon: 'route' | 'leaf'
  ) => (
    <div className="tt-award" data-testid={testId}>
      <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true">
        <rect x="-13" y="-13" width="26" height="26" rx="6" fill={icon === 'route' ? '#f2d9b8' : '#cfeedd'} />
        {icon === 'route' ? (
          <path d="M -8 7 L -2 1 L 2 4 L 8 -4" stroke="#9c5a1c" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M -7 8 C -7 -1, -1 -7, 8 -7 C 8 2, 2 8, -7 8 Z M -7 8 L 2 -1" stroke="#1e7a3e" strokeWidth="2" fill="#7fd09a" strokeLinejoin="round" />
        )}
      </svg>
      <span>
        <b>{title}</b>
        <small>
          {holder ? (
            <span style={{ color: PLAYER_THEMES[holder].stroke, fontWeight: 700 }}>
              {state.players[holder]?.name} · {detail}
            </span>
          ) : (
            detail
          )}
        </small>
      </span>
      <span className="tt-award-badge" data-held={holder ? 'true' : 'false'}>
        +2
      </span>
    </div>
  );

  return (
    <aside className="tt-rail" data-testid="right-table-margin" aria-label="Table">
      <button
        type="button"
        className="tt-card tt-bag"
        data-testid="event-bag"
        data-ready={canDrawEventDisc ? 'true' : 'false'}
        onClick={() => canDrawEventDisc && onDrawEventDisc()}
        aria-disabled={!canDrawEventDisc}
        aria-label={`Event bag: ${state.eventBag.length} discs left.${canDrawEventDisc ? ' Draw an event disc.' : ''}`}
      >
        <BagIllustration discs={state.eventBag.length} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <span className="tt-card-title">Event bag</span>
          <span className="tt-bag-count" data-testid="hud-bag-count">
            {state.eventBag.length}
            <span style={{ fontSize: '13px', fontWeight: 600, marginLeft: '5px', letterSpacing: 0 }}>discs</span>
          </span>
          <span style={{ fontSize: '12px', color: canDrawEventDisc ? '#9a6a00' : 'var(--text-muted)', fontWeight: canDrawEventDisc ? 700 : 400 }}>
            {canDrawEventDisc
              ? `Draw ${state.eventDiscsDrawnThisTurn + 1} of ${drawCount}`
              : `${drawCount} draw${drawCount === 1 ? '' : 's'} per turn`}
          </span>
        </span>
      </button>

      <button
        type="button"
        className="tt-card tt-dice"
        data-testid="tabletop-dice-roll-overlay"
        data-ready={canRoll ? 'true' : 'false'}
        onClick={() => canRoll && onRoll()}
        aria-disabled={!canRoll}
        aria-label={canRoll ? diceCaption : `Last roll ${sum ?? 'none'}`}
      >
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="tt-card-title">Dice</span>
          <span className="tt-dice-sum" style={{ color: sum === 7 ? 'var(--flare)' : 'var(--text)' }}>
            {sum ?? '–'}
          </span>
        </span>
        <span className="tt-dice-felt" data-testid="table-dice">
          <span
            key={rollAnimKey ?? 'still'}
            className={rollAnimKey ? 'dice-tumble-anim' : undefined}
            style={{ display: 'flex', gap: '14px' }}
          >
            <DieFaceSvg value={dice?.[0] ?? 3} variant="cream" />
            <DieFaceSvg value={dice?.[1] ?? 4} variant="green" />
          </span>
        </span>
        <span style={{ display: 'block', marginTop: '7px', fontSize: '12px', color: canRoll ? '#9a6a00' : 'var(--text-muted)', fontWeight: canRoll ? 700 : 400 }}>
          {diceCaption}
        </span>
      </button>

      <section className="tt-card tt-supply" aria-label="Supply">
        <span className="tt-card-title">Supply</span>
        <div className="tt-supply-grid">
          {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as (ResourceType | 'science')[]).map(
            (key) => {
              const count = key === 'science' ? state.supply.science : state.supply.resources[key];
              return (
                <div key={key} className="tt-stack" data-testid={`supply-pile-${key}`} title={`${CARD_METADATA[key].label}: ${count} left`}>
                  <MiniCardStack type={key} count={count} />
                  <strong>{count}</strong>
                </div>
              );
            }
          )}
          <div className="tt-stack" data-testid="supply-dev-deck" title={`Development cards: ${state.supply.devDeck.length} left`}>
            <svg width="28" height="33" viewBox="-17 -20 34 40" aria-hidden="true">
              <rect x="-10.4" y="-17.6" width="24" height="32" rx="4" fill="#2b5f8f" stroke="#173a5a" strokeWidth="1.3" />
              <rect x="-12" y="-16" width="24" height="32" rx="4" fill="#3d7fb8" stroke="#173a5a" strokeWidth="1.3" />
              <circle cx="0" cy="-3" r="5.5" fill="#ffd34d" />
              <path d="M -12 6 Q 0 0, 12 6 L 12 12 Q 12 16, 8 16 L -8 16 Q -12 16, -12 12 Z" fill="#2f9a53" />
            </svg>
            <strong>{state.supply.devDeck.length}</strong>
          </div>
          <div className="tt-stack" data-testid="supply-hazards" title={`Hazard tokens: ${state.supply.hazards} left`}>
            <svg width="28" height="33" viewBox="-17 -20 34 40" aria-hidden="true">
              <PieceDefs />
              <HazardCogSvg cx={0} cy={-1} r={13} />
            </svg>
            <strong>{state.supply.hazards}</strong>
          </div>
          <div className="tt-stack" data-testid="supply-energy" title={`Energy tokens: ${state.supply.energy} left`}>
            <svg width="28" height="33" viewBox="-17 -20 34 40" aria-hidden="true">
              <EnergyBoltSvg cx={0} cy={-1} scale={1.05} />
            </svg>
            <strong>{state.supply.energy}</strong>
          </div>
        </div>
      </section>

      <section className="tt-card tt-awards" aria-label="Special awards">
        {award(
          'award-longest-road',
          'Longest trade route',
          state.longestRoadHolder,
          state.longestRoadHolder
            ? `${state.specialAwards.longestRoad.length} roads`
            : '5+ connected roads',
          'route'
        )}
        {award(
          'award-cleanest-environment',
          'Cleanest environment',
          state.cleanestEnvironmentHolder,
          state.cleanestEnvironmentHolder
            ? `${state.specialAwards.cleanestEnvironment.cleanupCount} clean-ups`
            : '3+ clean-up cards played',
          'leaf'
        )}
      </section>
    </aside>
  );
}
