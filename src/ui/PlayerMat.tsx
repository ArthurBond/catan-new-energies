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
  CityPieceSvg,
  EnergyBoltSvg,
  FootprintCloudIconSvg,
  PlayerEmblemSvg,
  PowerPlantCylinderSvg,
  ResourceIconSvg,
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
  onSelectBuildMode?: (mode: ActiveBuildMode) => void;
  onBuildWarehouse?: () => void;
  onBuyDevCard?: () => void;
  onOpenEnergyBuyCardModal?: () => void;
  onPlayDevCardPrompt?: (cardId: string, cardType: DevelopmentCardType) => void;
  onRevealVpCards?: (cardIds: string[]) => void;
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

  // Town slots (5 total: index 0..4, built slots expose grey '+' cloud icon from right to left)
  const townSlotPositions = [
    { x: 120, y: 52 },
    { x: 186, y: 52 },
    { x: 252, y: 52 },
    { x: 318, y: 52 },
    { x: 384, y: 52 },
  ];

  // City slots (4 total: index 0..3, built slots expose 2 stacked grey '+' cloud icons from right to left)
  const citySlotPositions = [
    { x: 476, y: 52 },
    { x: 554, y: 52 },
    { x: 632, y: 52 },
    { x: 710, y: 52 },
  ];

  // Fossil Fuel Power Plant slots (2 rows x 3 columns = 6 slots at bottom-left)
  const fossilSlotPositions = [
    { x: 68, y: 314 },
    { x: 136, y: 314 },
    { x: 204, y: 314 },
    { x: 68, y: 382 },
    { x: 136, y: 382 },
    { x: 204, y: 382 },
  ];

  // Renewable Power Plant slots (3x3 grid at bottom-right with generous clearance below City Cost Strip)
  const renewableSlotPositions = [
    // Left column of 3
    { x: 616, y: 246 },
    { x: 616, y: 314 },
    { x: 616, y: 382 },
    // Middle column of 3
    { x: 694, y: 246 },
    { x: 694, y: 314 },
    { x: 694, y: 382 },
    // Rightmost column of 3
    { x: 772, y: 246 },
    { x: 772, y: 314 },
    { x: 772, y: 382 },
  ];

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
          maxWidth: compact ? '420px' : '640px',
          background: '#17191c',
          borderRadius: '14px',
          padding: '6px',
          boxShadow: isActiveTurn
            ? `0 0 0 2px ${pTheme.fill}, 0 10px 28px rgba(0,0,0,0.65)`
            : '0 8px 22px rgba(0,0,0,0.55)',
          border: `2px solid ${isActiveTurn ? pTheme.fill : '#363b42'}`,
        }}
      >
        <svg
          viewBox="0 0 860 440"
          width="100%"
          style={{ display: 'block', userSelect: 'none' }}
        >
          <defs>
            <linearGradient id={`matSkyGrad-${player.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#263d66" style={{ stopColor: '#263d66' }} />
              <stop offset="65%" stopColor="#324c78" style={{ stopColor: '#324c78' }} />
              <stop offset="100%" stopColor="#485d87" style={{ stopColor: '#485d87' }} />
            </linearGradient>

            <linearGradient id={`bridgeTwilight-${player.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2c4570" style={{ stopColor: '#2c4570' }} />
              <stop offset="55%" stopColor="#565278" style={{ stopColor: '#565278' }} />
              <stop offset="100%" stopColor="#8c6f85" style={{ stopColor: '#8c6f85' }} />
            </linearGradient>

            <linearGradient id={`meadowGreen-${player.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7aa646" style={{ stopColor: '#7aa646' }} />
              <stop offset="50%" stopColor="#6b9c3e" style={{ stopColor: '#6b9c3e' }} />
              <stop offset="100%" stopColor="#528732" style={{ stopColor: '#528732' }} />
            </linearGradient>

            <clipPath id={`matShapeClip-${player.id}`}>
              {/* Exact stepped cardboard die-cut silhouette from player-mat-reference.png */}
              <path d="M 56 14 L 780 14 Q 796 14, 796 30 L 796 52 L 832 52 Q 848 52, 848 68 L 848 412 Q 848 428, 832 428 L 28 428 Q 12 428, 12 412 L 12 68 Q 12 52, 28 52 L 56 52 Z" />
            </clipPath>
          </defs>

          {/* Stepped Cream Cardboard Base Frame */}
          <path
            d="M 56 10 L 780 10 Q 800 10, 800 30 L 800 48 L 832 48 Q 852 48, 852 68 L 852 414 Q 852 432, 832 432 L 28 432 Q 8 432, 8 414 L 8 68 Q 8 48, 28 48 L 56 48 Z"
            fill="#e9e7de"
            stroke="#b8b4a6"
            strokeWidth={3}
          />

          {/* Main Clipped Artwork Interior */}
          <g clipPath={`url(#matShapeClip-${player.id})`}>
            {/* 1. Top Navy/Twilight Sky Backdrop */}
            <rect x={10} y={12} width={840} height={270} fill="#324c78" />
            <rect x={10} y={12} width={840} height={270} fill={`url(#matSkyGrad-${player.id})`} />

            {/* Left & Right Sky Clouds */}
            <path
              d="M 10 60 Q 55 58, 72 95 Q 98 115, 112 165 Q 150 175, 190 220 L 190 290 L 10 290 Z"
              fill="#c5daeb"
              opacity={0.92}
            />
            <path
              d="M 850 60 Q 808 65, 804 115 Q 785 155, 725 170 Q 675 182, 665 245 L 850 265 Z"
              fill="#c5daeb"
              opacity={0.9}
            />

            {/* 2. Upper-Left Angled Development Card Frame (1 Food, 1 Fiber, 1 Steel) */}
            <g
              data-testid="mat-buy-dev-card"
              transform="translate(148, 168) rotate(-6)"
              onClick={() => {
                if (canAffordDevCard) onBuyDevCard?.();
              }}
              style={{ cursor: canAffordDevCard ? 'pointer' : 'default' }}
              role="button"
              tabIndex={0}
              aria-label="Buy Development Card (Cost: 1 Food, 1 Natural Fiber, 1 Steel)"
            >
              <rect
                x={-44}
                y={-40}
                width={92}
                height={82}
                rx={8}
                fill="#f2f0e6"
                stroke={canAffordDevCard ? '#f5d11d' : '#9c9688'}
                strokeWidth={canAffordDevCard ? 3 : 1.5}
              />
              {/* 3 Cost Icons on Left of Card */}
              <ResourceIconSvg type="food" cx={-26} cy={-21} scale={0.95} />
              <ResourceIconSvg type="natural_fiber" cx={-26} cy={1} scale={0.95} />
              <ResourceIconSvg type="steel" cx={-26} cy={23} scale={0.95} />

              {/* Sunrise-over-Lake Dev Card Art */}
              <rect x={-6} y={-30} width={44} height={64} rx={4} fill="#7ac1e4" stroke="#ffffff" strokeWidth={1.5} />
              <circle cx={16} cy={-4} r={10} fill="#f5d76e" />
              <path d="M -6 6 Q 10 -2, 24 4 L 38 2 L 38 34 L -6 34 Z" fill="#3a6b4c" />
              <path d="M -6 17 L 38 17 L 38 34 L -6 34 Z" fill="#2c5e8a" />
            </g>

            {/* 3. Center Twilight Highway Bridge Frame (Road Cost: 1 Lumber, 1 Brick) */}
            <g
              data-testid="mat-build-road"
              onClick={() => {
                if (canAffordRoad) {
                  onSelectBuildMode?.(activeBuildMode === 'BUILD_ROAD' ? null : 'BUILD_ROAD');
                }
              }}
              style={{ cursor: canAffordRoad ? 'pointer' : 'default' }}
              role="button"
              tabIndex={0}
              aria-label={`Build Road (Cost: 1 Lumber, 1 Brick). ${player.roadsInReserve} roads in reserve.`}
            >
              <rect
                x={216}
                y={96}
                width={492}
                height={152}
                rx={12}
                fill={`url(#bridgeTwilight-${player.id})`}
                stroke={
                  activeBuildMode === 'BUILD_ROAD'
                    ? '#f5d11d'
                    : canAffordRoad
                      ? '#a8e6b8'
                      : '#ebe8df'
                }
                strokeWidth={activeBuildMode === 'BUILD_ROAD' ? 4 : 5}
              />

              {/* Road Cost Corner Tab (1 Lumber, 1 Brick) */}
              <path
                d="M 216 96 L 266 96 L 266 142 Q 266 154, 252 154 L 216 154 Z"
                fill="#ebe8df"
              />
              <ResourceIconSvg type="lumber" cx={238} cy={112} scale={1.15} />
              <ResourceIconSvg type="brick" cx={238} cy={135} scale={1.15} />

              {/* Highway Overpass Concrete Deck & Pillars Artwork */}
              <path
                d="M 218 148 L 365 215 M 310 210 L 705 154"
                stroke="#9aa5b8"
                strokeWidth={14}
                fill="none"
              />
              <path
                d="M 218 143 L 365 210 M 310 204 L 705 148"
                stroke="#d0d8e6"
                strokeWidth={4}
                fill="none"
              />
              {/* Bridge Support Pillars */}
              {[258, 294, 420, 515, 608].map((px, i) => (
                <rect key={i} x={px} y={175} width={8} height={65} fill="#798296" />
              ))}

              {/* Reserve Wooden Road Sticks Badge along the Bridge */}
              <g transform="translate(465, 118)">
                <rect
                  x={-98}
                  y={-13}
                  width={196}
                  height={24}
                  rx={12}
                  fill="rgba(20, 26, 38, 0.78)"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={1}
                />
                <text x={0} y={3} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#f0f4f8">
                  ROADS IN RESERVE: {player.roadsInReserve} / 12
                </text>
              </g>
            </g>

            {/* 4. Distant Purple Mountains & Power Transmission Lines */}
            <path
              d="M 150 285 L 255 232 L 325 256 L 445 224 L 545 255 L 660 228 L 848 272 L 848 310 L 10 310 Z"
              fill="#9992a3"
              stroke="#787282"
              strokeWidth={1.5}
            />

            {/* 5. Bottom Lush Green Valley Floor */}
            <path
              d="M 10 278 Q 140 272, 290 296 L 620 296 Q 760 270, 850 266 L 850 428 L 10 428 Z"
              fill={`url(#meadowGreen-${player.id})`}
            />

            {/* 6. Left Industrial Factory & Twin Striped Smokestacks */}
            <g className="industrial-factory">
              {/* Smoke Plumes */}
              <path
                d="M 74 148 Q 52 108, 45 75 Q 72 82, 92 120 Q 108 135, 104 162 Z"
                fill="#e6ebf0"
                opacity={0.85}
              />
              {/* Smokestack 1 */}
              <rect x={68} y={148} width={12} height={95} fill="#d8d6ce" stroke="#8c887d" strokeWidth={1} />
              {[158, 178, 198, 218].map((sy) => (
                <rect key={sy} x={68} y={sy} width={12} height={8} fill="#d9a738" />
              ))}
              {/* Smokestack 2 */}
              <rect x={94} y={162} width={12} height={82} fill="#d8d6ce" stroke="#8c887d" strokeWidth={1} />
              {[172, 192, 212].map((sy) => (
                <rect key={sy} x={94} y={sy} width={12} height={8} fill="#d9a738" />
              ))}
              {/* Factory Building */}
              <polygon
                points="46,245 78,232 174,242 174,295 46,282"
                fill="#e3e1da"
                stroke="#8a867c"
                strokeWidth={1.5}
              />
              <polygon points="46,245 78,232 78,285 46,282" fill="#9c9488" />
              {[92, 112, 132, 152].map((wx) => (
                <rect key={wx} x={wx} y={248} width={6} height={14} fill="#7a828c" />
              ))}
            </g>

            {/* 7. Right White Wind Turbines */}
            <g className="wind-turbines" pointerEvents="none">
              {/* Background Turbine */}
              <g transform="translate(642, 208)">
                <line x1={0} y1={0} x2={0} y2={105} stroke="#dcdad2" strokeWidth={4} />
                <circle cx={0} cy={0} r={3.5} fill="#ffffff" stroke="#8c8f94" strokeWidth={1} />
                {[25, 145, 265].map((deg) => (
                  <polygon
                    key={deg}
                    points="0,0 -3,-48 0,-54 3,-48"
                    transform={`rotate(${deg})`}
                    fill="#f4f5f0"
                    stroke="#9ea3a8"
                    strokeWidth={0.7}
                  />
                ))}
              </g>
              {/* Foreground Tall Turbine */}
              <g transform="translate(718, 178)">
                <line x1={0} y1={0} x2={12} y2={245} stroke="#e6e4dc" strokeWidth={7} />
                <circle cx={0} cy={0} r={5} fill="#ffffff" stroke="#7a7d82" strokeWidth={1.2} />
                {[12, 132, 252].map((deg) => (
                  <polygon
                    key={deg}
                    points="0,0 -4.5,-85 0,-95 4.5,-85"
                    transform={`rotate(${deg})`}
                    fill="#ffffff"
                    stroke="#8c9196"
                    strokeWidth={0.9}
                  />
                ))}
              </g>
            </g>

            {/* =============================================================== */}
            {/* 8. TOP BAR: 5 TOWN SLOTS (LEFT) & 4 CITY SLOTS (RIGHT)          */}
            {/* =============================================================== */}
            {/* Left Town Cost Strip (1 Lumber, 1 Brick, 1 Food, 1 Fiber) */}
            <g transform="translate(56, 16)">
              <rect x={0} y={0} width={36} height={84} rx={6} fill="#ebe8df" stroke="#b8b4a6" strokeWidth={1} />
              <ResourceIconSvg type="lumber" cx={18} cy={13} scale={1.0} />
              <ResourceIconSvg type="brick" cx={18} cy={33} scale={1.0} />
              <ResourceIconSvg type="food" cx={18} cy={53} scale={1.0} />
              <ResourceIconSvg type="natural_fiber" cx={18} cy={73} scale={1.0} />
            </g>

            {/* 5 Town Recessed Slots */}
            {townSlotPositions.map((pos, idx) => {
              const hasPieceInReserve = idx < player.townsInReserve;
              const isTownMode = activeBuildMode === 'BUILD_TOWN';

              return (
                <g
                  key={`town-slot-${idx}`}
                  data-testid={`mat-town-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordTown) {
                      onSelectBuildMode?.(isTownMode ? null : 'BUILD_TOWN');
                    }
                  }}
                  style={{ cursor: canAffordTown ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Town reserve slot ${idx + 1}: ${hasPieceInReserve ? 'In reserve' : 'Built on board (+1 Local Footprint)'}`}
                >
                  {/* Town Outline Recess */}
                  <polygon
                    points="-22,-8 -4,-25 18,-15 22,16 0,25 -22,15"
                    fill="rgba(26, 38, 58, 0.55)"
                    stroke={isTownMode && hasPieceInReserve ? '#f5d11d' : 'rgba(214, 224, 240, 0.65)'}
                    strokeWidth={isTownMode && hasPieceInReserve ? 2.5 : 1.3}
                  />
                  {/* Exposed +1 Pollution Cloud underneath */}
                  <FootprintCloudIconSvg type="plus" cx={0} cy={2} scale={1.15} />

                  {/* 3D Wooden Town Piece when still in reserve */}
                  {hasPieceInReserve && (
                    <TownPieceSvg playerId={player.id} cx={0} cy={0} scale={1.95} />
                  )}
                </g>
              );
            })}

            {/* 4 City Recessed Slots */}
            {citySlotPositions.map((pos, idx) => {
              const hasPieceInReserve = idx < player.citiesInReserve;
              const isCityMode = activeBuildMode === 'BUILD_CITY';

              return (
                <g
                  key={`city-slot-${idx}`}
                  data-testid={`mat-city-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordCity) {
                      onSelectBuildMode?.(isCityMode ? null : 'BUILD_CITY');
                    }
                  }}
                  style={{ cursor: canAffordCity ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`City reserve slot ${idx + 1}: ${hasPieceInReserve ? 'In reserve' : 'Built on board (+2 Local Footprint)'}`}
                >
                  {/* City Outline Recess */}
                  <polygon
                    points="-12,-28 12,-28 28,-12 28,14 12,28 -12,28 -28,14 -28,-12"
                    fill="rgba(26, 38, 58, 0.55)"
                    stroke={isCityMode && hasPieceInReserve ? '#f5d11d' : 'rgba(214, 224, 240, 0.65)'}
                    strokeWidth={isCityMode && hasPieceInReserve ? 2.5 : 1.3}
                  />
                  {/* Exposed TWO Stacked + Pollution Clouds (+2 LF) underneath */}
                  <FootprintCloudIconSvg type="plus" cx={0} cy={-10} scale={1.02} />
                  <FootprintCloudIconSvg type="plus" cx={0} cy={11} scale={1.02} />

                  {/* 3D Wooden City Piece when still in reserve */}
                  {hasPieceInReserve && (
                    <CityPieceSvg playerId={player.id} cx={0} cy={0} scale={1.9} />
                  )}
                </g>
              );
            })}

            {/* Right City Cost Strip (2 Food, 3 Steel) */}
            <g transform="translate(756, 16)">
              <rect x={0} y={0} width={38} height={106} rx={6} fill="#ebe8df" stroke="#b8b4a6" strokeWidth={1} />
              <ResourceIconSvg type="food" cx={19} cy={13} scale={1.0} />
              <ResourceIconSvg type="food" cx={19} cy={33} scale={1.0} />
              <ResourceIconSvg type="steel" cx={19} cy={53} scale={1.0} />
              <ResourceIconSvg type="steel" cx={19} cy={73} scale={1.0} />
              <ResourceIconSvg type="steel" cx={19} cy={93} scale={1.0} />
            </g>

            {/* =============================================================== */}
            {/* 9. BOTTOM-LEFT: 6 FOSSIL FUEL POWER PLANTS (Cost: 1 Science)    */}
            {/* =============================================================== */}
            {/* 1 Science Cost Badge at Far Bottom-Left */}
            <g transform="translate(18, 344)">
              <rect x={0} y={0} width={28} height={68} rx={10} fill="#ebe8df" stroke="#9ea399" strokeWidth={1.2} />
              <ResourceIconSvg type="science" cx={14} cy={34} scale={1.45} />
            </g>

            {fossilSlotPositions.map((pos, idx) => {
              const hasPlantInReserve = idx < player.fossilPlantsInReserve;
              const isFossilMode = activeBuildMode === 'BUILD_FOSSIL_PLANT';

              return (
                <g
                  key={`fossil-slot-${idx}`}
                  data-testid={`mat-fossil-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordFossil) {
                      onSelectBuildMode?.(isFossilMode ? null : 'BUILD_FOSSIL_PLANT');
                    }
                  }}
                  style={{ cursor: canAffordFossil ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Fossil Power Plant slot ${idx + 1}: ${hasPlantInReserve ? 'In reserve (Cost: 1 Science)' : 'Built on board (+1 Local Footprint)'}`}
                >
                  <circle
                    cx={0}
                    cy={0}
                    r={22}
                    fill="rgba(34, 42, 34, 0.45)"
                    stroke={isFossilMode && hasPlantInReserve ? '#f5d11d' : 'rgba(255,255,255,0.75)'}
                    strokeWidth={isFossilMode && hasPlantInReserve ? 3 : 1.5}
                    strokeDasharray={hasPlantInReserve ? undefined : '4 3'}
                  />
                  {/* Underlying +1 Pollution Cloud */}
                  <FootprintCloudIconSvg type="plus" cx={0} cy={1} scale={1.15} />

                  {/* 3D Dark-Brown Fossil Plant Cylinder */}
                  {hasPlantInReserve && (
                    <PowerPlantCylinderSvg type="fossil" cx={0} cy={0} r={19.5} />
                  )}
                </g>
              );
            })}

            {/* =============================================================== */}
            {/* 10. BOTTOM-CENTER: WAREHOUSE, ENERGY PYLONS & 5-BOLT ENERGY BAR */}
            {/* =============================================================== */}
            {/* Interactive Warehouse Tile */}
            <g
              data-testid="warehouse-tile"
              transform="translate(292, 246)"
              onClick={() => {
                if (canAffordWarehouse) onBuildWarehouse?.();
              }}
              style={{ cursor: canAffordWarehouse ? 'pointer' : 'default' }}
              role="button"
              tabIndex={0}
              aria-label={
                player.hasWarehouse
                  ? 'Warehouse Active: Hand limit on roll of 7 is raised to 10 cards'
                  : 'Build Warehouse (Cost: 2 Energy tokens). Raises hand limit on roll of 7 from 7 to 10 cards.'
              }
            >
              <rect
                x={0}
                y={0}
                width={104}
                height={70}
                rx={6}
                fill={player.hasWarehouse ? '#e8f4ea' : '#dcd9d0'}
                stroke={canAffordWarehouse ? '#f5d11d' : '#595e66'}
                strokeWidth={canAffordWarehouse ? 3 : 2}
              />
              {/* Warehouse Roof lines */}
              <polygon points="0,12 52,2 104,12 104,20 0,20" fill="#8c929c" />

              {!player.hasWarehouse ? (
                <>
                  {/* 2 Energy Bolts Cost + Flip Arrow */}
                  <EnergyBoltSvg cx={28} cy={40} scale={1.15} />
                  <EnergyBoltSvg cx={46} cy={42} scale={1.15} />
                  <rect x={64} y={36} width={28} height={24} rx={2} fill="#4d535c" />
                  <path
                    d="M 74 32 Q 86 20, 94 34"
                    fill="none"
                    stroke="#22252a"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                  <polygon points="94,34 90,29 97,29" fill="#22252a" />
                </>
              ) : (
                <>
                  {/* Active Warehouse: <= 10 Hand Limit Badge */}
                  <rect x={12} y={24} width={80} height={38} rx={4} fill="#2e8540" />
                  <text x={52} y={42} textAnchor="middle" fontSize="14" fontWeight="900" fill="#ffffff">
                    &le; 10 CARDS
                  </text>
                  <text x={52} y={55} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#d9f2e1">
                    WAREHOUSE ACTIVE
                  </text>
                </>
              )}
            </g>

            {/* 3 Power-Line Pylon Energy Action Buttons */}
            {/* Action 1: 2 Energy -> 1 Resource/Science Card */}
            <g
              data-testid="energy-action-buy-card"
              transform="translate(425, 278)"
              onClick={() => {
                if (canEnergyBuyCard) onOpenEnergyBuyCardModal?.();
              }}
              style={{ cursor: canEnergyBuyCard ? 'pointer' : 'default' }}
              role="button"
              tabIndex={0}
              aria-label="Spend 2 Energy to take any 1 Resource or Science card from supply"
            >
              <rect
                x={-22}
                y={-34}
                width={44}
                height={66}
                rx={6}
                fill={canEnergyBuyCard ? 'rgba(245, 209, 29, 0.22)' : 'transparent'}
                stroke={canEnergyBuyCard ? '#f5d11d' : 'transparent'}
                strokeWidth={1.5}
              />
              <EnergyBoltSvg cx={-6} cy={-22} scale={0.68} />
              <EnergyBoltSvg cx={5} cy={-20} scale={0.68} />
              {/* Mini Resource/Science Split Card Icon */}
              <rect x={-11} y={-2} width={22} height={30} rx={3} fill="#f4f5f0" stroke="#2c3540" strokeWidth={1.2} />
              <circle cx={0} cy={13} r={6} fill="#3a8f4c" />
            </g>

            {/* Action 2: 1 Energy -> Remove 1 Hazard Cog */}
            <g
              data-testid="energy-action-clean-hazard"
              transform="translate(478, 278)"
              onClick={() => {
                if (canEnergyCleanHazard) {
                  onSelectBuildMode?.(activeBuildMode === 'CLEAN_HAZARD' ? null : 'CLEAN_HAZARD');
                }
              }}
              style={{ cursor: canEnergyCleanHazard ? 'pointer' : 'default' }}
              role="button"
              tabIndex={0}
              aria-label="Spend 1 Energy to clean 1 Hazard token from any hex or building"
            >
              <rect
                x={-24}
                y={-34}
                width={48}
                height={66}
                rx={6}
                fill={
                  activeBuildMode === 'CLEAN_HAZARD'
                    ? 'rgba(245, 209, 29, 0.4)'
                    : canEnergyCleanHazard
                      ? 'rgba(245, 209, 29, 0.18)'
                      : 'transparent'
                }
                stroke={
                  activeBuildMode === 'CLEAN_HAZARD'
                    ? '#ffffff'
                    : canEnergyCleanHazard
                      ? '#f5d11d'
                      : 'transparent'
                }
                strokeWidth={1.8}
              />
              <EnergyBoltSvg cx={0} cy={-21} scale={0.68} />
              <circle cx={0} cy={12} r={11} fill="none" stroke="#8c8f94" strokeWidth={3.5} strokeDasharray="4 2" />
              <path d="M 4 2 L 15 -4" stroke="#141619" strokeWidth={2.2} strokeLinecap="round" />
            </g>

            {/* Action 3: 1 Energy -> Demolish 1 Fossil Plant (x1 per turn) */}
            <g
              data-testid="energy-action-demolish-plant"
              transform="translate(534, 278)"
              onClick={() => {
                if (canEnergyDemolish) {
                  onSelectBuildMode?.(activeBuildMode === 'DEMOLISH_PLANT' ? null : 'DEMOLISH_PLANT');
                }
              }}
              style={{ cursor: canEnergyDemolish ? 'pointer' : 'default' }}
              role="button"
              tabIndex={0}
              aria-label="Spend 1 Energy to demolish 1 of your built Fossil Fuel Power Plants (-1 Local Footprint, max 1 per turn)"
            >
              <rect
                x={-26}
                y={-34}
                width={52}
                height={66}
                rx={6}
                fill={
                  activeBuildMode === 'DEMOLISH_PLANT'
                    ? 'rgba(245, 209, 29, 0.4)'
                    : canEnergyDemolish
                      ? 'rgba(245, 209, 29, 0.18)'
                      : 'transparent'
                }
                stroke={
                  activeBuildMode === 'DEMOLISH_PLANT'
                    ? '#ffffff'
                    : canEnergyDemolish
                      ? '#f5d11d'
                      : 'transparent'
                }
                strokeWidth={1.8}
              />
              <EnergyBoltSvg cx={-4} cy={-21} scale={0.68} />
              <ellipse cx={-3} cy={14} rx={10} ry={8} fill="#261c15" stroke="#8c6239" strokeWidth={1.2} />
              {/* Red x1 per turn badge */}
              <circle cx={15} cy={-2} r={8.5} fill="#c93b2b" stroke="#ffffff" strokeWidth={1.2} />
              <text x={15} y={1.5} textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#ffffff">
                x1
              </text>
            </g>

            {/* Yellow 5-Slot Energy Storage Bar (`[data-testid="energy-bar"]`) */}
            <g data-testid="energy-bar" transform="translate(290, 316)">
              <rect
                x={0}
                y={0}
                width={272}
                height={58}
                rx={12}
                fill="#d9b338"
                stroke="#8c6d14"
                strokeWidth={2}
              />
              {Array.from({ length: 5 }, (_, eIdx) => {
                const bx = 30 + eIdx * 53;
                const by = 29;
                const isFilled = eIdx < player.energy;
                return (
                  <g key={eIdx} data-testid={`energy-slot-${eIdx}`}>
                    <EnergyBoltSvg cx={bx} cy={by} scale={1.45} empty={!isFilled} />
                  </g>
                );
              })}
            </g>

            {/* Bottom-Center 1-Power-Plant-Per-Turn Indicator Badge */}
            <g transform="translate(426, 398)" data-testid="plant-limit-badge">
              <rect
                x={-60}
                y={-18}
                width={120}
                height={34}
                rx={8}
                fill="#ebe8df"
                stroke={plantLimitReached ? '#c93b2b' : '#9ea399'}
                strokeWidth={1.5}
              />
              <ellipse cx={-34} cy={0} rx={12} ry={9} fill="#2e2018" />
              <circle cx={0} cy={0} r={9.5} fill="#c93b2b" />
              <text x={0} y={3.5} textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#ffffff">
                x1
              </text>
              <ellipse cx={34} cy={0} rx={12} ry={9} fill="#2e8540" />
            </g>

            {/* =============================================================== */}
            {/* 11. BOTTOM-RIGHT: 9 RENEWABLE POWER PLANTS & GREEN EVENT DISCS  */}
            {/* =============================================================== */}
            {/* 3 Science Cost Badge at Far Bottom-Right */}
            <g transform="translate(812, 318)">
              <rect x={0} y={0} width={30} height={96} rx={10} fill="#ebe8df" stroke="#9ea399" strokeWidth={1.2} />
              <ResourceIconSvg type="science" cx={15} cy={22} scale={1.3} />
              <ResourceIconSvg type="science" cx={15} cy={50} scale={1.3} />
              <ResourceIconSvg type="science" cx={15} cy={78} scale={1.3} />
            </g>

            {renewableSlotPositions.map((pos, idx) => {
              const hasPlantInReserve = idx < player.renewablePlantsInReserve;
              const isRenewableMode = activeBuildMode === 'BUILD_RENEWABLE_PLANT';

              return (
                <g
                  key={`renewable-slot-${idx}`}
                  data-testid={`mat-renewable-slot-${idx}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    if (canAffordRenewable) {
                      onSelectBuildMode?.(isRenewableMode ? null : 'BUILD_RENEWABLE_PLANT');
                    }
                  }}
                  style={{ cursor: canAffordRenewable ? 'pointer' : 'default' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Renewable Power Plant slot ${idx + 1}: ${hasPlantInReserve ? 'In reserve with hidden Green Event Disc (Cost: 3 Science)' : 'Built on board (-1 Local Footprint)'}`}
                >
                  <circle
                    cx={0}
                    cy={0}
                    r={22}
                    fill="rgba(26, 56, 32, 0.45)"
                    stroke={isRenewableMode && hasPlantInReserve ? '#f5d11d' : 'rgba(255,255,255,0.75)'}
                    strokeWidth={isRenewableMode && hasPlantInReserve ? 3 : 1.5}
                    strokeDasharray={hasPlantInReserve ? undefined : '4 3'}
                  />
                  {/* Underlying -1 Clean Cloud Icon */}
                  <FootprintCloudIconSvg type="minus" cx={0} cy={1} scale={1.15} />

                  {/* Face-Down Green Event Disc + 3D Dark-Green Renewable Plant Cylinder */}
                  {hasPlantInReserve && (
                    <PowerPlantCylinderSvg
                      type="renewable"
                      cx={0}
                      cy={0}
                      r={19.5}
                      hasGreenDiscUnderneath={true}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* =================================================================== */}
      {/* PART B: INTEGRATED RESOURCE & SCIENCE CARD ORGANISER TRAY           */}
      {/* =================================================================== */}
      {!compact && (
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
