/**
 * CATAN: New Energies — Showcase Player Board Mat & Resource Card Organiser
 *
 * Faithfully replicates `player-mat-reference.png` in a crisp, scalable hybrid SVG + texture
 * component (`[data-testid="player-mat"]`) paired with an interactive 6-compartment
 * Tabletop Resource & Science Card Organiser Tray (`[data-testid="resource-organiser"]`).
 */

import 'preact/compat';
import { getDevCardType } from '../engine/dev-cards';
import {
  DevelopmentCardType,
  PlayerState,
  ResourceType,
  TurnStats,
} from '../engine/types';
import {
  CARD_METADATA,
  DEV_CARD_METADATA,
  PLAYER_THEMES,
} from './theme';
import {
  CITY_PATH_D,
  CityPieceSvg,
  EnergyBoltSvg,
  FootprintCloudIconSvg,
  HazardTokenSvg,
  PlayerEmblemSvg,
  PowerPlantCylinderSvg,
  ResourceIconSvg,
  TOWN_PATH_D,
  TownPieceSvg,
} from './WoodenPiecesSvg';

export type ActiveBuildMode =
  | null
  | 'BUILD_ROAD'
  | 'BUILD_TOWN'
  | 'BUILD_CITY'
  | 'BUILD_FOSSIL_PLANT'
  | 'BUILD_RENEWABLE_PLANT'
  | 'CLEAN_HAZARD'
  | 'DEMOLISH_PLANT';

export interface PlayerMatProps {
  player: PlayerState;
  isActiveTurn: boolean;
  isActionPhase: boolean;
  isPreEventWindow: boolean;
  turnStats: TurnStats;
  devCardsBoughtThisTurn: string[];
  devCardPlayedThisTurn: boolean;
  activeBuildMode: ActiveBuildMode;
  redactPrivateCards?: boolean;
  compact?: boolean;
  /** Show the card organiser tray beside the board (the tabletop dock already shows the hand) */
  showOrganiser?: boolean;
  onSelectBuildMode?: (mode: ActiveBuildMode) => void;
  onBuildWarehouse?: () => void;
  onBuyDevCard?: () => void;
  onOpenEnergyBuyCardModal?: () => void;
  onPlayDevCardPrompt?: (cardId: string, cardType: DevelopmentCardType) => void;
  onRevealVpCards?: (cardIds: string[]) => void;
}

/** Bridge window (the road picture) on the player board, in board units (860 x 440). */
const WINDOW = { x: 230, y: 106, w: 462, h: 150, r: 14 };
/** Pieces in storage sit with their notch facing down, and each slot is printed in the same shape. */
const MAT_PIECE_ANGLE = 90;
const TOWN_MAT_SCALE = 1.9;
const CITY_MAT_SCALE = 1.7;
const TOWN_SLOT_SCALE = TOWN_MAT_SCALE * 1.1;
const CITY_SLOT_SCALE = CITY_MAT_SCALE * 1.1;

/** A soft puffy cloud (smoke from the stacks, clouds in the sky). */
function MatCloud({ x, y, scale = 1, opacity = 0.9 }: { x: number; y: number; scale?: number; opacity?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={opacity} pointerEvents="none">
      <ellipse cx={0} cy={10} rx={34} ry={10} fill="#dce6f1" />
      <circle cx={-18} cy={2} r={14} fill="#eaf0f7" />
      <circle cx={2} cy={-6} r={19} fill="#f6f9fc" />
      <circle cx={22} cy={2} r={13} fill="#eaf0f7" />
      <ellipse cx={0} cy={13} rx={30} ry={6} fill="#c7d4e4" opacity={0.7} />
    </g>
  );
}

/** A printed cream tab listing a building cost. */
function MatCostTab({
  x,
  y,
  items,
  tall = false,
}: {
  x: number;
  y: number;
  items: (ResourceType | 'science')[];
  tall?: boolean;
}) {
  const step = tall ? 26 : 20;
  const height = items.length * step + 10;
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect x={1} y={2} width={32} height={height} rx={8} fill="rgba(0,0,0,0.22)" />
      <rect width={32} height={height} rx={8} fill="#f6f1e4" stroke="#cfc4a6" strokeWidth={1} />
      {items.map((k, i) => (
        <ResourceIconSvg key={i} type={k} cx={16} cy={5 + step / 2 + i * step} scale={tall ? 1.15 : 0.9} />
      ))}
    </g>
  );
}

