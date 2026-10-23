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

/**
 * Quarry levels from the rim down to the floor. The floor is centred on the number disc, so the disc
 * sits at the bottom of the mine; every level above it is larger and drawn a little higher (seen
 * from the south), so the far walls show as shaded faces and the near walls as thin lit edges.
 * `bench` is a level's flat terrace [rx, ry]; `lip` is the top edge of the wall cut down from it.
 */
const QUARRY_LEVELS: { cy: number; bench?: [number, number]; lip?: [number, number] }[] = [
  { cy: -4.8, lip: [38.2, 37.4] },
  { cy: -3.2, bench: [36, 35], lip: [31.2, 30.4] },
  { cy: -1.6, bench: [29, 28], lip: [24.2, 23.4] },
  { cy: 0, bench: [22, 21] },
];
const QUARRY_RIM = { cy: -4.8, rx: 38.2, ry: 37.4 };

/**
 * Soft rolling mounds on the open ground below and above the pit [x, y, rx, ry]: rust shade low-right,
 * sunlit cap up-left. None at the sides, where the pit leaves only a sliver of ground.
 */
const HILL_MOUNDS: [number, number, number, number][] = [
  [-24, -45, 17, 9],
  [26, -44, 16, 9],
  [-30, 41, 17, 10],
  [-8, 51, 14, 7],
  [14, 51, 14, 7],
  [32, 42, 16, 10],
];

/** Deterministic soft mottling [x, y, rx, ry, rotation, light?] so the painted look is stable per render. */
const HILL_BLOTCHES: [number, number, number, number, number, boolean][] = Array.from({ length: 30 }, (_, i) => {
  const r1 = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1;
  const r2 = Math.abs(Math.sin(i * 78.233 + 1.7) * 24634.6345) % 1;
  const r3 = Math.abs(Math.sin(i * 39.346 + 9.2) * 31415.9265) % 1;
  return [-42 + r1 * 84, -46 + r2 * 92, 3 + r3 * 5, 1.6 + r1 * 2.6, r2 * 180, i % 2 === 0];
});

/** Fine speckle dots [x, y, r], kept out of the middle so the number disc stays calm. */
const HILL_SPECKS: [number, number, number][] = Array.from({ length: 90 }, (_, i) => {
  const r1 = Math.abs(Math.sin(i * 45.164 + 2.3) * 43758.5453) % 1;
  const r2 = Math.abs(Math.sin(i * 94.673 + 5.9) * 24634.6345) % 1;
  return [-44 + r1 * 88, -50 + r2 * 100, 0.4 + ((i * 7) % 5) * 0.12] as [number, number, number];
}).filter(([x, y]) => Math.hypot(x, y) > 21);

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

