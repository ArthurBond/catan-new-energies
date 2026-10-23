/**
 * CATAN: New Energies — Sea Frame SVG Component
 *
 * Renders:
 * 1. Seamless azure ocean frame with shallow turquoise reefs, wave crests & swimming Whales.
 * 2. 9 coastal Harbors (`[data-testid="harbor-0"]`..`harbor-8`) with pier lines, 3:1 / 2:1 labels & resource icons.
 * 3. 12 o'clock Green Island Victory Point Track (`1..10`) with 3D player cylinder markers.
 * 4. 1–2 o'clock Diagonal Global Footprint Track (`0..28` in 4P / `0..21` in 3P) with 3P/4P Whale pod, draw bands & 3D Black Cube marker.
 * 5. 7 Coastal Event Disc Islands (`[data-testid="event-track-<type>"]`) with empty/filled disc slots.
 */

import 'preact/compat';
import { GF_CONFIG_3P, GF_CONFIG_4P, getEventDiscDrawCount } from '../engine/config';
import {
  Board,
  EventDiscType,
  PlayerId,
  PlayerState,
} from '../engine/types';
import {
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  ISLAND_TRANSFORM,
  EVENT_TRACK_METADATA,
  latticeToSvg,
  PLAYER_THEMES,
} from './theme';
import { EventIconSvg, PlayerEmblemSvg, ResourceIconSvg } from './WoodenPiecesSvg';

export interface SeaFrameSvgProps {
  board: Board;
  playerCount: 3 | 4;
  playerOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  clampedGF: number;
  trueTotalLF: number;
  eventTracks: Record<string, number>;
  onSelectEventTrackInfo?: (track: EventDiscType) => void;
}

/**
 * Illustrated Ocean Whale swimming in the azure sea with water spout & foam ripples
 */
