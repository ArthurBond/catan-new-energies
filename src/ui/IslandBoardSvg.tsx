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
  /** Hexes ringed in a player's colour: where they have a town or city (shown while they discard on a 7) */
  yourHexes?: { playerId: PlayerId; hexIds: Set<HexId> };
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

type WorkerPose = 'pick' | 'axe' | 'fork' | 'crook' | 'barrow' | 'carry';

/**
 * Tiny worker on a resource tile: a miner in a hard hat, a lumberjack in a cap or a farmer or
 * shepherd in a straw hat, swinging a pick or axe, raising a pitchfork, leaning on a crook,
 * pushing a barrow or carrying a load (`load` colours the barrow's contents or what is carried).
 */
function Worker({
  x,
  y,
  shirt,
  pose,
  flip = false,
  s = 1.25,
  hat = 'hard',
  load = '#c8673c',
}: {
  x: number;
  y: number;
  shirt: string;
  pose: WorkerPose;
  flip?: boolean;
  s?: number;
  hat?: 'hard' | 'cap' | 'straw';
  load?: string;
}) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${flip ? -s : s}, ${s})`}>
      <ellipse cx={0.6} cy={0.4} rx={2.5} ry={0.7} fill="rgba(30,20,6,0.38)" />
      {pose === 'barrow' && (
        <g transform="translate(4, -0.5)">
          <path d="M -2.3 -2.1 L -4 -1.3" stroke="#5b3a22" strokeWidth={0.45} strokeLinecap="round" />
          <path d="M -2.6 -2.7 L 2.8 -2.7 L 2 -0.6 L -1.9 -0.6 Z" fill="#6b4a2f" stroke="#2f1a0c" strokeWidth={0.3} />
          <path d="M -2.2 -2.7 Q 0.2 -4.8, 2.5 -2.7 Z" fill={load} stroke="#3a2010" strokeWidth={0.25} />
          <circle cx={1.5} cy={0} r={0.85} fill="#2f1a0c" />
        </g>
      )}
      {pose === 'crook' && (
        <path d="M 1.5 0.2 L 1.5 -6.4 Q 1.5 -7.6, 2.5 -7.6 Q 3.4 -7.6, 3.3 -6.7" fill="none" stroke="#7a5230" strokeWidth={0.45} strokeLinecap="round" />
      )}
      <path d="M -0.45 -1.6 L -0.7 0.2 M 0.45 -1.6 L 0.75 0.2" stroke="#3b2a1e" strokeWidth={0.6} strokeLinecap="round" />
      <rect x={-0.95} y={-3.9} width={1.9} height={2.6} rx={0.6} fill={shirt} stroke="#2f1a0c" strokeWidth={0.25} />
      <circle cx={0} cy={-4.7} r={0.9} fill="#e8b48a" stroke="#2f1a0c" strokeWidth={0.25} />
      {hat === 'hard' && (
        <>
          <path d="M -1.1 -4.95 Q 0 -6.3, 1.1 -4.95 Z" fill="#f2c230" stroke="#2f1a0c" strokeWidth={0.22} />
          <path d="M -1.4 -4.95 L 1.4 -4.95" stroke="#2f1a0c" strokeWidth={0.3} strokeLinecap="round" />
        </>
      )}
      {hat === 'cap' && <path d="M -1 -5 Q 0 -6.2, 1 -5 L 1.6 -4.9 Z" fill="#b8332a" stroke="#2f1a0c" strokeWidth={0.22} />}
      {hat === 'straw' && (
        <>
          <ellipse cx={0} cy={-5.05} rx={1.9} ry={0.45} fill="#e9c46a" stroke="#7a5a1c" strokeWidth={0.2} />
          <path d="M -0.8 -5.1 Q 0 -6.1, 0.8 -5.1 Z" fill="#f0d27a" stroke="#7a5a1c" strokeWidth={0.2} />
        </>
      )}
      {pose === 'pick' && (
        <g>
          <path d="M 0.5 -3.2 L -2.2 -6.3" stroke="#7a5230" strokeWidth={0.45} strokeLinecap="round" />
          <path d="M -3.2 -5.35 Q -2.6 -6.75, -1.2 -7.25" fill="none" stroke="#9aa3ad" strokeWidth={0.6} strokeLinecap="round" />
        </g>
      )}
      {pose === 'axe' && (
        <g>
          <path d="M 0.5 -3.2 L -2.2 -6.3" stroke="#7a5230" strokeWidth={0.45} strokeLinecap="round" />
          <path d="M -2.6 -6.9 L -1.5 -5.6 L -2.9 -4.9 Z" fill="#b9c0c8" stroke="#3b3f46" strokeWidth={0.2} />
        </g>
      )}
      {pose === 'fork' && (
        <g>
          <path d="M 0.6 -3 L -1.6 -7" stroke="#7a5230" strokeWidth={0.4} strokeLinecap="round" />
          <path d="M -2.6 -6.8 L -1.8 -8.2 M -1.6 -7 L -1.2 -8.6 M -0.7 -7.3 L -0.6 -8.6" stroke="#8b939c" strokeWidth={0.3} strokeLinecap="round" />
        </g>
      )}
      {pose === 'carry' && <rect x={-1.7} y={-3.5} width={3.4} height={1.3} rx={0.2} fill={load} stroke="#3a2010" strokeWidth={0.25} />}
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
      <Worker x={-22.5} y={-27.5} shirt="#2f6ea8" pose="pick" />
      <Worker x={13.3} y={-23.9} shirt="#d9402e" pose="pick" flip />
      <Worker x={-24.5} y={23.6} shirt="#f4f1e6" pose="barrow" flip />
      <Worker x={8} y={41} shirt="#3f7f4a" pose="carry" load="#c9552d" />
    </g>
  );
}

/** A mountain as a lit (left) and a shaded (right) face split by a kinked ridge line, light from the top-left. */
interface MountainPeak {
  apex: [number, number];
  left: [number, number];
  right: [number, number];
  /** Ridge from the apex down to the foot that divides the lit and shaded faces */
  ridge: [number, number][];
}

/** Back to front. The two tall peaks stand behind the mine yard; the shoulders frame the sides. */
const MOUNTAIN_PEAKS: MountainPeak[] = [
  { apex: [-21, -41], left: [-56, 2], right: [8, -2], ridge: [[-18, -30], [-21, -18], [-12, -2]] },
  { apex: [19, -47], left: [-8, -2], right: [56, 4], ridge: [[22, -34], [18, -20], [27, -2]] },
  { apex: [-37, -11], left: [-60, 24], right: [-12, 20], ridge: [[-34, -2], [-30, 20]] },
  { apex: [37, -7], left: [12, 22], right: [60, 26], ridge: [[39, 4], [35, 23]] },
];

/** Snow caps [apex index, jagged lower edge from left to right] on the two tall peaks. */
const MOUNTAIN_SNOW: [number, [number, number][]][] = [
  [0, [[-29.5, -23], [-26, -27], [-23, -22], [-20, -26], [-17.5, -21], [-15, -26]]],
  [1, [[10.5, -26], [14, -31], [17, -25], [20, -30], [23, -24], [26.5, -29]]],
];

/** Mine yard: a raised flat terrace centred under the number disc, with a short cliff face at the front. */
const MINE_YARD = { cx: 0, cy: 2, rx: 25, ry: 21, drop: 3.2 };

/** Deterministic grit [x, y, r] for the gravel yard and the talus. */
const MOUNTAIN_SPECKS: [number, number, number][] = Array.from({ length: 80 }, (_, i) => {
  const r1 = Math.abs(Math.sin(i * 31.17 + 3.3) * 43758.5453) % 1;
  const r2 = Math.abs(Math.sin(i * 67.91 + 8.1) * 24634.6345) % 1;
  return [-44 + r1 * 88, -10 + r2 * 60, 0.35 + ((i * 5) % 4) * 0.12] as [number, number, number];
}).filter(([x, y]) => Math.hypot(x, y) > 19);

/** Heap of iron ore: dark rock with rusty glints. */
function OreHeap({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`}>
      <ellipse cx={0.8} cy={0.6} rx={6.4} ry={1.7} fill="rgba(20,16,24,0.4)" />
      <path d="M -6 0.4 Q -4.6 -3.4, -1.6 -4.4 Q 1.4 -5.6, 3.6 -3.2 Q 5.8 -1.6, 6 0.4 Z" fill="#4a3b3a" stroke="#241a1c" strokeWidth={0.4} />
      <path d="M -4.2 -1.6 Q -2.6 -3.8, -0.6 -3.9" fill="none" stroke="#8e8a96" strokeWidth={0.7} strokeLinecap="round" opacity={0.7} />
      {([[-3.4, -1.2], [-0.6, -2.6], [1.8, -1.4], [3.6, -0.6], [0.6, -0.4]] as [number, number][]).map(([ox, oy], i) => (
        <circle key={i} cx={ox} cy={oy} r={0.55} fill={i % 2 ? '#c4643c' : '#a5502f'} />
      ))}
    </g>
  );
}

