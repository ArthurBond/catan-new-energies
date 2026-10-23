/**
 * CATAN: New Energies — Central Circular Island Board SVG Component
 *
 * Renders the complete 1000x1000 SVG tabletop board:
 * - Outer 6-piece Sea Frame (`SeaFrameSvg`)
 * - White base road channel lattice (`#f4f5f0`)
 * - 19 pointy-top terrain hexes (`[data-hex="0"]`..`18`) with Ian O'Toole-inspired vector illustrations
 * - Cream Number Discs (red double-ringed 6 & 8, probability pips), Hazard cogs, and Inspector pawn
 * - 72 path edges (`[data-edge="0"]`..`71`) with 3D beveled wooden Roads
 * - Hex-corner Power Plant cutout slots (`[data-plant-slot="nodeId-hexId"]`) with Fossil & Renewable cylinders
 * - 54 intersection nodes (`[data-node="0"]`..`53`) with 3D wooden Towns, Cities & Hazard overlays
 */

import 'preact/compat';
import { useRef } from 'preact/hooks';
import {
  EdgeId,
  EventDiscType,
  GameState,
  HexId,
  Intersection,
  NodeId,
  PlayerId,
  TerrainType,
} from '../engine/types';
import { SeaFrameSvg } from './SeaFrameSvg';
import {
  getNumberDiscPips,
  getPointyHexPoints,
  HEX_RADIUS,
  hexCoordToSvg,
  ISLAND_TRANSFORM,
  ROAD_LENGTH,
  latticeToSvg,
  PLAYER_THEMES,
  TABLETOP_THEME,
  TERRAIN_THEMES,
} from './theme';
import {
  CityPieceSvg,
  HazardTokenSvg,
  InspectorPawnSvg,
  PieceDefs,
  PLANT_RADIUS,
  PLANT_SOCKET_DIST,
  plantRestOffset,
  PowerPlantCylinderSvg,
  TownPieceSvg,
} from './WoodenPiecesSvg';

export interface IslandBoardSvgProps {
  state: GameState;
  highlightedHexIds?: Set<HexId>;
  producingHexIds?: Set<HexId>;
  highlightedNodeIds?: Set<NodeId>;
  highlightedEdgeIds?: Set<EdgeId>;
  highlightedCutoutSlots?: Set<string>; // Format: `${nodeId}-${hexId}`
  /** Translucent piece shown where a hovered placement would go */
  previewNode?: { nodeId: NodeId; type: 'town' | 'city'; playerId: PlayerId } | null;
  previewEdge?: { edgeId: EdgeId; playerId: PlayerId } | null;
  /** Roads chosen but not yet built (e.g. the first road of Road Construction) */
  pinnedEdges?: { edgeId: EdgeId; playerId: PlayerId }[];
  onHexClick?: (hexId: HexId) => void;
  onNodeClick?: (nodeId: NodeId) => void;
  onEdgeClick?: (edgeId: EdgeId) => void;
  onCutoutClick?: (nodeId: NodeId, hexId: HexId) => void;
  onNodeHover?: (nodeId: NodeId | null) => void;
  onEdgeHover?: (edgeId: EdgeId | null) => void;
  onSelectEventTrackInfo?: (track: EventDiscType) => void;
}

/** Conifer positions [x, y, scale] for the forest tile, leaving the number disc clear. */
const FOREST_TREES: [number, number, number][] = [
  [-30, -18, 1],
  [-18, -32, 0.95],
  [-4, -40, 0.85],
  [12, -34, 1],
  [26, -24, 1.05],
  [36, -6, 0.9],
  [-38, 0, 0.9],
  [-30, 16, 1.05],
  [-16, 30, 0.95],
  [0, 40, 0.85],
  [16, 32, 1],
  [30, 22, 1.05],
  [40, 10, 0.85],
  [-26, -4, 0.8],
  [26, 6, 0.8],
];

/** Radius wobble shared by every quarry terrace, so the nested rings stay organic but never cross. */
const PIT_WOBBLE = [1.0, 1.07, 0.97, 1.05, 0.93, 1.02, 1.04, 0.94, 1.06, 0.98, 1.01, 0.95];

/** Closed smooth blob (Catmull-Rom through wobbled points on an ellipse), as an SVG path. */
function blobPath(cx: number, cy: number, rx: number, ry: number, round: number): string {
  const n = PIT_WOBBLE.length;
  const pts = PIT_WOBBLE.map((m, i) => {
    const a = (2 * Math.PI * i) / n - 0.35;
    const k = 1 + (m - 1) * (1 - round);
    return [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)] as const;
  });
  const f = (v: number) => v.toFixed(1);
  let d = `M ${f(pts[0]![0])} ${f(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d} Z`;
}

const PIT_RX = 40;
const PIT_RY = 36;

/**
 * Open-pit clay quarry levels, outermost first. `s` scales the pit, (dx, dy) slides it down-right
 * so the far (upper-left) walls show tall and the near walls thin; `top` levels are sunlit
 * terrace tops, the others are the shadowed walls stepping down to the floor.
 */
const PIT_LEVELS: { s: number; dx: number; dy: number; kind: 'top' | 'wall' | 'floor' }[] = [
  { s: 1.0, dx: 0, dy: -1, kind: 'top' },
  { s: 0.94, dx: 0.3, dy: 0.2, kind: 'wall' },
  { s: 0.85, dx: 0.8, dy: 2.4, kind: 'top' },
  { s: 0.79, dx: 1.1, dy: 3.2, kind: 'wall' },
  { s: 0.7, dx: 1.5, dy: 5.2, kind: 'top' },
  { s: 0.64, dx: 1.8, dy: 6, kind: 'wall' },
  { s: 0.56, dx: 2.2, dy: 7.4, kind: 'floor' },
];

