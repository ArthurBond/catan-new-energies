/**
 * CATAN: New Energies — Shared 3D Wooden Pieces, Resource Icons & Accessibility Badges
 */

import 'preact/compat';
import { PlayerId, PowerPlantType, ResourceType } from '../engine/types';
import { PLAYER_THEMES, TABLETOP_THEME } from './theme';

export function PlayerEmblemSvg({
  playerId,
  cx,
  cy,
  r = 4.5,
}: {
  playerId: PlayerId;
  cx: number;
  cy: number;
  r?: number;
}) {
  const theme = PLAYER_THEMES[playerId];
  const stroke = theme.textOnFill;
  const fill = theme.textOnFill;

  if (theme.emblem === 'Sun') {
    return (
      <g transform={`translate(${cx}, ${cy})`} pointerEvents="none">
        <circle r={r * 0.55} fill={fill} />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={Math.cos(rad) * r * 0.65}
              y1={Math.sin(rad) * r * 0.65}
              x2={Math.cos(rad) * r * 1.05}
              y2={Math.sin(rad) * r * 1.05}
              stroke={stroke}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    );
  }

  if (theme.emblem === 'Wave') {
    return (
      <g transform={`translate(${cx}, ${cy})`} pointerEvents="none">
        <path
          d={`M ${-r * 0.85} ${-r * 0.2} Q ${-r * 0.4} ${-r * 0.75}, 0 ${-r * 0.2} T ${r * 0.85} ${-r * 0.2}`}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <path
          d={`M ${-r * 0.85} ${r * 0.35} Q ${-r * 0.4} ${-r * 0.2}, 0 ${r * 0.35} T ${r * 0.85} ${r * 0.35}`}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (theme.emblem === 'Triangle') {
    return (
      <polygon
        points={`${cx},${cy - r * 0.85} ${cx + r * 0.8},${cy + r * 0.65} ${cx - r * 0.8},${cy + r * 0.65}`}
        fill={fill}
        pointerEvents="none"
      />
    );
  }

  // Hexagon (Purple)
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((i * 60 - 30) * Math.PI) / 180;
    pts.push(`${(cx + Math.cos(a) * r * 0.8).toFixed(1)},${(cy + Math.sin(a) * r * 0.8).toFixed(1)}`);
  }
  return (
    <polygon
      points={pts.join(' ')}
      fill="none"
      stroke={stroke}
      strokeWidth={1.6}
      pointerEvents="none"
    />
  );
}

// ============================================================================
// Piece geometry
// ============================================================================

/**
 * Power plants sit in the hex corner next to their Town/City: the disc centre is
 * PLANT_SOCKET_DIST board units from the intersection toward the hex centre, and every
 * Town/City notch is an arc around that same centre, so plants nest exactly in the cutouts.
 */
export const PLANT_SOCKET_DIST = 15.5;
export const PLANT_RADIUS = 7;

const TOWN_RADIUS = 11.5;
const CITY_APOTHEM = 13;
const TOWN_DEPTH = 3.5;
const CITY_DEPTH = 6;

function polar(radius: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [Math.cos(rad) * radius, Math.sin(rad) * radius];
}

function fmt([x, y]: [number, number]): string {
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

/**
 * Builds a hexagonal piece outline whose edge facing each angle in `notchDegs` is replaced by a
 * concave arc centred on the plant socket in that direction. Edges facing the roads stay flat.
 */
function notchedHexPath(circumradius: number, notchDegs: number[]): string {
  const apothem = circumradius * Math.cos(Math.PI / 6);
  const halfEdge = circumradius / 2;
  const notchRadius = Math.hypot(PLANT_SOCKET_DIST - apothem, halfEdge);
  const cmds: string[] = [];
  for (let i = 0; i < 6; i++) {
    const edgeDeg = i * 60;
    const start = polar(circumradius, edgeDeg - 30);
    const end = polar(circumradius, edgeDeg + 30);
    if (i === 0) cmds.push(`M ${fmt(start)}`);
    if (notchDegs.includes(edgeDeg)) {
      cmds.push(`A ${notchRadius.toFixed(2)} ${notchRadius.toFixed(2)} 0 0 0 ${fmt(end)}`);
    } else {
      cmds.push(`L ${fmt(end)}`);
    }
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/** Town / City outlines (notch(es) facing 0°); also used for the matching slots on the player board. */
export const TOWN_PATH_D = notchedHexPath(TOWN_RADIUS, [0]);
export const CITY_PATH_D = notchedHexPath(CITY_APOTHEM / Math.cos(Math.PI / 6), [0, 120, 240]);

/**
 * Shared gradients & textures for pieces and tokens. Render once inside any <svg> that draws
 * pieces; every consumer also passes a plain fallback colour so pieces still render without it.
 */
export function PieceDefs() {
  return (
    <defs>
      {(Object.keys(PLAYER_THEMES) as PlayerId[]).map((pid) => {
        const t = PLAYER_THEMES[pid];
        return (
          <linearGradient key={pid} id={`piece-top-${pid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.highlight} style={{ stopColor: t.highlight }} />
            <stop offset="55%" stopColor={t.fill} style={{ stopColor: t.fill }} />
            <stop offset="100%" stopColor={t.fill} style={{ stopColor: t.fill }} />
          </linearGradient>
        );
      })}
      <pattern id="hex-grain" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1.2" r="0.45" fill="#ffffff" fillOpacity="0.16" />
        <circle cx="3.6" cy="3.4" r="0.5" fill="#000000" fillOpacity="0.1" />
        <circle cx="3.9" cy="0.9" r="0.3" fill="#000000" fillOpacity="0.08" />
      </pattern>
      <pattern id="hazard-speckle" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="1.2" cy="1.5" r="0.55" fill="#5d6065" />
        <circle cx="4.6" cy="2.4" r="0.45" fill="#d9dbde" />
        <circle cx="2.8" cy="5.2" r="0.5" fill="#6b6e73" />
        <circle cx="6.1" cy="5.9" r="0.4" fill="#cfd1d4" />
        <circle cx="5.4" cy="0.6" r="0.35" fill="#74777c" />
      </pattern>
    </defs>
  );
}

/** Stacks copies of a shape downward to fake the side walls of a thick wooden/cardboard piece. */
function Extrusion({
  d,
  depth,
  fill,
  stroke,
  rotateDeg,
  fillRule,
}: {
  d: string;
  depth: number;
  fill: string;
  stroke: string;
  rotateDeg: number;
  fillRule?: 'evenodd' | 'nonzero';
}) {
  const layers: number[] = [];
  for (let y = depth; y > 0; y -= 1) layers.push(y);
  return (
    <g>
      {layers.map((y, idx) => (
        <g key={y} transform={`translate(0, ${y.toFixed(2)})`}>
          <path
            d={d}
            transform={`rotate(${rotateDeg})`}
            fill={fill}
            fillRule={fillRule}
            stroke={idx === 0 ? stroke : fill}
            strokeWidth={idx === 0 ? 1.2 : 1}
            strokeLinejoin="round"
          />
        </g>
      ))}
    </g>
  );
}

function WoodenPiece({
  playerId,
  d,
  depth,
  rotateDeg,
  emblemR,
  showEmblem,
}: {
  playerId: PlayerId;
  d: string;
  depth: number;
  rotateDeg: number;
  emblemR: number;
  showEmblem: boolean;
}) {
  const p = PLAYER_THEMES[playerId];
  return (
    <g>
      {/* Soft contact shadow on the board */}
      <path
        d={d}
        transform={`translate(2.4, ${(depth + 2.6).toFixed(2)}) rotate(${rotateDeg})`}
        fill="rgba(10, 14, 20, 0.34)"
        stroke="rgba(10, 14, 20, 0.18)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Extrusion d={d} depth={depth} fill={p.sideFill} stroke={p.stroke} rotateDeg={rotateDeg} />
      {/* Top face with wood-grain light falloff */}
      <path
        d={d}
        transform={`rotate(${rotateDeg})`}
        fill={`url(#piece-top-${playerId}) ${p.fill}`}
        stroke={p.stroke}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Bevel: bright upper rim, keeps dark pieces readable on dark terrain */}
      <path
        d={d}
        transform={`rotate(${rotateDeg}) scale(0.86)`}
        fill="none"
        stroke={p.highlight}
        strokeOpacity={0.55}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {showEmblem && <PlayerEmblemSvg playerId={playerId} cx={0} cy={0} r={emblemR} />}
    </g>
  );
}

/**
 * Wooden Town: a low hexagon with one concave edge that faces its (possible) power plant.
 */
export function TownPieceSvg({
  playerId,
  cx,
  cy,
  scale = 1,
  showEmblem = true,
  cutoutAngleDeg = -35,
}: {
  playerId: PlayerId;
  cx: number;
  cy: number;
  scale?: number;
  showEmblem?: boolean;
  cutoutAngleDeg?: number;
}) {
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`} data-piece="town">
      <WoodenPiece
        playerId={playerId}
        d={TOWN_PATH_D}
        depth={TOWN_DEPTH}
        rotateDeg={cutoutAngleDeg}
        emblemR={3.9}
        showEmblem={showEmblem}
      />
    </g>
  );
}

/**
 * Wooden City: a tall hexagon with three concave edges at 120° that face the three adjacent hexes,
 * so up to three power plants lock in; roads meet its flat edges.
 */
export function CityPieceSvg({
  playerId,
  cx,
  cy,
  scale = 1,
  showEmblem = true,
  cutoutAngleDeg = 30,
}: {
  playerId: PlayerId;
  cx: number;
  cy: number;
  scale?: number;
  showEmblem?: boolean;
  cutoutAngleDeg?: number;
}) {
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`} data-piece="city">
      <WoodenPiece
        playerId={playerId}
        d={CITY_PATH_D}
        depth={CITY_DEPTH}
        rotateDeg={cutoutAngleDeg}
        emblemR={4.8}
        showEmblem={showEmblem}
      />
    </g>
  );
}

/**
 * Wooden power plant disc (dark fossil or green renewable) with a yellow lightning bolt.
 */
export function PowerPlantCylinderSvg({
  type,
  cx,
  cy,
  r = 9.5,
  hasGreenDiscUnderneath = false,
}: {
  type: PowerPlantType;
  cx: number;
  cy: number;
  r?: number;
  hasGreenDiscUnderneath?: boolean;
}) {
  const style = type === 'fossil' ? TABLETOP_THEME.plants.fossil : TABLETOP_THEME.plants.renewable;
  const depth = r * 0.34;
  const bolt = `${-r * 0.12},${-r * 0.62} ${r * 0.38},${-r * 0.62} ${r * 0.06},${-r * 0.1} ${r * 0.42},${-r * 0.1} ${-r * 0.3},${r * 0.62} ${-r * 0.04},${r * 0.04} ${-r * 0.4},${r * 0.04}`;

  return (
    <g transform={`translate(${cx}, ${cy})`} data-piece={`plant-${type}`}>
      {/* Optional green event disc underneath (player mat renewable slots) */}
      {hasGreenDiscUnderneath && (
        <g transform="translate(-1.5, 2.2)">
          <circle r={r * 1.18} fill="rgba(0,0,0,0.28)" cx={1.5} cy={2} />
          <circle r={r * 1.16} fill="#88b858" stroke="#d8ecc2" strokeWidth={1.4} />
          <circle
            r={r * 0.96}
            fill="none"
            stroke="#5a8732"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        </g>
      )}

      <ellipse cx={r * 0.22} cy={depth + r * 0.24} rx={r} ry={r * 0.94} fill="rgba(10,14,20,0.34)" />
      {/* Disc side wall */}
      <ellipse cx={0} cy={depth} rx={r} ry={r * 0.94} fill={style.fill} stroke="#14100c" strokeWidth={1} />
      <rect x={-r} y={0} width={r * 2} height={depth} fill={style.fill} />
      <line x1={-r} y1={0} x2={-r} y2={depth} stroke="#14100c" strokeWidth={1} />
      <line x1={r} y1={0} x2={r} y2={depth} stroke="#14100c" strokeWidth={1} />
      {/* Top face */}
      <ellipse cx={0} cy={0} rx={r} ry={r * 0.94} fill={style.topFill} stroke={style.stroke} strokeWidth={1.1} />
      <ellipse
        cx={-r * 0.12}
        cy={-r * 0.14}
        rx={r * 0.78}
        ry={r * 0.72}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.14}
        strokeWidth={1}
      />
      <polygon
        points={bolt}
        fill={style.bolt}
        stroke="#3d2c00"
        strokeWidth={r * 0.07}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** [amplitude, frequency, phase] waves that make a circle wobble like a spilled puddle. */
type Wave = [number, number, number];
const SPILL_WAVES: Wave[] = [
  [0.1, 2, 0.9],
  [0.09, 3, 2.1],
  [0.07, 5, 0.3],
  [0.04, 7, 1.4],
];
const SPILL_HOLE_WAVES: Wave[] = [
  [0.07, 3, 1.3],
  [0.05, 5, 0.2],
];

function waveRadius(theta: number, waves: Wave[]): number {
  let k = 1;
  for (const [amp, freq, phase] of waves) k += amp * Math.sin(freq * theta + phase);
  return k;
}

/** Largest radius factor of the spill outline, so the token's outer radius is exactly the `r` asked for. */
const SPILL_MAX = (() => {
  let max = 0;
  for (let i = 0; i < 720; i++) max = Math.max(max, waveRadius((i / 720) * Math.PI * 2, SPILL_WAVES));
  return max;
})();

/** Smooth closed outline through wobbly radius samples (Catmull-Rom converted to cubic Beziers). */
function wobblyOutline(base: number, waves: Wave[], samples = 30): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const rad = base * waveRadius(theta, waves);
    pts.push([Math.cos(theta) * rad, Math.sin(theta) * rad]);
  }
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(pts[0]![0])} ${f(pts[0]![1])}`;
  for (let i = 0; i < samples; i++) {
    const p0 = pts[(i - 1 + samples) % samples]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % samples]!;
    const p3 = pts[(i + 2) % samples]!;
    d +=
      ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}` +
      `, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}` +
      `, ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d} Z`;
}

const spillPathCache = new Map<string, string>();

/** Outer puddle outline plus the hole, as one even-odd path. */
function spillPath(r: number, holeRatio: number): string {
  const key = `${r}|${holeRatio}`;
  let d = spillPathCache.get(key);
  if (!d) {
    d = `${wobblyOutline(r / SPILL_MAX, SPILL_WAVES)} ${wobblyOutline(r * holeRatio, SPILL_HOLE_WAVES, 20)}`;
    spillPathCache.set(key, d);
  }
  return d;
}

/**
 * Natural hazard token: the flat grey cardboard oil spill from the box. A wavy puddle with a white
 * die-cut border, a thin dark edge showing its thickness, a speckled face and a hole in the middle
 * so the number disc (on a hex) or the player's piece (on a town/city) shows through.
 * `r` is the largest radius of the puddle; `holeRatio` sizes the hole relative to it.
 */
export function HazardTokenSvg({
  cx,
  cy,
  r = 14,
  holeRatio = 0.42,
}: {
  cx: number;
  cy: number;
  r?: number;
  holeRatio?: number;
}) {
  const d = spillPath(r, holeRatio);
  const edge = Math.max(0.8, r * 0.06);
  const depth = Math.max(1.4, r * 0.08);
  return (
    <g transform={`translate(${cx}, ${cy})`} data-token="hazard">
      {/* Soft shadow on the board */}
      <path
        d={d}
        fillRule="evenodd"
        transform={`translate(${(r * 0.1).toFixed(2)}, ${(depth + r * 0.14).toFixed(2)})`}
        fill="rgba(10, 14, 20, 0.3)"
      />
      {/* White die-cut border around the face and its thickness */}
      <path d={d} fillRule="evenodd" fill="#f7f7f4" stroke="#f7f7f4" strokeWidth={edge * 2} strokeLinejoin="round" />
      <path
        d={d}
        fillRule="evenodd"
        transform={`translate(0, ${depth.toFixed(2)})`}
        fill="#f7f7f4"
        stroke="#f7f7f4"
        strokeWidth={edge * 2}
        strokeLinejoin="round"
      />
      {/* Thickness: the dark edge under the face */}
      <path d={d} fillRule="evenodd" transform={`translate(0, ${depth.toFixed(2)})`} fill="#4b4e53" />
      {/* Speckled grey cardboard face */}
      <path d={d} fillRule="evenodd" fill="#8d9095" />
      <path d={d} fillRule="evenodd" fill="url(#hazard-speckle) transparent" opacity={0.9} />
    </g>
  );
}

/**
 * 3D Environmental Inspector Figurine — Human figure with limbs, clipboard & green ID lanyard
 * standing on the classic 3D wooden pawn pedestal
 */
export function InspectorPawnSvg({
  cx,
  cy,
  scale = 1,
}: {
  cx: number;
  cy: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`} data-testid="inspector-pawn">
      {/* Drop Shadow */}
      <ellipse cx={2.5} cy={9.5} rx={11.5} ry={6.5} fill="rgba(0,0,0,0.42)" />

      {/* Classic 3D Wooden Pedestal Base (retained from Robber design) */}
      <ellipse
        cx={0}
        cy={7.5}
        rx={10.5}
        ry={5.8}
        fill={TABLETOP_THEME.tokens.inspector.base}
        stroke="#1e2024"
        strokeWidth={1.3}
      />
      <ellipse
        cx={0}
        cy={5.6}
        rx={9.2}
        ry={4.6}
        fill={TABLETOP_THEME.tokens.inspector.body}
        stroke="#2c2f36"
        strokeWidth={1}
      />

      {/* Two Distinct Human Legs planted on the pedestal */}
      <path
        d="M -4.6 5.8 L -3.8 -1.5 L -1.0 -1.5 L -1.2 5.8 Z"
        fill="#4f5663"
        stroke="#1e2024"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path
        d="M 1.2 5.8 L 1.0 -1.5 L 3.8 -1.5 L 4.6 5.8 Z"
        fill="#4f5663"
        stroke="#1e2024"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />

      {/* Human Torso / Jacket */}
      <path
        d="M -5.4 -1.2 L -6.2 -10.2 C -6.2 -11.5, -4.5 -12.4, -2.8 -12.4 L 2.8 -12.4 C 4.5 -12.4, 6.2 -11.5, 6.2 -10.2 L 5.4 -1.2 Z"
        fill={TABLETOP_THEME.tokens.inspector.body}
        stroke="#1e2024"
        strokeWidth={1.25}
        strokeLinejoin="round"
      />

      {/* Left & Right Articulated Arms / Limbs */}
      {/* Left Arm (angled out, holding an environmental inspection clipboard) */}
      <path
        d="M -5.6 -11.4 L -9.8 -5.8 L -7.4 -4.2 L -4.6 -8.8"
        fill={TABLETOP_THEME.tokens.inspector.highlight}
        stroke="#1e2024"
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right Arm (gesture / hand on hip) */}
      <path
        d="M 5.6 -11.4 L 9.4 -5.5 L 7.0 -4.0 L 4.6 -8.8"
        fill={TABLETOP_THEME.tokens.inspector.highlight}
        stroke="#1e2024"
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Mini Inspection Clipboard in Left Hand */}
      <g transform="translate(-9.6, -4.6) rotate(-18)">
        <rect
          x={-2.8}
          y={-3.6}
          width={5.6}
          height={7.2}
          rx={1}
          fill="#f7fafc"
          stroke="#2d3748"
          strokeWidth={0.9}
        />
        <rect x={-1.5} y={-4.1} width={3} height={1.4} rx={0.5} fill="#cbd5e0" />
        <line x1={-1.6} y1={-1.2} x2={1.6} y2={-1.2} stroke="#38a169" strokeWidth={0.9} />
        <line x1={-1.6} y1={0.8} x2={1.2} y2={0.8} stroke="#4a5568" strokeWidth={0.8} />
      </g>

      {/* Eco-Green Lanyard Strap & Inspector ID Badge on Chest */}
      <path
        d="M -2.6 -12.2 L 0 -6.8 L 2.6 -12.2"
        fill="none"
        stroke="#48bb78"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x={-2.2}
        y={-6.8}
        width={4.4}
        height={5.0}
        rx={0.9}
        fill="#ffffff"
        stroke="#276749"
        strokeWidth={0.85}
      />
      <circle cx={0} cy={-4.3} r={1.1} fill="#38a169" />

      {/* Human Head & Inspector Cap/Visor */}
      <circle
        cx={0}
        cy={-16.8}
        r={4.8}
        fill={TABLETOP_THEME.tokens.inspector.highlight}
        stroke="#1e2024"
        strokeWidth={1.25}
      />
      {/* Safety Hat / Inspector Cap Brim */}
      <path
        d="M -5.2 -18.2 Q 0 -22.8, 5.2 -18.2 L 6.2 -17.5 Q 0 -19.2, -5.2 -18.2 Z"
        fill="#ecc94b"
        stroke="#744210"
        strokeWidth={0.9}
      />
      {/* Specular highlight */}
      <circle cx={-1.6} cy={-18.0} r={1.2} fill="#ffffff" fillOpacity={0.8} />
    </g>
  );
}

/**
 * 3D Yellow Wooden Energy Lightning-Bolt Token
 */
export function EnergyBoltSvg({
  cx = 0,
  cy = 0,
  scale = 1,
  empty = false,
}: {
  cx?: number;
  cy?: number;
  scale?: number;
  empty?: boolean;
}) {
  const boltPoints = '-2,-14 7,-14 1,-3 8,-3 -5,14 -1,2 -7,2';
  if (empty) {
    return (
      <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
        <polygon
          points={boltPoints}
          fill="#f4f2eb"
          stroke="#b89828"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </g>
    );
  }
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
      <polygon points={boltPoints} transform="translate(1.8, 2.5)" fill="rgba(0,0,0,0.32)" />
      <polygon
        points={boltPoints}
        transform="translate(0.8, 1.5)"
        fill={TABLETOP_THEME.tokens.energy.side}
        stroke={TABLETOP_THEME.tokens.energy.stroke}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <polygon
        points={boltPoints}
        fill={TABLETOP_THEME.tokens.energy.fill}
        stroke={TABLETOP_THEME.tokens.energy.stroke}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <polyline
        points="-1,-12 4.5,-12 0,-3"
        fill="none"
        stroke={TABLETOP_THEME.tokens.energy.highlight}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Pollution / Footprint Cloud Icon (+1 grey smog cloud or -1 green eco cloud)
 */
export function FootprintCloudIconSvg({
  type,
  cx = 0,
  cy = 0,
  scale = 1,
}: {
  type: 'plus' | 'minus';
  cx?: number;
  cy?: number;
  scale?: number;
}) {
  const isPlus = type === 'plus';
  const fill = isPlus ? '#595e66' : '#3a8f4c';
  const stroke = isPlus ? '#d6dce5' : '#d2f5d9';

  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
      <path
        d="M -8 5 C -11 5, -13 2.5, -12 0 C -12 -3, -9 -5, -6.5 -4.5 C -5 -8, 1 -9, 4 -5.5 C 7 -6, 10 -3.5, 9.5 0 C 11.5 1.5, 10.5 5, 7.5 5 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      {isPlus ? (
        <g stroke="#ffffff" strokeWidth={2} strokeLinecap="round">
          <line x1={-3.2} y1={0} x2={3.2} y2={0} />
          <line x1={0} y1={-3.2} x2={0} y2={3.2} />
        </g>
      ) : (
        <line x1={-3.5} y1={0} x2={3.5} y2={0} stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" />
      )}
    </g>
  );
}

// ============================================================================
// Resource icon parts (brick stack, steel I-beams)
// ============================================================================

type Vec = [number, number];
const polyPts = (pts: Vec[]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];

/** Brick edges: long axis (right and up), short axis (left and up), height drawn downward. */
const BRICK_A: Vec = [12, -4.5];
const BRICK_B: Vec = [-5.5, -3.5];
const BRICK_H = 4.2;
const BRICK_HOLES: Vec[] = [0.2, 0.5, 0.8].flatMap((u) => [0.3, 0.7].map((v): Vec => [u, v]));

/** One clay brick: top face with its cores, darker end face, lighter long face. `t` is the near top corner. */
function BrickPiece({ t }: { t: Vec }) {
  const down: Vec = [0, BRICK_H];
  const tA = add(t, BRICK_A);
  const tB = add(t, BRICK_B);
  const tAB = add(tA, BRICK_B);
  const holeAngle = (Math.atan2(BRICK_A[1], BRICK_A[0]) * 180) / Math.PI;
  return (
    <g strokeLinejoin="round" stroke="#4a1a0a" strokeWidth={0.7}>
      <polygon points={polyPts([t, tB, add(tB, down), add(t, down)])} fill="#b23a1a" />
      <polygon points={polyPts([t, tA, add(tA, down), add(t, down)])} fill="#ee7e3d" />
      <polygon points={polyPts([t, tA, tAB, tB])} fill="#dc5a2b" />
      <polyline points={polyPts([tB, t, tA])} fill="none" stroke="#f6a066" strokeWidth={0.6} />
      {BRICK_HOLES.map(([u, v], i) => {
        const c = add(t, add(mul(BRICK_A, u), mul(BRICK_B, v)));
        return (
          <ellipse
            key={i}
            cx={c[0]}
            cy={c[1]}
            rx={1}
            ry={0.58}
            transform={`rotate(${holeAngle} ${c[0]} ${c[1]})`}
            fill="#6b1f0c"
            stroke="none"
          />
        );
      })}
    </g>
  );
}

/** Steel I-beam geometry: runs down and to the right, the "I" profile shows at the near end. */
const BEAM_L: Vec = [8.5, 7.5];
const BEAM_W: Vec = [4, -2.6];
const BEAM_DEPTH = 3;
const BEAM_FLANGE = 1.05;

/** One I-beam. `s` is the top-flange corner at the far (upper-left) end. */
function IBeamPiece({ s }: { s: Vec }) {
  const e = add(s, BEAM_L);
  const at = (base: Vec, u: number, d: number): Vec => add(base, add(mul(BEAM_W, u), [0, d]));
  const web0 = 0.34;
  const web1 = 0.66;
  const D = BEAM_DEPTH;
  const F = BEAM_FLANGE;
  return (
    <g strokeLinejoin="round" stroke="#2b3a4b" strokeWidth={0.6}>
      {/* lower flange edge, web (set back), upper flange edge */}
      <polygon points={polyPts([at(s, 0, D - F), at(e, 0, D - F), at(e, 0, D), at(s, 0, D)])} fill="#8ea6bf" />
      <polygon points={polyPts([at(s, web0, F), at(e, web0, F), at(e, web0, D - F), at(s, web0, D - F)])} fill="#5a7089" />
      <polygon points={polyPts([at(s, 0, 0), at(e, 0, 0), at(e, 0, F), at(s, 0, F)])} fill="#9db5cc" />
      {/* top face with a bright strip */}
      <polygon points={polyPts([at(s, 0, 0), at(e, 0, 0), at(e, 1, 0), at(s, 1, 0)])} fill="#bdd2e6" />
      <polygon points={polyPts([at(s, 0.12, 0), at(e, 0.12, 0), at(e, 0.34, 0), at(s, 0.34, 0)])} fill="#e3eef8" stroke="none" />
      {/* the I profile at the near end */}
      <polygon
        points={polyPts([
          at(e, 0, 0),
          at(e, 1, 0),
          at(e, 1, F),
          at(e, web1, F),
          at(e, web1, D - F),
          at(e, 1, D - F),
          at(e, 1, D),
          at(e, 0, D),
          at(e, 0, D - F),
          at(e, web0, D - F),
          at(e, web0, F),
          at(e, 0, F),
        ])}
        fill="#d2e0ee"
      />
    </g>
  );
}

/**
 * Vector Resource & Science Miniature Icon
 */
export function ResourceIconSvg({
  type,
  cx = 0,
  cy = 0,
  scale = 1,
}: {
  type: ResourceType | 'science';
  cx?: number;
  cy?: number;
  scale?: number;
}) {
  switch (type) {
    case 'lumber':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Three stacked logs: bark sides running up and to the right, cut ends (with growth rings) facing us */}
          <g transform="translate(0.6, 1.6)">
          {[
            { x: -3.4, y: -2.6 },
            { x: -6.6, y: 3.0 },
            { x: -0.4, y: 3.0 },
          ].map((log, i) => (
            <g key={i}>
              <path
                d={`M ${log.x} ${log.y - 3.3} L ${log.x + 8.6} ${log.y - 7} L ${log.x + 8.6} ${log.y - 0.4} L ${log.x} ${log.y + 3.3} Z`}
                fill="#8a5a2b"
                stroke="#3d230a"
                strokeWidth={0.9}
                strokeLinejoin="round"
              />
              <path
                d={`M ${log.x + 1.2} ${log.y - 1.6} L ${log.x + 8.2} ${log.y - 4.8} M ${log.x + 1.2} ${log.y + 1.2} L ${log.x + 8.2} ${log.y - 2}`}
                stroke="#5d3b18"
                strokeWidth={0.8}
                strokeLinecap="round"
                fill="none"
              />
              <ellipse cx={log.x} cy={log.y} rx={2.9} ry={3.3} fill="#e4b676" stroke="#3d230a" strokeWidth={0.9} />
              <ellipse cx={log.x} cy={log.y} rx={1.7} ry={2} fill="none" stroke="#a06a33" strokeWidth={0.6} />
              <circle cx={log.x} cy={log.y} r={0.6} fill="#a06a33" />
            </g>
          ))}
          </g>
        </g>
      );
    case 'brick':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Three clay bricks with round cores, stacked like the rulebook card */}
          <g transform="scale(0.82) translate(-0.5, 5.07)">
            <BrickPiece t={add(BRICK_B, [0, 0])} />
            <BrickPiece t={[0, 0]} />
            <BrickPiece t={[1.2, -6.2]} />
          </g>
        </g>
      );
    case 'natural_fiber':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* A big cone of white thread beside a small spool, each on a grey cardboard core */}
          <g transform="translate(-0.7, 0)" stroke="#6f736b" strokeWidth={0.8} strokeLinejoin="round">
            <ellipse cx={-2.6} cy={5.2} rx={4.4} ry={1.7} fill="#9a9d96" />
            <path d="M -5.4 -6.2 L -6.9 5 A 4.3 1.6 0 0 0 1.7 5 L 0.2 -6.2 Z" fill="#f8f8f4" />
            <path d="M -0.4 -6.2 L 0.2 -6.2 L 1.7 5 A 4.3 1.6 0 0 1 -1 6.4 Z" fill="#d5d8d1" stroke="none" />
            <path
              d="M -6.2 -3.2 Q -2.6 -1.6 0.8 -3.2 M -6.5 0 Q -2.6 1.6 1 0 M -6.8 3 Q -2.6 4.6 1.5 3 M -6 2 L 0.5 -4.4"
              fill="none"
              stroke="#c6c9c1"
              strokeWidth={0.7}
              strokeLinecap="round"
            />
            <ellipse cx={-2.6} cy={-6.2} rx={2.9} ry={1.25} fill="#f2f2ee" />
            <ellipse cx={-2.6} cy={-6.2} rx={1.8} ry={0.75} fill="#5d6168" stroke="none" />
            <path d="M 2.2 0.8 L 2 5.6 A 3.2 1.2 0 0 0 8.4 5.6 L 8.2 0.8 Z" fill="#f8f8f4" />
            <path d="M 7 0.8 L 8.2 0.8 L 8.4 5.6 A 3.2 1.2 0 0 1 6.6 6.7 Z" fill="#d5d8d1" stroke="none" />
            <path d="M 2.1 3 Q 5.2 4.2 8.3 3" fill="none" stroke="#c6c9c1" strokeWidth={0.7} strokeLinecap="round" />
            <ellipse cx={5.2} cy={0.8} rx={3} ry={1.1} fill="#f2f2ee" />
            <ellipse cx={5.2} cy={0.8} rx={1.8} ry={0.65} fill="#5d6168" stroke="none" />
            <path d="M 6 7.2 Q 7 8.2 5.8 8.8 Q 4.8 9.4 5.8 10" fill="none" stroke="#8a8d86" strokeWidth={0.6} strokeLinecap="round" />
          </g>
        </g>
      );
    case 'food':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Loaf of bread with two slices cut off in front of it (kept inside the icon box) */}
          <g transform="translate(-1.4, -0.4) scale(0.9)">
          <path
            d="M -9.6 0.6 C -9.8 -4.2, -6 -7.4, -1.4 -7.4 C 3 -7.4, 6.4 -4.4, 6.6 0.2 L 6.6 2.6 C 6.6 4.2, 5.6 5, 4.2 5 L -7.4 5 C -8.8 5, -9.6 4.1, -9.6 2.6 Z"
            fill="#c98a2e"
            stroke="#6b3d0c"
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <path d="M -8.2 -0.6 C -7.6 -4.6, -4.6 -6.4, -1.4 -6.4 C 1.6 -6.4, 4 -5, 5.2 -2.4 C 2.6 -3.8, -3.6 -3.8, -8.2 -0.6 Z" fill="#e8b04e" />
          <path d="M -5.6 -5.4 L -3.8 -2.4 M -2 -6 L -0.2 -3 M 1.6 -5.2 L 3.2 -2.4" stroke="#8b5412" strokeWidth={0.9} strokeLinecap="round" />
          {[
            { x: 2.2, y: 4.4, rot: 10 },
            { x: 6.6, y: 5.2, rot: 22 },
          ].map((slice, i) => (
            <g key={i} transform={`translate(${slice.x}, ${slice.y}) rotate(${slice.rot})`}>
              <path
                d="M -3.9 4.2 L -3.9 -1 C -5.6 -2.2, -4.8 -5.4, -2 -5.8 C -1 -6.4, 1 -6.4, 2 -5.8 C 4.8 -5.4, 5.6 -2.2, 3.9 -1 L 3.9 4.2 Z"
                fill="#fff0c4"
                stroke="#a8641a"
                strokeWidth={1.1}
                strokeLinejoin="round"
              />
              <path
                d="M -2.6 3 L -2.6 -1.4 C -3.8 -2.6, -3.2 -4.4, -1.4 -4.6 C -0.6 -5, 0.6 -5, 1.4 -4.6 C 3.2 -4.4, 3.8 -2.6, 2.6 -1.4 L 2.6 3 Z"
                fill="#f6d78a"
                opacity={0.6}
              />
            </g>
          ))}
          </g>
        </g>
      );
    case 'steel':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Three steel I-beams lying side by side (farthest first), the I profile at their near ends */}
          <g transform="scale(0.9)">
            {[2, 1, 0].map((i) => (
              <IBeamPiece key={i} s={[-10.95 + i * 4.72, -0.9 - i * 3.07]} />
            ))}
          </g>
        </g>
      );
    case 'science':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Glowing Lightbulb */}
          <circle cx={0} cy={-2} r={5.5} fill="#fff7b2" stroke="#bfa124" strokeWidth={1.2} />
          <rect x={-2.5} y={3} width={5} height={3.5} rx={1} fill="#8c96a3" stroke="#2d343d" strokeWidth={1} />
          <line x1={0} y1={-4} x2={0} y2={0} stroke="#f0b418" strokeWidth={1.4} />
        </g>
      );
  }
}

/**
 * Event icons (drawn in a ~20-unit box centred on 0,0) for the seven event tracks.
 */
export function EventIconSvg({ type, scale = 1 }: { type: string; scale?: number }) {
  const ink = '#1f2a33';
  return (
    <g transform={`scale(${scale})`} aria-hidden="true">
      {type === 'airPollution' && (
        <g>
          <path
            d="M -7 5 C -11 5, -11 -1, -7 -1 C -7 -6, 0 -8, 2 -3 C 6 -6, 10 -2, 8 2 C 10 3, 9 6, 6 6 Z"
            fill="#9aa1a8"
            stroke={ink}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <path d="M -4 8 Q -2 10, 0 8 Q 2 6, 4 8" fill="none" stroke={ink} strokeWidth={1.1} strokeLinecap="round" />
        </g>
      )}
      {type === 'environmentalPollution' && (
        <g>
          <path d="M 0 -9 C 4 -3, 7 0, 7 3.5 C 7 7.5, 3.5 9.5, 0 9.5 C -3.5 9.5, -7 7.5, -7 3.5 C -7 0, -4 -3, 0 -9 Z" fill="#4b4560" stroke={ink} strokeWidth={1.2} />
          <path d="M -4 4 Q -2 2, 0 4 Q 2 6, 4 4" fill="none" stroke="#c9b8ff" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      )}
      {type === 'rainAndFlooding' && (
        <g>
          <path
            d="M -7 2 C -11 2, -11 -4, -7 -4 C -7 -9, 0 -10, 2 -6 C 6 -9, 10 -5, 8 -1 C 10 0, 9 3, 6 3 Z"
            fill="#7fb8e6"
            stroke={ink}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          {[-5, 0, 5].map((x) => (
            <path key={x} d={`M ${x} 5 l -1.5 4`} stroke="#1f78c1" strokeWidth={1.8} strokeLinecap="round" />
          ))}
        </g>
      )}
      {type === 'productionIncrease' && (
        <g>
          <path d="M -9 8 L -9 -1 L -4 2 L -4 -1 L 1 2 L 1 -6 L 4 -6 L 5 2 L 9 2 L 9 8 Z" fill="#8c6a4e" stroke={ink} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M 2.5 -8 C 2 -10, 5 -11, 6 -9" fill="none" stroke="#9aa1a8" strokeWidth={1.4} strokeLinecap="round" />
          <path d="M -6 -8 L -6 -3 M -8.5 -5.5 L -6 -8 L -3.5 -5.5" fill="none" stroke="#c9302c" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {type === 'climateConference' && (
        <g>
          <circle r={8.5} fill="#5fb3e8" stroke={ink} strokeWidth={1.2} />
          <path d="M -6 -3 C -3 -5, -1 -2, -3 1 C -5 3, -2 6, 0 7 M 2 -7 C 5 -5, 3 -2, 6 -1" fill="none" stroke="#2f9a53" strokeWidth={2} strokeLinecap="round" />
          <ellipse rx={8.5} ry={3.4} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.45} />
        </g>
      )}
      {type === 'sustainableProduction' && (
        <g>
          <line x1={0} y1={0} x2={0} y2={10} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
          {[-90, 30, 150].map((deg) => (
            <path
              key={deg}
              d="M 0 0 C 2 -2, 2.5 -6, 0 -9.5 C -1.5 -6, -1.5 -2, 0 0 Z"
              transform={`rotate(${deg + 90})`}
              fill="#e9f6ee"
              stroke={ink}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ))}
          <circle r={1.6} fill="#2f9a53" stroke={ink} strokeWidth={0.8} />
        </g>
      )}
      {type === 'governmentFunding' && (
        <g>
          <path d="M -9 -3 L 0 -9 L 9 -3 Z" fill="#e8dcc0" stroke={ink} strokeWidth={1.2} strokeLinejoin="round" />
          {[-6, -2, 2, 6].map((x) => (
            <rect key={x} x={x - 1} y={-2} width={2} height={8} fill="#e8dcc0" stroke={ink} strokeWidth={0.8} />
          ))}
          <rect x={-9.5} y={6} width={19} height={2.6} rx={0.6} fill="#e8dcc0" stroke={ink} strokeWidth={1} />
        </g>
      )}
    </g>
  );
}

/** A wooden event disc as drawn from the bag: brown (pollution) or green (sustainable). */
export function EventDiscSvg({
  type,
  green,
  r = 20,
}: {
  type: string;
  green: boolean;
  r?: number;
}) {
  const face = green ? '#2f8f47' : '#8a5a3a';
  const side = green ? '#1d6631' : '#5e3a22';
  const depth = r * 0.22;
  return (
    <g data-token="event-disc">
      <ellipse cx={r * 0.12} cy={depth + r * 0.16} rx={r} ry={r * 0.96} fill="rgba(10,14,20,0.35)" />
      <ellipse cx={0} cy={depth} rx={r} ry={r * 0.96} fill={side} />
      <rect x={-r} y={0} width={r * 2} height={depth} fill={side} />
      <ellipse cx={0} cy={0} rx={r} ry={r * 0.96} fill={face} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
      <circle r={r * 0.68} fill="#fbf6ea" stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
      <EventIconSvg type={type} scale={r / 15} />
    </g>
  );
}
