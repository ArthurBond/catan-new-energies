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

/**
 * 3D Wooden Town piece with 1 concave circular power-plant socket that rotates to lock around the attached Power Plant
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
  const p = PLAYER_THEMES[playerId];
  // In local coordinates, the concave socket is centered at (13.5, 0) with radius 8.0
  // so a Power Plant cylinder (r=7.6) at distance 13.5 along cutoutAngleDeg locks snugly into the crescent notch.
  const pathD =
    'M 9.3 -6.8 A 8.0 8.0 0 0 0 9.3 6.8 L 1.5 11.8 L -9.5 9.2 L -12.2 0 L -9.5 -9.2 L 1.5 -11.8 Z';
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
      <g transform={`rotate(${cutoutAngleDeg})`}>
        {/* Drop shadow */}
        <path d={pathD} transform="translate(1.8, 2.8)" fill="rgba(0,0,0,0.36)" />
        {/* High-contrast outer halo for dark pieces */}
        <path
          d={pathD}
          transform="translate(0, 1.2)"
          fill={p.sideFill}
          stroke={p.outerHalo}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        {/* 3D Side Extrusion */}
        <path
          d={pathD}
          transform="translate(0, 1.8)"
          fill={p.sideFill}
          stroke={p.stroke}
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
        {/* Top Wooden Face */}
        <path
          d={pathD}
          fill={p.fill}
          stroke={p.stroke}
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
        {/* Top Bevel Highlight */}
        <path
          d="M -7.5 -7.2 L 1 -9.5 L 6.8 -6"
          fill="none"
          stroke={p.highlight}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </g>
      {showEmblem && <PlayerEmblemSvg playerId={playerId} cx={-1.5} cy={0} r={4.1} />}
    </g>
  );
}

/**
 * Builds the 3-lobed City path with 3 concave circular sockets spaced at exact 120-degree intervals (0°, 120°, 240°),
 * each centered at distance 13.5 from (0,0) with socket radius 8.0 so up to 3 Power Plants lock into the 3 hex corners.
 */