/** Timber-framed tunnel mouth (adit) cut into a mountain foot. */
function MineAdit({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path d="M -4.6 2 L -4.6 -3.6 Q 0 -7.6, 4.6 -3.6 L 4.6 2 Z" fill="#1d1a22" />
      <path d="M -3.6 2 L -3.6 -3 Q 0 -6.2, 3.6 -3 L 3.6 2 Z" fill="#0e0c12" />
      <rect x={-5.4} y={-4.6} width={1.5} height={6.8} fill="#8a5a32" stroke="#3d2412" strokeWidth={0.35} />
      <rect x={3.9} y={-4.6} width={1.5} height={6.8} fill="#7a4d2a" stroke="#3d2412" strokeWidth={0.35} />
      <rect x={-6} y={-5.8} width={12} height={1.6} rx={0.3} fill="#a06a3c" stroke="#3d2412" strokeWidth={0.35} />
      <circle cx={0} cy={-2.4} r={0.7} fill="#f6c453" />
      <circle cx={0} cy={-2.4} r={1.6} fill="#f6c453" opacity={0.25} />
    </g>
  );
}

/** Small mine cart of ore on the rails. */
function OreCart({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <ellipse cx={0.4} cy={0.9} rx={3.6} ry={0.9} fill="rgba(20,16,24,0.4)" />
      <path d="M -3 -3 L 3 -3 L 2.3 0 L -2.3 0 Z" fill="#6b7280" stroke="#2a2e36" strokeWidth={0.35} />
      <path d="M -2.6 -3 Q 0 -5.2, 2.6 -3 Z" fill="#4a3b3a" stroke="#241a1c" strokeWidth={0.3} />
      <circle cx={-0.6} cy={-3.8} r={0.45} fill="#c4643c" />
      <circle cx={1} cy={-3.5} r={0.4} fill="#a5502f" />
      <circle cx={-1.5} cy={0.3} r={0.8} fill="#2a2e36" />
      <circle cx={1.5} cy={0.3} r={0.8} fill="#2a2e36" />
    </g>
  );
}

/**
 * Iron mine in the mountains for the steel tile: a hazy far range, two snow-capped peaks with warm
 * lit and cool shaded faces, and a raised mine yard centred under the number disc, with a tunnel,
 * an ore cart on its rails, heaps of iron ore and miners at work.
 */
