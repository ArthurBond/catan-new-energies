/**
 * CATAN: New Energies — Sea Frame SVG Component
 *
 * Renders:
 * 1. 6-piece interlocking azure ocean jigsaw frame with shallow turquoise reefs, wave crests & swimming Whales.
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
  EVENT_TRACK_METADATA,
  latticeToSvg,
  PLAYER_THEMES,
} from './theme';
import { PlayerEmblemSvg, ResourceIconSvg } from './WoodenPiecesSvg';

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

  // Global Footprint track geometry constants (1–2 o'clock diagonal)
  const gfBaseX = 584;
  const gfBaseY = 98;
  const gfAngleDeg = 38;
  const gfRad = (gfAngleDeg * Math.PI) / 180;
  const cosA = Math.cos(gfRad);
  const sinA = Math.sin(gfRad);
  // Inward perpendicular vector (pointing down-left toward the island)
  const perpX = -sinA;
  const perpY = cosA;
  const gfStep = 13.4;

  // Header pill positioned outward of Row 0, centered along the track
  const headerShift = 8.5;
  const headerOutwardOffset = -17.5;
  const headerCx = gfBaseX + headerShift * gfStep * cosA + headerOutwardOffset * perpX;
  const headerCy = gfBaseY + headerShift * gfStep * sinA + headerOutwardOffset * perpY;

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

      {/* Main Circular Sea Frame Base (with solid #1c74b8 fallback + rich ocean radial gradient) */}
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
        stroke="#0e3b68"
        strokeWidth={4.5}
      />

      {/* Outer Decorative Nautical Rim Ring */}
      <circle
        cx={BOARD_CENTER_X}
        cy={BOARD_CENTER_Y}
        r={463}
        fill="none"
        stroke="rgba(179, 229, 252, 0.38)"
        strokeWidth={1.5}
      />

      {/* Shallow Turquoise Reef Halo around the Central Island */}
      <circle
        cx={BOARD_CENTER_X}
        cy={BOARD_CENTER_Y}
        r={282}
        fill="rgba(122, 224, 255, 0.22)"
        stroke="rgba(184, 240, 255, 0.4)"
        strokeWidth={8}
      />

      {/* Subtle Wave Contour Ripples & Whitecaps */}
      {[316, 352, 386, 424, 450].map((r, idx) => (
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

      {/* 6 Jigsaw Frame Seams with Interlocking Tabs */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = ((deg - 15) * Math.PI) / 180;
        const innerR = 275;
        const midR = 378;
        const outerR = 470;
        const perpSeamX = -Math.sin(rad);
        const perpSeamY = Math.cos(rad);

        const x1 = BOARD_CENTER_X + Math.cos(rad) * innerR;
        const y1 = BOARD_CENTER_Y + Math.sin(rad) * innerR;
        const xm1 = BOARD_CENTER_X + Math.cos(rad) * (midR - 14);
        const ym1 = BOARD_CENTER_Y + Math.sin(rad) * (midR - 14);
        const xTab = BOARD_CENTER_X + Math.cos(rad) * midR + perpSeamX * 12;
        const yTab = BOARD_CENTER_Y + Math.sin(rad) * midR + perpSeamY * 12;
        const xm2 = BOARD_CENTER_X + Math.cos(rad) * (midR + 14);
        const ym2 = BOARD_CENTER_Y + Math.sin(rad) * (midR + 14);
        const x2 = BOARD_CENTER_X + Math.cos(rad) * outerR;
        const y2 = BOARD_CENTER_Y + Math.sin(rad) * outerR;

        return (
          <path
            key={deg}
            d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${xm1.toFixed(1)} ${ym1.toFixed(1)} Q ${xTab.toFixed(1)} ${yTab.toFixed(1)}, ${xm2.toFixed(1)} ${ym2.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`}
            fill="none"
            stroke="rgba(9, 42, 74, 0.42)"
            strokeWidth={1.6}
          />
        );
      })}

      {/* =================================================================== */}
      {/* 0. WHALES IN THE OCEAN (3P / 4P Indicator Pod + Scenic Ocean Whales)*/}
      {/* =================================================================== */}
      <g data-testid="ocean-whales" aria-label={`Ocean whales (${playerCount}-player game indicator pod)`}>
        {/* Official Rulebook Global Footprint Whale Pod (3 whales in 3P, 4 whales in 4P) */}
        <g data-testid="gf-whale-pod">
          <OceanWhaleSvg cx={568} cy={136} scale={0.95} rotate={24} showSpout={true} />
          <OceanWhaleSvg cx={604} cy={165} scale={0.85} rotate={32} showSpout={false} />
          <OceanWhaleSvg cx={778} cy={292} scale={0.92} rotate={42} showSpout={true} />
          {playerCount === 4 && (
            <OceanWhaleSvg cx={742} cy={268} scale={0.78} rotate={36} showSpout={false} />
          )}
        </g>

        {/* Scenic Whales Swimming in the Outer Blue Sea Channels */}
        <OceanWhaleSvg cx={256} cy={142} scale={1.08} rotate={-28} showSpout={true} />
        <OceanWhaleSvg cx={155} cy={386} scale={0.92} rotate={-75} flipX={true} showSpout={true} />
        <OceanWhaleSvg cx={292} cy={798} scale={1.05} rotate={22} showSpout={true} />
        <OceanWhaleSvg cx={692} cy={792} scale={0.96} rotate={-24} flipX={true} showSpout={true} />
      </g>

      {/* =================================================================== */}
      {/* 1. 9 COASTAL HARBORS                                                */}
      {/* =================================================================== */}
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

      {/* =================================================================== */}
      {/* 2. TOP 12 O'CLOCK GREEN ISLAND — VICTORY POINT TRACK (1..10)        */}
      {/* =================================================================== */}
      <g data-testid="vp-track">
        {/* Shallow Reef Halo around VP Island */}
        <path
          d="M 316 114 Q 432 42, 560 58 Q 588 64, 582 94 Q 574 124, 530 116 Q 432 100, 350 140 Q 318 148, 312 124 Z"
          fill="rgba(130, 228, 255, 0.28)"
          stroke="rgba(210, 246, 255, 0.55)"
          strokeWidth={5}
        />

        {/* Green Coastal Island Body at Top (11:00 to 12:30) */}
        <path
          d="M 320 112 Q 435 44, 558 60 Q 584 65, 578 93 Q 570 120, 528 113 Q 435 98, 352 137 Q 320 145, 315 123 Z"
          fill="url(#greenIslandGrad)"
          stroke="#ece2c6"
          strokeWidth={3.5}
        />

        {/* Track Title Pill Centered Cleanly Above the Island */}
        <g transform="translate(448, 43)">
          <rect
            x={-88}
            y={-10}
            width={176}
            height={16}
            rx={8}
            fill="rgba(12, 34, 58, 0.88)"
            stroke="rgba(190, 232, 255, 0.45)"
            strokeWidth={1}
          />
          <text
            x={0}
            y={1.5}
            textAnchor="middle"
            fontSize="8.2"
            fontWeight="800"
            letterSpacing="0.9"
            fill="#f0f8ff"
          >
            VICTORY POINTS (10 TO WIN)
          </text>
        </g>

        {/* 10 Stone Circles along the Green Island Arc */}
        {Array.from({ length: 10 }, (_, idx) => {
          const vp = idx + 1;
          const t = idx / 9;
          // Arc from left (340, 118) to right (552, 82)
          const cx = 340 + t * 212;
          const cy = 117 - Math.sin(t * Math.PI) * 28 - t * 30;
          const occupants = vpSlotPlayers.get(vp) ?? [];

          return (
            <g key={vp} data-testid={`vp-slot-${vp}`}>
              <circle
                cx={cx}
                cy={cy}
                r={10.2}
                fill={vp === 10 ? '#f7e594' : '#dedcd2'}
                stroke={vp === 10 ? '#9c7816' : '#4a4d45'}
                strokeWidth={1.6}
              />
              <text
                x={cx}
                y={cy + 3.5}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="900"
                fill="#1e221b"
              >
                {vp}
              </text>

              {/* Render 3D Player Cylinder Markers occupying this VP slot */}
              {occupants.map((pid, pIdx) => {
                const pTheme = PLAYER_THEMES[pid];
                const offsetAngle = (pIdx * Math.PI) / 2 - Math.PI / 4;
                const offsetR = occupants.length > 1 ? 5.5 : 0;
                const mx = cx + Math.cos(offsetAngle) * offsetR;
                const my = cy + Math.sin(offsetAngle) * offsetR - 2;

                return (
                  <g
                    key={pid}
                    data-testid={`vp-marker-${pid}`}
                    transform={`translate(${mx.toFixed(1)}, ${my.toFixed(1)})`}
                  >
                    <ellipse cx={1.5} cy={3} rx={7.2} ry={6.2} fill="rgba(0,0,0,0.4)" />
                    <ellipse
                      cx={0}
                      cy={1.8}
                      rx={7}
                      ry={6}
                      fill={pTheme.sideFill}
                      stroke={pTheme.outerHalo}
                      strokeWidth={1.4}
                    />
                    <ellipse
                      cx={0}
                      cy={-1}
                      rx={7}
                      ry={6}
                      fill={pTheme.fill}
                      stroke={pTheme.stroke}
                      strokeWidth={1.2}
                    />
                    <PlayerEmblemSvg playerId={pid} cx={0} cy={-1} r={3.4} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>

      {/* =================================================================== */}
      {/* 3. 1–2 O'CLOCK DIAGONAL GLOBAL FOOTPRINT TRACK (0..28 / 0..21)      */}
      {/* =================================================================== */}
      <g
        data-testid="gf-track"
        aria-label={`Global Footprint Track: ${clampedGF} of ${gfConfig.max} (True Total LF: ${trueTotalLF}), drawing ${currentDrawCount} event discs per turn`}
      >
        {/* Track Header Pill (positioned cleanly inside the circular rim above Row 0) */}
        <g transform={`translate(${headerCx.toFixed(1)}, ${headerCy.toFixed(1)}) rotate(${gfAngleDeg})`}>
          <rect
            x={-104}
            y={-9}
            width={208}
            height={17}
            rx={8.5}
            fill="rgba(12, 34, 58, 0.9)"
            stroke="rgba(190, 232, 255, 0.5)"
            strokeWidth={1}
          />
          <text
            x={0}
            y={2.5}
            textAnchor="middle"
            fontSize="8"
            fontWeight="800"
            letterSpacing="0.4"
            fill="#f0f8ff"
          >
            GLOBAL FOOTPRINT: {clampedGF}/{gfConfig.max} ({currentDrawCount} DISC{currentDrawCount > 1 ? 'S' : ''}/TURN)
          </text>
        </g>

        {/* Render Segmented Cells in 2 Non-Overlapping Diagonal Rows */}
        {Array.from({ length: gfConfig.max + 1 }, (_, val) => {
          // Row 0: 0..17, Row 1: 18..max (tucked INWARD underneath Row 0 with +16.5px perpendicular offset)
          const isSecondRow = val >= 18;
          const colIdx = isSecondRow ? val - 18 : val;

          const rowOffset = isSecondRow ? 18.5 : 0;
          const colShift = isSecondRow ? colIdx + 4.5 : colIdx;

          const cx = gfBaseX + colShift * gfStep * cosA + rowOffset * perpX;
          const cy = gfBaseY + colShift * gfStep * sinA + rowOffset * perpY;

          // Determine band color
          let cellFill = '#3b9c3f'; // Green eco band (0..5: 2 draws)
          const b1Max = playerCount === 4 ? 17 : 13;
          const b2Max = playerCount === 4 ? 23 : 17;
          if (val >= 6 && val <= b1Max) {
            cellFill = '#7cb342'; // Neutral lime/olive band (1 draw)
          } else if (val > b1Max && val <= b2Max) {
            cellFill = '#c28b2e'; // Amber-brown warning band (2 draws)
          } else if (val > b2Max) {
            cellFill = '#6b5344'; // Dark smog band (3 draws)
          }

          const isCurrentGF = val === clampedGF;

          return (
            <g
              key={val}
              data-testid={`gf-space-${val}`}
              transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${gfAngleDeg})`}
            >
              <rect
                x={-6.2}
                y={-6.5}
                width={12.4}
                height={13}
                rx={2}
                fill={cellFill}
                stroke={isCurrentGF ? '#f5d11d' : '#e8f0dc'}
                strokeWidth={isCurrentGF ? 1.8 : 0.9}
              />
              <text
                x={0}
                y={2.6}
                textAnchor="middle"
                fontSize="6.5"
                fontWeight="900"
                fill="#ffffff"
              >
                {val}
              </text>

              {/* 3D Black Cube Global Footprint Marker */}
              {isCurrentGF && (
                <g data-testid="gf-marker" transform="translate(0, -1)">
                  {/* Shadow */}
                  <rect x={-4.5} y={-4.5} width={11} height={11} rx={1.5} fill="rgba(0,0,0,0.52)" />
                  {/* 3D Black Wooden Cube */}
                  <polygon
                    points="-5,-5 3,-5 6,-2 6,6 -2,6 -5,3"
                    fill="#141619"
                    stroke="#f5d11d"
                    strokeWidth={1.3}
                  />
                  <rect
                    x={-5}
                    y={-5}
                    width={8}
                    height={8}
                    fill="#2b3038"
                    stroke="#ffffff"
                    strokeWidth={0.9}
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
        const islandRadiusFromCenter = 412;

        const ix = BOARD_CENTER_X + Math.cos(rad) * islandRadiusFromCenter;
        const iy = BOARD_CENTER_Y + Math.sin(rad) * islandRadiusFromCenter;

        // Tangent angle along the circular rim so the island curves naturally along the coast
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
              fill="rgba(130, 228, 255, 0.25)"
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
                      <circle
                        cx={sx}
                        cy={0}
                        r={5.2}
                        fill="none"
                        stroke="rgba(255,255,255,0.5)"
                        strokeWidth={0.8}
                      />
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
