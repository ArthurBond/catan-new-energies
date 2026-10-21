/**
 * CATAN: New Energies — Sea Frame SVG Component
 *
 * Renders:
 * 1. 6-piece interlocking azure ocean jigsaw frame with wave contours.
 * 2. 9 coastal Harbors (`[data-testid="harbor-0"]`..`harbor-8`) with pier lines, 3:1 / 2:1 labels & resource icons.
 * 3. 12 o'clock Green Island Victory Point Track (`1..10`) with 3D player cylinder markers.
 * 4. 1–2 o'clock Diagonal Global Footprint Track (`0..28` in 4P / `0..21` in 3P) with draw bands & 3D Black Cube marker.
 * 5. 7 Coastal Event Disc Islands (`[data-testid="event-track-<type>"]`) with empty/filled disc slots.
 */

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
  TABLETOP_THEME,
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
        <radialGradient id="oceanRadialGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7ac5f0" />
          <stop offset="58%" stopColor={TABLETOP_THEME.board.oceanInner} />
          <stop offset="82%" stopColor={TABLETOP_THEME.board.oceanMid} />
          <stop offset="97%" stopColor={TABLETOP_THEME.board.oceanOuter} />
          <stop offset="100%" stopColor={TABLETOP_THEME.board.oceanRim} />
        </radialGradient>

        <linearGradient id="greenIslandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#78a848" />
          <stop offset="65%" stopColor="#588732" />
          <stop offset="100%" stopColor="#3f6620" />
        </linearGradient>

        <linearGradient id="brownIslandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a39278" />
          <stop offset="60%" stopColor="#7d6e57" />
          <stop offset="100%" stopColor="#594d3b" />
        </linearGradient>
      </defs>

      {/* Outer Cardboard Table Drop Shadow */}
      <circle cx={BOARD_CENTER_X + 6} cy={BOARD_CENTER_Y + 9} r={472} fill="rgba(0,0,0,0.48)" />

      {/* Main Circular Sea Frame Base */}
      <circle
        cx={BOARD_CENTER_X}
        cy={BOARD_CENTER_Y}
        r={470}
        fill="url(#oceanRadialGrad)"
        stroke="#1b4d80"
        strokeWidth={4}
      />

      {/* Subtle Wave Contour Ripples */}
      {[345, 378, 412, 444].map((r, idx) => (
        <circle
          key={r}
          cx={BOARD_CENTER_X}
          cy={BOARD_CENTER_Y}
          r={r}
          fill="none"
          stroke={TABLETOP_THEME.board.waveContour}
          strokeWidth={idx % 2 === 0 ? 1.5 : 1}
          strokeDasharray={idx % 2 === 0 ? '18 10 6 10' : '30 14'}
        />
      ))}

      {/* 6 Jigsaw Frame Seams with Interlocking Tabs */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = ((deg - 15) * Math.PI) / 180;
        const innerR = 295;
        const midR = 382;
        const outerR = 470;
        const perpX = -Math.sin(rad);
        const perpY = Math.cos(rad);

        const x1 = BOARD_CENTER_X + Math.cos(rad) * innerR;
        const y1 = BOARD_CENTER_Y + Math.sin(rad) * innerR;
        const xm1 = BOARD_CENTER_X + Math.cos(rad) * (midR - 14);
        const ym1 = BOARD_CENTER_Y + Math.sin(rad) * (midR - 14);
        const xTab = BOARD_CENTER_X + Math.cos(rad) * midR + perpX * 12;
        const yTab = BOARD_CENTER_Y + Math.sin(rad) * midR + perpY * 12;
        const xm2 = BOARD_CENTER_X + Math.cos(rad) * (midR + 14);
        const ym2 = BOARD_CENTER_Y + Math.sin(rad) * (midR + 14);
        const x2 = BOARD_CENTER_X + Math.cos(rad) * outerR;
        const y2 = BOARD_CENTER_Y + Math.sin(rad) * outerR;

        return (
          <path
            key={deg}
            d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${xm1.toFixed(1)} ${ym1.toFixed(1)} Q ${xTab.toFixed(1)} ${yTab.toFixed(1)}, ${xm2.toFixed(1)} ${ym2.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`}
            fill="none"
            stroke="rgba(16, 52, 88, 0.45)"
            strokeWidth={1.6}
          />
        );
      })}

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

        const harborX = midX + nx * 38;
        const harborY = midY + ny * 38;

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
              x2={harborX - nx * 8}
              y2={harborY - ny * 8}
              stroke="#d9ccb4"
              strokeWidth={3.2}
              strokeLinecap="round"
            />
            <line
              x1={p2.x}
              y1={p2.y}
              x2={harborX - nx * 8}
              y2={harborY - ny * 8}
              stroke="#d9ccb4"
              strokeWidth={3.2}
              strokeLinecap="round"
            />

            {/* Harbor Water Badge */}
            <circle
              cx={harborX}
              cy={harborY}
              r={19}
              fill="rgba(244, 245, 240, 0.92)"
              stroke="#275d94"
              strokeWidth={1.8}
            />

            {harbor.resource ? (
              <>
                <ResourceIconSvg type={harbor.resource} cx={harborX} cy={harborY - 4.5} scale={0.9} />
                <text
                  x={harborX}
                  y={harborY + 11.5}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="800"
                  fill="#163554"
                >
                  2:1
                </text>
              </>
            ) : (
              <>
                <text
                  x={harborX}
                  y={harborY + 1}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight="900"
                  fill="#163554"
                >
                  3:1
                </text>
                <text
                  x={harborX}
                  y={harborY + 10}
                  textAnchor="middle"
                  fontSize="7"
                  fontWeight="700"
                  fill="#3b648c"
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
        {/* Green Coastal Island Body at Top (11:00 to 12:30) */}
        <path
          d="M 332 106 Q 425 46, 540 58 Q 565 62, 560 88 Q 552 114, 515 110 Q 430 98, 355 134 Q 326 144, 322 122 Z"
          fill="url(#greenIslandGrad)"
          stroke="#e8dec0"
          strokeWidth={3.5}
        />

        {/* Track Title */}
        <text
          x={444}
          y={52}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="800"
          letterSpacing="1.2"
          fill="#e8f4fc"
        >
          VICTORY POINTS (10 TO WIN)
        </text>

        {/* 10 Stone Circles along the Green Island Arc */}
        {Array.from({ length: 10 }, (_, idx) => {
          const vp = idx + 1;
          const t = idx / 9;
          // Arc from left (346, 118) to right (542, 82)
          const cx = 346 + t * 196;
          const cy = 116 - Math.sin(t * Math.PI) * 28 - t * 28;
          const occupants = vpSlotPlayers.get(vp) ?? [];

          return (
            <g key={vp} data-testid={`vp-slot-${vp}`}>
              <circle
                cx={cx}
                cy={cy}
                r={10.5}
                fill={vp === 10 ? '#f7e594' : '#d6d4cc'}
                stroke={vp === 10 ? '#9c7816' : '#5e6158'}
                strokeWidth={1.6}
              />
              <text
                x={cx}
                y={cy + 3.8}
                textAnchor="middle"
                fontSize="10"
                fontWeight="900"
                fill="#252922"
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
                    transform={`translate(${mx}, ${my})`}
                  >
                    <ellipse cx={1.5} cy={3} rx={7.5} ry={6.5} fill="rgba(0,0,0,0.4)" />
                    <ellipse
                      cx={0}
                      cy={1.8}
                      rx={7.2}
                      ry={6.2}
                      fill={pTheme.sideFill}
                      stroke={pTheme.outerHalo}
                      strokeWidth={1.4}
                    />
                    <ellipse
                      cx={0}
                      cy={-1}
                      rx={7.2}
                      ry={6.2}
                      fill={pTheme.fill}
                      stroke={pTheme.stroke}
                      strokeWidth={1.2}
                    />
                    <PlayerEmblemSvg playerId={pid} cx={0} cy={-1} r={3.5} />
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
        {/* Track Header Pill */}
        <g transform="translate(695, 130) rotate(36)">
          <rect
            x={-115}
            y={-28}
            width={230}
            height={20}
            rx={10}
            fill="rgba(16, 38, 62, 0.85)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
          />
          <text
            x={0}
            y={-14.5}
            textAnchor="middle"
            fontSize="9"
            fontWeight="800"
            fill="#f0f6fc"
          >
            GLOBAL FOOTPRINT: {clampedGF}/{gfConfig.max} ({currentDrawCount} DISC{currentDrawCount > 1 ? 'S' : ''}/TURN)
          </text>
        </g>

        {/* Render Segmented Cells in 2 Diagonal Rows matching UI-design-style.png */}
        {Array.from({ length: gfConfig.max + 1 }, (_, val) => {
          // Row 0: 0..17, Row 1: 18..max (tucked underneath, just like UI-design-style.png!)
          const isSecondRow = val >= 18;
          const colIdx = isSecondRow ? val - 18 : val;

          // Base diagonal vector at 38 degrees
          const baseX = 595;
          const baseY = 104;
          const cosA = Math.cos((38 * Math.PI) / 180);
          const sinA = Math.sin((38 * Math.PI) / 180);
          const perpX = -sinA;
          const perpY = cosA;

          const step = 12.8;
          const rowOffset = isSecondRow ? -16 : 0;
          const colShift = isSecondRow ? colIdx + 4 : colIdx;

          const cx = baseX + colShift * step * cosA + rowOffset * perpX;
          const cy = baseY + colShift * step * sinA + rowOffset * perpY;

          // Determine band color
          let cellFill = '#4aa346'; // Green band (0..5)
          const b1Max = playerCount === 4 ? 17 : 13;
          const b2Max = playerCount === 4 ? 23 : 17;
          if (val >= 6 && val <= b1Max) {
            cellFill = '#8ab846'; // Neutral lime/olive band (1 draw)
          } else if (val > b1Max && val <= b2Max) {
            cellFill = '#b58d3d'; // Brown band (2 draws)
          } else if (val > b2Max) {
            cellFill = '#6e5c4f'; // Dark smog band (3 draws)
          }

          const isCurrentGF = val === clampedGF;

          return (
            <g
              key={val}
              data-testid={`gf-space-${val}`}
              transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(38)`}
            >
              <rect
                x={-6}
                y={-6.5}
                width={12}
                height={13}
                rx={1.5}
                fill={cellFill}
                stroke={isCurrentGF ? '#ffffff' : '#e6ebd8'}
                strokeWidth={isCurrentGF ? 1.8 : 0.8}
              />
              <text
                x={0}
                y={3}
                textAnchor="middle"
                fontSize="6.8"
                fontWeight="800"
                fill="#ffffff"
              >
                {val}
              </text>

              {/* 3D Black Cube Global Footprint Marker */}
              {isCurrentGF && (
                <g data-testid="gf-marker" transform="translate(0, -1)">
                  {/* Shadow */}
                  <rect x={-4.5} y={-4.5} width={11} height={11} rx={1.5} fill="rgba(0,0,0,0.5)" />
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
        const islandRadiusFromCenter = 415;

        const ix = BOARD_CENTER_X + Math.cos(rad) * islandRadiusFromCenter;
        const iy = BOARD_CENTER_Y + Math.sin(rad) * islandRadiusFromCenter;

        // Tangent angle along the circular rim so the island curves naturally along the coast
        const tangentDeg = meta.angleDeg + 90;
        const isGreen = meta.category === 'green' || meta.category === 'hybrid';
        const pillHalfLen = meta.capacity === 4 ? 54 : 42;

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
            {/* Coastal Foam / Sandy Beach Outline */}
            <rect
              x={-pillHalfLen - 4}
              y={-20}
              width={(pillHalfLen + 4) * 2}
              height={40}
              rx={20}
              fill="#e6dec5"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth={2}
            />
            {/* Island Terrain Fill (Lush Green on Left Rim, Rocky Brown on Right/Bottom Rim) */}
            <rect
              x={-pillHalfLen}
              y={-17}
              width={pillHalfLen * 2}
              height={34}
              rx={17}
              fill={isGreen ? 'url(#greenIslandGrad)' : 'url(#brownIslandGrad)'}
              stroke={isGreen ? '#35591b' : '#4a3f2f'}
              strokeWidth={1.5}
            />

            {/* Slots along the Island */}
            {Array.from({ length: meta.capacity }, (_, sIdx) => {
              const step = 24;
              const startX = -((meta.capacity - 1) * step) / 2;
              const sx = startX + sIdx * step;
              const isFilled = sIdx < filledCount;

              return (
                <g key={sIdx} data-testid={`event-slot-${trackKey}-${sIdx}`}>
                  {/* Stone Slot Crater */}
                  <circle
                    cx={sx}
                    cy={0}
                    r={9.5}
                    fill="rgba(25, 28, 24, 0.38)"
                    stroke="rgba(240, 238, 225, 0.75)"
                    strokeWidth={1.2}
                    strokeDasharray={isFilled ? undefined : '2.5 2'}
                  />

                  {/* Drawn Event Disc Token when filled */}
                  {isFilled && (
                    <g data-testid={`event-disc-${trackKey}-${sIdx}`}>
                      <circle cx={sx + 1} cy={1.5} r={8.8} fill="rgba(0,0,0,0.35)" />
                      <circle
                        cx={sx}
                        cy={0}
                        r={8.5}
                        fill={isGreen ? '#7cb342' : '#8d6e63'}
                        stroke="#f5f2e6"
                        strokeWidth={1.4}
                      />
                      <circle
                        cx={sx}
                        cy={0}
                        r={5.5}
                        fill="none"
                        stroke="rgba(255,255,255,0.5)"
                        strokeWidth={0.8}
                      />
                    </g>
                  )}
                </g>
              );
            })}

            {/* Track Name Banner */}
            <g transform={meta.angleDeg > 20 && meta.angleDeg < 160 ? 'rotate(180)' : undefined}>
              <rect
                x={-44}
                y={-28}
                width={88}
                height={12}
                rx={6}
                fill="rgba(18, 30, 46, 0.85)"
              />
              <text
                x={0}
                y={-19.5}
                textAnchor="middle"
                fontSize="7"
                fontWeight="800"
                fill="#f4f7fa"
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