function MountainsArtworkSvg({ hexId }: { hexId: number }) {
  const id = (name: string) => `mtn-${name}-${hexId}`;
  const pts = (list: [number, number][]) => list.map(([px, py]) => `${px},${py}`).join(' ');
  const railPath = 'M 23.5 -9.5 Q 24.5 -2, 21.5 7';
  return (
    <g>
      <defs>
        <radialGradient id={id('base')} gradientUnits="userSpaceOnUse" cx={-10} cy={-20} r={90}>
          <stop offset="0" stopColor="#7e8fb6" />
          <stop offset="1" stopColor="#434f78" />
        </radialGradient>
        {/* Sunlit faces: warm alpenglow near the summits, cooling to lavender grey lower down */}
        <linearGradient id={id('lit')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f2dcc6" />
          <stop offset="0.4" stopColor="#cbc3cd" />
          <stop offset="1" stopColor="#8f95b4" />
        </linearGradient>
        {/* Faces turned from the light: deep blue */}
        <linearGradient id={id('shade')} x1="1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#4b5d94" />
          <stop offset="1" stopColor="#33406c" />
        </linearGradient>
        <linearGradient id={id('yard')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b3aca2" />
          <stop offset="1" stopColor="#968f86" />
        </linearGradient>
        <linearGradient id={id('talus')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9195b3" />
          <stop offset="1" stopColor="#585e88" />
        </linearGradient>
      </defs>

      {/* Cool slate base */}
      <rect x={-60} y={-60} width={120} height={120} fill={`url(#${id('base')})`} />

      {/* Far range, hazy and blue with distance */}
      <polygon points="-60,-14 -46,-34 -36,-26 -24,-50 -10,-36 2,-54 14,-40 30,-56 42,-34 60,-44 60,4 -60,4" fill="#8ea8d3" />
      <path d="M -60 -14 L -46 -34 L -43 -22 Z M -36 -26 L -24 -50 L -21 -36 Z M -10 -36 L 2 -54 L 5 -40 Z M 14 -40 L 30 -56 L 33 -38 Z M 42 -34 L 60 -44 L 60 -30 Z" fill="#c2d3ee" opacity={0.85} />
      <path d="M -24 -50 L -20 -38 L -24 -30 M 2 -54 L 6 -44 L 2 -36 M 30 -56 L 34 -42 L 30 -34" fill="none" stroke="#7d90ae" strokeWidth={0.6} opacity={0.7} />

      {/* Talus slope across the lower half, with fans of lighter scree and darker gullies */}
      <path d="M -60 10 Q -30 2, 0 8 Q 30 2, 60 12 L 60 60 L -60 60 Z" fill={`url(#${id('talus')})`} />
      <path d="M -42 14 Q -45 28, -50 44 M -30 24 Q -32 36, -37 50 M 26 24 Q 29 36, 33 50 M 42 16 Q 45 30, 50 44 M -6 30 Q -6 40, -8 52 M 8 30 Q 9 40, 12 52" fill="none" stroke="#c4c8de" strokeWidth={1.3} strokeLinecap="round" opacity={0.35} />
      <path d="M -36 18 Q -38 32, -43 48 M 34 20 Q 37 33, 41 48 M 0 31 Q 1 41, 2 52" fill="none" stroke="#3b416a" strokeWidth={0.9} strokeLinecap="round" opacity={0.35} />

      {/* Peaks: lit face, shaded face, a cast shadow down the right foot, crevices */}
      {MOUNTAIN_PEAKS.map((peak, i) => {
        const ridgeLine = [peak.apex, ...peak.ridge];
        return (
          <g key={`peak-${i}`}>
            <polygon points={pts([peak.left, ...ridgeLine])} fill={`url(#${id('lit')})`} />
            <polygon points={pts([...ridgeLine, peak.right])} fill={`url(#${id('shade')})`} />
            <polyline points={pts(ridgeLine)} fill="none" stroke="#2f3550" strokeWidth={0.7} strokeLinejoin="round" opacity={0.55} />
            {/* Warm rim light along the sunlit skyline */}
            <polyline points={pts([peak.left, peak.apex])} fill="none" stroke="#fff1de" strokeWidth={0.6} strokeLinecap="round" opacity={0.55} />
            <path
              d={`M ${peak.apex[0] - 4} ${peak.apex[1] + 14} L ${peak.apex[0] - 7} ${peak.apex[1] + 22} M ${peak.apex[0] + 6} ${peak.apex[1] + 12} L ${peak.apex[0] + 10} ${peak.apex[1] + 22} L ${peak.apex[0] + 8} ${peak.apex[1] + 28}`}
              fill="none"
              stroke="#2f3550"
              strokeWidth={0.55}
              strokeLinecap="round"
              opacity={0.4}
            />
          </g>
        );
      })}

      {/* Snow caps: bright on the lit side, blue in the shade */}
      {MOUNTAIN_SNOW.map(([peakIdx, edge], i) => {
        const apex = MOUNTAIN_PEAKS[peakIdx]!.apex;
        const ridgeX = MOUNTAIN_PEAKS[peakIdx]!.ridge[0]![0];
        const split = edge.findIndex(([ex]) => ex >= ridgeX);
        const litEdge = edge.slice(0, split + 1);
        const shadeEdge = edge.slice(split);
        return (
          <g key={`snow-${i}`}>
            <polygon points={pts([apex, ...litEdge])} fill="#f7f9fd" />
            <polygon points={pts([apex, ...shadeEdge])} fill="#c3d0e6" />
            <polyline points={pts([apex, MOUNTAIN_PEAKS[peakIdx]!.ridge[0]!])} fill="none" stroke="#9fb0cc" strokeWidth={0.6} opacity={0.8} />
          </g>
        );
      })}

      {/* Tunnel mouth at the foot of the tall peak */}
      <MineAdit x={23.5} y={-10} />

      {/* Raised mine yard under the number disc: rock face at the front, gravel on top */}
      <ellipse cx={MINE_YARD.cx} cy={MINE_YARD.cy + MINE_YARD.drop} rx={MINE_YARD.rx} ry={MINE_YARD.ry} fill="#4f5163" />
      <ellipse cx={MINE_YARD.cx + 0.6} cy={MINE_YARD.cy + MINE_YARD.drop + 0.6} rx={MINE_YARD.rx - 1} ry={MINE_YARD.ry - 0.6} fill="#5f6176" opacity={0.6} />
      <ellipse cx={MINE_YARD.cx} cy={MINE_YARD.cy} rx={MINE_YARD.rx} ry={MINE_YARD.ry} fill={`url(#${id('yard')})`} />
      <path
        d={`M ${-MINE_YARD.rx + 2} ${MINE_YARD.cy - 6} A ${MINE_YARD.rx - 1} ${MINE_YARD.ry - 1} 0 0 1 ${MINE_YARD.rx - 2} ${MINE_YARD.cy - 6}`}
        fill="none"
        stroke="#5a5866"
        strokeOpacity={0.35}
        strokeWidth={1.4}
        strokeLinecap="round"
      />

      {/* Gravel grit on the yard */}
      {MOUNTAIN_SPECKS.filter(([sx, sy]) => ((sx - MINE_YARD.cx) / MINE_YARD.rx) ** 2 + ((sy - MINE_YARD.cy) / MINE_YARD.ry) ** 2 < 0.9).map(([sx, sy, sr], i) => (
        <circle key={`grit-${i}`} cx={sx} cy={sy} r={sr} fill={i % 2 ? '#efebe4' : '#6e6a72'} opacity={0.4} />
      ))}

      {/* Rails from the tunnel down into the yard, with an ore cart */}
      <path d={railPath} transform="translate(-1.1, 0)" fill="none" stroke="#3a3540" strokeWidth={0.5} />
      <path d={railPath} transform="translate(1.1, 0)" fill="none" stroke="#3a3540" strokeWidth={0.5} />
      <path d={railPath} fill="none" stroke="#7a5230" strokeWidth={2.6} strokeDasharray="0.5 1.4" opacity={0.8} />
      <OreCart x={23.3} y={-1.5} />

      {/* Iron ore heaps on the yard */}
      <OreHeap x={-19} y={6} s={0.95} />
      <OreHeap x={-11} y={17.5} s={0.75} />

      {/* Boulders on the talus with lit tops */}
      {([[-30, 33, 3], [-14, 40, 2.4], [30, 34, 2.8], [12, 42, 2.2], [40, 18, 2], [-41, 16, 2]] as [number, number, number][]).map(([bx, by, br], i) => (
        <g key={`boulder-${i}`}>
          <ellipse cx={bx + 0.8} cy={by + br * 0.6} rx={br * 1.3} ry={br * 0.45} fill="rgba(20,18,30,0.4)" />
          <path d={`M ${bx - br} ${by + br * 0.4} Q ${bx - br * 0.9} ${by - br * 0.7}, ${bx} ${by - br * 0.8} Q ${bx + br} ${by - br * 0.6}, ${bx + br} ${by + br * 0.4} Z`} fill="#6c6f84" stroke="#33364a" strokeWidth={0.45} />
          <path d={`M ${bx - br * 0.7} ${by - br * 0.1} Q ${bx - br * 0.5} ${by - br * 0.65}, ${bx + br * 0.1} ${by - br * 0.7}`} fill="none" stroke="#c9c8d6" strokeWidth={0.7} strokeLinecap="round" opacity={0.8} />
        </g>
      ))}

      {/* A few hardy pines in the lower corners */}
      {([[-34, 28, 0.8], [-25, 40, 0.7], [35, 26, 0.75], [24, 41, 0.65]] as [number, number, number][]).map(([tx, ty, sc], i) => (
        <g key={`pine-${i}`} transform={`translate(${tx}, ${ty}) scale(${sc})`}>
          <ellipse cx={1.5} cy={5.5} rx={5.5} ry={2} fill="rgba(10,14,20,0.35)" />
          <rect x={-0.8} y={2} width={1.6} height={3.6} fill="#4a3424" />
          <polygon points="0,-4 5.6,4 -5.6,4" fill="#2c5a42" stroke="#142a1e" strokeWidth={0.6} strokeLinejoin="round" />
          <polygon points="0,-9 4.4,-1 -4.4,-1" fill="#3a7454" stroke="#142a1e" strokeWidth={0.6} strokeLinejoin="round" />
          <path d="M 0 -8.5 L -2.6 -2 M 0 -3.4 L -3.8 3.2" stroke="#7fb894" strokeWidth={0.7} strokeLinecap="round" opacity={0.7} />
        </g>
      ))}

      {/* Miners: one breaking ore, one wheeling a barrow from the cart, one at the tunnel mouth */}
      <Worker x={-24.5} y={9} shirt="#2f6ea8" pose="pick" />
      <Worker x={15.5} y={13} shirt="#d9402e" pose="barrow" flip load="#4a3b3a" />
      <Worker x={17} y={-6.5} shirt="#f4f1e6" pose="carry" s={1.05} load="#5a4a48" />
    </g>
  );
}

/** Stable pseudo-random number in [0, 1) so tile layouts never change between renders. */
function hash01(i: number, salt: number): number {
  return Math.abs(Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1;
}

/** Whether a point lies inside the tile's pointy-top hex (art coordinates), shrunk by `margin`. */
function inTileHex(x: number, y: number, margin = 0): boolean {
  const r = HEX_RADIUS - 4.8 - margin;
  return Math.abs(x) <= r * Math.cos(Math.PI / 6) && Math.abs(y) <= r - Math.abs(x) * Math.tan(Math.PI / 6);
}

/** A point on an ellipse at `deg` (y pointing down), as "x y". */
function ellipsePt(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const t = (deg * Math.PI) / 180;
  return `${(cx + rx * Math.cos(t)).toFixed(2)} ${(cy + ry * Math.sin(t)).toFixed(2)}`;
}

const CONIFER_TONES = [
  { lit: '#6fbb72', mid: '#438d55', shade: '#24543a' },
  { lit: '#5aa868', mid: '#367a4a', shade: '#1d4831' },
  { lit: '#8cc46c', mid: '#55955a', shade: '#2f603c' },
];

/** Side-view conifer in three tiers, lit on the left and shaded on the right, with a cast shadow. */
function Conifer({ x, y, s = 1, tone = 0 }: { x: number; y: number; s?: number; tone?: number }) {
  const c = CONIFER_TONES[tone % CONIFER_TONES.length]!;
  const tiers: [number, number, number][] = [
    [4, -4, 6.5],
    [-1, -9, 5.2],
    [-6, -13, 3.8],
  ];
  return (
    <g transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${s.toFixed(2)})`}>
      <ellipse cx={2.6} cy={5} rx={6.8} ry={2.3} fill="rgba(6,22,10,0.4)" />
      <rect x={-0.8} y={2} width={1.6} height={3.8} fill="#5b3f26" />
      {tiers.map(([by, ay, hw], i) => (
        <g key={i}>
          <polygon points={`0,${ay} ${hw},${by} ${-hw},${by}`} fill={c.shade} stroke="#12301c" strokeWidth={0.5} strokeLinejoin="round" />
          <polygon points={`0,${ay} 0,${by} ${-hw},${by}`} fill={c.mid} />
          <path d={`M -0.3 ${ay + 0.8} L ${(-hw * 0.6).toFixed(2)} ${by - 0.6}`} stroke={c.lit} strokeWidth={0.8} strokeLinecap="round" opacity={0.85} />
        </g>
      ))}
    </g>
  );
}

const BROADLEAF_TONES = [
  { lit: '#a6d46e', mid: '#6aa84f', shade: '#3b7638' },
  { lit: '#cfdc72', mid: '#93b14c', shade: '#5b7d2f' },
  { lit: '#8fc77c', mid: '#4f8f4a', shade: '#2b5c33' },
];

/** Round-crowned broadleaf tree: shaded crown, lit upper-left, cast shadow. */
function Broadleaf({ x, y, s = 1, tone = 0 }: { x: number; y: number; s?: number; tone?: number }) {
  const c = BROADLEAF_TONES[tone % BROADLEAF_TONES.length]!;
  return (
    <g transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${s.toFixed(2)})`}>
      <ellipse cx={2.8} cy={4.6} rx={6.4} ry={2.2} fill="rgba(6,22,10,0.4)" />
      <rect x={-0.8} y={0} width={1.6} height={4.6} fill="#5b3f26" />
      <circle cx={0.6} cy={-4} r={5.6} fill={c.shade} stroke="#173a1e" strokeWidth={0.5} />
      <circle cx={-0.8} cy={-5.2} r={4.3} fill={c.mid} />
      <circle cx={-2.1} cy={-6.7} r={2.1} fill={c.lit} opacity={0.9} />
      <circle cx={2.7} cy={-2.4} r={1.2} fill={c.mid} opacity={0.75} />
    </g>
  );
}

/** Tall narrow poplar for field edges. */
function Poplar({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${s.toFixed(2)})`}>
      <ellipse cx={3.2} cy={3.4} rx={6.5} ry={1.5} fill="rgba(70,40,0,0.32)" transform="rotate(12 3.2 3.4)" />
      <rect x={-0.6} y={0} width={1.2} height={3.4} fill="#5b3f26" />
      <ellipse cx={0.4} cy={-6} rx={2.9} ry={7.6} fill="#3f7a35" stroke="#1f4219" strokeWidth={0.45} />
      <ellipse cx={-0.6} cy={-7} rx={1.7} ry={6} fill="#5f9e43" />
      <ellipse cx={-1.1} cy={-9} rx={0.8} ry={3} fill="#9ccc64" opacity={0.85} />
    </g>
  );
}

/** Tree stump with a cut face. */
function Stump({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <ellipse cx={1} cy={1.4} rx={2.8} ry={0.9} fill="rgba(20,14,6,0.35)" />
      <path d="M -1.8 -0.6 L -1.9 1 Q 0 1.8, 1.9 1 L 1.8 -0.6 Z" fill="#6b4223" stroke="#3d2412" strokeWidth={0.3} />
      <ellipse cx={0} cy={-0.6} rx={1.8} ry={0.85} fill="#e2b77c" stroke="#6b4223" strokeWidth={0.3} />
      <ellipse cx={0} cy={-0.6} rx={0.9} ry={0.4} fill="none" stroke="#b8864e" strokeWidth={0.25} />
    </g>
  );
}

/** Stacked felled logs, end grain to the front. */
function LogPile({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const logs: [number, number][] = [
    [-3.4, 0],
    [0, 0],
    [3.4, 0],
    [-1.7, -2.9],
    [1.7, -2.9],
    [0, -5.8],
  ];
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`}>
      <ellipse cx={3} cy={1.6} rx={8.5} ry={2} fill="rgba(20,14,6,0.35)" />
      {logs.map(([lx, ly], i) => (
        <path key={`b-${i}`} d={`M ${lx} ${ly - 1.7} L ${lx + 4.5} ${ly - 3.4} L ${lx + 4.5} ${ly} L ${lx} ${ly + 1.7} Z`} fill="#7a4e2c" stroke="#3d2412" strokeWidth={0.3} />
      ))}
      {logs.map(([lx, ly], i) => (
        <g key={`e-${i}`}>
          <circle cx={lx} cy={ly} r={1.7} fill="#e2b77c" stroke="#6b4223" strokeWidth={0.35} />
          <circle cx={lx} cy={ly} r={0.8} fill="none" stroke="#b8864e" strokeWidth={0.3} />
        </g>
      ))}
    </g>
  );
}