const PIT_PATHS = PIT_LEVELS.map((l, i) =>
  blobPath(l.dx, l.dy, PIT_RX * l.s, PIT_RY * l.s, Math.min(0.5, i * 0.07)),
);

/** Track spiralling from the rim down to the pit floor, as a polyline. */
const PIT_RAMP = (() => {
  const steps = 34;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = ((-140 + 255 * t) * Math.PI) / 180;
    const s = 0.93 - 0.27 * t;
    const cx = 0.3 + 1.9 * t;
    const cy = 0.5 + 7 * t;
    pts.push(`${(cx + PIT_RX * s * Math.cos(a)).toFixed(1)} ${(cy + PIT_RY * s * Math.sin(a)).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')}`;
})();

/** Small brick pyramid used beside the quarry. */
function BrickStack({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const rows = [3, 2, 1];
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`}>
      <ellipse cx={1} cy={1.2} rx={7} ry={1.8} fill="rgba(60,20,8,0.35)" />
      {rows.map((count, r) =>
        Array.from({ length: count }, (_, c) => (
          <rect
            key={`${r}-${c}`}
            x={-((count * 4.2) / 2) + c * 4.2 + 0.1}
            y={-2.1 * (r + 1) + 0.2}
            width={4}
            height={1.9}
            rx={0.3}
            fill={(r + c) % 2 === 0 ? '#c9552d' : '#b44a26'}
            stroke="#6a2a14"
            strokeWidth={0.4}
          />
        )),
      )}
      <rect x={-6} y={-2.1} width={12.6} height={0.5} fill="#f0a478" opacity={0.35} />
    </g>
  );
}

/** Dry scrub bush on the quarry rim. */
function ScrubBush({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`}>
      <ellipse cx={1.2} cy={2.4} rx={5.6} ry={1.7} fill="rgba(60,20,8,0.3)" />
      <circle cx={-2.4} cy={0.4} r={2.8} fill="#5f6b2f" stroke="#3a4219" strokeWidth={0.5} />
      <circle cx={2.6} cy={0.6} r={2.6} fill="#566226" stroke="#3a4219" strokeWidth={0.5} />
      <circle cx={0} cy={-1.4} r={3.1} fill="#74823a" stroke="#3a4219" strokeWidth={0.5} />
      <circle cx={-0.9} cy={-2.3} r={1.2} fill="#a1b058" opacity={0.8} />
    </g>
  );
}