/** Tiny clay miner in a hard hat: swinging a pick, pushing a barrow of clay, or carrying bricks. */
function Miner({ x, y, shirt, pose, flip = false, s = 1.25 }: { x: number; y: number; shirt: string; pose: 'pick' | 'barrow' | 'carry'; flip?: boolean; s?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${flip ? -s : s}, ${s})`}>
      <ellipse cx={0.6} cy={0.4} rx={2.5} ry={0.7} fill="rgba(60,20,6,0.38)" />
      {pose === 'barrow' && (
        <g transform="translate(4, -0.5)">
          <path d="M -2.3 -2.1 L -4 -1.3" stroke="#5b3a22" strokeWidth={0.45} strokeLinecap="round" />
          <path d="M -2.6 -2.7 L 2.8 -2.7 L 2 -0.6 L -1.9 -0.6 Z" fill="#6b4a2f" stroke="#2f1a0c" strokeWidth={0.3} />
          <path d="M -2.2 -2.7 Q 0.2 -4.8, 2.5 -2.7 Z" fill="#c8673c" stroke="#6a2a14" strokeWidth={0.25} />
          <circle cx={1.5} cy={0} r={0.85} fill="#2f1a0c" />
        </g>
      )}
      <path d="M -0.45 -1.6 L -0.7 0.2 M 0.45 -1.6 L 0.75 0.2" stroke="#3b2a1e" strokeWidth={0.6} strokeLinecap="round" />
      <rect x={-0.95} y={-3.9} width={1.9} height={2.6} rx={0.6} fill={shirt} stroke="#2f1a0c" strokeWidth={0.25} />
      <circle cx={0} cy={-4.7} r={0.9} fill="#e8b48a" stroke="#2f1a0c" strokeWidth={0.25} />
      <path d="M -1.1 -4.95 Q 0 -6.3, 1.1 -4.95 Z" fill="#f2c230" stroke="#2f1a0c" strokeWidth={0.22} />
      <path d="M -1.4 -4.95 L 1.4 -4.95" stroke="#2f1a0c" strokeWidth={0.3} strokeLinecap="round" />
      {pose === 'pick' && (
        <g>
          <path d="M 0.5 -3.2 L -2.2 -6.3" stroke="#7a5230" strokeWidth={0.45} strokeLinecap="round" />
          <path d="M -3.2 -5.35 Q -2.6 -6.75, -1.2 -7.25" fill="none" stroke="#9aa3ad" strokeWidth={0.6} strokeLinecap="round" />
        </g>
      )}
      {pose === 'carry' && <rect x={-1.7} y={-3.5} width={3.4} height={1.3} rx={0.2} fill="#c9552d" stroke="#6a2a14" strokeWidth={0.25} />}
    </g>
  );
}

/** The upper part of an ellipse (from `fromDeg` to `toDeg`, y pointing down), for clay strata on a wall. */
function upperArc(cx: number, cy: number, rx: number, ry: number, fromDeg = 195, toDeg = 345): string {
  const pt = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    return `${(cx + rx * Math.cos(t)).toFixed(2)} ${(cy + ry * Math.sin(t)).toFixed(2)}`;
  };
  return `M ${pt(fromDeg)} A ${rx} ${ry} 0 0 1 ${pt(toDeg)}`;
}

/**
 * Open-pit clay quarry for the hills (brick) tile: burnt-orange hills round a terraced pit whose floor
 * is centred under the number disc, with miners at work and bricks stacked by the haul road.
 */
function HillsArtworkSvg({ hexId }: { hexId: number }) {
  const id = (name: string) => `hills-${name}-${hexId}`;
  // Haul road: in from the lower-left, over the rim onto the first terrace, along it, then down a
  // ramp cut through the wall to the second terrace (the arc follows the first terrace's mid-line)
  const roadPath =
    'M -37.7 29.6 C -31 26.8, -24.5 25, -19.75 23.25 A 33.6 32.7 0 0 1 -32.45 5.26 C -32.2 0.5, -29.5 -4, -26.2 -6.1';
  return (
    <g>
      <defs>
        <radialGradient id={id('ground')} gradientUnits="userSpaceOnUse" cx={-14} cy={-16} r={92}>
          <stop offset="0" stopColor="#ee8c44" />
          <stop offset="0.55" stopColor="#db7835" />
          <stop offset="1" stopColor="#a54d20" />
        </radialGradient>
        {/* Flat terraces: lit, a little shaded on the upper-left under the wall above */}
        <linearGradient id={id('bench')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ee9d69" />
          <stop offset="0.5" stopColor="#f8b07c" />
          <stop offset="1" stopColor="#fcc193" />
        </linearGradient>
        <linearGradient id={id('floor')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dd8455" />
          <stop offset="1" stopColor="#eda274" />
        </linearGradient>
        {/* Cut walls: in shade where they face away from the light (upper-left), sunlit lower-right */}
        <linearGradient id={id('wall')} x1="0.15" y1="0.1" x2="0.85" y2="0.9">
          <stop offset="0" stopColor="#94462a" />
          <stop offset="0.4" stopColor="#b5592f" />
          <stop offset="0.7" stopColor="#de8450" />
          <stop offset="1" stopColor="#f6c093" />
        </linearGradient>
      </defs>

      {/* Burnt-orange ground, rust toward the edges */}
      <rect x={-60} y={-60} width={120} height={120} fill={`url(#${id('ground')})`} />

      {/* Soft painted mottling on the ground */}
      {HILL_BLOTCHES.map(([bx, by, brx, bry, rot, light], i) => (
        <ellipse key={`blot-${i}`} cx={bx} cy={by} rx={brx} ry={bry} transform={`rotate(${rot.toFixed(0)} ${bx.toFixed(1)} ${by.toFixed(1)})`} fill={light ? '#f2a05e' : '#8f4426'} opacity={0.14} />
      ))}

      {/* Rolling mounds around the perimeter: rust body, sunlit cap on the upper-left */}
      {HILL_MOUNDS.map(([mx, my, mrx, mry], i) => (
        <g key={`mound-${i}`}>
          <ellipse cx={mx} cy={my} rx={mrx} ry={mry} fill="#a24a27" />
          <ellipse cx={mx - mrx * 0.1} cy={my - mry * 0.18} rx={mrx * 0.9} ry={mry * 0.78} fill="#e07a30" />
          <ellipse cx={mx - mrx * 0.26} cy={my - mry * 0.42} rx={mrx * 0.55} ry={mry * 0.4} fill="#f5a458" opacity={0.75} />
        </g>
      ))}

      {/* Boulders on the ground round the pit */}
      {([[-40.5, 6, 1.6], [40.5, -2, 1.5], [-14, 45.5, 1.6], [30.5, 27.5, 1.3]] as [number, number, number][]).map(([bx, by, br], i) => (
        <g key={`rock-${i}`}>
          <ellipse cx={bx + 0.6} cy={by + br * 0.6} rx={br * 1.2} ry={br * 0.45} fill="rgba(90,35,14,0.35)" />
          <ellipse cx={bx} cy={by} rx={br} ry={br * 0.75} fill="#c4704a" stroke="#8a4228" strokeWidth={0.4} />
          <ellipse cx={bx - br * 0.3} cy={by - br * 0.3} rx={br * 0.45} ry={br * 0.28} fill="#eaa57c" opacity={0.8} />
        </g>
      ))}

      {/* The pit, rim first: each level's flat bench, then the wall cut down from it, then the next
          level drawn a little lower on top, so only the far wall faces and thin near edges show */}
      {QUARRY_LEVELS.map((level, i) => {
        const isFloor = i === QUARRY_LEVELS.length - 1;
        return (
          <g key={`level-${i}`}>
            {level.bench && (
              <>
                <ellipse cx={0} cy={level.cy} rx={level.bench[0]} ry={level.bench[1]} fill={`url(#${id(isFloor ? 'floor' : 'bench')})`} />
                {/* Soft shade at the foot of the wall above */}
                <path d={upperArc(0, level.cy + 0.7, level.bench[0] - 0.7, level.bench[1] - 0.7, 200, 340)} fill="none" stroke="#9c4b2b" strokeOpacity={0.3} strokeWidth={1.3} strokeLinecap="round" />
              </>
            )}
            {level.lip && (
              <>
                <ellipse cx={0} cy={level.cy} rx={level.lip[0]} ry={level.lip[1]} fill={`url(#${id('wall')})`} />
                {/* A clay seam along the shaded far wall */}
                <path d={upperArc(0, level.cy + 0.8, level.lip[0] - 0.9, level.lip[1] - 1.1, 205, 335)} fill="none" stroke="#6b2c17" strokeOpacity={0.22} strokeWidth={0.5} strokeLinecap="round" />
              </>
            )}
          </g>
        );
      })}
      <ellipse cx={0} cy={QUARRY_RIM.cy} rx={QUARRY_RIM.rx} ry={QUARRY_RIM.ry} fill="none" stroke="#7a3520" strokeOpacity={0.4} strokeWidth={0.6} />

      {/* Soft sunlit patches on the terraces */}
      {HILL_BLOTCHES.filter((_, i) => i % 2 === 1).map(([bx, by, brx, bry, rot], i) => {
        const px = bx * 0.75;
        const py = by * 0.72 - 4;
        return (
          <ellipse key={`bm-${i}`} cx={px} cy={py} rx={brx * 0.8} ry={bry * 0.8} transform={`rotate(${rot.toFixed(0)} ${px.toFixed(1)} ${py.toFixed(1)})`} fill="#ffd2a6" opacity={0.2} />
        );
      })}

      {/* Speckle grit: darker on the hills, paler in the pit */}
      {HILL_SPECKS.map(([sx, sy, sr], i) => {
        const inPit = (sx / QUARRY_RIM.rx) ** 2 + ((sy - QUARRY_RIM.cy) / QUARRY_RIM.ry) ** 2 < 1;
        return <circle key={`sp-${i}`} cx={sx} cy={sy} r={sr} fill={inPit ? (i % 2 ? '#c9775a' : '#ffd5ab') : i % 2 ? '#8a4026' : '#f0a05c'} opacity={0.4} />;
      })}

      {/* Haul road */}
      <path d={roadPath} transform="translate(0.5, 0.8)" fill="none" stroke="#7a3520" strokeOpacity={0.5} strokeWidth={4} strokeLinecap="round" />
      <path d={roadPath} fill="none" stroke="#f8d2a8" strokeWidth={3} strokeLinecap="round" />
      <path d={roadPath} fill="none" stroke="#c98257" strokeOpacity={0.6} strokeWidth={0.35} strokeDasharray="1.4 1.2" />

      {/* Bricks stacked by the road, out of the pit */}
      <BrickStack x={17} y={37.5} s={0.85} />
      <BrickStack x={-2} y={44} s={0.72} />

      {/* Miners: two cutting clay from the far walls, one wheeling a barrow up the road, one carrying bricks */}
      <Miner x={-22.5} y={-27.5} shirt="#2f6ea8" pose="pick" />
      <Miner x={13.3} y={-23.9} shirt="#d9402e" pose="pick" flip />
      <Miner x={-24.5} y={23.6} shirt="#f4f1e6" pose="barrow" flip />
      <Miner x={8} y={41} shirt="#3f7f4a" pose="carry" />
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