/** Round hay bale lying on its side, end face to the front. */
function HayBale({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`}>
      <ellipse cx={3.2} cy={2.4} rx={5.6} ry={1.4} fill="rgba(90,55,0,0.35)" />
      <path d="M 0 -2.6 L 3.6 -3.6 Q 6.2 -3.6, 6.2 -0.9 Q 6.2 1.7, 3.6 1.7 L 0 2.6 Z" fill="#c99a3e" stroke="#7a5a1c" strokeWidth={0.3} />
      <circle cx={0} cy={0} r={2.6} fill="#eac56a" stroke="#7a5a1c" strokeWidth={0.35} />
      <path d="M 0 0 m -1.6 0 a 1.6 1.6 0 1 1 1.6 1.6 a 0.9 0.9 0 1 1 0.9 -0.9" fill="none" stroke="#b8913a" strokeWidth={0.3} />
    </g>
  );
}

/** Woolly sheep grazing; `dir` -1 faces left. */
function Sheep({ x, y, dir = 1, s = 0.72 }: { x: number; y: number; dir?: number; s?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${dir * s}, ${s})`}>
      <ellipse cx={1.2} cy={3.6} rx={5.6} ry={1.5} fill="rgba(20,50,10,0.3)" />
      <path d="M -3 1.5 L -3 3.6 M -1 1.8 L -1 3.8 M 1.5 1.8 L 1.5 3.8 M 3 1.5 L 3 3.6" stroke="#2a2a2a" strokeWidth={0.9} strokeLinecap="round" />
      <path d="M -4.6 1 C -6.2 0.6, -6 -2.4, -4.2 -2.6 C -3.8 -4.4, -1 -4.6, 0 -3.4 C 1.2 -4.8, 3.8 -4.2, 4 -2.4 C 5.6 -2, 5.4 1.2, 3.8 1.4 Z" fill="#fbfbf6" stroke="#5c6f3a" strokeWidth={0.7} />
      <path d="M -3.6 -2 C -2.6 -3.4, -0.6 -3.4, 0.2 -2.4" fill="none" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" opacity={0.9} />
      <ellipse cx={5.6} cy={-1.2} rx={1.9} ry={1.5} fill="#2d2a26" />
    </g>
  );
}