/** Tiny quarry worker, optionally pushing a clay cart. */
function QuarryWorker({ x, y, shirt, cart = false, flip = false }: { x: number; y: number; shirt: string; cart?: boolean; flip?: boolean }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${flip ? -1 : 1}, 1)`}>
      <ellipse cx={0.4} cy={0.8} rx={2.4} ry={0.8} fill="rgba(40,12,4,0.4)" />
      {cart && (
        <g transform="translate(3.6, -0.6)">
          <path d="M -2.4 -2.4 L 2.4 -2.4 L 1.8 0 L -1.8 0 Z" fill="#5b3a22" stroke="#2f1a0c" strokeWidth={0.35} />
          <path d="M -2 -2.4 Q 0 -4.2, 2 -2.4 Z" fill="#d9794a" stroke="#6a2a14" strokeWidth={0.3} />
          <circle cx={0} cy={0.2} r={0.9} fill="#2f1a0c" />
        </g>
      )}
      <rect x={-0.9} y={-3} width={1.8} height={3} rx={0.6} fill={shirt} stroke="#2f1a0c" strokeWidth={0.3} />
      <circle cx={0} cy={-3.8} r={0.95} fill="#e8b48a" stroke="#2f1a0c" strokeWidth={0.3} />
      <path d="M -1.1 -4.2 Q 0 -5.4, 1.1 -4.2 Z" fill="#f2c230" stroke="#2f1a0c" strokeWidth={0.25} />
    </g>
  );
}

/** Open-pit clay quarry for the hills (brick) tile: stepped terraces spiralling down to a dark floor. */
function HillsArtworkSvg({ hexId }: { hexId: number }) {
  const id = (name: string) => `hills-${name}-${hexId}`;
  return (
    <g>
      <defs>
        <linearGradient id={id('ground')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9b07d" />
          <stop offset="0.55" stopColor="#d9915f" />
          <stop offset="1" stopColor="#bf6c43" />
        </linearGradient>
        <linearGradient id={id('top')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0b685" />
          <stop offset="1" stopColor="#d58a5a" />
        </linearGradient>
        <linearGradient id={id('wall')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5a2615" />
          <stop offset="0.5" stopColor="#8d4224" />
          <stop offset="1" stopColor="#c46c40" />
        </linearGradient>
        <radialGradient id={id('floor')} cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#7b3820" />
          <stop offset="1" stopColor="#5a2515" />
        </radialGradient>
      </defs>

      {/* Sandy-clay ground with soft dunes */}
      <rect x={-60} y={-60} width={120} height={120} fill={`url(#${id('ground')})`} />
      <ellipse cx={-26} cy={-30} rx={34} ry={22} fill="#f6cfa4" opacity={0.28} />
      <ellipse cx={30} cy={34} rx={34} ry={20} fill="#9c4c28" opacity={0.28} />

      {/* Boulders and clay patches on the ground */}
      {([[-36, -4, 2.4], [38, -12, 1.8], [-14, 40, 2], [18, -41, 1.6], [37, 20, 1.5]] as [number, number, number][]).map(([bx, by, br], i) => (
        <g key={`rock-${i}`}>
          <ellipse cx={bx + 0.6} cy={by + br * 0.6} rx={br * 1.2} ry={br * 0.45} fill="rgba(60,20,8,0.3)" />
          <ellipse cx={bx} cy={by} rx={br} ry={br * 0.75} fill="#b8734d" stroke="#6a3018" strokeWidth={0.45} />
          <ellipse cx={bx - br * 0.3} cy={by - br * 0.3} rx={br * 0.45} ry={br * 0.28} fill="#e0a37a" opacity={0.8} />
        </g>
      ))}

      {/* Soft shadow the pit casts on the surrounding ground */}
      <path d={blobPath(2.4, 2.6, PIT_RX + 2.5, PIT_RY + 2.5, 0)} fill="#6a2a14" opacity={0.18} />
      <path d={blobPath(1.6, 1.6, PIT_RX + 1.2, PIT_RY + 1.2, 0)} fill="#6a2a14" opacity={0.22} />

      {/* Terraces and walls stepping down to the floor */}
      {PIT_LEVELS.map((lvl, i) => (
        <path
          key={i}
          d={PIT_PATHS[i]}
          fill={lvl.kind === 'top' ? `url(#${id('top')})` : lvl.kind === 'wall' ? `url(#${id('wall')})` : `url(#${id('floor')})`}
          stroke={lvl.kind === 'top' ? '#7a3a20' : '#4a1d0e'}
          strokeOpacity={lvl.kind === 'top' ? 0.55 : 0.5}
          strokeWidth={lvl.kind === 'top' ? 0.7 : 0.5}
        />
      ))}

      {/* Layered clay strata streaking the shadowed walls */}
      {PIT_LEVELS.map((lvl, i) =>
        lvl.kind === 'wall' ? (
          <path
            key={`strata-${i}`}
            d={PIT_PATHS[i]}
            transform="translate(0, 0.9)"
            fill="none"
            stroke="#3d170a"
            strokeOpacity={0.3}
            strokeWidth={0.6}
            strokeDasharray="7 3 2 6 11 4"
          />
        ) : null,
      )}

      {/* Sunlit lip catching the light on the lower-right terraces */}
      {[2, 4].map((i) => (
        <path
          key={i}
          d={PIT_PATHS[i]}
          fill="none"
          stroke="#fbd9b0"
          strokeOpacity={0.5}
          strokeWidth={0.8}
          strokeDasharray="40 200"
          strokeDashoffset={-110 - i * 6}
        />
      ))}

      {/* Track spiralling down into the pit */}
      <path d={PIT_RAMP} transform="translate(0.5, 0.8)" fill="none" stroke="#4a1d0e" strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={PIT_RAMP} fill="none" stroke="#dfa673" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={PIT_RAMP} transform="translate(-0.3, -0.4)" fill="none" stroke="#f8dfb8" strokeOpacity={0.45} strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" />

      {/* Workers and a clay cart on the terraces */}
      <QuarryWorker x={-27} y={-6} shirt="#2f6ea8" cart />
      <QuarryWorker x={21} y={19} shirt="#d9402e" flip />
      <QuarryWorker x={-6} y={-27} shirt="#f4f1e6" />

      {/* Brick stacks and scrub around the rim */}
      <BrickStack x={-26} y={-32} s={0.85} />
      <BrickStack x={25} y={37} s={0.85} />
      <ScrubBush x={29} y={-34} s={0.8} />
      <ScrubBush x={-31} y={34} s={0.8} />
      <ScrubBush x={0} y={-46} s={0.6} />
      <ScrubBush x={4} y={47} s={0.6} />
    </g>
  );
}

/**
 * Renders original clean vector topographic/architectural terrain artwork inside a pointy-top hex centered at (0,0)
 */