const CITY_120_PATH_D = (() => {
  const R_OUTER = 12.2;
  const halfSpanRad = (32 * Math.PI) / 180; // 32 deg half-angle on each side of 0°, 120°, 240°
  const lobeHalfRad = (14 * Math.PI) / 180;
  const cmds: string[] = [];

  for (let i = 0; i < 3; i++) {
    const cRad = (i * 120 * Math.PI) / 180;
    const lobeRad = ((i * 120 + 60) * Math.PI) / 180;

    // Socket entry & exit points on the outer ring
    const sx1 = Math.cos(cRad - halfSpanRad) * R_OUTER;
    const sy1 = Math.sin(cRad - halfSpanRad) * R_OUTER;
    const sx2 = Math.cos(cRad + halfSpanRad) * R_OUTER;
    const sy2 = Math.sin(cRad + halfSpanRad) * R_OUTER;

    // Lobe shoulder points between sockets (at +60°, +180°, +300°)
    const lx1 = Math.cos(lobeRad - lobeHalfRad) * (R_OUTER + 1.4);
    const ly1 = Math.sin(lobeRad - lobeHalfRad) * (R_OUTER + 1.4);
    const lx2 = Math.cos(lobeRad + lobeHalfRad) * (R_OUTER + 1.4);
    const ly2 = Math.sin(lobeRad + lobeHalfRad) * (R_OUTER + 1.4);

    if (i === 0) {
      cmds.push(`M ${sx1.toFixed(2)} ${sy1.toFixed(2)}`);
    } else {
      cmds.push(`L ${sx1.toFixed(2)} ${sy1.toFixed(2)}`);
    }
    // Concave circular socket of radius 8.0 curving inward around the power plant center at distance 13.5
    cmds.push(`A 8.0 8.0 0 0 0 ${sx2.toFixed(2)} ${sy2.toFixed(2)}`);
    // Outward architectural city wing between the 120° sockets
    cmds.push(`L ${lx1.toFixed(2)} ${ly1.toFixed(2)}`);
    cmds.push(`L ${lx2.toFixed(2)} ${ly2.toFixed(2)}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
})();

/**
 * 3D Wooden City piece with 3 concave power-plant sockets at exact 120° intervals
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
  const p = PLAYER_THEMES[playerId];
  const pathD = CITY_120_PATH_D;
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
      <g transform={`rotate(${cutoutAngleDeg})`}>
        {/* Drop shadow */}
        <path d={pathD} transform="translate(2.2, 3.2)" fill="rgba(0,0,0,0.38)" />
        {/* High-contrast outer halo */}
        <path
          d={pathD}
          transform="translate(0, 1.4)"
          fill={p.sideFill}
          stroke={p.outerHalo}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        {/* 3D Side Extrusion */}
        <path
          d={pathD}
          transform="translate(0, 2.0)"
          fill={p.sideFill}
          stroke={p.stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        {/* Top Wooden Face */}
        <path
          d={pathD}
          fill={p.fill}
          stroke={p.stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        {/* Inner roof turret ring */}
        <circle
          cx={0}
          cy={0}
          r={5.8}
          fill={p.highlight}
          fillOpacity={0.28}
          stroke={p.stroke}
          strokeWidth={0.8}
        />
      </g>
      {showEmblem && <PlayerEmblemSvg playerId={playerId} cx={0} cy={0} r={4.5} />}
    </g>
  );
}

/**
 * 3D Wooden Power Plant Cylinder (Fossil dark-brown or Renewable bright-green) with yellow lightning bolt
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

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      {/* Optional Green Event Disc underneath (on player mat renewable slots) */}
      {hasGreenDiscUnderneath && (
        <g transform="translate(-1.5, 2.2)">
          <circle r={r * 1.18} fill="rgba(0,0,0,0.28)" cx={1.5} cy={2} />
          <circle
            r={r * 1.16}
            fill="#88b858"
            stroke="#d8ecc2"
            strokeWidth={1.4}
          />
          <circle
            r={r * 0.96}
            fill="none"
            stroke="#5a8732"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        </g>
      )}

      {/* Cylinder Shadow */}
      <ellipse cx={1.8} cy={3.2} rx={r} ry={r * 0.92} fill="rgba(0,0,0,0.38)" />

      {/* Cylinder 3D Body */}
      <ellipse
        cx={0}
        cy={2}
        rx={r}
        ry={r * 0.92}
        fill={style.fill}
        stroke="#1a1410"
        strokeWidth={1.2}
      />

      {/* Cylinder Top Face */}
      <ellipse
        cx={0}
        cy={-0.8}
        rx={r}
        ry={r * 0.9}
        fill={style.topFill}
        stroke={style.stroke}
        strokeWidth={1.3}
      />

      {/* Yellow Lightning Bolt */}
      <polygon
        points={`${-r * 0.15},${-r * 0.65} ${r * 0.35},${-r * 0.65} ${r * 0.05},${-r * 0.08} ${r * 0.42},${-r * 0.08} ${-r * 0.28},${r * 0.58} ${-r * 0.05},${0.05} ${-r * 0.38},${0.05}`}
        fill={style.bolt}
        stroke="#261c00"
        strokeWidth={0.7}
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * Natural Hazard Token — Glossy Crude Oil Spill / Toxic Pollution Slick (replaces old gear icon)
 */
export function HazardCogSvg({
  cx,
  cy,
  r = 14,
}: {
  cx: number;
  cy: number;
  r?: number;
}) {
  const s = r / 14;
  // Organic wavy multi-lobed oil spill puddle path
  const spillPath =
    'M -3 -13.5 C 2 -15, 6 -11, 9.5 -12 C 13 -13, 15.5 -8.5, 13 -4.5 C 11 -1.5, 15.5 2, 14 6.5 C 12.5 11, 7.5 10.5, 4.5 13.5 C 1.5 16.5, -3.5 14, -7 12.5 C -10.5 11, -14.5 12, -14.5 7 C -14.5 3, -11.5 0.5, -13.5 -3.5 C -15.5 -7.5, -11.5 -12.5, -7.5 -11.5 C -5 -11, -5.5 -12.5, -3 -13.5 Z';

  return (
    <g transform={`translate(${cx}, ${cy}) scale(${s})`}>
      {/* Soft dark outer oil stain shadow */}
      <path d={spillPath} transform="translate(1.4, 2.0)" fill="rgba(0, 0, 0, 0.48)" />

      {/* Main glossy pitch-black crude oil puddle */}
      <path
        d={spillPath}
        fill="#14171f"
        stroke="#3b4252"
        strokeWidth={1.3}
        strokeLinejoin="round"
      />

      {/* Iridescent petrol-slick rainbow sheen bands (teal / violet / amber oil film) */}
      <path
        d="M -8 -8 C -3 -11, 5 -9, 9 -5 C 11 -2, 8 3, 10 6 C 7 9, 1 11, -5 9 C -10 7, -11 1, -8 -8 Z"
        fill="none"
        stroke="#4fd1c5"
        strokeWidth={1.3}
        strokeOpacity={0.65}
        strokeLinecap="round"
      />
      <path
        d="M -6 -5 C -1 -8, 6 -6, 7 -1 C 8 4, 3 8, -3 7 C -8 6, -9 0, -6 -5 Z"
        fill="none"
        stroke="#b794f4"
        strokeWidth={1.2}
        strokeOpacity={0.6}
        strokeLinecap="round"
      />

      {/* Specular liquid gloss highlights */}
      <path
        d="M -7 -7.5 Q -2 -10.5, 4 -8"
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.75}
      />
      <circle cx={8.5} cy={-6.5} r={1.3} fill="#ffffff" opacity={0.7} />

      {/* Satellite oil splatter droplets around the puddle perimeter */}
      <circle cx={-14.5} cy={-8.5} r={2.1} fill="#14171f" stroke="#4fd1c5" strokeWidth={0.7} />
      <circle cx={15.2} cy={-1.2} r={1.8} fill="#14171f" stroke="#b794f4" strokeWidth={0.7} />
      <circle cx={9.5} cy={12.8} r={2.2} fill="#14171f" stroke="#4fd1c5" strokeWidth={0.7} />
      <circle cx={-11.8} cy={11.5} r={1.6} fill="#14171f" />

      {/* Translucent center ring so underlying hex number disc remains visible */}
      <circle
        r={5.2}
        fill="rgba(16, 20, 28, 0.52)"
        stroke="#f6ad55"
        strokeWidth={1.1}
        strokeDasharray="2.5 1.8"
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