/** Dry-stone wall along a path: soft shadow, grey stones, pale capstones. */
function StoneWall({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} transform="translate(0.6, 0.9)" stroke="#24461a" strokeOpacity={0.35} strokeWidth={2.8} />
      <path d={d} stroke="#8a8778" strokeWidth={2.3} />
      <path d={d} stroke="#d9d5c3" strokeWidth={1.1} strokeDasharray="1.3 0.9" />
    </g>
  );
}

/** Forest layout: trees on a jittered grid, outside the clearing and off the logging trail, back to front. */
const FOREST_CLEARING = { cx: 0, cy: 1, rx: 27, ry: 24 };
const FOREST_TRAIL: [number, number][] = [
  [-16, 19],
  [-27, 26],
  [-40, 32],
];
const FOREST_STAND = (() => {
  const trees: { x: number; y: number; s: number; conifer: boolean; tone: number }[] = [];
  let i = 0;
  for (let gy = -52; gy <= 54; gy += 8.6) {
    const row = Math.round((gy + 52) / 8.6);
    for (let gx = -48; gx <= 48; gx += 9.2) {
      i++;
      const x = gx + (row % 2) * 4.6 + (hash01(i, 1) - 0.5) * 5;
      const y = gy + (hash01(i, 2) - 0.5) * 4.5;
      const inClearing = ((x - FOREST_CLEARING.cx) / (FOREST_CLEARING.rx + 4)) ** 2 + ((y - FOREST_CLEARING.cy) / (FOREST_CLEARING.ry + 4)) ** 2 < 1;
      const nearTrail = FOREST_TRAIL.some(([tx, ty]) => Math.hypot(x - tx, y - ty) < 7);
      if (inClearing || nearTrail || !inTileHex(x, y + 3, -7)) continue;
      trees.push({ x, y, s: 0.82 + hash01(i, 3) * 0.36, conifer: hash01(i, 4) < 0.62, tone: Math.floor(hash01(i, 5) * 3) });
    }
  }
  return trees.sort((a, b) => a.y - b.y);
})();

/**
 * Forest (lumber) tile: a dense mixed wood of shaded conifers and broadleaf trees round a sunlit
 * logging clearing centred under the number disc, with stumps, a log pile, a trail and lumberjacks.
 */
