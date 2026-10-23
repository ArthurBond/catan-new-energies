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
      <linearGradient id="hazard-top" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#b4b6ba" style={{ stopColor: '#b4b6ba' }} />
        <stop offset="100%" stopColor="#85888d" style={{ stopColor: '#85888d' }} />
      </linearGradient>
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

const HAZARD_TEETH = 8;

/** Cog outline (8 rounded teeth) plus a centre hole, drawn with the even-odd rule. */
function hazardCogPath(outer: number, root: number, hole: number): string {
  const pitch = 360 / HAZARD_TEETH;
  const pts: string[] = [];
  for (let k = 0; k < HAZARD_TEETH; k++) {
    const a = k * pitch;
    pts.push(fmt(polar(root, a - pitch * 0.5)));
    pts.push(fmt(polar(root, a - pitch * 0.27)));
    pts.push(fmt(polar(outer, a - pitch * 0.17)));
    pts.push(fmt(polar(outer, a + pitch * 0.17)));
    pts.push(fmt(polar(root, a + pitch * 0.27)));
  }
  const h = hole.toFixed(2);
  return (
    `M ${pts.join(' L ')} Z ` +
    `M ${h} 0 A ${h} ${h} 0 1 0 -${h} 0 A ${h} ${h} 0 1 0 ${h} 0 Z`
  );
}

/**
 * Hazard token — the grey cardboard cog from the box, with a hole in the middle so the number
 * disc (on a hex) or the player's piece (on a town/city) shows through it.
 * `r` is the outer tooth radius; `holeRatio` sizes the centre hole.
 */
export function HazardCogSvg({
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
  const d = hazardCogPath(r, r * 0.8, r * holeRatio);
  const depth = Math.max(1.5, r * 0.13);
  return (
    <g transform={`translate(${cx}, ${cy})`} data-token="hazard">
      <path
        d={d}
        fillRule="evenodd"
        transform={`translate(${(r * 0.12).toFixed(2)}, ${(depth + r * 0.12).toFixed(2)})`}
        fill="rgba(10, 14, 20, 0.38)"
      />
      <Extrusion d={d} depth={depth} fill="#63666b" stroke="#3f4247" rotateDeg={0} fillRule="evenodd" />
      <path
        d={d}
        fillRule="evenodd"
        fill="url(#hazard-top) #96989d"
        stroke="#4a4d52"
        strokeWidth={Math.max(0.8, r * 0.06)}
        strokeLinejoin="round"
      />
      {/* Pressed-felt speckle texture */}
      <path d={d} fillRule="evenodd" fill="url(#hazard-speckle) transparent" opacity={0.85} />
      {/* Rim light along the upper-left teeth */}
      <path
        d={hazardCogPath(r * 0.9, r * 0.72, r * holeRatio * 1.12)}
        fillRule="evenodd"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.22}
        strokeWidth={Math.max(0.6, r * 0.05)}
        strokeLinejoin="round"
      />
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
          {/* 3D Wood Beam / Log */}
          <polygon
            points="-9,2 3,-7 9,-3 -3,6"
            fill="#8c5828"
            stroke="#3d230a"
            strokeWidth={1.1}
          />
          <ellipse cx={-6} cy={4} rx={3.2} ry={2.5} fill="#cfa068" stroke="#3d230a" strokeWidth={1} />
        </g>
      );
    case 'brick':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Terracotta Bricks */}
          <rect x={-8} y={-2} width={11} height={6} rx={1} fill="#c85a38" stroke="#4f1c0b" strokeWidth={1} />
          <rect x={-3} y={-6} width={11} height={6} rx={1} fill="#df7350" stroke="#4f1c0b" strokeWidth={1} />
        </g>
      );
    case 'natural_fiber':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Spool of White/Green Natural Fiber */}
          <ellipse cx={0} cy={5} rx={5.5} ry={2} fill="#7a5835" stroke="#3a2510" strokeWidth={1} />
          <path d="M -4.5 5 L -3.5 -5 L 3.5 -5 L 4.5 5 Z" fill="#f2f4ee" stroke="#5c6354" strokeWidth={1} />
          <ellipse cx={0} cy={-5} rx={4} ry={1.8} fill="#9c7348" stroke="#3a2510" strokeWidth={1} />
        </g>
      );
    case 'food':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Golden Wheat Sheaf / Grain Stalks */}
          <path
            d="M -4 6 L 3 -6 M -1 6 L 0 -7 M 3 6 L -3 -6"
            stroke="#b7791f"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <ellipse cx={-3.2} cy={-4.2} rx={2.2} ry={3.8} transform="rotate(-22 -3.2 -4.2)" fill="#f6e05e" stroke="#744210" strokeWidth={0.9} />
          <ellipse cx={0} cy={-5.2} rx={2.2} ry={4.0} fill="#ecc94b" stroke="#744210" strokeWidth={0.9} />
          <ellipse cx={3.2} cy={-4.2} rx={2.2} ry={3.8} transform="rotate(22 3.2 -4.2)" fill="#f6e05e" stroke="#744210" strokeWidth={0.9} />
          {/* Tie ribbon */}
          <rect x={-3.2} y={1.2} width={6.4} height={2.2} rx={1} fill="#c53030" />
        </g>
      );
    case 'steel':
      return (
        <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
          {/* Steel I-Beam */}
          <polygon
            points="-9,3 4,-6 9,-2 -4,7"
            fill="#7a8899"
            stroke="#242c36"
            strokeWidth={1.1}
          />
          <line x1={-6} y1={4} x2={6} y2={-4} stroke="#cbd5e0" strokeWidth={1.4} />
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
