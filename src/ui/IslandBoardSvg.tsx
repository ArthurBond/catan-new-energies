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
import {
  EdgeId,
  EventDiscType,
  GameState,
  HexId,
  NodeId,
  TerrainType,
} from '../engine/types';
import { SeaFrameSvg } from './SeaFrameSvg';
import {
  getNumberDiscPips,
  getPointyHexPoints,
  HEX_RADIUS,
  hexCoordToSvg,
  latticeToSvg,
  PLAYER_THEMES,
  TABLETOP_THEME,
  TERRAIN_THEMES,
} from './theme';
import {
  CityPieceSvg,
  HazardCogSvg,
  InspectorPawnSvg,
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
  onHexClick?: (hexId: HexId) => void;
  onNodeClick?: (nodeId: NodeId) => void;
  onEdgeClick?: (edgeId: EdgeId) => void;
  onCutoutClick?: (nodeId: NodeId, hexId: HexId) => void;
  onSelectEventTrackInfo?: (track: EventDiscType) => void;
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
            {/* Deep forest patches */}
            <circle cx={-18} cy={-14} r={26} fill={theme.secondaryFill} />
            <circle cx={20} cy={12} r={28} fill={theme.accentFill} />
            {/* Winding logging trail */}
            <path
              d="M -35 28 Q -10 10, 0 -5 T 32 -32"
              fill="none"
              stroke="#7a6348"
              strokeWidth={5}
              strokeLinecap="round"
              opacity={0.7}
            />
            {/* Conifer tree canopies */}
            {[
              [-24, -18],
              [-10, -28],
              [14, -22],
              [26, -8],
              [-28, 8],
              [18, 22],
              [-8, 28],
            ].map(([tx, ty], idx) => (
              <g key={idx} transform={`translate(${tx}, ${ty})`}>
                <circle cx={1} cy={2} r={8.5} fill="rgba(0,0,0,0.28)" />
                <polygon points="0,-10 7,3 -7,3" fill="#3f704d" stroke="#182e1f" strokeWidth={0.8} />
                <polygon points="0,-14 5.5,-3 -5.5,-3" fill="#528c63" />
              </g>
            ))}
          </g>
        )}

        {terrain === 'hills' && (
          <g>
            {/* Stepped concentric terracotta quarry terraces */}
            <ellipse cx={4} cy={4} rx={42} ry={34} fill={theme.secondaryFill} stroke={theme.accentFill} strokeWidth={2} />
            <ellipse cx={2} cy={2} rx={31} ry={25} fill={theme.primaryFill} stroke={theme.accentFill} strokeWidth={2.2} />
            <ellipse cx={0} cy={0} rx={20} ry={16} fill={theme.accentFill} stroke="#6e2e16" strokeWidth={2} />
            {/* Quarry road & brick stacks */}
            <path d="M 0 14 L 18 36" stroke="#e09a7e" strokeWidth={4.5} strokeLinecap="round" />
            <rect x={-26} y={-22} width={10} height={6} rx={1} fill="#e07a56" stroke="#5c220e" strokeWidth={0.8} />
            <rect x={16} y={-20} width={10} height={6} rx={1} fill="#e07a56" stroke="#5c220e" strokeWidth={0.8} />
          </g>
        )}

        {terrain === 'pasture' && (
          <g>
            {/* Patchwork meadow paddocks */}
            <polygon points="-55,-10 10,-55 55,5 -10,55" fill={theme.secondaryFill} opacity={0.65} />
            <path
              d="M -45 -18 L 45 18 M -18 45 L 18 -45"
              stroke={theme.accentFill}
              strokeWidth={2.2}
              strokeDasharray="6 3"
            />
            {/* Grazing fiber/sheep tufts */}
            {[
              [-22, -16],
              [20, -18],
              [-20, 20],
              [22, 16],
            ].map(([sx, sy], i) => (
              <g key={i} transform={`translate(${sx}, ${sy})`}>
                <ellipse cx={0} cy={0} rx={4.5} ry={3.2} fill="#f4f6f0" stroke="#4a6324" strokeWidth={0.8} />
                <circle cx={-2.5} cy={-1} r={2.2} fill="#ffffff" />
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

            {/* Mini Harvester Tractor along the lower-left swath */}
            <g transform="translate(-14, 24) rotate(28)">
              <rect x={-5} y={-3} width={10} height={6} rx={1.5} fill="#2f6f3e" stroke="#1a3d22" strokeWidth={0.8} />
              <rect x={-2} y={-2} width={4} height={4} rx={0.8} fill="#e2e8f0" />
              <rect x={5} y={-5.5} width={2.5} height={11} rx={0.8} fill="#b84a27" />
            </g>
          </g>
        )}

        {terrain === 'mountains' && (
          <g>
            {/* Faceted geometric slate ridges */}
            <polygon points="-42,32 -14,-34 14,32" fill={theme.accentFill} />
            <polygon points="-14,-34 14,32 -8,32" fill={theme.secondaryFill} />
            <polygon points="-8,35 20,-28 46,35" fill={theme.accentFill} />
            <polygon points="20,-28 46,35 22,35" fill={theme.secondaryFill} />
            {/* Crisp snow caps */}
            <polygon points="-14,-34 -4,-12 -14,-16 -22,-12" fill="#edf2f7" />
            <polygon points="20,-28 29,-9 20,-13 12,-9" fill="#edf2f7" />
            {/* Mine portal */}
            <rect x={-26} y={14} width={12} height={11} rx={2} fill="#1f242b" stroke="#a0aec0" strokeWidth={1.2} />
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
      </g>
    </g>
  );
}

export function IslandBoardSvg({
  state,
  highlightedHexIds,
  producingHexIds,
  highlightedNodeIds,
  highlightedEdgeIds,
  highlightedCutoutSlots,
  onHexClick,
  onNodeClick,
  onEdgeClick,
  onCutoutClick,
  onSelectEventTrackInfo,
}: IslandBoardSvgProps) {
  const { board } = state;

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
              tabIndex={0}
              aria-label={`Hex ${hex.id}: ${hex.terrain}${hex.numberDisc ? ` number ${hex.numberDisc}` : ''}${hex.hasHazard ? ', has hazard' : ''}${hex.hasInspector ? ', has Environmental Inspector' : ''}`}
              style={{ cursor: isHighlighted ? 'pointer' : 'default' }}
            >
              {/* Vector Terrain Illustration */}
              <TerrainArtworkSvg terrain={hex.terrain} hexId={hex.id} />

              {/* Hex Hazard Cog (drawn underneath or framing the number disc so number stays legible) */}
              {hex.hasHazard && (
                <g data-testid={`hex-hazard-${hex.id}`}>
                  <HazardCogSvg cx={0} cy={0} r={24} />
                </g>
              )}

              {/* Cream Circular Number Disc (diameter 34 SVG units -> >= 28px on screen) */}
              {hex.numberDisc !== null && (
                <g data-testid={`number-disc-${hex.id}`}>
                  {/* Drop shadow */}
                  <circle cx={1.5} cy={2.5} r={17} fill="rgba(0,0,0,0.32)" />
                  {/* Cream disc */}
                  <circle
                    cx={0}
                    cy={0}
                    r={17}
                    fill={TABLETOP_THEME.board.numberDiscFill}
                    stroke={isHighProb ? TABLETOP_THEME.board.numberDiscRed : TABLETOP_THEME.board.numberDiscStroke}
                    strokeWidth={isHighProb ? 2 : 1.4}
                  />
                  {/* Double ring for high-probability 6 and 8 */}
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
                  {/* Bold Numeral */}
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fontSize="15"
                    fontWeight="900"
                    fill={
                      isHighProb
                        ? TABLETOP_THEME.board.numberDiscRed
                        : TABLETOP_THEME.board.numberDiscCharcoal
                    }
                  >
                    {hex.numberDisc}
                  </text>
                  {/* Probability Pips */}
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
                          fill={
                            isHighProb
                              ? TABLETOP_THEME.board.numberDiscRed
                              : TABLETOP_THEME.board.numberDiscCharcoal
                          }
                        />
                      );
                    })}
                  </g>
                </g>
              )}

              {/* 3D Grey Environmental Inspector Pawn */}
              {hex.hasInspector && (
                <InspectorPawnSvg
                  cx={hex.numberDisc !== null ? 16 : 0}
                  cy={hex.numberDisc !== null ? -8 : 2}
                  scale={1.05}
                />
              )}

              {/* Production Roll Highlight Glow */}
              {isProducing && (
                <g data-testid={`hex-producing-${hex.id}`} pointerEvents="none">
                  <polygon
                    points={getPointyHexPoints(0, 0, HEX_RADIUS - 5)}
                    fill="rgba(246, 224, 94, 0.28)"
                    stroke="#f6e05e"
                    strokeWidth={4}
                  />
                  <circle
                    cx={0}
                    cy={0}
                    r={21}
                    fill="none"
                    stroke="#f6e05e"
                    strokeWidth={3}
                  />
                </g>
              )}

              {/* Interactive Hex Highlight Overlay (Move Inspector / Clean Hazard / High Yield) */}
              {isHighlighted && (
                <g data-testid={`hex-target-${hex.id}`}>
                  <polygon
                    points={getPointyHexPoints(0, 0, HEX_RADIUS - 6)}
                    fill="rgba(245, 209, 29, 0.22)"
                    stroke="#f5d11d"
                    strokeWidth={3.5}
                    strokeDasharray="8 4"
                  />
                  <circle
                    cx={0}
                    cy={0}
                    r={22}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={2.5}
                  />
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

          return (
            <g
              key={edge.id}
              data-edge={edge.id}
              transform={`translate(${midX.toFixed(2)}, ${midY.toFixed(2)}) rotate(${angleDeg.toFixed(2)})`}
              onClick={() => onEdgeClick?.(edge.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEdgeClick?.(edge.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Path edge ${edge.id} between intersections ${edge.v1} and ${edge.v2}${edge.road ? `, Road owned by ${edge.road.playerId}` : ''}`}
              style={{ cursor: isHighlighted ? 'pointer' : 'default' }}
            >
              {/* Invisible wide hit target for easy clicking */}
              <rect x={-18} y={-9} width={36} height={18} fill="transparent" />

              {/* Built 3D Wooden Road Bar */}
              {edge.road && (() => {
                const pTheme = PLAYER_THEMES[edge.road.playerId];
                return (
                  <g data-testid={`road-${edge.id}`}>
                    {/* Shadow */}
                    <rect x={-14} y={-2.5} width={29} height={8.5} rx={2} fill="rgba(0,0,0,0.35)" />
                    {/* High-contrast outer halo */}
                    <rect
                      x={-15}
                      y={-4.5}
                      width={30}
                      height={9}
                      rx={2.2}
                      fill={pTheme.sideFill}
                      stroke={pTheme.outerHalo}
                      strokeWidth={2}
                    />
                    {/* 3D wooden beam top */}
                    <rect
                      x={-14.5}
                      y={-4}
                      width={29}
                      height={7.5}
                      rx={1.8}
                      fill={pTheme.fill}
                      stroke={pTheme.stroke}
                      strokeWidth={1.2}
                    />
                    {/* Bevel highlight line */}
                    <line
                      x1={-12}
                      y1={-2}
                      x2={12}
                      y2={-2}
                      stroke={pTheme.highlight}
                      strokeWidth={1.3}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })()}

              {/* Interactive Placement Highlight for Legal Road Build */}
              {isHighlighted && (
                <rect
                  data-testid={`edge-target-${edge.id}`}
                  x={-15}
                  y={-5.5}
                  width={30}
                  height={11}
                  rx={5.5}
                  fill="rgba(245, 209, 29, 0.78)"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
      </g>

      {/* 5. 54 Intersections (Towns & Cities with oriented concave sockets, Hazards & Placement Targets) */}
      <g className="intersections-layer">
        {board.intersections.map((node) => {
          const np = latticeToSvg(node.u, node.v);
          const isHighlighted = highlightedNodeIds?.has(node.id) ?? false;

          // Compute exact cutout orientation so Town's 1 concave socket faces its attached/target Power Plant,
          // and City's 3 120°-spaced concave sockets align with all 3 adjacent resource hexes!
          const firstAdjHexId = node.adjacentHexIds[0];
          const firstHexAngleDeg =
            firstAdjHexId !== undefined
              ? (() => {
                  const hp = hexCoordToSvg(board.hexes[firstAdjHexId]!.coord);
                  return (Math.atan2(hp.y - np.y, hp.x - np.x) * 180) / Math.PI;
                })()
              : 30;

          const townTargetHexId =
            node.powerPlants[0]?.hexId ??
            node.adjacentHexIds.find((hId) => highlightedCutoutSlots?.has(`${node.id}-${hId}`)) ??
            firstAdjHexId;

          const townCutoutAngleDeg =
            townTargetHexId !== undefined
              ? (() => {
                  const hp = hexCoordToSvg(board.hexes[townTargetHexId]!.coord);
                  return (Math.atan2(hp.y - np.y, hp.x - np.x) * 180) / Math.PI;
                })()
              : firstHexAngleDeg;

          return (
            <g
              key={node.id}
              data-node={node.id}
              transform={`translate(${np.x.toFixed(2)}, ${np.y.toFixed(2)})`}
              onClick={() => onNodeClick?.(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNodeClick?.(node.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Intersection ${node.id}${node.building ? `: ${node.building.type} owned by ${node.building.playerId}` : ''}${node.hasHazard ? ', blocked by Hazard' : ''}`}
              style={{ cursor: isHighlighted ? 'pointer' : 'default' }}
            >
              {/* Invisible hit circle */}
              <circle cx={0} cy={0} r={13} fill="transparent" />

              {/* Built Town or City with exact interlocking cutout orientation */}
              {node.building?.type === 'town' && (
                <TownPieceSvg
                  playerId={node.building.playerId}
                  cx={0}
                  cy={0}
                  scale={0.96}
                  cutoutAngleDeg={townCutoutAngleDeg}
                />
              )}
              {node.building?.type === 'city' && (
                <CityPieceSvg
                  playerId={node.building.playerId}
                  cx={0}
                  cy={0}
                  scale={1.14}
                  cutoutAngleDeg={firstHexAngleDeg}
                />
              )}

              {/* Building Hazard Oil Spill Overlay */}
              {node.hasHazard && (
                <g data-testid={`node-hazard-${node.id}`}>
                  <HazardCogSvg cx={0} cy={0} r={15.5} />
                </g>
              )}

              {/* Interactive Placement Highlight Ring */}
              {isHighlighted && (
                <g data-testid={`node-target-${node.id}`}>
                  <circle
                    cx={0}
                    cy={0}
                    r={13}
                    fill="rgba(245, 209, 29, 0.8)"
                    stroke="#ffffff"
                    strokeWidth={2.5}
                  />
                  <circle cx={0} cy={0} r={6} fill="#1e2022" />
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* 6. Hex-Corner Power Plant Cutout Slots (Locked directly into Town/City concave sockets at dist=13.5) */}
      <g className="power-plants-cutout-layer">
        {board.intersections.map((node) => {
          const np = latticeToSvg(node.u, node.v);

          return node.adjacentHexIds.map((hexId) => {
            const hex = board.hexes[hexId]!;
            const hp = hexCoordToSvg(hex.coord);
            const dx = hp.x - np.x;
            const dy = hp.y - np.y;
            const dist = Math.hypot(dx, dy) || 1;
            // Position cutout slot at exact socket center (13.5 units from intersection toward hex center)
            // so the r=7.5 cylinder locks directly into the r=8.0 concave cutout of the Town or City piece!
            const slotX = np.x + (dx / dist) * 13.5;
            const slotY = np.y + (dy / dist) * 13.5;

            const slotKey = `${node.id}-${hexId}`;
            const plant = node.powerPlants.find((p) => p.hexId === hexId) ?? null;
            const isHighlighted = highlightedCutoutSlots?.has(slotKey) ?? false;

            if (!plant && !isHighlighted) return null;

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
                style={{ cursor: isHighlighted ? 'pointer' : 'default' }}
              >
                {plant && (
                  <PowerPlantCylinderSvg
                    type={plant.type}
                    cx={slotX}
                    cy={slotY}
                    r={7.5}
                  />
                )}

                {isHighlighted && (
                  <g data-testid={`plant-target-${slotKey}`}>
                    <circle
                      cx={slotX}
                      cy={slotY}
                      r={9.5}
                      fill="rgba(46, 184, 87, 0.72)"
                      stroke="#ffffff"
                      strokeWidth={2.2}
                    />
                    <polygon
                      points={`${slotX - 1},${slotY - 4.5} ${slotX + 2.8},${slotY - 4.5} ${slotX},${slotY} ${slotX + 3.2},${slotY} ${slotX - 2.2},${slotY + 5} ${slotX - 0.5},${slotY + 0.5} ${slotX - 3.2},${slotY + 0.5}`}
                      fill="#f5d11d"
                    />
                  </g>
                )}
              </g>
            );
          });
        })}
      </g>
    </svg>
  );
}