function OceanWhaleSvg({
  cx,
  cy,
  scale = 1,
  rotate = 0,
  flipX = false,
  showSpout = true,
}: {
  cx: number;
  cy: number;
  scale?: number;
  rotate?: number;
  flipX?: boolean;
  showSpout?: boolean;
}) {
  const sx = flipX ? -scale : scale;
  return (
    <g
      transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${rotate}) scale(${sx}, ${scale})`}
      pointerEvents="none"
    >
      <g className="ocean-whale-animated">
        {/* White water wake / surface ripple */}
        <ellipse
          cx={-2}
          cy={4.5}
          rx={19}
          ry={5.2}
          fill="rgba(186, 234, 255, 0.25)"
          stroke="rgba(224, 246, 255, 0.65)"
          strokeWidth={1}
          strokeDasharray="6 3"
        />

        {/* Water spout mist above blowhole */}
        {showSpout && (
          <g stroke="rgba(235, 250, 255, 0.85)" strokeWidth={1.3} fill="none" strokeLinecap="round">
            <path d="M 6 -5 Q 7 -13, 2 -16" />
            <path d="M 7.5 -5 Q 10 -12, 14 -14" />
            <circle cx={1.5} cy={-17.5} r={1} fill="#ffffff" stroke="none" />
            <circle cx={14.5} cy={-15.5} r={0.9} fill="#ffffff" stroke="none" />
          </g>
        )}

        {/* Whale drop shadow in water */}
        <path
          d="M -16 2 C -12 -6, 2 -8, 12 -3 C 16 -1, 17 3, 13 4.5 C 5 6, -8 5.5, -16 2 Z"
          transform="translate(1, 2.2)"
          fill="rgba(7, 34, 62, 0.45)"
        />

        {/* Tail Flukes */}
        <path
          d="M -14 1.5 L -22 -4.5 Q -20 0, -23 4.5 Z"
          fill="#164b7a"
          stroke="#0d3152"
          strokeWidth={0.9}
          strokeLinejoin="round"
        />

        {/* Main Whale Dorsal Body */}
        <path
          d="M -15 1.5 C -11 -6.5, 3 -8.5, 13 -2.5 C 16.5 -0.5, 16.5 3.2, 12.5 4.2 C 4 5.5, -7 5, -15 1.5 Z"
          fill="#1f629c"
          stroke="#0d3152"
          strokeWidth={1.1}
        />

        {/* Light Ventral Belly Grooves */}
        <path
          d="M 1 3.8 C 6 4.5, 11 4, 13.5 2.2 C 11 0.8, 5 1.5, 1 3.8 Z"
          fill="#bfe6fa"
        />

        {/* Dorsal Fin */}
        <path
          d="M -5 -4.2 Q -7 -8.5, -10 -7.5 Q -8 -4.5, -8 -3.5 Z"
          fill="#164b7a"
          stroke="#0d3152"
          strokeWidth={0.8}
        />

        {/* Pectoral Fin */}
        <path
          d="M 3 2.5 Q 1 7.5, -3 6.5 Q -1 3.5, 1 2 Z"
          fill="#2975b5"
          stroke="#0d3152"
          strokeWidth={0.8}
        />

        {/* Whale Eye & Brow Highlight */}
        <circle cx={9.5} cy={-0.5} r={1.1} fill="#ffffff" />
        <circle cx={9.8} cy={-0.5} r={0.55} fill="#0a2239" />
        <path
          d="M -7 -3.2 Q 2 -5.8, 10 -2.2"
          fill="none"
          stroke="rgba(190, 232, 255, 0.65)"
          strokeWidth={1}
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

export function SeaFrameSvg({
  board,
  playerCount,
  playerOrder,
  players,
  clampedGF,
  trueTotalLF,
  eventTracks,
  onSelectEventTrackInfo,
}: SeaFrameSvgProps) {
  const gfConfig = playerCount === 4 ? GF_CONFIG_4P : GF_CONFIG_3P;
  const currentDrawCount = getEventDiscDrawCount(clampedGF, playerCount);

  // Group players by clamped VP (1..10) for the 12 o'clock VP track
  const vpSlotPlayers = new Map<number, PlayerId[]>();
  for (let v = 1; v <= 10; v++) vpSlotPlayers.set(v, []);
  for (const pid of playerOrder) {
    const p = players[pid];
    if (!p) continue;
    const clampedVp = Math.max(1, Math.min(10, p.victoryPoints || 1));
    vpSlotPlayers.get(clampedVp)!.push(pid);
  }

  return (
    <g className="sea-frame-layer" data-testid="sea-frame">
      <defs>
        {/* Vibrant Coastal-to-Deep-Ocean Blue Radial Gradient */}
        <radialGradient id="oceanRadialGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7be0ff" style={{ stopColor: '#7be0ff' }} />
          <stop offset="50%" stopColor="#56c4f2" style={{ stopColor: '#56c4f2' }} />
          <stop offset="66%" stopColor="#2e96d6" style={{ stopColor: '#2e96d6' }} />
          <stop offset="82%" stopColor="#1c74b8" style={{ stopColor: '#1c74b8' }} />
          <stop offset="95%" stopColor="#135694" style={{ stopColor: '#135694' }} />
          <stop offset="100%" stopColor="#0c3c6e" style={{ stopColor: '#0c3c6e' }} />
        </radialGradient>

        {/* Lush Green Coastal Island Gradient */}
        <linearGradient id="greenIslandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#82b54c" style={{ stopColor: '#82b54c' }} />
          <stop offset="60%" stopColor="#5d8f34" style={{ stopColor: '#5d8f34' }} />
          <stop offset="100%" stopColor="#3f6920" style={{ stopColor: '#3f6920' }} />
        </linearGradient>

        {/* Rocky Brown Coastal Island Gradient */}
        <linearGradient id="brownIslandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ad9b7e" style={{ stopColor: '#ad9b7e' }} />
          <stop offset="60%" stopColor="#85745b" style={{ stopColor: '#85745b' }} />
          <stop offset="100%" stopColor="#5e503d" style={{ stopColor: '#5e503d' }} />
        </linearGradient>
      </defs>

      {/* Outer Cardboard Table Drop Shadow */}
      <circle cx={BOARD_CENTER_X + 6} cy={BOARD_CENTER_Y + 9} r={474} fill="rgba(0,0,0,0.46)" />

      {/* Main Circular Sea Frame Base (with solid #1c74b8 fallback + rich ocean radial gradient + vibrant green outer rim matching BGG board) */}
      <circle
        cx={BOARD_CENTER_X}
        cy={BOARD_CENTER_Y}
        r={470}
        fill="#1c74b8"
      />
      <circle
        cx={BOARD_CENTER_X}
        cy={BOARD_CENTER_Y}
        r={470}
        fill="url(#oceanRadialGrad)"
        stroke="#38a832"
        strokeWidth={7}
      />

      {/* Inner Rim Trim Ring */}
      <circle
        cx={BOARD_CENTER_X}
        cy={BOARD_CENTER_Y}
        r={465}
        fill="none"
        stroke="#1e6b1a"
        strokeWidth={1.8}
      />

      {/* Wide Sandy Coastal Shelf around the Central 19-Hex Island (matching BGG board) */}
      <circle
        transform={ISLAND_TRANSFORM}
        cx={BOARD_CENTER_X}
        cy={BOARD_CENTER_Y}
        r={286}
        fill="rgba(122, 228, 255, 0.28)"
        stroke="rgba(236, 226, 198, 0.55)"
        strokeWidth={12}
      />

      {/* Subtle Wave Contour Ripples & Whitecaps */}
      {[372, 400, 428, 452].map((r, idx) => (
        <circle
          key={r}
          cx={BOARD_CENTER_X}
          cy={BOARD_CENTER_Y}
          r={r}
          fill="none"
          stroke="rgba(196, 238, 255, 0.28)"
          strokeWidth={idx % 2 === 0 ? 1.4 : 1}
          strokeDasharray={idx % 2 === 0 ? '20 12 6 12' : '32 16'}
        />
      ))}

      {/* Hand-drawn Wave Whitecap Accents in the Ocean */}
      {[
        { x: 265, y: 170, rot: -32 },
        { x: 755, y: 315, rot: 58 },
        { x: 745, y: 695, rot: 125 },
        { x: 510, y: 838, rot: 178 },
        { x: 245, y: 715, rot: -135 },
        { x: 162, y: 465, rot: -82 },
      ].map((w, i) => (
        <path
          key={i}
          d="M -12 0 Q -6 -4.5, 0 0 Q 6 -4.5, 12 0 M -7 5 Q 0 1.5, 7 5"
          transform={`translate(${w.x}, ${w.y}) rotate(${w.rot})`}
          fill="none"
          stroke="rgba(220, 246, 255, 0.55)"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      ))}

      {/* =================================================================== */}
      {/* 0. WHALES IN THE OCEAN (3P / 4P Indicator Pod + Scenic Ocean Whales)*/}
      {/* =================================================================== */}
      <g data-testid="ocean-whales" aria-label={`Ocean whales (${playerCount}-player game indicator pod)`}>
        {/* Official Rulebook Global Footprint Whale Pod (3 whales in 3P, 4 whales in 4P) */}
        <g data-testid="gf-whale-pod">
          <OceanWhaleSvg cx={586} cy={128} scale={0.8} rotate={22} showSpout={true} />
          <OceanWhaleSvg cx={636} cy={146} scale={0.72} rotate={30} showSpout={false} />
          <OceanWhaleSvg cx={846} cy={396} scale={0.76} rotate={78} showSpout={true} />
          {playerCount === 4 && (
            <OceanWhaleSvg cx={872} cy={478} scale={0.66} rotate={88} showSpout={false} />
          )}
        </g>

        {/* Scenic Whales Swimming in the Outer Blue Sea Channels */}
        <OceanWhaleSvg cx={330} cy={156} scale={0.9} rotate={-28} showSpout={true} />
        <OceanWhaleSvg cx={124} cy={392} scale={0.8} rotate={-75} flipX={true} showSpout={true} />
        <OceanWhaleSvg cx={270} cy={836} scale={0.88} rotate={22} showSpout={true} />
        <OceanWhaleSvg cx={720} cy={826} scale={0.84} rotate={-24} flipX={true} showSpout={true} />
      </g>

      {/* =================================================================== */}
      {/* 1. 9 COASTAL HARBORS                                                */}
      {/* =================================================================== */}
      <g transform={ISLAND_TRANSFORM}>
      {board.harbors.map((harbor) => {
        const n1 = board.intersections[harbor.nodeIds[0]]!;
        const n2 = board.intersections[harbor.nodeIds[1]]!;
        const p1 = latticeToSvg(n1.u, n1.v);
        const p2 = latticeToSvg(n2.u, n2.v);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // Outward normal vector from board center through edge midpoint
        const dx = midX - BOARD_CENTER_X;
        const dy = midY - BOARD_CENTER_Y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;

        const harborX = midX + nx * 40;
        const harborY = midY + ny * 40;

        return (
          <g
            key={harbor.id}
            data-testid={`harbor-${harbor.id}`}
            aria-label={`Harbor ${harbor.id}: ${harbor.ratio}:1 ${harbor.resource ?? 'generic'}`}
          >
            {/* Wooden Pier Lines to the 2 Coastal Intersections */}
            <line
              x1={p1.x}
              y1={p1.y}
              x2={harborX - nx * 9}
              y2={harborY - ny * 9}
              stroke="#e0d4bc"
              strokeWidth={3.4}
              strokeLinecap="round"
            />
            <line
              x1={p2.x}
              y1={p2.y}
              x2={harborX - nx * 9}
              y2={harborY - ny * 9}
              stroke="#e0d4bc"
              strokeWidth={3.4}
              strokeLinecap="round"
            />

            {/* Harbor Water Ripple Halo */}
            <circle
              cx={harborX}
              cy={harborY}
              r={22.5}
              fill="rgba(186, 236, 255, 0.28)"
            />

            {/* Harbor Water Badge */}
            <circle
              cx={harborX}
              cy={harborY}
              r={20}
              fill="#f7f6f0"
              stroke="#1b4f82"
              strokeWidth={2}
            />

            {harbor.resource ? (
              <>
                <ResourceIconSvg type={harbor.resource} cx={harborX} cy={harborY - 5} scale={0.85} />
                <text
                  x={harborX}
                  y={harborY + 12.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="900"
                  fill="#12304d"
                >
                  2:1
                </text>
              </>
            ) : (
              <>
                <text
                  x={harborX}
                  y={harborY - 1}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="900"
                  fill="#12304d"
                >
                  3:1
                </text>
                <text
                  x={harborX}
                  y={harborY + 9.5}
                  textAnchor="middle"
                  fontSize="6.8"
                  fontWeight="800"
                  letterSpacing="0.5"
                  fill="#2c5882"
                >
                  ANY
                </text>
              </>
            )}
          </g>
        );
      })}

      </g>

      {/* =================================================================== */}
      {/* 2. TOP 12 O'CLOCK GREEN COASTAL PENINSULA — VICTORY POINTS (1..10)  */}
      {/* =================================================================== */}
      <g data-testid="vp-track">
        {/* Shallow Turquoise Reef & Foam Shoreline under the Top Coastal Peninsula */}
        <path
          d="M 284 86 A 466 466 0 0 1 592 43 Q 598 76, 568 86 Q 445 64, 326 112 Q 290 116, 284 86 Z"
          fill="rgba(138, 232, 255, 0.36)"
          stroke="rgba(220, 248, 255, 0.7)"
          strokeWidth={5}
          strokeLinejoin="round"
        />

        {/* Green Coastal Peninsula Hugging the Outer Top Rim (matching BGG board image) */}
        <path
          d="M 290 83 A 465 465 0 0 1 588 42 Q 592 72, 564 81 Q 445 59, 328 106 Q 296 110, 290 83 Z"
          fill="url(#greenIslandGrad)"
          stroke="#ece2c6"
          strokeWidth={3.5}
          strokeLinejoin="round"
        />

        {/* Subtle Inner-Shore VP Badge (positioned below the peninsula at cy=96, never sticking outside the board rim) */}
        <g transform="translate(454, 96)">
          <rect
            x={-68}
            y={-7.5}
            width={136}
            height={14}
            rx={7}
            fill="rgba(14, 42, 68, 0.82)"
            stroke="rgba(190, 232, 255, 0.5)"
            strokeWidth={0.9}
          />
          <text
            x={0}
            y={2}
            textAnchor="middle"
            fontSize="7.2"
            fontWeight="800"
            fill="#f0f8ff"
          >
            Victory points · 10 to win
          </text>
        </g>

        {/* 10 Stone Circles Following the Top Rim Curve (from angle -114° to -80° at r=441) */}
        {Array.from({ length: 10 }, (_, idx) => {
          const vp = idx + 1;
          const deg = -114 + (idx / 9) * 34;
          const rad = (deg * Math.PI) / 180;
          const rTrack = 441;
          const cx = BOARD_CENTER_X + Math.cos(rad) * rTrack;
          const cy = BOARD_CENTER_Y + Math.sin(rad) * rTrack;
          const occupants = vpSlotPlayers.get(vp) ?? [];

          return (
            <g key={vp} data-testid={`vp-slot-${vp}`}>
              {/* Outer stone ring */}
              <circle
                cx={cx}
                cy={cy}
                r={10.8}
                fill={vp === 10 ? '#f7e594' : '#cbd5c0'}
                stroke={vp === 10 ? '#9c7816' : '#4a5d3f'}
                strokeWidth={1.8}
              />
              <circle
                cx={cx}
                cy={cy}
                r={8.4}
                fill={vp === 10 ? '#fff3b8' : '#e6ebe0'}
                stroke="rgba(74, 93, 63, 0.45)"
                strokeWidth={0.9}
              />
              <text
                x={cx}
                y={cy + 3.4}
                textAnchor="middle"
                fontSize="9.2"
                fontWeight="900"
                fill="#1e2b18"
              >
                {vp}
              </text>

              {/* Render 3D Wooden Player Cylinder Discs occupying this VP slot */}
              {occupants.map((pid, pIdx) => {
                const pTheme = PLAYER_THEMES[pid];
                const stackOffset = pIdx * -3.2;
                const mx = cx + (occupants.length > 1 ? (pIdx - (occupants.length - 1) / 2) * 4.5 : 0);
                const my = cy + stackOffset;

                return (
                  <g
                    key={pid}
                    data-testid={`vp-marker-${pid}`}
                    transform={`translate(${mx.toFixed(1)}, ${my.toFixed(1)})`}
                  >
                    <ellipse cx={1.4} cy={3.2} rx={8.2} ry={6.8} fill="rgba(0,0,0,0.42)" />
                    <ellipse
                      cx={0}
                      cy={2.2}
                      rx={8}
                      ry={6.5}
                      fill={pTheme.sideFill}
                      stroke={pTheme.outerHalo}
                      strokeWidth={1.4}
                    />
                    <ellipse
                      cx={0}
                      cy={-0.8}
                      rx={8}
                      ry={6.5}
                      fill={pTheme.fill}
                      stroke={pTheme.stroke}
                      strokeWidth={1.2}
                    />
                    <PlayerEmblemSvg playerId={pid} cx={0} cy={-0.8} r={3.6} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>

      {/* =================================================================== */}
      {/* 3. 1–2 O'CLOCK CURVED GLOBAL FOOTPRINT TRACK & BGG-STYLE HUD WIDGET */}
      {/* =================================================================== */}
      <g
        data-testid="gf-track"
        aria-label={`Global Footprint Track: ${clampedGF} of ${gfConfig.max} (True Total LF: ${trueTotalLF}), drawing ${currentDrawCount} event discs per turn`}
      >
        {/* Shallow Turquoise Reef & Foam Shoreline under the Curved GF Peninsula */}
        <path
          d="M 640 52 A 468 468 0 0 1 962 422 Q 930 446, 886 436 A 392 392 0 0 0 616 128 Q 620 70, 640 52 Z"
          fill="rgba(138, 232, 255, 0.36)"
          stroke="rgba(220, 248, 255, 0.7)"
          strokeWidth={4.5}
          strokeLinejoin="round"
        />

        {/* Curved Green Coastal Peninsula Hugging the Outer 1-2 o'clock Rim (matching VP track curve) */}
        <path
          d="M 644 58 A 465 465 0 0 1 958 419 Q 928 440, 890 431 A 396 396 0 0 0 622 123 Q 625 75, 644 58 Z"
          fill="url(#greenIslandGrad)"
          stroke="#ece2c6"
          strokeWidth={3.5}
          strokeLinejoin="round"
        />

        {/* BGG-Style Horizontal Global Footprint Callout Box ([- cloud] [12] [+ cloud] & Bag Draw Icon) */}
        <g
          data-testid="gf-hud-widget"
          transform="translate(770, 262) scale(0.9)"
        >
          {/* Drop shadow */}
          <rect x={-48} y={-24} width={96} height={50} rx={7} fill="rgba(0,0,0,0.38)" />
          {/* Sky-blue framed widget matching media_1792637289394_167577ac.png */}
          <rect
            x={-50}
            y={-26}
            width={96}
            height={50}
            rx={7}
            fill="#2b8ad4"
            stroke="#16202a"
            strokeWidth={1.8}
          />
          {/* Left Green Minus Cloud (-1 LF) */}
          <g transform="translate(-31, -11)">
            <path
              d="M -8 4 C -11 4, -12 1.5, -11 -1 C -11 -3.5, -8 -5, -5.5 -4.5 C -4 -7.5, 1 -8, 3.5 -5 C 6.5 -5.5, 9 -3, 8.5 0 C 10 1.5, 9 4, 6.5 4 Z"
              fill="#4ea83b"
              stroke="#e6f7de"
              strokeWidth={1.1}
            />
            <line x1={-3.5} y1={-0.5} x2={2.5} y2={-0.5} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
          </g>

          {/* Center Parchment Square with Current Clamped GF Numeral */}
          <rect
            x={-13}
            y={-21}
            width={24}
            height={20}
            rx={3}
            fill="#f5f0dc"
            stroke="#2d3748"
            strokeWidth={1.4}
          />
          <text
            x={-1}
            y={-7}
            textAnchor="middle"
            fontSize="12"
            fontWeight="900"
            fill="#1a202c"
          >
            {clampedGF}
          </text>

          {/* Right Grey Plus Cloud (+1 LF) */}
          <g transform="translate(28, -11)">
            <path
              d="M -8 4 C -11 4, -12 1.5, -11 -1 C -11 -3.5, -8 -5, -5.5 -4.5 C -4 -7.5, 1 -8, 3.5 -5 C 6.5 -5.5, 9 -3, 8.5 0 C 10 1.5, 9 4, 6.5 4 Z"
              fill="#636b75"
              stroke="#e2e8f0"
              strokeWidth={1.1}
            />
            <line x1={-3} y1={-0.5} x2={3} y2={-0.5} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
            <line x1={0} y1={-3.5} x2={0} y2={2.5} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
          </g>

          {/* Bottom row: event bag icon, then "DRAW n/TURN" in a fixed-width run so it can never touch the icon */}
          <g transform="translate(0, 11)">
            <rect
              data-testid="gf-draw-pill"
              x={-42}
              y={-8}
              width={80}
              height={16}
              rx={8}
              fill="rgba(11, 38, 65, 0.72)"
            />
            <g data-testid="gf-draw-icon">
              <circle cx={-35} cy={0} r={4.4} fill="#8d6e63" stroke="#f5f0dc" strokeWidth={1} />
              <path d="M -35 -4.4 A 4.4 4.4 0 0 1 -30.6 0 L -35 0 Z" fill="#689f38" />
            </g>
            <text
              data-testid="gf-draw-text"
              x={-22}
              y={2.7}
              textAnchor="start"
              fontSize="7.2"
              fontWeight="900"
              fill="#ffffff"
              textLength={54}
              lengthAdjust="spacingAndGlyphs"
            >
              DRAW {currentDrawCount}/TURN
            </text>
          </g>
        </g>

        {/* Render Slightly Larger Segmented Cells in 2 Concentric Curved Rows */}
        {Array.from({ length: gfConfig.max + 1 }, (_, val) => {
          // Row 0: 0..17 in 4P (0..14 in 3P), Row 1: 18..max in 4P (15..max in 3P)
          const row0Count = playerCount === 4 ? 18 : 15;
          const isSecondRow = val >= row0Count;
          const colIdx = isSecondRow ? val - row0Count : val;
          const totalColsInRow = isSecondRow ? (gfConfig.max + 1 - row0Count) : row0Count;

          // Outer arc r=442, inner arc r=416 (26px radial difference ensures >12px clear gap between rows)
          const rArc = isSecondRow ? 416 : 442;
          const degStart = isSecondRow ? -56 : -66;
          const degEnd = isSecondRow ? -25 : -15;

          const deg =
            totalColsInRow > 1
              ? degStart + (colIdx / (totalColsInRow - 1)) * (degEnd - degStart)
              : degStart;
          const rad = (deg * Math.PI) / 180;

          const cx = BOARD_CENTER_X + Math.cos(rad) * rArc;
          const cy = BOARD_CENTER_Y + Math.sin(rad) * rArc;
          const cellRot = deg + 90;

          // Determine band color (matching BGG board's natural coastal green / olive / amber / earth bands)
          let cellFill = '#3b9c3f'; // Green eco band (0..5: 2 draws)
          const b1Max = playerCount === 4 ? 17 : 13;
          const b2Max = playerCount === 4 ? 23 : 17;
          if (val >= 6 && val <= b1Max) {
            cellFill = '#7cb342'; // Neutral lime/olive band (1 draw)
          } else if (val > b1Max && val <= b2Max) {
            cellFill = '#c28b2e'; // Amber-tan warning band (2 draws)
          } else if (val > b2Max) {
            cellFill = '#785a46'; // Earth-brown smog band (3 draws)
          }

          const isCurrentGF = val === clampedGF;

          return (
            <g
              key={val}
              data-testid={`gf-space-${val}`}
              transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${cellRot.toFixed(1)})`}
            >
              {/* Slightly larger cell (13.6 x 13.6) with curved corners */}
              <rect
                x={-6.8}
                y={-6.8}
                width={13.6}
                height={13.6}
                rx={2.8}
                fill={cellFill}
                stroke={isCurrentGF ? '#f5d11d' : 'rgba(238, 245, 228, 0.85)'}
                strokeWidth={isCurrentGF ? 2.2 : 1.0}
              />
              <text
                x={0}
                y={2.8}
                textAnchor="middle"
                fontSize="7.5"
                fontWeight="900"
                fill="#ffffff"
              >
                {val}
              </text>

              {/* 3D Black Cube Global Footprint Marker */}
              {isCurrentGF && (
                <g data-testid="gf-marker" transform="translate(0, -1)">
                  {/* Shadow */}
                  <rect x={-5.5} y={-5.5} width={12} height={12} rx={1.8} fill="rgba(0,0,0,0.52)" />
                  {/* 3D Black Wooden Cube */}
                  <polygon
                    points="-6,-6 3.5,-6 7,-2.5 7,6.5 -2.5,6.5 -6,3"
                    fill="#141619"
                    stroke="#f5d11d"
                    strokeWidth={1.4}
                  />
                  <rect
                    x={-6}
                    y={-6}
                    width={9.5}
                    height={9.5}
                    fill="#2b3038"
                    stroke="#ffffff"
                    strokeWidth={1.0}
                  />
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* =================================================================== */}
      {/* 4. 7 COASTAL EVENT DISC ISLANDS                                     */}
      {/* =================================================================== */}
      {(Object.keys(EVENT_TRACK_METADATA) as EventDiscType[]).map((trackKey) => {
        const meta = EVENT_TRACK_METADATA[trackKey];
        const filledCount = eventTracks[trackKey] ?? 0;
        const rad = (meta.angleDeg * Math.PI) / 180;
        const islandRadiusFromCenter = 434;

        const ix = BOARD_CENTER_X + Math.cos(rad) * islandRadiusFromCenter;
        const iy = BOARD_CENTER_Y + Math.sin(rad) * islandRadiusFromCenter;

        // Tangent angle along the circular rim so the island hugs the outer coast like BGG board
        const tangentDeg = meta.angleDeg + 90;
        const isGreen = meta.category === 'green' || meta.category === 'hybrid';
        const pillHalfLen = meta.capacity === 4 ? 52 : 40;

        // Keep label right-side up for bottom-half islands while always placing it on the inner (+Y local) side
        const isBottomHalf = meta.angleDeg > 10 && meta.angleDeg < 170;

        return (
          <g
            key={trackKey}
            data-testid={`event-track-${trackKey}`}
            transform={`translate(${ix.toFixed(1)}, ${iy.toFixed(1)}) rotate(${tangentDeg})`}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectEventTrackInfo?.(trackKey)}
            role="button"
            tabIndex={0}
            aria-label={`${meta.title} Event Track: ${filledCount} of ${meta.capacity} discs`}
          >
            {/* Shallow Turquoise Reef Halo */}
            <rect
              x={-pillHalfLen - 7}
              y={-22}
              width={(pillHalfLen + 7) * 2}
              height={44}
              rx={22}
              fill="rgba(130, 228, 255, 0.28)"
            />

            {/* Coastal Foam / Sandy Beach Outline */}
            <rect
              x={-pillHalfLen - 3.5}
              y={-18.5}
              width={(pillHalfLen + 3.5) * 2}
              height={37}
              rx={18.5}
              fill="#ece2c6"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth={1.8}
            />
            {/* Island Terrain Fill (Lush Green on Left Rim, Rocky Brown on Right/Bottom Rim) */}
            <rect
              x={-pillHalfLen}
              y={-15.5}
              width={pillHalfLen * 2}
              height={31}
              rx={15.5}
              fill={isGreen ? 'url(#greenIslandGrad)' : 'url(#brownIslandGrad)'}
              stroke={isGreen ? '#35591b' : '#4a3f2f'}
              strokeWidth={1.4}
            />

            {/* BGG-Style '?' Info Badge on the End of Each Event Island */}
            <g transform={`translate(${-pillHalfLen - 6}, -4) ${isBottomHalf ? 'rotate(180)' : ''}`}>
              <circle r={7.5} fill="#c8ba9e" stroke="#2d261c" strokeWidth={1.2} />
              <text x={0} y={2.8} textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#1e1a14">
                ?
              </text>
            </g>

            {/* Slots along the Island */}
            {Array.from({ length: meta.capacity }, (_, sIdx) => {
              const step = 23;
              const startX = -((meta.capacity - 1) * step) / 2;
              const sx = startX + sIdx * step;
              const isFilled = sIdx < filledCount;

              return (
                <g key={sIdx} data-testid={`event-slot-${trackKey}-${sIdx}`}>
                  {/* Stone Slot Crater */}
                  <circle
                    cx={sx}
                    cy={0}
                    r={9}
                    fill="rgba(20, 24, 20, 0.42)"
                    stroke="rgba(244, 242, 232, 0.8)"
                    strokeWidth={1.2}
                    strokeDasharray={isFilled ? undefined : '2.5 2'}
                  />
                  {!isFilled && (
                    <g transform={`translate(${sx}, 0)`} opacity={0.42}>
                      <EventIconSvg type={trackKey} scale={0.4} />
                    </g>
                  )}

                  {/* Drawn Event Disc Token when filled */}
                  {isFilled && (
                    <g data-testid={`event-disc-${trackKey}-${sIdx}`}>
                      <circle cx={sx + 1} cy={1.5} r={8.5} fill="rgba(0,0,0,0.35)" />
                      <circle
                        cx={sx}
                        cy={0}
                        r={8.2}
                        fill={isGreen ? '#7cb342' : '#8d6e63'}
                        stroke="#f5f2e6"
                        strokeWidth={1.4}
                      />
                      <circle cx={sx} cy={0} r={5.8} fill="#fbf6ea" />
                      <g transform={`translate(${sx}, 0)`}>
                        <EventIconSvg type={trackKey} scale={0.4} />
                      </g>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Track Name Banner (Always placed on the inner side `y = +24` toward the island, away from the outer rim) */}
            <g transform={`translate(0, 24.5) ${isBottomHalf ? 'rotate(180)' : ''}`}>
              <rect
                x={-45}
                y={-6.5}
                width={90}
                height={13}
                rx={6.5}
                fill="rgba(12, 32, 54, 0.9)"
                stroke="rgba(190, 232, 255, 0.45)"
                strokeWidth={0.9}
              />
              <text
                x={0}
                y={2.4}
                textAnchor="middle"
                fontSize="6.8"
                fontWeight="800"
                fill="#f4f8fc"
              >
                {meta.shortTitle} ({filledCount}/{meta.capacity})
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