export function PlayerMat({
  player,
  isActiveTurn,
  isActionPhase,
  isPreEventWindow,
  turnStats,
  devCardsBoughtThisTurn,
  devCardPlayedThisTurn,
  activeBuildMode,
  redactPrivateCards = false,
  compact = false,
  showOrganiser = true,
  onSelectBuildMode,
  onBuildWarehouse,
  onBuyDevCard,
  onOpenEnergyBuyCardModal,
  onPlayDevCardPrompt,
  onRevealVpCards,
}: PlayerMatProps) {
  const pTheme = PLAYER_THEMES[player.id];
  const canInteract = isActiveTurn && isActionPhase;

  // Affordability checks
  const canAffordRoad =
    canInteract &&
    player.roadsInReserve > 0 &&
    player.resources.lumber >= 1 &&
    player.resources.brick >= 1;

  const canAffordTown =
    canInteract &&
    player.townsInReserve > 0 &&
    player.resources.lumber >= 1 &&
    player.resources.brick >= 1 &&
    player.resources.natural_fiber >= 1 &&
    player.resources.food >= 1;

  const canAffordCity =
    canInteract &&
    player.citiesInReserve > 0 &&
    player.resources.food >= 2 &&
    player.resources.steel >= 3 &&
    player.townsBuilt > 0;

  const canAffordDevCard =
    canInteract &&
    player.resources.natural_fiber >= 1 &&
    player.resources.food >= 1 &&
    player.resources.steel >= 1;

  const plantLimitReached = turnStats.powerPlantsBuiltThisTurn >= 1;

  const canAffordFossil =
    canInteract &&
    !plantLimitReached &&
    player.fossilPlantsInReserve > 0 &&
    player.science >= 1;

  const canAffordRenewable =
    canInteract &&
    !plantLimitReached &&
    player.renewablePlantsInReserve > 0 &&
    player.science >= 3;

  const canAffordWarehouse =
    canInteract && !player.hasWarehouse && player.energy >= 2;

  const canEnergyBuyCard = canInteract && player.energy >= 2;
  const canEnergyCleanHazard = canInteract && player.energy >= 1;
  const canEnergyDemolish =
    canInteract &&
    player.energy >= 1 &&
    player.fossilPlantsBuilt > 0 &&
    turnStats.fossilPlantsDemolishedThisTurn < 1;

  // Piece storage positions on the board (860 x 440 units)
  const townSlotPositions = [104, 168, 232, 296, 360].map((x) => ({ x, y: 62 }));
  const citySlotPositions = [478, 558, 638, 718].map((x) => ({ x, y: 64 }));
  const fossilSlotPositions = [330, 392].flatMap((y) => [82, 144, 206].map((x) => ({ x, y })));
  const renewableSlotPositions = [640, 704, 768].flatMap((x) => [280, 340, 400].map((y) => ({ x, y })));

  const totalResourceHand =
    player.resources.lumber +
    player.resources.brick +
    player.resources.natural_fiber +
    player.resources.food +
    player.resources.steel;

  const vpCardIds = player.devCards.unplayed.filter(
    (cid) => getDevCardType(cid) === 'victoryPoint'
  );
  const canWinWithVpCards =
    isActiveTurn &&
    vpCardIds.length > 0 &&
    player.victoryPoints + vpCardIds.length >= 10;

  return (
    <div
      className="player-mat-showcase-wrapper"
      style={{
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        justifyContent: showOrganiser ? undefined : 'center',
        gap: '12px',
        alignItems: 'stretch',
        width: '100%',
      }}
    >
      {/* =================================================================== */}
      {/* PART A: THE GRAPHICAL PLAYER BOARD MAT (player-mat-reference.png)   */}
      {/* =================================================================== */}
      <div
        data-testid="player-mat"
        data-player-id={player.id}
        style={{
          position: 'relative',
          flex: compact ? '0 0 auto' : '1 1 540px',
          minWidth: compact ? '280px' : '460px',
          maxWidth: compact ? '420px' : showOrganiser ? '640px' : '820px',
          // The board draws its own rounded cardboard edge; the wrapper only adds the turn ring
          borderRadius: '2.8% / 5.4%',
          boxShadow: isActiveTurn
            ? `0 0 0 3px ${pTheme.fill}, 0 14px 30px -8px rgba(0,0,0,0.6)`
            : '0 14px 30px -8px rgba(0,0,0,0.55)',
        }}
      >
        <svg
          viewBox="0 0 860 440"
          width="100%"
          style={{ display: 'block', userSelect: 'none' }}
          role="group"
          aria-label={`${player.name}'s player board`}
        >
          <defs>
            <linearGradient id={`matSky-${player.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d335a" style={{ stopColor: '#1d335a' }} />
              <stop offset="45%" stopColor="#2f4d7d" style={{ stopColor: '#2f4d7d' }} />
              <stop offset="100%" stopColor="#7d86ad" style={{ stopColor: '#7d86ad' }} />
            </linearGradient>
            <linearGradient id={`matWindow-${player.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a4472" style={{ stopColor: '#2a4472' }} />
              <stop offset="60%" stopColor="#5f5b8a" style={{ stopColor: '#5f5b8a' }} />
              <stop offset="100%" stopColor="#b88ea0" style={{ stopColor: '#b88ea0' }} />
            </linearGradient>
            <linearGradient id={`matMeadow-${player.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#86b552" style={{ stopColor: '#86b552' }} />
              <stop offset="100%" stopColor="#4f8a32" style={{ stopColor: '#4f8a32' }} />
            </linearGradient>
            <linearGradient id={`matRail-${player.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0b1830" stopOpacity={0.55} style={{ stopColor: '#0b1830', stopOpacity: 0.55 }} />
              <stop offset="100%" stopColor="#0b1830" stopOpacity={0} style={{ stopColor: '#0b1830', stopOpacity: 0 }} />
            </linearGradient>
            <clipPath id={`matArt-${player.id}`}>
              <rect x={16} y={16} width={828} height={408} rx={14} />
            </clipPath>
            <clipPath id={`matWindowClip-${player.id}`}>
              <rect x={WINDOW.x} y={WINDOW.y} width={WINDOW.w} height={WINDOW.h} rx={WINDOW.r} />
            </clipPath>
          </defs>

          {/* Cardboard board: printed face over a visible cut edge */}
          <rect x={4} y={7} width={852} height={430} rx={24} fill="#cbbf9f" />
          <rect x={4} y={3} width={852} height={430} rx={24} fill="#f4eee0" stroke="#d6cba9" strokeWidth={1.5} />

          <g clipPath={`url(#matArt-${player.id})`}>
            {/* Sky, rail shading behind the piece storage, distant hills and meadow */}
            <rect x={16} y={16} width={828} height={408} fill={`url(#matSky-${player.id}) #2f4d7d`} />
            <rect x={16} y={16} width={828} height={92} fill={`url(#matRail-${player.id}) transparent`} />
            <MatCloud x={790} y={214} scale={1.25} opacity={0.85} />
            <MatCloud x={600} y={128} scale={0.7} opacity={0.35} />
            <path
              d="M 140 272 L 212 238 L 262 254 L 334 226 L 420 252 L 500 230 L 580 254 L 664 232 L 762 258 L 844 242 L 844 310 L 140 310 Z"
              fill="#8b84a6"
            />
            <path
              d="M 16 262 Q 160 248 300 268 Q 480 286 640 264 Q 760 248 844 256 L 844 424 L 16 424 Z"
              fill={`url(#matMeadow-${player.id}) #6b9c3e`}
            />
            <path
              d="M 16 330 Q 120 318 230 334 M 590 300 Q 700 286 844 296"
              fill="none"
              stroke="#9cc766"
              strokeWidth={2}
              opacity={0.6}
            />

            {/* Factory with striped smokestacks and their smoke */}
            <g className="industrial-factory" pointerEvents="none">
              <MatCloud x={62} y={132} scale={0.66} opacity={0.92} />
              <MatCloud x={92} y={116} scale={0.5} opacity={0.75} />
              {[
                { x: 50, top: 150 },
                { x: 76, top: 166 },
              ].map((stack) => (
                <g key={stack.x}>
                  <rect x={stack.x} y={stack.top} width={13} height={262 - stack.top} fill="#e2ded3" stroke="#8c887d" strokeWidth={1} />
                  {[0, 1, 2, 3].map((band) => (
                    <rect key={band} x={stack.x} y={stack.top + 8 + band * 22} width={13} height={9} fill="#e0a83a" />
                  ))}
                  <rect x={stack.x - 1.5} y={stack.top - 4} width={16} height={5} rx={1.5} fill="#a8a296" />
                </g>
              ))}
              <path d="M 30 252 L 30 238 L 56 226 L 56 238 L 82 226 L 82 238 L 108 226 L 108 252 Z" fill="#b9b3a5" stroke="#8a867c" strokeWidth={1.2} strokeLinejoin="round" />
              <rect x={30} y={250} width={146} height={52} fill="#ebe7dc" stroke="#8a867c" strokeWidth={1.4} />
              <rect x={108} y={240} width={68} height={12} fill="#d6d1c3" stroke="#8a867c" strokeWidth={1.2} />
              {[44, 70, 96, 122, 148].map((wx) => (
                <rect key={wx} x={wx} y={262} width={12} height={16} rx={1.5} fill="#6f7a88" />
              ))}
              <rect x={74} y={284} width={20} height={18} fill="#8a867c" />
            </g>

            {/* Development card (1 food, 1 fiber, 1 steel) */}
            <g
              data-testid="mat-buy-dev-card"
              transform="translate(152, 178) rotate(-5)"
              onClick={() => {
                if (canAffordDevCard) onBuyDevCard?.();
              }}
              style={{ cursor: canAffordDevCard ? 'pointer' : 'default' }}
              role="button"
              tabIndex={canAffordDevCard ? 0 : -1}
              aria-label="Buy a development card (1 food, 1 fiber, 1 steel)"
            >
              <rect x={-44} y={-38} width={92} height={80} rx={9} fill="rgba(0,0,0,0.25)" transform="translate(2, 3)" />
              <rect
                x={-44}
                y={-40}
                width={92}
                height={80}
                rx={9}
                fill="#f6f1e4"
                stroke={canAffordDevCard ? '#ffc83a' : '#cfc4a6'}
                strokeWidth={canAffordDevCard ? 3 : 1.5}
              />
              <ResourceIconSvg type="food" cx={-27} cy={-21} scale={0.9} />
              <ResourceIconSvg type="natural_fiber" cx={-27} cy={0} scale={0.9} />
              <ResourceIconSvg type="steel" cx={-27} cy={21} scale={0.9} />
              <rect x={-8} y={-31} width={48} height={62} rx={5} fill="#7ac1e4" stroke="#ffffff" strokeWidth={1.5} />
              <circle cx={16} cy={-6} r={10} fill="#ffd34d" />
              <path d="M -8 8 Q 8 -1 24 5 L 40 3 L 40 31 L -8 31 Z" fill="#3a7a4c" />
              <path d="M -8 19 L 40 19 L 40 31 L -8 31 Z" fill="#2c6494" />
            </g>

            {/* Bridge window (road: 1 lumber, 1 brick) */}
            <g
              data-testid="mat-build-road"
              onClick={() => {
                if (canAffordRoad) onSelectBuildMode?.(activeBuildMode === 'BUILD_ROAD' ? null : 'BUILD_ROAD');
              }}
              style={{ cursor: canAffordRoad ? 'pointer' : 'default' }}
              role="button"
              tabIndex={canAffordRoad ? 0 : -1}
              aria-label={`Build a road (1 lumber, 1 brick). ${player.roadsInReserve} roads left.`}
            >
              <rect
                x={WINDOW.x}
                y={WINDOW.y}
                width={WINDOW.w}
                height={WINDOW.h}
                rx={WINDOW.r}
                fill={`url(#matWindow-${player.id}) #5f5b8a`}
              />
              <g clipPath={`url(#matWindowClip-${player.id})`}>
                <path
                  d="M 222 232 Q 300 208 380 226 T 540 216 T 692 224 L 692 256 L 222 256 Z"
                  fill="#8f86a8"
                />
                {/* Highway overpass: two decks crossing, with pillars */}
                {[258, 300, 344, 452, 548, 640].map((px) => (
                  <rect key={px} x={px} y={px < 400 ? 178 + (px - 258) * 0.38 : 196 - (px - 452) * 0.12} width={9} height={90} fill="#7b8399" />
                ))}
                <path d="M 214 150 L 404 220" stroke="#8d97ad" strokeWidth={15} strokeLinecap="butt" />
                <path d="M 214 145 L 404 215" stroke="#d6dde9" strokeWidth={4} />
                <path d="M 330 214 L 700 152" stroke="#9aa4ba" strokeWidth={15} strokeLinecap="butt" />
                <path d="M 330 208 L 700 146" stroke="#e1e7f1" strokeWidth={4} />
                {[
                  [270, 168, '#ffd34d'],
                  [352, 196, '#ef5a3c'],
                  [470, 186, '#ffd34d'],
                  [598, 165, '#ef5a3c'],
                ].map(([cx, cy, c], i) => (
                  <circle key={i} cx={cx as number} cy={cy as number} r={2.4} fill={c as string} />
                ))}
              </g>
              <rect
                x={WINDOW.x}
                y={WINDOW.y}
                width={WINDOW.w}
                height={WINDOW.h}
                rx={WINDOW.r}
                fill="none"
                stroke={activeBuildMode === 'BUILD_ROAD' ? '#ffc83a' : canAffordRoad ? '#bfe9c8' : '#f4eee0'}
                strokeWidth={6}
              />
              <MatCostTab x={WINDOW.x + 12} y={WINDOW.y + 12} items={['lumber', 'brick']} />
              <g transform={`translate(${WINDOW.x + WINDOW.w / 2}, ${WINDOW.y + 22})`}>
                <rect x={-62} y={-11} width={124} height={22} rx={11} fill="rgba(16, 26, 44, 0.78)" />
                <text x={0} y={4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#f0f4f8">
                  {player.roadsInReserve} of 12 roads left
                </text>
              </g>
            </g>

            {/* Wind turbines (behind the renewable plants) */}
            <g className="wind-turbines" pointerEvents="none">
              {[
                { x: 812, y: 206, blade: 46, tower: 4 },
                { x: 748, y: 168, blade: 72, tower: 6 },
              ].map((t) => (
                <g key={t.x} transform={`translate(${t.x}, ${t.y})`}>
                  <path d={`M -${t.tower / 2} 2 L ${t.tower / 2} 2 L ${t.tower} 260 L -${t.tower} 260 Z`} fill="#eceae3" stroke="#a7a9ac" strokeWidth={0.8} />
                  {[8, 128, 248].map((deg) => (
                    <path
                      key={deg}
                      d={`M 0 0 L -${t.blade * 0.06} -${t.blade * 0.86} L 0 -${t.blade} L ${t.blade * 0.07} -${t.blade * 0.86} Z`}
                      transform={`rotate(${deg})`}
                      fill="#ffffff"
                      stroke="#8c9196"
                      strokeWidth={0.9}
                      strokeLinejoin="round"
                    />
                  ))}
                  <circle r={t.tower * 0.8} fill="#ffffff" stroke="#7a7d82" strokeWidth={1.1} />
                </g>
              ))}
            </g>

            {/* Piece storage: towns (left) and cities (right), each slot shaped like its piece */}
            <MatCostTab x={26} y={24} items={['lumber', 'brick', 'food', 'natural_fiber']} />
            {townSlotPositions.map((pos, idx) => {
              const hasPieceInReserve = idx < player.townsInReserve;
              const isTownMode = activeBuildMode === 'BUILD_TOWN';
              return (
                <g
                  key={`town-slot-${idx}`}
                  data-testid={`mat-town-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordTown) onSelectBuildMode?.(isTownMode ? null : 'BUILD_TOWN');
                  }}
                  style={{ cursor: canAffordTown ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={canAffordTown ? 0 : -1}
                  aria-label={`Town ${idx + 1}: ${hasPieceInReserve ? 'in reserve' : 'built (+1 footprint)'}`}
                >
                  <path
                    data-slot-recess
                    d={TOWN_PATH_D}
                    transform={`rotate(${MAT_PIECE_ANGLE}) scale(${TOWN_SLOT_SCALE})`}
                    fill="rgba(8, 16, 32, 0.45)"
                    stroke={isTownMode && hasPieceInReserve ? '#ffc83a' : 'rgba(226, 234, 246, 0.6)'}
                    strokeWidth={isTownMode && hasPieceInReserve ? 2.5 : 1.3}
                    strokeDasharray={hasPieceInReserve ? undefined : '4 3'}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                  <FootprintCloudIconSvg type="plus" cx={0} cy={-2} scale={1.1} />
                  {hasPieceInReserve && (
                    <TownPieceSvg playerId={player.id} cx={0} cy={-3} scale={TOWN_MAT_SCALE} cutoutAngleDeg={MAT_PIECE_ANGLE} />
                  )}
                </g>
              );
            })}

            {citySlotPositions.map((pos, idx) => {
              const hasPieceInReserve = idx < player.citiesInReserve;
              const isCityMode = activeBuildMode === 'BUILD_CITY';
              return (
                <g
                  key={`city-slot-${idx}`}
                  data-testid={`mat-city-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordCity) onSelectBuildMode?.(isCityMode ? null : 'BUILD_CITY');
                  }}
                  style={{ cursor: canAffordCity ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={canAffordCity ? 0 : -1}
                  aria-label={`City ${idx + 1}: ${hasPieceInReserve ? 'in reserve' : 'built (+2 footprint)'}`}
                >
                  <path
                    data-slot-recess
                    d={CITY_PATH_D}
                    transform={`rotate(${MAT_PIECE_ANGLE}) scale(${CITY_SLOT_SCALE})`}
                    fill="rgba(8, 16, 32, 0.45)"
                    stroke={isCityMode && hasPieceInReserve ? '#ffc83a' : 'rgba(226, 234, 246, 0.6)'}
                    strokeWidth={isCityMode && hasPieceInReserve ? 2.5 : 1.3}
                    strokeDasharray={hasPieceInReserve ? undefined : '4 3'}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                  <FootprintCloudIconSvg type="plus" cx={0} cy={-11} scale={0.9} />
                  <FootprintCloudIconSvg type="plus" cx={0} cy={6} scale={0.9} />
                  {hasPieceInReserve && (
                    <CityPieceSvg playerId={player.id} cx={0} cy={-4} scale={CITY_MAT_SCALE} cutoutAngleDeg={MAT_PIECE_ANGLE} />
                  )}
                </g>
              );
            })}
            <MatCostTab x={800} y={24} items={['food', 'food', 'steel', 'steel', 'steel']} />

            {/* Fossil fuel power plants (1 science each) */}
            <MatCostTab x={20} y={340} items={['science']} tall />
            {fossilSlotPositions.map((pos, idx) => {
              const hasPlantInReserve = idx < player.fossilPlantsInReserve;
              const isFossilMode = activeBuildMode === 'BUILD_FOSSIL_PLANT';
              return (
                <g
                  key={`fossil-slot-${idx}`}
                  data-testid={`mat-fossil-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordFossil) onSelectBuildMode?.(isFossilMode ? null : 'BUILD_FOSSIL_PLANT');
                  }}
                  style={{ cursor: canAffordFossil ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={canAffordFossil ? 0 : -1}
                  aria-label={`Fossil fuel plant ${idx + 1}: ${hasPlantInReserve ? 'in reserve (1 science)' : 'built (+1 footprint)'}`}
                >
                  <circle
                    r={22}
                    fill="rgba(20, 30, 20, 0.4)"
                    stroke={isFossilMode && hasPlantInReserve ? '#ffc83a' : 'rgba(255,255,255,0.75)'}
                    strokeWidth={isFossilMode && hasPlantInReserve ? 3 : 1.5}
                    strokeDasharray={hasPlantInReserve ? undefined : '4 3'}
                  />
                  <FootprintCloudIconSvg type="plus" cx={0} cy={1} scale={1.1} />
                  {hasPlantInReserve && <PowerPlantCylinderSvg type="fossil" cx={0} cy={-3} r={18} />}
                </g>
              );
            })}

            {/* Warehouse, energy uses, energy storage and the one-plant-per-turn reminder */}
            <g
              data-testid="warehouse-tile"
              transform="translate(298, 268)"
              onClick={() => {
                if (canAffordWarehouse) onBuildWarehouse?.();
              }}
              style={{ cursor: canAffordWarehouse ? 'pointer' : 'default' }}
              role="button"
              tabIndex={canAffordWarehouse ? 0 : -1}
              aria-label={
                player.hasWarehouse
                  ? 'Warehouse built: you keep up to 10 cards on a 7'
                  : 'Build the warehouse (2 energy): keep up to 10 cards on a 7'
              }
            >
              <rect x={1.5} y={2.5} width={108} height={58} rx={8} fill="rgba(0,0,0,0.22)" />
              <rect
                x={0}
                y={0}
                width={108}
                height={58}
                rx={8}
                fill={player.hasWarehouse ? '#e6f4e9' : '#f4eee0'}
                stroke={canAffordWarehouse ? '#ffc83a' : '#a99f86'}
                strokeWidth={canAffordWarehouse ? 3 : 1.5}
              />
              <path d="M 0 16 L 54 4 L 108 16 L 108 20 L 0 20 Z" fill="#8d93a0" />
              {!player.hasWarehouse ? (
                <>
                  <EnergyBoltSvg cx={30} cy={39} scale={1.05} />
                  <EnergyBoltSvg cx={47} cy={41} scale={1.05} />
                  <rect x={66} y={30} width={28} height={22} rx={3} fill="#4d535c" />
                  <path d="M 76 28 Q 88 16 96 30" fill="none" stroke="#22252a" strokeWidth={2.2} strokeLinecap="round" />
                  <polygon points="96,30 92,25 99,25" fill="#22252a" />
                </>
              ) : (
                <>
                  <text x={54} y={39} textAnchor="middle" fontSize="15" fontWeight="800" fill="#1e7a3e">
                    &le; 10 cards
                  </text>
                  <text x={54} y={52} textAnchor="middle" fontSize="9" fontWeight="700" fill="#2f6b43">
                    Warehouse built
                  </text>
                </>
              )}
            </g>

            {(
              [
                {
                  testId: 'energy-action-buy-card',
                  x: 446,
                  mode: null,
                  enabled: canEnergyBuyCard,
                  label: 'Spend 2 energy to take any 1 resource or science card',
                  onClick: () => canEnergyBuyCard && onOpenEnergyBuyCardModal?.(),
                },
                {
                  testId: 'energy-action-clean-hazard',
                  x: 502,
                  mode: 'CLEAN_HAZARD' as ActiveBuildMode,
                  enabled: canEnergyCleanHazard,
                  label: 'Spend 1 energy to remove a hazard',
                  onClick: () =>
                    canEnergyCleanHazard &&
                    onSelectBuildMode?.(activeBuildMode === 'CLEAN_HAZARD' ? null : 'CLEAN_HAZARD'),
                },
                {
                  testId: 'energy-action-demolish-plant',
                  x: 558,
                  mode: 'DEMOLISH_PLANT' as ActiveBuildMode,
                  enabled: canEnergyDemolish,
                  label: 'Spend 1 energy to remove one of your fossil fuel plants (once per turn)',
                  onClick: () =>
                    canEnergyDemolish &&
                    onSelectBuildMode?.(activeBuildMode === 'DEMOLISH_PLANT' ? null : 'DEMOLISH_PLANT'),
                },
              ] as const
            ).map((a) => {
              const selected = a.mode !== null && activeBuildMode === a.mode;
              return (
                <g
                  key={a.testId}
                  data-testid={a.testId}
                  transform={`translate(${a.x}, 297)`}
                  onClick={a.onClick}
                  style={{ cursor: a.enabled ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={a.enabled ? 0 : -1}
                  aria-label={a.label}
                >
                  <rect x={-24.5} y={-27.5} width={50} height={58} rx={8} fill="rgba(0,0,0,0.2)" />
                  <rect
                    x={-26}
                    y={-29}
                    width={50}
                    height={58}
                    rx={8}
                    fill={selected ? '#ffc83a' : '#f4eee0'}
                    stroke={selected ? '#1b2a39' : a.enabled ? '#ffc83a' : '#a99f86'}
                    strokeWidth={a.enabled || selected ? 2.5 : 1.3}
                    opacity={a.enabled || selected ? 1 : 0.85}
                  />
                  {a.testId === 'energy-action-buy-card' && (
                    <>
                      <EnergyBoltSvg cx={-8} cy={-15} scale={0.62} />
                      <EnergyBoltSvg cx={4} cy={-13} scale={0.62} />
                      <rect x={-11} y={2} width={20} height={24} rx={3} fill="#ffffff" stroke="#2c3540" strokeWidth={1.2} />
                      <circle cx={-1} cy={14} r={5.5} fill="#2f9a53" />
                    </>
                  )}
                  {a.testId === 'energy-action-clean-hazard' && (
                    <>
                      <EnergyBoltSvg cx={-1} cy={-15} scale={0.62} />
                      <HazardTokenSvg cx={-1} cy={13} r={11} />
                      <path d="M -10 22 L 9 4" stroke="#c9302c" strokeWidth={2.4} strokeLinecap="round" />
                    </>
                  )}
                  {a.testId === 'energy-action-demolish-plant' && (
                    <>
                      <EnergyBoltSvg cx={-6} cy={-15} scale={0.62} />
                      <PowerPlantCylinderSvg type="fossil" cx={-3} cy={12} r={9} />
                      <circle cx={12} cy={-3} r={8} fill="#c9302c" stroke="#ffffff" strokeWidth={1.2} />
                      <text x={12} y={0.5} textAnchor="middle" fontSize="8" fontWeight="800" fill="#ffffff">
                        x1
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            <g data-testid="energy-bar" transform="translate(298, 334)">
              <rect x={1.5} y={2.5} width={286} height={50} rx={12} fill="rgba(0,0,0,0.22)" />
              <rect x={0} y={0} width={286} height={50} rx={12} fill="#e2b93b" stroke="#8c6d14" strokeWidth={2} />
              <rect x={6} y={5} width={274} height={8} rx={4} fill="#f2d470" opacity={0.6} />
              {Array.from({ length: 5 }, (_, eIdx) => (
                <g key={eIdx} data-testid={`energy-slot-${eIdx}`}>
                  <EnergyBoltSvg cx={33 + eIdx * 55} cy={26} scale={1.3} empty={eIdx >= player.energy} />
                </g>
              ))}
            </g>

            <g transform="translate(441, 405)" data-testid="plant-limit-badge">
              <rect
                x={-62}
                y={-14}
                width={124}
                height={28}
                rx={14}
                fill="#f4eee0"
                stroke={plantLimitReached ? '#c9302c' : '#a99f86'}
                strokeWidth={1.5}
              />
              <PowerPlantCylinderSvg type="fossil" cx={-36} cy={-2} r={8} />
              <circle cx={0} cy={0} r={9} fill="#c9302c" />
              <text x={0} y={3.5} textAnchor="middle" fontSize="9" fontWeight="800" fill="#ffffff">
                x1
              </text>
              <PowerPlantCylinderSvg type="renewable" cx={36} cy={-2} r={8} />
            </g>

            {/* Renewable power plants (3 science each), each on its green event disc */}
            <MatCostTab x={812} y={300} items={['science', 'science', 'science']} tall />
            {renewableSlotPositions.map((pos, idx) => {
              const hasPlantInReserve = idx < player.renewablePlantsInReserve;
              const isRenewableMode = activeBuildMode === 'BUILD_RENEWABLE_PLANT';
              return (
                <g
                  key={`renewable-slot-${idx}`}
                  data-testid={`mat-renewable-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordRenewable) onSelectBuildMode?.(isRenewableMode ? null : 'BUILD_RENEWABLE_PLANT');
                  }}
                  style={{ cursor: canAffordRenewable ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={canAffordRenewable ? 0 : -1}
                  aria-label={`Renewable plant ${idx + 1}: ${hasPlantInReserve ? 'in reserve (3 science)' : 'built (-1 footprint)'}`}
                >
                  <circle
                    r={22}
                    fill="rgba(16, 48, 24, 0.4)"
                    stroke={isRenewableMode && hasPlantInReserve ? '#ffc83a' : 'rgba(255,255,255,0.75)'}
                    strokeWidth={isRenewableMode && hasPlantInReserve ? 3 : 1.5}
                    strokeDasharray={hasPlantInReserve ? undefined : '4 3'}
                  />
                  <FootprintCloudIconSvg type="minus" cx={0} cy={1} scale={1.1} />
                  {hasPlantInReserve && (
                    <PowerPlantCylinderSvg type="renewable" cx={1} cy={-3} r={16} hasGreenDiscUnderneath={true} />
                  )}
                </g>
              );
            })}
          </g>

          {/* Inner edge of the printed area */}
          <rect x={16} y={16} width={828} height={408} rx={14} fill="none" stroke="rgba(30, 24, 10, 0.28)" strokeWidth={2} />
        </svg>
      </div>

      {/* =================================================================== */}
      {/* PART B: INTEGRATED RESOURCE & SCIENCE CARD ORGANISER TRAY           */}
      {/* =================================================================== */}
      {!compact && showOrganiser && (
        <div
          data-testid="resource-organiser"
          style={{
            flex: '1 1 420px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #24282e 0%, #181b20 100%)',
            borderRadius: '14px',
            padding: '10px 12px',
            border: '2px solid #3c424d',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), 0 8px 22px rgba(0,0,0,0.55)',
          }}
        >
          {/* Organiser Header & Quick Recipe Affordability Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '8px',
              paddingBottom: '6px',
              borderBottom: '1px solid #343a44',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="-10 -10 20 20">
                <circle r="9" fill={pTheme.fill} stroke={pTheme.outerHalo} strokeWidth="1.5" />
                <PlayerEmblemSvg playerId={player.id} cx={0} cy={0} r={4.5} />
              </svg>
              <span style={{ fontWeight: 800, fontSize: '13px', color: '#f0f4f8' }}>
                {player.name}&apos;s Card Organiser
              </span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: '#2d333d',
                  color: '#cbd5e0',
                  fontWeight: 700,
                }}
              >
                Hand: {totalResourceHand + player.science} / {player.hasWarehouse ? 10 : 7}
              </span>
            </div>

            {/* Quick-Build Recipe Buttons */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="quick-build-road"
                disabled={!canAffordRoad}
                onClick={() =>
                  onSelectBuildMode?.(activeBuildMode === 'BUILD_ROAD' ? null : 'BUILD_ROAD')
                }
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: activeBuildMode === 'BUILD_ROAD' ? '2px solid #f5d11d' : '1px solid #4a5260',
                  background: canAffordRoad ? '#2e6b40' : '#262b33',
                  color: canAffordRoad ? '#ffffff' : '#7a828e',
                  cursor: canAffordRoad ? 'pointer' : 'not-allowed',
                }}
              >
                Road
              </button>
              <button
                type="button"
                data-testid="quick-build-town"
                disabled={!canAffordTown}
                onClick={() =>
                  onSelectBuildMode?.(activeBuildMode === 'BUILD_TOWN' ? null : 'BUILD_TOWN')
                }
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: activeBuildMode === 'BUILD_TOWN' ? '2px solid #f5d11d' : '1px solid #4a5260',
                  background: canAffordTown ? '#2e6b40' : '#262b33',
                  color: canAffordTown ? '#ffffff' : '#7a828e',
                  cursor: canAffordTown ? 'pointer' : 'not-allowed',
                }}
              >
                Town
              </button>
              <button
                type="button"
                data-testid="quick-build-city"
                disabled={!canAffordCity}
                onClick={() =>
                  onSelectBuildMode?.(activeBuildMode === 'BUILD_CITY' ? null : 'BUILD_CITY')
                }
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: activeBuildMode === 'BUILD_CITY' ? '2px solid #f5d11d' : '1px solid #4a5260',
                  background: canAffordCity ? '#2e6b40' : '#262b33',
                  color: canAffordCity ? '#ffffff' : '#7a828e',
                  cursor: canAffordCity ? 'pointer' : 'not-allowed',
                }}
              >
                City
              </button>
              <button
                type="button"
                data-testid="quick-build-fossil"
                disabled={!canAffordFossil}
                onClick={() =>
                  onSelectBuildMode?.(
                    activeBuildMode === 'BUILD_FOSSIL_PLANT' ? null : 'BUILD_FOSSIL_PLANT'
                  )
                }
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border:
                    activeBuildMode === 'BUILD_FOSSIL_PLANT' ? '2px solid #f5d11d' : '1px solid #4a5260',
                  background: canAffordFossil ? '#6e4b26' : '#262b33',
                  color: canAffordFossil ? '#ffffff' : '#7a828e',
                  cursor: canAffordFossil ? 'pointer' : 'not-allowed',
                }}
              >
                Fossil (1 Sci)
              </button>
              <button
                type="button"
                data-testid="quick-build-renewable"
                disabled={!canAffordRenewable}
                onClick={() =>
                  onSelectBuildMode?.(
                    activeBuildMode === 'BUILD_RENEWABLE_PLANT' ? null : 'BUILD_RENEWABLE_PLANT'
                  )
                }
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border:
                    activeBuildMode === 'BUILD_RENEWABLE_PLANT'
                      ? '2px solid #f5d11d'
                      : '1px solid #4a5260',
                  background: canAffordRenewable ? '#237a38' : '#262b33',
                  color: canAffordRenewable ? '#ffffff' : '#7a828e',
                  cursor: canAffordRenewable ? 'pointer' : 'not-allowed',
                }}
              >
                Renewable (3 Sci)
              </button>
              <button
                type="button"
                data-testid="quick-buy-dev"
                disabled={!canAffordDevCard}
                onClick={() => onBuyDevCard?.()}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: '1px solid #4a5260',
                  background: canAffordDevCard ? '#366899' : '#262b33',
                  color: canAffordDevCard ? '#ffffff' : '#7a828e',
                  cursor: canAffordDevCard ? 'pointer' : 'not-allowed',
                }}
              >
                +Dev Card
              </button>
            </div>
          </div>

          {/* 6 Dedicated Physical Card Compartments (5 Resources + 1 Science) */}
          {redactPrivateCards ? (
            <div
              data-testid="organiser-redacted"
              style={{
                padding: '18px',
                textAlign: 'center',
                background: 'rgba(15, 18, 24, 0.6)',
                borderRadius: '10px',
                border: '1px dashed #4a5260',
                color: '#a0aec0',
                fontSize: '12px',
              }}
            >
              Private Hand Hidden ({totalResourceHand + player.science} Resource/Science Cards,{' '}
              {player.devCards.unplayed.length} Unplayed Dev Cards)
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '6px',
                marginBottom: '8px',
              }}
            >
              {(
                ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as (
                  | ResourceType
                  | 'science'
                )[]
              ).map((cardKey) => {
                const meta = CARD_METADATA[cardKey];
                const count =
                  cardKey === 'science' ? player.science : player.resources[cardKey];
                const fanCount = Math.min(count, 4);

                return (
                  <div
                    key={cardKey}
                    data-testid={`organiser-slot-${cardKey}`}
                    title={meta.description}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 4px',
                      borderRadius: '8px',
                      background: count > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.28)',
                      border: `1.5px solid ${count > 0 ? meta.bg : '#2d323b'}`,
                      minHeight: '92px',
                      position: 'relative',
                    }}
                  >
                    {/* Compartment Label */}
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: count > 0 ? '#f0f4f8' : '#718096',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}
                    >
                      {meta.shortLabel}
                    </span>

                    {/* Fanned Physical Cards Stack */}
                    <div
                      style={{
                        position: 'relative',
                        width: '44px',
                        height: '50px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {count === 0 ? (
                        <svg width="36" height="44" viewBox="-18 -22 36 44" style={{ opacity: 0.25 }}>
                          <rect
                            x="-16"
                            y="-20"
                            width="32"
                            height="40"
                            rx="4"
                            fill="none"
                            stroke="#a0aec0"
                            strokeWidth="1.2"
                            strokeDasharray="3 2"
                          />
                          <ResourceIconSvg type={cardKey} cx={0} cy={0} scale={1.1} />
                        </svg>
                      ) : (
                        <svg width="48" height="52" viewBox="-24 -26 48 52">
                          {Array.from({ length: fanCount }, (_, fIdx) => {
                            const angle = (fIdx - (fanCount - 1) / 2) * 7;
                            const tx = (fIdx - (fanCount - 1) / 2) * 3.5;
                            return (
                              <g
                                key={fIdx}
                                transform={`translate(${tx}, 0) rotate(${angle})`}
                              >
                                <rect
                                  x="-15"
                                  y="-20"
                                  width="30"
                                  height="40"
                                  rx="4"
                                  fill={meta.cardFill}
                                  stroke={meta.border}
                                  strokeWidth="1.4"
                                />
                                <circle
                                  cx="0"
                                  cy="0"
                                  r="10.5"
                                  fill={meta.bg}
                                  opacity={0.35}
                                />
                                <ResourceIconSvg type={cardKey} cx={0} cy={0} scale={1.15} />
                              </g>
                            );
                          })}
                        </svg>
                      )}
                    </div>

                    {/* Count Badge */}
                    <span
                      data-testid={`organiser-count-${cardKey}`}
                      style={{
                        fontSize: '12px',
                        fontWeight: 900,
                        padding: '1px 8px',
                        borderRadius: '10px',
                        background: count > 0 ? meta.bg : '#252930',
                        color: count > 0 ? meta.textColor : '#636b78',
                        boxShadow: count > 0 ? '0 2px 4px rgba(0,0,0,0.4)' : 'none',
                      }}
                    >
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Development Cards & Played Clean Up Tray */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              paddingTop: '6px',
              borderTop: '1px solid #343a44',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#a0aec0' }}>
                Dev Cards ({player.devCards.unplayed.length}):
              </span>
              {!redactPrivateCards &&
                player.devCards.unplayed.map((cardId) => {
                  const cType = getDevCardType(cardId);
                  const cMeta = DEV_CARD_METADATA[cType];
                  const boughtThisTurn =
                    devCardsBoughtThisTurn.includes(cardId) ||
                    turnStats.devCardsBoughtThisTurn.includes(cardId);
                  const canPlayNow =
                    isActiveTurn &&
                    (isActionPhase || isPreEventWindow) &&
                    !devCardPlayedThisTurn &&
                    !boughtThisTurn &&
                    cType !== 'victoryPoint';

                  return (
                    <button
                      key={cardId}
                      type="button"
                      data-testid={`dev-card-${cardId}`}
                      disabled={!canPlayNow}
                      onClick={() => onPlayDevCardPrompt?.(cardId, cType)}
                      title={`${cMeta.title}: ${cMeta.description}${boughtThisTurn ? ' (Bought this turn)' : ''}`}
                      style={{
                        padding: '3px 8px',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        borderRadius: '6px',
                        border: `1.5px solid ${cMeta.color}`,
                        background: canPlayNow ? cMeta.color : '#262b33',
                        color: canPlayNow ? '#ffffff' : '#cbd5e0',
                        cursor: canPlayNow ? 'pointer' : 'default',
                      }}
                    >
                      {cMeta.title}
                      {boughtThisTurn ? ' (New)' : ''}
                    </button>
                  );
                })}

              {!redactPrivateCards && canWinWithVpCards && (
                <button
                  type="button"
                  data-testid="reveal-vp-cards-btn"
                  onClick={() => onRevealVpCards?.(vpCardIds)}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 900,
                    borderRadius: '6px',
                    background: '#f0b418',
                    color: '#1e190d',
                    border: '2px solid #ffffff',
                    cursor: 'pointer',
                  }}
                >
                  Reveal VP Cards to Win!
                </button>
              )}
            </div>

            {/* Public Played Clean Up Cards Counter */}
            <div
              data-testid={`played-cleanup-count-${player.id}`}
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#8ce09a',
                background: 'rgba(46, 133, 64, 0.2)',
                padding: '2px 8px',
                borderRadius: '8px',
                border: '1px solid #2e8540',
              }}
            >
              Played Clean Up:{' '}
              {player.devCards.played.filter((id) => getDevCardType(id) === 'cleanup').length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