function ForestArtworkSvg({ hexId }: { hexId: number }) {
  const id = (name: string) => `forest-${name}-${hexId}`;
  const c = FOREST_CLEARING;
  const trail = `M ${FOREST_TRAIL[0]!.join(' ')} Q ${FOREST_TRAIL[1]!.join(' ')}, ${FOREST_TRAIL[2]!.join(' ')}`;
  return (
    <g>
      <defs>
        <radialGradient id={id('floor')} gradientUnits="userSpaceOnUse" cx={-14} cy={-16} r={90}>
          <stop offset="0" stopColor="#3f8048" />
          <stop offset="0.6" stopColor="#285f36" />
          <stop offset="1" stopColor="#173f25" />
        </radialGradient>
        <radialGradient id={id('glade')} gradientUnits="userSpaceOnUse" cx={-6} cy={-6} r={34}>
          <stop offset="0" stopColor="#c6d77a" />
          <stop offset="0.7" stopColor="#9fbe5e" />
          <stop offset="1" stopColor="#7fa24c" />
        </radialGradient>
      </defs>

      {/* Deep forest floor */}
      <rect x={-60} y={-60} width={120} height={120} fill={`url(#${id('floor')})`} />

      {/* Sunlit clearing under the number disc, shaded on the upper-left by the trees */}
      <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={`url(#${id('glade')})`} />
      <path d={`M ${ellipsePt(c.cx, c.cy + 1.4, c.rx - 1.4, c.ry - 1.4, 150)} A ${c.rx - 1.4} ${c.ry - 1.4} 0 0 1 ${ellipsePt(c.cx, c.cy + 1.4, c.rx - 1.4, c.ry - 1.4, 300)}`} fill="none" stroke="#3d6a2c" strokeOpacity={0.4} strokeWidth={3.2} strokeLinecap="round" />
      {([[-14, -12], [12, 14], [-6, 15], [16, -8]] as [number, number][]).map(([px, py], i) => (
        <ellipse key={`grass-${i}`} cx={px} cy={py} rx={5} ry={2.4} fill="#d8e48c" opacity={0.35} />
      ))}

      {/* Logging trail out of the clearing */}
      <path d={trail} fill="none" stroke="#5a4128" strokeOpacity={0.5} strokeWidth={5} strokeLinecap="round" transform="translate(0.5, 0.8)" />
      <path d={trail} fill="none" stroke="#9b7a50" strokeWidth={4} strokeLinecap="round" />
      <path d={trail} fill="none" stroke="#c4a172" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />

      {/* Stumps and a log pile in the clearing */}
      <Stump x={-22} y={-7} />
      <Stump x={21} y={10} />
      <Stump x={8} y={-20} />
      <Stump x={2} y={21.5} />
      <LogPile x={-23} y={10} s={0.85} />

      {/* The wood, back to front */}
      {FOREST_STAND.map((t, i) =>
        t.conifer ? <Conifer key={`tree-${i}`} x={t.x} y={t.y} s={t.s} tone={t.tone} /> : <Broadleaf key={`tree-${i}`} x={t.x} y={t.y} s={t.s} tone={t.tone} />,
      )}

      {/* Lumberjacks: felling at the clearing edge, carrying a log, wheeling logs out along the trail */}
      <Worker x={20} y={-14} shirt="#b8332a" pose="axe" flip hat="cap" />
      <Worker x={-10} y={21} shirt="#2f6ea8" pose="carry" hat="cap" load="#8a5a32" />
      <Worker x={-25} y={25} shirt="#e2b04a" pose="barrow" flip hat="cap" load="#8a5a32" />
    </g>
  );
}

/** Field sectors round the harvested middle: [from deg, to deg, row angle, colours]. */
const FIELD_SECTORS: { from: number; to: number; rows: number; base: [string, string]; lit: string; furrow: string }[] = [
  { from: 200, to: 330, rows: 28, base: ['#f2c33c', '#d8961c'], lit: '#fbdc7a', furrow: '#a9760f' },
  { from: 330, to: 460, rows: -38, base: ['#ecc76e', '#cf9f42'], lit: '#f6dc98', furrow: '#a87f2e' },
  { from: 100, to: 200, rows: 72, base: ['#e9a72c', '#c47d14'], lit: '#f4c75c', furrow: '#9a650e' },
];
const FIELD_ROUND = 26;

/**
 * Fields (grain) tile: three wheat plots with their rows running different ways, divided by farm
 * tracks that meet at a harvested round centred under the number disc; a combine cutting the ripe
 * wheat, round bales on the stubble, poplars along a track and a farmer with a pitchfork.
 */
function FieldsArtworkSvg({ hexId }: { hexId: number }) {
  const id = (name: string) => `fields-${name}-${hexId}`;
  const ray = (deg: number, r: number): [number, number] => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
  return (
    <g>
      <defs>
        {FIELD_SECTORS.map((f, i) => (
          <g key={i}>
            <linearGradient id={id(`base-${i}`)} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={f.base[0]} />
              <stop offset="1" stopColor={f.base[1]} />
            </linearGradient>
            <pattern id={id(`rows-${i}`)} width={3.6} height={3.6} patternUnits="userSpaceOnUse" patternTransform={`rotate(${f.rows})`}>
              <rect x={0} y={0} width={1.5} height={3.6} fill={f.lit} opacity={0.5} />
              <rect x={2.5} y={0} width={0.6} height={3.6} fill={f.furrow} opacity={0.6} />
            </pattern>
          </g>
        ))}
        <radialGradient id={id('round')} gradientUnits="userSpaceOnUse" cx={-6} cy={-6} r={30}>
          <stop offset="0" stopColor="#f3d27f" />
          <stop offset="1" stopColor="#d6a650" />
        </radialGradient>
        <radialGradient id={id('light')} gradientUnits="userSpaceOnUse" cx={-22} cy={-26} r={90}>
          <stop offset="0" stopColor="#fff6d8" stopOpacity={0.14} />
          <stop offset="0.55" stopColor="#fff6d8" stopOpacity={0} />
          <stop offset="1" stopColor="#6a3c00" stopOpacity={0.22} />
        </radialGradient>
      </defs>

      {/* Three plots, each a wedge from the middle with its own crop and row direction */}
      {FIELD_SECTORS.map((f, i) => {
        const steps = 4;
        const corners = Array.from({ length: steps + 1 }, (_, k) => ray(f.from + ((f.to - f.from) * k) / steps, 95).map((n) => n.toFixed(1)).join(','));
        const points = `0,0 ${corners.join(' ')}`;
        return (
          <g key={`plot-${i}`}>
            <polygon points={points} fill={`url(#${id(`base-${i}`)})`} />
            <polygon points={points} fill={`url(#${id(`rows-${i}`)})`} />
          </g>
        );
      })}

      {/* Swath already cut behind the combine, in the top plot */}
      <path d="M -60 -38 L -21 -30" stroke="#e8c574" strokeWidth={6.5} strokeLinecap="round" opacity={0.9} />

      {/* Sun from the upper-left, darker toward the far edges */}
      <rect x={-60} y={-60} width={120} height={120} fill={`url(#${id('light')})`} />

      {/* Farm tracks along the plot edges, with grass verges */}
      {FIELD_SECTORS.map((f, i) => {
        const [x1, y1] = ray(f.from, FIELD_ROUND - 1);
        const [x2, y2] = ray(f.from, 80);
        const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        return (
          <g key={`track-${i}`} fill="none" strokeLinecap="round">
            <path d={d} stroke="#7d9e44" strokeWidth={5.2} />
            <path d={d} stroke="#c4995e" strokeWidth={3.2} />
            <path d={d} stroke="#e0bd84" strokeWidth={1} opacity={0.8} />
          </g>
        );
      })}

      {/* Harvested round under the number disc, with the mower's circles; the standing wheat shades its upper-left edge */}
      <circle cx={0} cy={0} r={FIELD_ROUND + 0.8} fill="#a8721a" opacity={0.45} />
      <circle cx={0} cy={0} r={FIELD_ROUND} fill={`url(#${id('round')})`} />
      {[18.6, 21.2, 23.8].map((r) => (
        <circle key={`mow-${r}`} cx={0} cy={0} r={r} fill="none" stroke="#c9ab6a" strokeWidth={0.5} opacity={0.7} />
      ))}
      <path d={`M ${ellipsePt(0, 0.8, FIELD_ROUND - 1, FIELD_ROUND - 1, 150)} A ${FIELD_ROUND - 1} ${FIELD_ROUND - 1} 0 0 1 ${ellipsePt(0, 0.8, FIELD_ROUND - 1, FIELD_ROUND - 1, 300)}`} fill="none" stroke="#a8782a" strokeOpacity={0.35} strokeWidth={2.2} strokeLinecap="round" />

      {/* Round bales on the stubble */}
      <HayBale x={27} y={9} s={0.95} />
      <HayBale x={33} y={19} s={0.85} />
      <HayBale x={19} y={31} s={0.9} />

      {/* Poplars along the lower track */}
      <Poplar x={1.6} y={33} s={0.9} />
      <Poplar x={0.2} y={43} s={0.85} />
      <Poplar x={33} y={-12} s={0.85} />

      {/* Combine harvester cutting the ripe wheat, with a trail of chaff */}
      {([[-27, -32, 2.6], [-31, -33.5, 2], [-35, -34.5, 1.5]] as [number, number, number][]).map(([dx, dy, dr], i) => (
        <ellipse key={`dust-${i}`} cx={dx} cy={dy} rx={dr * 1.4} ry={dr} fill="#fff3cc" opacity={0.45 - i * 0.1} />
      ))}
      <g transform="translate(-19, -29.5) rotate(11)">
        <ellipse cx={1.6} cy={3.6} rx={8.6} ry={1.9} fill="rgba(90,55,0,0.4)" />
        <rect x={-5.5} y={2.2} width={3.2} height={1.4} rx={0.4} fill="#2a2a2a" />
        <rect x={1} y={2.2} width={2.6} height={1.3} rx={0.4} fill="#2a2a2a" />
        <rect x={-6} y={-2.8} width={11.4} height={5.4} rx={1} fill="#c0392b" stroke="#5a1610" strokeWidth={0.35} />
        <rect x={-4.8} y={-2.2} width={4.8} height={4} rx={0.6} fill="#a52f23" />
        <path d="M -3.4 -2.8 L -1.4 -5.6" stroke="#8a8f96" strokeWidth={0.7} strokeLinecap="round" />
        <rect x={1.4} y={-2.2} width={3} height={3.6} rx={0.5} fill="#f2f2ee" stroke="#5a1610" strokeWidth={0.3} />
        <rect x={2} y={-1.6} width={1.8} height={1.6} rx={0.2} fill="#7fb6d6" />
        <rect x={5.6} y={-4.2} width={2.2} height={8.6} rx={0.6} fill="#e9c046" stroke="#6b4e10" strokeWidth={0.35} />
        <path d="M 6.7 -3.6 L 6.7 3.8" stroke="#b8901c" strokeWidth={0.4} strokeDasharray="0.6 0.6" />
      </g>

      {/* Farmer forking hay by the bales */}
      <Worker x={25} y={25} shirt="#3f6fa8" pose="fork" hat="straw" />
    </g>
  );
}