function TerrainArtworkSvg({ terrain, hexId }: { terrain: TerrainType; hexId: number }) {
  const theme = TERRAIN_THEMES[terrain];
  const innerR = HEX_RADIUS - 4.8;
  const clipId = `hex-clip-${hexId}`;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <polygon points={getPointyHexPoints(0, 0, innerR)} />
        </clipPath>
      </defs>

      {/* Base Hex Polygon */}
      <polygon
        points={getPointyHexPoints(0, 0, innerR)}
        fill={theme.primaryFill}
        stroke={theme.borderFill}
        strokeWidth={1.5}
      />

      {/* Clipped Vector Terrain Illustration */}
      <g clipPath={`url(#${clipId})`}>
        {terrain === 'forest' && (
          <g>
            {/* Mossy undergrowth and a logging trail */}
            <circle cx={-20} cy={-16} r={26} fill={theme.secondaryFill} />
            <circle cx={22} cy={14} r={28} fill={theme.accentFill} />
            <path
              d="M -40 30 Q -12 12, -2 -2 T 34 -34"
              fill="none"
              stroke="#8a7152"
              strokeWidth={5.5}
              strokeLinecap="round"
              opacity={0.75}
            />
            {/* Dense layered conifers (kept clear of the number disc) */}
            {FOREST_TREES.map(([tx, ty, sc], idx) => (
              <g key={idx} transform={`translate(${tx}, ${ty}) scale(${sc})`}>
                <ellipse cx={1.5} cy={5.5} rx={6.5} ry={2.6} fill="rgba(0,0,0,0.3)" />
                <rect x={-0.9} y={2} width={1.8} height={4} fill="#5b3f26" />
                <polygon points="0,-4 6.5,4 -6.5,4" fill="#2f5d3c" stroke="#16301f" strokeWidth={0.7} strokeLinejoin="round" />
                <polygon points="0,-9 5.2,-1 -5.2,-1" fill="#3f7a50" stroke="#16301f" strokeWidth={0.7} strokeLinejoin="round" />
                <polygon points="0,-13 3.8,-6 -3.8,-6" fill="#5a9a68" stroke="#16301f" strokeWidth={0.7} strokeLinejoin="round" />
                <path d="M 0 -12.5 L -3 -6.5 M 0 -8.5 L -4.4 -1.4" stroke="#8cc79a" strokeWidth={0.8} strokeLinecap="round" opacity={0.7} />
              </g>
            ))}
          </g>
        )}

        {terrain === 'hills' && <HillsArtworkSvg hexId={hexId} />}

        {terrain === 'pasture' && (
          <g>
            {/* Patchwork meadow paddocks with fence lines */}
            <polygon points="-55,-10 10,-55 55,5 -10,55" fill={theme.secondaryFill} opacity={0.65} />
            <path
              d="M -45 -18 L 45 18 M -18 45 L 18 -45"
              stroke={theme.accentFill}
              strokeWidth={2.2}
              strokeDasharray="6 3"
            />
            {/* Grass tufts */}
            {([
              [-34, -2],
              [-8, -36],
              [30, -30],
              [36, 4],
              [-26, 30],
              [10, 36],
              [-40, 14],
            ] as [number, number][]).map(([gx, gy], i) => (
              <path
                key={`tuft-${i}`}
                d={`M ${gx - 3} ${gy} L ${gx - 1} ${gy - 4} M ${gx} ${gy} L ${gx} ${gy - 5} M ${gx + 3} ${gy} L ${gx + 1} ${gy - 4}`}
                stroke={theme.accentFill}
                strokeWidth={1.1}
                strokeLinecap="round"
              />
            ))}
            {/* Grazing sheep */}
            {[
              [-22, -16, 1],
              [20, -18, -1],
              [-20, 20, -1],
              [22, 16, 1],
              [-2, -30, 1],
            ].map(([sx, sy, dir], i) => (
              <g key={i} transform={`translate(${sx}, ${sy}) scale(${dir}, 1)`}>
                <ellipse cx={0.6} cy={3.4} rx={5.4} ry={1.6} fill="rgba(0,0,0,0.22)" />
                <path d="M -3 1.5 L -3 3.6 M -1 1.8 L -1 3.8 M 1.5 1.8 L 1.5 3.8 M 3 1.5 L 3 3.6" stroke="#2a2a2a" strokeWidth={0.9} strokeLinecap="round" />
                <path
                  d="M -4.6 1 C -6.2 0.6, -6 -2.4, -4.2 -2.6 C -3.8 -4.4, -1 -4.6, 0 -3.4 C 1.2 -4.8, 3.8 -4.2, 4 -2.4 C 5.6 -2, 5.4 1.2, 3.8 1.4 Z"
                  fill="#fbfbf6"
                  stroke="#4a6324"
                  strokeWidth={0.8}
                />
                <ellipse cx={5.6} cy={-1.4} rx={1.9} ry={1.5} fill="#2d2a26" />
              </g>
            ))}
          </g>
        )}

        {terrain === 'fields' && (
          <g>
            {/* Golden wheat field swaths matching Catan: New Energies board art */}
            {[-44, -28, -12, 4, 20, 36].map((offset, idx) => (
              <g key={idx} transform="rotate(28)">
                <rect
                  x={offset}
                  y={-58}
                  width={16}
                  height={116}
                  fill={idx % 2 === 0 ? '#eab839' : '#d69e26'}
                />
                {/* Fine wheat row texture lines */}
                <line
                  x1={offset + 4}
                  y1={-58}
                  x2={offset + 4}
                  y2={58}
                  stroke="#f6d567"
                  strokeWidth={1}
                  opacity={0.65}
                />
                <line
                  x1={offset + 11}
                  y1={-58}
                  x2={offset + 11}
                  y2={58}
                  stroke="#b57d14"
                  strokeWidth={0.9}
                  opacity={0.55}
                />
              </g>
            ))}

            {/* Swaying Golden Wheat Sheaves / Stalks around the perimeter */}
            {[
              [-22, -16],
              [21, -18],
              [-20, 19],
              [22, 16],
            ].map(([wx, wy], wIdx) => (
              <g key={wIdx} transform={`translate(${wx}, ${wy})`}>
                <path
                  d="M -3 6 L 2 -6 M 0 6 L 0 -7 M 3 6 L -2 -6"
                  stroke="#8c580c"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                />
                <ellipse
                  cx={-2.5}
                  cy={-4}
                  rx={1.8}
                  ry={3.2}
                  transform="rotate(-18 -2.5 -4)"
                  fill="#fef08a"
                  stroke="#8c580c"
                  strokeWidth={0.7}
                />
                <ellipse
                  cx={0}
                  cy={-5}
                  rx={1.8}
                  ry={3.4}
                  fill="#fde047"
                  stroke="#8c580c"
                  strokeWidth={0.7}
                />
                <ellipse
                  cx={2.5}
                  cy={-4}
                  rx={1.8}
                  ry={3.2}
                  transform="rotate(18 2.5 -4)"
                  fill="#fef08a"
                  stroke="#8c580c"
                  strokeWidth={0.7}
                />
              </g>
            ))}
          </g>
        )}

        {terrain === 'mountains' && (
          <g>
            {/* Distant range */}
            <polygon points="-56,18 -30,-22 -8,10 10,-14 34,8 56,-6 56,40 -56,40" fill={theme.secondaryFill} opacity={0.55} />
            {/* Left peak: lit and shaded faces */}
            <polygon points="-46,34 -18,-30 -6,34" fill={theme.secondaryFill} />
            <polygon points="-18,-30 -6,34 8,34" fill={theme.accentFill} />
            {/* Main peak */}
            <polygon points="-12,38 18,-38 30,38" fill="#7d8899" />
            <polygon points="18,-38 30,38 50,38" fill={theme.accentFill} />
            <path d="M 18 -38 L 12 -6 L 20 10 L 16 38" fill="none" stroke="#3b424c" strokeWidth={1} opacity={0.6} />
            {/* Jagged snow caps */}
            <polygon points="-18,-30 -11,-13 -15,-16 -19,-11 -23,-17 -27,-12" fill="#f4f7fb" />
            <polygon points="18,-38 26,-16 21,-20 17,-14 12,-21 8,-15" fill="#f4f7fb" />
            <path d="M 18 -38 L 26 -16" stroke="#c7d2df" strokeWidth={1.2} />
            {/* Scree at the foot */}
            {[
              [-30, 30],
              [-4, 36],
              [36, 32],
              [44, 24],
              [-38, 24],
            ].map(([rx, ry], i) => (
              <ellipse key={i} cx={rx} cy={ry} rx={3} ry={1.8} fill="#9aa5b4" stroke="#3b424c" strokeWidth={0.6} />
            ))}
          </g>
        )}

        {terrain === 'desert' && (
          <g>
            {/* Sweeping wind-rippled sand dunes */}
            <path
              d="M -55 -15 Q -15 -35, 25 -10 T 55 -15 L 55 55 L -55 55 Z"
              fill={theme.secondaryFill}
            />
            <path
              d="M -55 12 Q -10 -8, 30 18 T 55 12 L 55 55 L -55 55 Z"
              fill={theme.accentFill}
            />
            <path
              d="M -32 -18 Q 0 -30, 32 -14 M -28 16 Q 5 4, 34 20"
              fill="none"
              stroke="#b09d78"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Printed-board grain */}
        <polygon
          points={getPointyHexPoints(0, 0, innerR)}
          fill="url(#hex-grain) transparent"
          pointerEvents="none"
        />
      </g>

      {/* Cardboard tile bevel: lit upper-left edges, shaded lower-right edges */}
      <polyline
        points={bevelPoints(innerR - 1.6, [4, 5, 0, 1])}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.38}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
      <polyline
        points={bevelPoints(innerR - 1.6, [1, 2, 3, 4])}
        fill="none"
        stroke="#0b1520"
        strokeOpacity={0.26}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
    </g>
  );
}

