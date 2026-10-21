/**
 * CATAN: New Energies — Shared 3D Wooden Pieces, Resource Icons & Accessibility Badges
 */

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
 * 3D Wooden Town piece with 1 circular power-plant cutout indention (matching player-mat-reference.png)
 */
export function TownPieceSvg({
  playerId,
  cx,
  cy,
  scale = 1,
  showEmblem = true,
}: {
  playerId: PlayerId;
  cx: number;
  cy: number;
  scale?: number;
  showEmblem?: boolean;
}) {
  const p = PLAYER_THEMES[playerId];
  // Hexagonal-house wooden block with 1 concave circular cutout on its upper-right edge
  const pathD =
    'M -11 -4 L -2 -13 L 5 -9 A 5.5 5.5 0 0 0 11 -1 L 11 9 L 0 13 L -11 8 Z';
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
      {/* Drop shadow */}
      <path d={pathD} transform="translate(2, 3.2)" fill="rgba(0,0,0,0.34)" />
      {/* High-contrast outer halo for dark pieces */}
      <path
        d={pathD}
        transform="translate(0, 1.5)"
        fill={p.sideFill}
        stroke={p.outerHalo}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      {/* 3D Side Extrusion */}
      <path
        d={pathD}
        transform="translate(0, 2)"
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
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      {/* Top Bevel Highlight */}
      <path
        d="M -9 -3 L -2 -10.5 L 3.5 -7.5"
        fill="none"
        stroke={p.highlight}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {showEmblem && <PlayerEmblemSvg playerId={playerId} cx={-1} cy={1} r={4.2} />}
    </g>
  );
}

/**
 * 3D Wooden City piece with 3 circular power-plant cutout indentions around its perimeter
 */
export function CityPieceSvg({
  playerId,
  cx,
  cy,
  scale = 1,
  showEmblem = true,
}: {
  playerId: PlayerId;
  cx: number;
  cy: number;
  scale?: number;
  showEmblem?: boolean;
}) {
  const p = PLAYER_THEMES[playerId];
  // Star-clustered wooden city block with 3 semicircular cutouts
  const pathD =
    'M -5 -15 L 5 -15 L 8 -10 A 5.5 5.5 0 0 0 14 -3 L 16 3 L 11 11 A 5.5 5.5 0 0 0 2 14 L -3 15 L -11 11 A 5.5 5.5 0 0 0 -14 1 L -15 -5 L -9 -11 Z';
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
      {/* Drop shadow */}
      <path d={pathD} transform="translate(2.5, 3.8)" fill="rgba(0,0,0,0.38)" />
      {/* High-contrast outer halo */}
      <path
        d={pathD}
        transform="translate(0, 1.8)"
        fill={p.sideFill}
        stroke={p.outerHalo}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      {/* 3D Side Extrusion */}
      <path
        d={pathD}
        transform="translate(0, 2.5)"
        fill={p.sideFill}
        stroke={p.stroke}
        strokeWidth={1.5}
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
      {/* Inner roof ridge details */}
      <circle cx={0} cy={0} r={6.8} fill={p.highlight} fillOpacity={0.25} stroke={p.stroke} strokeWidth={0.8} />
      {showEmblem && <PlayerEmblemSvg playerId={playerId} cx={0} cy={0} r={5} />}
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
 * 8-Tooth Grey Cog Hazard Token (with translucent center hole)
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
  const teeth = 8;
  const outerR = r;
  const innerToothR = r * 0.76;
  const holeR = r * 0.42;

  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const angle1 = ((i * Math.PI) / teeth) - Math.PI / (teeth * 2);
    const angle2 = ((i * Math.PI) / teeth) + Math.PI / (teeth * 2);
    const rad = i % 2 === 0 ? outerR : innerToothR;
    pts.push(`${(Math.cos(angle1) * rad).toFixed(2)},${(Math.sin(angle1) * rad).toFixed(2)}`);
    pts.push(`${(Math.cos(angle2) * rad).toFixed(2)},${(Math.sin(angle2) * rad).toFixed(2)}`);
  }

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      {/* Drop Shadow */}
      <polygon points={pts.join(' ')} transform="translate(1.8, 2.5)" fill="rgba(0,0,0,0.36)" />
      {/* Cog Ring */}
      <polygon
        points={pts.join(' ')}
        fill={TABLETOP_THEME.tokens.hazard.fill}
        stroke={TABLETOP_THEME.tokens.hazard.stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <circle
        r={innerToothR * 0.86}
        fill="none"
        stroke={TABLETOP_THEME.tokens.hazard.innerFill}
        strokeWidth={1.2}
        strokeDasharray="2.5 2"
      />
      {/* Center Cutout Ring */}
      <circle
        r={holeR}
        fill="rgba(25, 28, 32, 0.55)"
        stroke={TABLETOP_THEME.tokens.hazard.stroke}
        strokeWidth={1.3}
      />
    </g>
  );
}

/**
 * 3D Grey Wooden Environmental Inspector Pawn
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
      {/* Shadow */}
      <ellipse cx={2.5} cy={9} rx={11} ry={6.5} fill="rgba(0,0,0,0.4)" />
      {/* Wooden Base */}
      <ellipse
        cx={0}
        cy={7}
        rx={10.5}
        ry={6}
        fill={TABLETOP_THEME.tokens.inspector.base}
        stroke="#1e2024"
        strokeWidth={1.3}
      />
      <ellipse
        cx={0}
        cy={5}
        rx={9.5}
        ry={5}
        fill={TABLETOP_THEME.tokens.inspector.body}
        stroke="#2c2f36"
        strokeWidth={1}
      />
      {/* Pawn Torso */}
      <path
        d="M -6.5 5 C -6 -4, -3.5 -8, -3 -11 L 3 -11 C 3.5 -8, 6 -4, 6.5 5 Z"
        fill={TABLETOP_THEME.tokens.inspector.body}
        stroke="#22252a"
        strokeWidth={1.3}
      />
      {/* Pawn Collar & Head */}
      <ellipse cx={0} cy={-10.5} rx={5.2} ry={2} fill={TABLETOP_THEME.tokens.inspector.highlight} stroke="#22252a" strokeWidth={1} />
      <circle
        cx={0}
        cy={-15.5}
        r={5.5}
        fill={TABLETOP_THEME.tokens.inspector.highlight}
        stroke="#22252a"
        strokeWidth={1.3}
      />
      {/* Specular highlight */}
      <circle cx={-1.8} cy={-17.2} r={1.6} fill="#ffffff" fillOpacity={0.75} />
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
          {/* Golden Harvest Bread / Grain */}
          <rect x={-8} y={-3} width={12} height={7} rx={3} fill="#e8ba38" stroke="#5c4206" strokeWidth={1.1} />
          <ellipse cx={4} cy={2} rx={4} ry={2.5} fill="#f5d469" stroke="#5c4206" strokeWidth={1} />
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