/** Pasture: the round sheepfold under the number disc, and grass tufts kept off it. */
const SHEEPFOLD = { cx: 0, cy: 1, r: 21.5 };
const PASTURE_TUFTS: [number, number][] = Array.from({ length: 34 }, (_, i): [number, number] => [-42 + hash01(i, 11) * 84, -46 + hash01(i, 12) * 92]).filter(
  ([x, y]) => Math.hypot(x - SHEEPFOLD.cx, y - SHEEPFOLD.cy) > SHEEPFOLD.r + 3,
);
const PASTURE_MOUNDS: [number, number, number, number][] = [
  [-28, -12, 20, 12],
  [30, -6, 18, 11],
  [26, 32, 22, 12],
  [-24, 36, 18, 10],
];

/**
 * Pasture (wool) tile: rolling meadows divided by dry-stone walls, a round stone sheepfold centred
 * under the number disc, a lane up to its gate, a pond, a farmhouse, flocks of sheep, and a
 * shepherd with a crook and a sheepdog.
 */
function PastureArtworkSvg({ hexId }: { hexId: number }) {
  const id = (name: string) => `pasture-${name}-${hexId}`;
  const f = SHEEPFOLD;
  // The fold wall runs all the way round except for a gate on the lower-right
  const foldWall = `M ${ellipsePt(f.cx, f.cy, f.r, f.r, 62)} A ${f.r} ${f.r} 0 1 1 ${ellipsePt(f.cx, f.cy, f.r, f.r, 36)}`;
  const lane = 'M -42 27 C -22 38, 4 33, 15.5 18.5';
  return (
    <g>
      <defs>
        <radialGradient id={id('meadow')} gradientUnits="userSpaceOnUse" cx={-14} cy={-16} r={90}>
          <stop offset="0" stopColor="#a6d86c" />
          <stop offset="0.55" stopColor="#78ba4c" />
          <stop offset="1" stopColor="#4e8f37" />
        </radialGradient>
        <radialGradient id={id('pond')} gradientUnits="userSpaceOnUse" cx={-27} cy={-30} r={10}>
          <stop offset="0" stopColor="#9fd6f2" />
          <stop offset="1" stopColor="#3f8fc7" />
        </radialGradient>
      </defs>

      {/* Meadow, sunnier toward the upper-left */}
      <rect x={-60} y={-60} width={120} height={120} fill={`url(#${id('meadow')})`} />

      {/* Rolling ground: shaded low-right, sunlit up-left */}
      {PASTURE_MOUNDS.map(([mx, my, mrx, mry], i) => (
        <g key={`mound-${i}`}>
          <ellipse cx={mx + 1} cy={my + 1.4} rx={mrx} ry={mry} fill="#5a983c" opacity={0.7} />
          <ellipse cx={mx - mrx * 0.08} cy={my - mry * 0.12} rx={mrx * 0.9} ry={mry * 0.8} fill="#8ccb5c" opacity={0.85} />
          <ellipse cx={mx - mrx * 0.28} cy={my - mry * 0.4} rx={mrx * 0.5} ry={mry * 0.36} fill="#b8e27f" opacity={0.6} />
        </g>
      ))}

      {/* Grass tufts */}
      {PASTURE_TUFTS.map(([gx, gy], i) => (
        <path key={`tuft-${i}`} d={`M ${(gx - 1.6).toFixed(1)} ${gy.toFixed(1)} L ${(gx - 0.6).toFixed(1)} ${(gy - 2.4).toFixed(1)} M ${gx.toFixed(1)} ${gy.toFixed(1)} L ${gx.toFixed(1)} ${(gy - 2.8).toFixed(1)} M ${(gx + 1.6).toFixed(1)} ${gy.toFixed(1)} L ${(gx + 0.6).toFixed(1)} ${(gy - 2.4).toFixed(1)}`} stroke="#4c8a2e" strokeWidth={0.6} strokeLinecap="round" opacity={0.6} />
      ))}

      {/* Pond with reeds */}
      <ellipse cx={-25} cy={-28} rx={10.4} ry={6.8} fill="#4f8a36" />
      <ellipse cx={-25} cy={-28} rx={9} ry={5.6} fill={`url(#${id('pond')})`} />
      <path d="M -31 -30 Q -27 -32.4, -22 -31.4" fill="none" stroke="#e6f6ff" strokeWidth={0.8} strokeLinecap="round" opacity={0.85} />
      <path d="M -33.5 -27 L -34.4 -30.4 M -32.6 -26.4 L -32.8 -30 M -17.2 -25.6 L -16.6 -29 M -16.2 -26.6 L -15 -29.4" stroke="#2f6a26" strokeWidth={0.55} strokeLinecap="round" />

      {/* Walls dividing the paddocks */}
      <StoneWall d={`M ${ellipsePt(f.cx, f.cy, f.r, f.r, 200)} Q -34 -8, -48 -15`} />
      <StoneWall d={`M ${ellipsePt(f.cx, f.cy, f.r, f.r, 288)} Q 10 -32, 15 -50`} />

      {/* Lane up to the fold gate */}
      <path d={lane} fill="none" stroke="#5f9a3e" strokeWidth={5.2} strokeLinecap="round" />
      <path d={lane} fill="none" stroke="#e2d2a2" strokeWidth={3.4} strokeLinecap="round" />
      <path d={lane} fill="none" stroke="#f4e9c8" strokeWidth={1} strokeLinecap="round" opacity={0.8} />

      {/* Sheepfold round the number disc: trampled grass inside a stone wall with a gate */}
      <circle cx={f.cx} cy={f.cy} r={f.r} fill="#93cc63" />
      <circle cx={f.cx - 1} cy={f.cy - 1} r={f.r - 3} fill="#a9d878" opacity={0.6} />
      <StoneWall d={foldWall} />

      {/* Farmhouse on the rise */}
      <g transform="translate(24, -25)">
        <ellipse cx={3} cy={1} rx={8.4} ry={2} fill="rgba(20,50,10,0.35)" />
        <polygon points="2,0 6,-1.6 6,-6.1 2,-4.5" fill="#d6c7a6" stroke="#6b5a40" strokeWidth={0.3} />
        <polygon points="-4,0 2,0 2,-4.5 -4,-4.5" fill="#f3ead8" stroke="#6b5a40" strokeWidth={0.3} />
        <polygon points="-1,-8 2.4,-4.5 6.4,-6.1 3,-9.6" fill="#8f3322" stroke="#4a1a10" strokeWidth={0.3} />
        <polygon points="-4.4,-4.5 2.4,-4.5 -1,-8" fill="#b8452e" stroke="#4a1a10" strokeWidth={0.3} />
        <rect x={3.4} y={-10.6} width={1} height={2.2} fill="#7a2a1c" />
        <rect x={-1.9} y={-2.6} width={1.6} height={2.6} fill="#6b4223" />
        <rect x={0.4} y={-3.4} width={1.2} height={1.1} fill="#7fb6d6" stroke="#6b5a40" strokeWidth={0.2} />
      </g>

      {/* Trees */}
      <Broadleaf x={38} y={22} s={0.9} tone={0} />
      <Broadleaf x={-36} y={31} s={0.85} tone={2} />
      <Broadleaf x={-40} y={-4} s={0.75} tone={1} />

      {/* Flocks in the paddocks */}
      {([
        [-34, 8, 1],
        [-29, 15, -1],
        [-38, 18, 1],
        [-8, -33, 1],
        [0, -38, -1],
        [-13, -41, 1],
        [34, -5, -1],
        [30, 3, 1],
        [37, 7, -1],
        [10, 40, 1],
        [19, 36, -1],
      ] as [number, number, number][]).map(([sx, sy, dir], i) => (
        <Sheep key={`sheep-${i}`} x={sx} y={sy} dir={dir} />
      ))}

      {/* Shepherd and sheepdog at the gate */}
      <g transform="translate(19, 23)">
        <ellipse cx={0.5} cy={1.2} rx={2.6} ry={0.7} fill="rgba(20,50,10,0.35)" />
        <ellipse cx={0} cy={0} rx={2.2} ry={1.1} fill="#1f1d1c" />
        <ellipse cx={0.6} cy={0.3} rx={1} ry={0.6} fill="#f4f1e6" />
        <circle cx={-2} cy={-0.8} r={0.9} fill="#1f1d1c" />
        <path d="M -2.4 -1.6 L -2.1 -2.2 L -1.7 -1.6" fill="#1f1d1c" />
        <path d="M 2 -0.4 Q 3.2 -1.4, 3.4 -2.2" fill="none" stroke="#1f1d1c" strokeWidth={0.5} strokeLinecap="round" />
        <path d="M -1.4 0.8 L -1.5 1.6 M 1.3 0.8 L 1.4 1.6" stroke="#1f1d1c" strokeWidth={0.45} strokeLinecap="round" />
      </g>
      <Worker x={25} y={20} shirt="#6b4f8a" pose="crook" flip hat="straw" />
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
        {terrain === 'forest' && <ForestArtworkSvg hexId={hexId} />}

        {terrain === 'hills' && <HillsArtworkSvg hexId={hexId} />}

        {terrain === 'pasture' && <PastureArtworkSvg hexId={hexId} />}

        {terrain === 'fields' && <FieldsArtworkSvg hexId={hexId} />}

        {terrain === 'mountains' && <MountainsArtworkSvg hexId={hexId} />}

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
  yourHexes,
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
          const isYours = yourHexes?.hexIds.has(hex.id) ?? false;
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

              {/* Discarding on a 7: hexes the player does not build on step back, theirs get a ring in their colour
                  (all under the number disc, so the numbers stay clear). A hex a hazard or the Inspector blocks is dimmed. */}
              {yourHexes && !isYours && (
                <polygon
                  data-testid={`hex-dimmed-${hex.id}`}
                  points={getPointyHexPoints(0, 0, HEX_RADIUS - 1)}
                  fill="rgba(7, 20, 33, 0.4)"
                  pointerEvents="none"
                />
              )}
              {isYours && yourHexes && (
                <g
                  data-testid={`hex-yours-${hex.id}`}
                  className={`hex-yours${hex.hasHazard || hex.hasInspector ? ' is-blocked' : ''}`}
                  pointerEvents="none"
                >
                  <g className="hex-yours-halo">
                    <polygon
                      points={getPointyHexPoints(0, 0, HEX_RADIUS - 5)}
                      fill={PLAYER_THEMES[yourHexes.playerId].fill}
                      fillOpacity={0.2}
                      stroke="#ffffff"
                      strokeWidth={8}
                      strokeLinejoin="round"
                    />
                    <polygon
                      points={getPointyHexPoints(0, 0, HEX_RADIUS - 5)}
                      fill="none"
                      stroke={PLAYER_THEMES[yourHexes.playerId].fill}
                      strokeWidth={4.5}
                      strokeLinejoin="round"
                    />
                    <circle cx={0} cy={0} r={21.5} fill="none" stroke="#ffffff" strokeWidth={4.5} />
                    <circle cx={0} cy={0} r={21.5} fill="none" stroke={PLAYER_THEMES[yourHexes.playerId].fill} strokeWidth={2.5} />
                  </g>
                </g>
              )}

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