/** Pointy-top hex vertices (0 = top, clockwise) joined into a polyline for edge shading. */
function bevelPoints(radius: number, vertexIdx: number[]): string {
  return vertexIdx
    .map((i) => {
      const a = ((60 * i - 90) * Math.PI) / 180;
      return `${(radius * Math.cos(a)).toFixed(2)},${(radius * Math.sin(a)).toFixed(2)}`;
    })
    .join(' ');
}

/** How long (ms) a freshly placed piece keeps its drop-in animation class. */
const PLACEMENT_ANIM_MS = 650;

/**
 * Remembers when each board piece first appeared so newly built pieces can animate in,
 * without replaying the animation on unrelated re-renders (hover, highlights, etc.).
 */
function usePlacementTimes(board: GameState['board']): (key: string) => boolean {
  const prevRef = useRef<Map<string, string> | null>(null);
  const placedAtRef = useRef<Map<string, number>>(new Map());

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const current = new Map<string, string>();
  for (const n of board.intersections) {
    if (n.building) current.set(`n${n.id}`, `${n.building.type}:${n.building.playerId}`);
    if (n.hasHazard) current.set(`hzn${n.id}`, '1');
    for (const p of n.powerPlants) current.set(`p${n.id}-${p.hexId}`, `${p.type}:${p.playerId}`);
  }
  for (const e of board.edges) {
    if (e.road) current.set(`e${e.id}`, e.road.playerId);
  }
  for (const h of board.hexes) {
    if (h.hasHazard) current.set(`hzh${h.id}`, '1');
    if (h.hasInspector) current.set(`insp${h.id}`, '1');
  }

  const prev = prevRef.current;
  if (prev) {
    for (const [key, value] of current) {
      if (prev.get(key) !== value) placedAtRef.current.set(key, now);
    }
  }
  prevRef.current = current;

  return (key: string) => {
    const at = placedAtRef.current.get(key);
    return at !== undefined && now - at < PLACEMENT_ANIM_MS;
  };
}

/**
 * Where the power plant disc for (node, hex) rests, and whether it is on the far side of the
 * building (up the screen), in which case the building is drawn over it.
 */
function plantSlot(
  board: GameState['board'],
  node: Intersection,
  hexId: HexId
): { x: number; y: number; behind: boolean } {
  const np = latticeToSvg(node.u, node.v);
  const hp = hexCoordToSvg(board.hexes[hexId]!.coord);
  const dx = hp.x - np.x;
  const dy = hp.y - np.y;
  const dist = Math.hypot(dx, dy) || 1;
  return {
    x: np.x + (dx / dist) * PLANT_SOCKET_DIST,
    y: np.y + (dy / dist) * PLANT_SOCKET_DIST + plantRestOffset(node.building?.type ?? 'town'),
    behind: dy < -1,
  };
}

function angleToHexDeg(
  board: GameState['board'],
  np: { x: number; y: number },
  hexId: HexId | undefined
): number | undefined {
  if (hexId === undefined) return undefined;
  const hp = hexCoordToSvg(board.hexes[hexId]!.coord);
  return (Math.atan2(hp.y - np.y, hp.x - np.x) * 180) / Math.PI;
}

export function IslandBoardSvg({
  state,
  highlightedHexIds,
  producingHexIds,
  highlightedNodeIds,
  highlightedEdgeIds,
  highlightedCutoutSlots,
  previewNode,
  previewEdge,
  pinnedEdges,
  onHexClick,
  onNodeClick,
  onEdgeClick,
  onCutoutClick,
  onNodeHover,
  onEdgeHover,
  onSelectEventTrackInfo,
}: IslandBoardSvgProps) {
  const { board } = state;
  const isFresh = usePlacementTimes(board);

  return (
    <svg
      viewBox="0 0 1000 1000"
      width="100%"
      height="100%"
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: '100%',
        userSelect: 'none',
        overflow: 'visible',
      }}
      data-testid="island-board-svg"
    >
      <PieceDefs />

      {/* 1. Outer Sea Frame, Harbors, VP Track, GF Track & 7 Event Islands */}
      <SeaFrameSvg
        board={board}
        playerCount={state.playerCount}
        playerOrder={state.playerOrder}
        players={state.players}
        clampedGF={state.clampedGF}
        trueTotalLF={state.trueTotalLF}
        eventTracks={state.eventTracks}
        onSelectEventTrackInfo={onSelectEventTrackInfo}
      />

      <g transform={ISLAND_TRANSFORM} data-testid="island-layer">
      {/* 2. Continuous White Road Lattice Base Underlay */}
      <g className="white-road-lattice" pointerEvents="none">
        {board.hexes.map((hex) => {
          const { x, y } = hexCoordToSvg(hex.coord);
          return (
            <polygon
              key={`lattice-${hex.id}`}
              points={getPointyHexPoints(x, y, HEX_RADIUS + 3)}
              fill={TABLETOP_THEME.board.roadLatticeFill}
              stroke={TABLETOP_THEME.board.roadLatticeStroke}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          );
        })}
      </g>

      {/* 3. 19 Pointy-Top Land Hexes + Number Discs + Hex Hazards + Inspector Pawn */}
      <g className="land-hexes-layer">
        {board.hexes.map((hex) => {
          const { x, y } = hexCoordToSvg(hex.coord);
          const isHighlighted = highlightedHexIds?.has(hex.id) ?? false;
          const isProducing = producingHexIds?.has(hex.id) ?? false;
          const isHighProb = hex.numberDisc === 6 || hex.numberDisc === 8;
          const pips = hex.numberDisc ? getNumberDiscPips(hex.numberDisc) : 0;
          const discInk = isHighProb
            ? TABLETOP_THEME.board.numberDiscRed
            : TABLETOP_THEME.board.numberDiscCharcoal;

          return (
            <g
              key={hex.id}
              data-hex={hex.id}
              transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)})`}
              onClick={() => onHexClick?.(hex.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHexClick?.(hex.id);
                }
              }}
              role="button"
              tabIndex={isHighlighted ? 0 : -1}
              aria-label={`Hex ${hex.id}: ${hex.terrain}${hex.numberDisc ? ` number ${hex.numberDisc}` : ''}${hex.hasHazard ? ', blocked by a hazard' : ''}${hex.hasInspector ? ', has Environmental Inspector' : ''}`}
              style={{ cursor: isHighlighted ? 'pointer' : 'inherit' }}
            >
              {/* Vector Terrain Illustration */}
              <TerrainArtworkSvg terrain={hex.terrain} hexId={hex.id} />

              {/* Cream Circular Number Disc */}
              {hex.numberDisc !== null && (
                <g data-testid={`number-disc-${hex.id}`}>
                  <circle cx={1.5} cy={2.5} r={17} fill="rgba(0,0,0,0.32)" />
                  <circle
                    cx={0}
                    cy={0}
                    r={17}
                    fill={TABLETOP_THEME.board.numberDiscFill}
                    stroke={
                      isHighProb ? TABLETOP_THEME.board.numberDiscRed : TABLETOP_THEME.board.numberDiscStroke
                    }
                    strokeWidth={isHighProb ? 2 : 1.4}
                  />
                  {isHighProb && (
                    <circle
                      cx={0}
                      cy={0}
                      r={14.2}
                      fill="none"
                      stroke={TABLETOP_THEME.board.numberDiscRed}
                      strokeWidth={0.9}
                    />
                  )}
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fontSize="15"
                    fontWeight="800"
                    fontFamily="'Bricolage Grotesque', 'Segoe UI', sans-serif"
                    fill={discInk}
                  >
                    {hex.numberDisc}
                  </text>
                  <g transform="translate(0, 9.5)">
                    {Array.from({ length: pips }, (_, pIdx) => {
                      const step = 3.8;
                      const startX = -((pips - 1) * step) / 2;
                      return (
                        <circle
                          key={pIdx}
                          cx={startX + pIdx * step}
                          cy={0}
                          r={1.35}
                          fill={discInk}
                        />
                      );
                    })}
                  </g>
                </g>
              )}

              {/* Hazard token lies over the number disc; its hole keeps the number readable */}
              {hex.hasHazard && (
                <g
                  data-testid={`hex-hazard-${hex.id}`}
                  className={isFresh(`hzh${hex.id}`) ? 'piece-drop' : undefined}
                >
                  <HazardTokenSvg cx={0} cy={0} r={34} holeRatio={0.58} />
                </g>
              )}

              {/* Environmental Inspector */}
              {hex.hasInspector && (
                <g className={isFresh(`insp${hex.id}`) ? 'piece-drop' : undefined}>
                  <InspectorPawnSvg
                    cx={hex.numberDisc !== null ? 17 : 0}
                    cy={hex.numberDisc !== null ? -10 : 2}
                    scale={1.05}
                  />
                </g>
              )}

              {/* Production Roll Highlight Glow */}
              {isProducing && (
                <g data-testid={`hex-producing-${hex.id}`} pointerEvents="none" className="hex-producing">
                  <polygon
                    points={getPointyHexPoints(0, 0, HEX_RADIUS - 5)}
                    fill="rgba(255, 214, 80, 0.26)"
                    stroke="#ffd650"
                    strokeWidth={4}
                    strokeLinejoin="round"
                  />
                  <circle cx={0} cy={0} r={21} fill="none" stroke="#ffd650" strokeWidth={3} />
                </g>
              )}

              {/* Interactive Hex Highlight Overlay (Move Inspector / Clean Hazard) */}
              {isHighlighted && (
                <g data-testid={`hex-target-${hex.id}`} className="hex-target">
                  <polygon
                    className="hex-target-fill"
                    points={getPointyHexPoints(0, 0, HEX_RADIUS - 6)}
                    fill="rgba(255, 200, 58, 0.3)"
                    stroke="#ffc83a"
                    strokeWidth={3}
                    strokeDasharray="7 5"
                    strokeLinejoin="round"
                  />
                  <g className="target-pulse">
                    <circle cx={0} cy={0} r={23} fill="none" stroke="#ffc83a" strokeWidth={3} />
                  </g>
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* 4. 72 Path Edges & 3D Wooden Roads */}
      <g className="path-edges-layer">
        {board.edges.map((edge) => {
          const n1 = board.intersections[edge.v1]!;
          const n2 = board.intersections[edge.v2]!;
          const p1 = latticeToSvg(n1.u, n1.v);
          const p2 = latticeToSvg(n2.u, n2.v);
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const angleDeg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
          const isHighlighted = highlightedEdgeIds?.has(edge.id) ?? false;
          const ghostPlayer = edge.road
            ? null
            : previewEdge?.edgeId === edge.id
              ? previewEdge.playerId
              : (pinnedEdges?.find((p) => p.edgeId === edge.id)?.playerId ?? null);
          const roadPlayer = edge.road?.playerId ?? ghostPlayer;

          return (
            <g
              key={edge.id}
              data-edge={edge.id}
              transform={`translate(${midX.toFixed(2)}, ${midY.toFixed(2)})`}
              onClick={() => onEdgeClick?.(edge.id)}
              onMouseEnter={isHighlighted ? () => onEdgeHover?.(edge.id) : undefined}
              onMouseLeave={isHighlighted ? () => onEdgeHover?.(null) : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEdgeClick?.(edge.id);
                }
              }}
              role="button"
              tabIndex={isHighlighted ? 0 : -1}
              aria-label={`Path edge ${edge.id} between intersections ${edge.v1} and ${edge.v2}${edge.road ? `, Road owned by ${edge.road.playerId}` : ''}`}
              style={{ cursor: isHighlighted ? 'pointer' : 'inherit' }}
            >
              <g transform={`rotate(${angleDeg.toFixed(2)})`}>
                {/* Invisible wide hit target for easy clicking */}
                <rect x={-20} y={-11} width={40} height={22} fill="transparent" />

                {/* Built (or previewed) wooden road */}
                {roadPlayer &&
                  (() => {
                    const pTheme = PLAYER_THEMES[roadPlayer];
                    return (
                      <g
                        data-testid={edge.road ? `road-${edge.id}` : `road-preview-${edge.id}`}
                        opacity={edge.road ? 1 : 0.6}
                        className={edge.road && isFresh(`e${edge.id}`) ? 'piece-drop' : undefined}
                      >
                        <rect x={-ROAD_LENGTH / 2 + 1} y={-1.5} width={ROAD_LENGTH} height={8.5} rx={2} fill="rgba(10,14,20,0.32)" />
                        <rect
                          x={-ROAD_LENGTH / 2}
                          y={-3.5}
                          width={ROAD_LENGTH}
                          height={9}
                          rx={2}
                          fill={pTheme.sideFill}
                          stroke={pTheme.stroke}
                          strokeWidth={1.1}
                        />
                        <rect
                          x={-ROAD_LENGTH / 2}
                          y={-4.5}
                          width={ROAD_LENGTH}
                          height={7}
                          rx={1.8}
                          fill={pTheme.fill}
                          stroke={pTheme.stroke}
                          strokeWidth={1.1}
                        />
                        <line
                          x1={-ROAD_LENGTH / 2 + 2.5}
                          y1={-2.6}
                          x2={ROAD_LENGTH / 2 - 2.5}
                          y2={-2.6}
                          stroke={pTheme.highlight}
                          strokeWidth={1.2}
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  })()}

                {/* Legal road placement */}
                {isHighlighted && !ghostPlayer && (
                  <g data-testid={`edge-target-${edge.id}`}>
                    <g className="target-pulse">
                      <rect
                        x={-12}
                        y={-4.5}
                        width={24}
                        height={9}
                        rx={4.5}
                        fill="#ffc83a"
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    </g>
                  </g>
                )}
              </g>
            </g>
          );
        })}
      </g>

      {/* 5. 54 Intersections. Each stack draws, in this order: plants on the far side of the building
          (the building's raised top then overlaps them, so they sit down in their notch), the building,
          plants on the near side (the building's wall shows above them), then any hazard token. */}
      <g className="intersections-layer">
        {board.intersections.map((node) => {
          const np = latticeToSvg(node.u, node.v);
          const isHighlighted = highlightedNodeIds?.has(node.id) ?? false;

          // City notches face all three adjacent hexes; a Town's single notch faces its plant
          // (or the hex being targeted for one, or simply its first hex).
          const firstHexAngleDeg = angleToHexDeg(board, np, node.adjacentHexIds[0]) ?? 30;
          const townTargetHexId =
            node.powerPlants[0]?.hexId ??
            node.adjacentHexIds.find((hId) => highlightedCutoutSlots?.has(`${node.id}-${hId}`)) ??
            node.adjacentHexIds[0];
          const townCutoutAngleDeg =
            angleToHexDeg(board, np, townTargetHexId) ?? firstHexAngleDeg;

          const preview =
            previewNode?.nodeId === node.id &&
            (!node.building || (previewNode.type === 'city' && node.building.type === 'town'))
              ? previewNode
              : null;
          const shownType = preview ? preview.type : node.building?.type;
          const shownPlayer = preview ? preview.playerId : node.building?.playerId;

          const plantsOn = (behind: boolean) =>
            node.powerPlants
              .filter((plant) => plantSlot(board, node, plant.hexId).behind === behind)
              .map((plant) => {
                const slot = plantSlot(board, node, plant.hexId);
                const slotKey = `${node.id}-${plant.hexId}`;
                return (
                  <g
                    key={slotKey}
                    data-plant={slotKey}
                    role="img"
                    aria-label={`${plant.type} power plant owned by ${plant.playerId} at intersection ${node.id}`}
                    pointerEvents="none"
                    className={isFresh(`p${slotKey}`) ? 'piece-drop' : undefined}
                  >
                    <PowerPlantCylinderSvg type={plant.type} cx={slot.x} cy={slot.y} r={PLANT_RADIUS} />
                  </g>
                );
              });

          return (
            <g key={node.id} className="node-stack">
              {plantsOn(true)}

              <g
                data-node={node.id}
                transform={`translate(${np.x.toFixed(2)}, ${np.y.toFixed(2)})`}
                onClick={() => onNodeClick?.(node.id)}
                onMouseEnter={isHighlighted ? () => onNodeHover?.(node.id) : undefined}
                onMouseLeave={isHighlighted ? () => onNodeHover?.(null) : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNodeClick?.(node.id);
                  }
                }}
                onFocus={isHighlighted ? () => onNodeHover?.(node.id) : undefined}
                onBlur={isHighlighted ? () => onNodeHover?.(null) : undefined}
                role="button"
                tabIndex={isHighlighted ? 0 : -1}
                aria-label={`Intersection ${node.id}${node.building ? `: ${node.building.type} owned by ${node.building.playerId}` : ''}${node.hasHazard ? ', blocked by Hazard' : ''}`}
                style={{ cursor: isHighlighted ? 'pointer' : 'inherit' }}
              >
                {/* Invisible hit circle */}
                <circle cx={0} cy={0} r={isHighlighted ? 19 : 13} fill="transparent" />

                {shownType && shownPlayer && (
                  <g
                    opacity={preview ? 0.62 : 1}
                    data-testid={preview ? `node-preview-${node.id}` : undefined}
                    className={!preview && isFresh(`n${node.id}`) ? 'piece-drop' : undefined}
                  >
                    {shownType === 'town' ? (
                      <TownPieceSvg
                        playerId={shownPlayer}
                        cx={0}
                        cy={0}
                        cutoutAngleDeg={townCutoutAngleDeg}
                      />
                    ) : (
                      <CityPieceSvg
                        playerId={shownPlayer}
                        cx={0}
                        cy={0}
                        cutoutAngleDeg={firstHexAngleDeg}
                      />
                    )}
                  </g>
                )}

                {/* Placement target */}
                {isHighlighted && !preview && (
                  <g data-testid={`node-target-${node.id}`}>
                    <g className="target-pulse">
                      <circle cx={0} cy={0} r={11} fill="rgba(255, 200, 58, 0.28)" stroke="#ffc83a" strokeWidth={1.5} />
                    </g>
                    <circle cx={0} cy={0} r={6.5} fill="#ffc83a" stroke="#ffffff" strokeWidth={2.2} />
                  </g>
                )}
              </g>

              {plantsOn(false)}

              {/* Hazard token resting on the building (its hole shows the piece beneath); clicks pass through */}
              {node.hasHazard && (
                <g
                  data-testid={`node-hazard-${node.id}`}
                  transform={`translate(${np.x.toFixed(2)}, ${np.y.toFixed(2)})`}
                  pointerEvents="none"
                  className={isFresh(`hzn${node.id}`) ? 'piece-drop' : undefined}
                >
                  <HazardTokenSvg cx={0} cy={-2} r={node.building?.type === 'city' ? 17 : 15} holeRatio={0.46} />
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* 6. Power plant placement targets, on top of everything so they are never hidden */}
      <g className="plant-targets-layer">
        {board.intersections.map((node) =>
          node.adjacentHexIds.map((hexId) => {
            const slotKey = `${node.id}-${hexId}`;
            if (!(highlightedCutoutSlots?.has(slotKey) ?? false)) return null;
            const slot = plantSlot(board, node, hexId);
            const plant = node.powerPlants.find((p) => p.hexId === hexId) ?? null;
            return (
              <g
                key={slotKey}
                data-plant-slot={slotKey}
                onClick={(e) => {
                  e.stopPropagation();
                  onCutoutClick?.(node.id, hexId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCutoutClick?.(node.id, hexId);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Power plant cutout at intersection ${node.id} on hex ${hexId}${plant ? `: ${plant.type} plant owned by ${plant.playerId}` : ' (available)'}`}
                style={{ cursor: 'pointer' }}
              >
                <g data-testid={`plant-target-${slotKey}`} transform={`translate(${slot.x}, ${slot.y})`}>
                  <circle r={13} fill="transparent" />
                  <g className="target-pulse">
                    <circle r={8.5} fill="rgba(47, 154, 83, 0.85)" stroke="#ffffff" strokeWidth={2} />
                    <polygon points="-1,-4.5 2.8,-4.5 0,0 3.2,0 -2.2,5 -0.5,0.5 -3.2,0.5" fill="#ffc83a" />
                  </g>
                </g>
              </g>
            );
          })
        )}
      </g>

      </g>
    </svg>
  );
}
