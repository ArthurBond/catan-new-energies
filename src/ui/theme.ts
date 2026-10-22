/**
 * CATAN: New Energies — Tabletop Theme, Palette, Geometry & Metadata
 */

import {
  DevelopmentCardType,
  EventDiscType,
  HexCoord,
  PlayerId,
  ResourceType,
  TerrainType,
} from '../engine/types';

export const TABLETOP_THEME = {
  tablecloth: {
    darkWeave: '#1e2022',
    lightWeave: '#e8eaed',
    midIntersection: '#7c8288',
    squareSizePx: 28,
  },
  board: {
    roadLatticeFill: '#f4f5f0',
    roadLatticeStroke: '#dcdfd6',
    oceanInner: '#66b3e6',
    oceanMid: '#4da0dc',
    oceanOuter: '#357ec2',
    oceanRim: '#1d568f',
    waveContour: 'rgba(255, 255, 255, 0.28)',
    numberDiscFill: '#f3efe2',
    numberDiscStroke: '#cbbca0',
    numberDiscRed: '#c93b2b',
    numberDiscCharcoal: '#22252a',
  },
  plants: {
    fossil: {
      fill: '#1f1712',
      topFill: '#3a2c22',
      stroke: '#0e0a07',
      bolt: '#f7d117',
      label: 'Fossil Fuel Power Plant',
    },
    renewable: {
      fill: '#17602e',
      topFill: '#2f9149',
      stroke: '#0f4420',
      bolt: '#f7d117',
      label: 'Renewable Power Plant',
    },
  },
  tokens: {
    hazard: {
      fill: '#8c8f94',
      innerFill: '#6a6d72',
      stroke: '#3a3d42',
    },
    inspector: {
      base: '#3a3d42',
      body: '#7a7d82',
      highlight: '#b0b4ba',
    },
    energy: {
      fill: '#f5d11d',
      highlight: '#fff078',
      side: '#c49b08',
      stroke: '#6e5200',
    },
  },
} as const;

export interface TerrainTheme {
  terrain: TerrainType;
  label: string;
  resourceLabel: string;
  primaryFill: string;
  secondaryFill: string;
  accentFill: string;
  borderFill: string;
}

export const TERRAIN_THEMES: Record<TerrainType, TerrainTheme> = {
  forest: {
    terrain: 'forest',
    label: 'Forest',
    resourceLabel: 'Lumber',
    primaryFill: '#264631',
    secondaryFill: '#345e40',
    accentFill: '#1b3323',
    borderFill: '#497a57',
  },
  hills: {
    terrain: 'hills',
    label: 'Hills',
    resourceLabel: 'Brick',
    primaryFill: '#b65c3b',
    secondaryFill: '#d07a57',
    accentFill: '#8f4226',
    borderFill: '#e09375',
  },
  pasture: {
    terrain: 'pasture',
    label: 'Pasture',
    resourceLabel: 'Natural Fiber',
    primaryFill: '#789c44',
    secondaryFill: '#93b858',
    accentFill: '#5c7a30',
    borderFill: '#aed173',
  },
  fields: {
    terrain: 'fields',
    label: 'Fields',
    resourceLabel: 'Food',
    primaryFill: '#dfb441',
    secondaryFill: '#f0ca62',
    accentFill: '#caa032',
    borderFill: '#fae08c',
  },
  mountains: {
    terrain: 'mountains',
    label: 'Mountains',
    resourceLabel: 'Steel',
    primaryFill: '#5e6978',
    secondaryFill: '#8a95a5',
    accentFill: '#3b424c',
    borderFill: '#aeb9c7',
  },
  desert: {
    terrain: 'desert',
    label: 'Desert',
    resourceLabel: 'No Yield',
    primaryFill: '#dcd0b4',
    secondaryFill: '#ebe2cc',
    accentFill: '#c5b492',
    borderFill: '#f5efe0',
  },
};

export interface PlayerTheme {
  id: PlayerId;
  name: string;
  displayColorName: string;
  fill: string;
  highlight: string;
  sideFill: string;
  stroke: string;
  outerHalo: string;
  emblem: 'Sun' | 'Wave' | 'Triangle' | 'Hexagon';
  textOnFill: string;
}

export const PLAYER_THEMES: Record<PlayerId, PlayerTheme> = {
  orange: {
    id: 'orange',
    name: 'Amber',
    displayColorName: 'Yellow / Amber',
    fill: '#f0b418',
    highlight: '#ffd04d',
    sideFill: '#b58205',
    stroke: '#5e4300',
    outerHalo: '#ffffff',
    emblem: 'Sun',
    textOnFill: '#1e190d',
  },
  blue: {
    id: 'blue',
    name: 'Azure',
    displayColorName: 'Blue',
    fill: '#3676c8',
    highlight: '#639fed',
    sideFill: '#1f4e8c',
    stroke: '#0f2e59',
    outerHalo: '#ffffff',
    emblem: 'Wave',
    textOnFill: '#ffffff',
  },
  pink: {
    id: 'pink',
    name: 'Magenta',
    displayColorName: 'Pink / Magenta',
    fill: '#d84b8a',
    highlight: '#f279af',
    sideFill: '#9e285d',
    stroke: '#5e1435',
    outerHalo: '#ffffff',
    emblem: 'Triangle',
    textOnFill: '#ffffff',
  },
  purple: {
    id: 'purple',
    name: 'Plum',
    displayColorName: 'Purple / Plum',
    fill: '#6b3578',
    highlight: '#9352a3',
    sideFill: '#451c4f',
    stroke: '#2d1236',
    outerHalo: '#f4f5f0',
    emblem: 'Hexagon',
    textOnFill: '#ffffff',
  },
};

export interface CardMetadata {
  key: ResourceType | 'science';
  label: string;
  shortLabel: string;
  bg: string;
  cardFill: string;
  accent: string;
  border: string;
  textColor: string;
  description: string;
}

export const CARD_METADATA: Record<ResourceType | 'science', CardMetadata> = {
  lumber: {
    key: 'lumber',
    label: 'Lumber',
    shortLabel: 'Lumber',
    bg: '#cfa95d',
    cardFill: '#f5ebd1',
    accent: '#6e4720',
    border: '#593d1c',
    textColor: '#2d1e0c',
    description: 'Harvested from Forests. Used for Roads (1) and Towns (1).',
  },
  brick: {
    key: 'brick',
    label: 'Brick',
    shortLabel: 'Brick',
    bg: '#cf7b57',
    cardFill: '#f7e1d7',
    accent: '#9c3d20',
    border: '#7a2e16',
    textColor: '#361509',
    description: 'Quarried from Hills. Used for Roads (1) and Towns (1).',
  },
  natural_fiber: {
    key: 'natural_fiber',
    label: 'Natural Fiber',
    shortLabel: 'Fiber',
    bg: '#9ec45e',
    cardFill: '#ebf5da',
    accent: '#4d7320',
    border: '#3e5c17',
    textColor: '#1f300a',
    description: 'Grown in Pastures. Used for Towns (1) and Dev Cards (1).',
  },
  food: {
    key: 'food',
    label: 'Food',
    shortLabel: 'Food',
    bg: '#ebd059',
    cardFill: '#fcf4d4',
    accent: '#b8860b',
    border: '#7a5c0d',
    textColor: '#332503',
    description: 'Harvested from Fields. Used for Towns (1), Cities (2), and Dev Cards (1).',
  },
  steel: {
    key: 'steel',
    label: 'Steel',
    shortLabel: 'Steel',
    bg: '#8d9aa8',
    cardFill: '#e6ebf0',
    accent: '#465261',
    border: '#2e3742',
    textColor: '#181e24',
    description: 'Mined from Mountains. Used for Cities (3) and Dev Cards (1).',
  },
  science: {
    key: 'science',
    label: 'Science',
    shortLabel: 'Science',
    bg: '#234a32',
    cardFill: '#d9f2e1',
    accent: '#2e8540',
    border: '#142e1e',
    textColor: '#0e2416',
    description: 'Produced by Cities (+1). Used for Fossil Plants (1) and Renewable Plants (3).',
  },
};

export interface EventTrackMetadata {
  type: EventDiscType;
  title: string;
  shortTitle: string;
  capacity: 3 | 4;
  category: 'brown' | 'green' | 'hybrid';
  angleDeg: number; // Standard clock angle on the circular sea frame (0 = 3 o'clock, -90 = 12 o'clock)
  ruleSummary: string;
}

export const EVENT_TRACK_METADATA: Record<EventDiscType, EventTrackMetadata> = {
  climateConference: {
    type: 'climateConference',
    title: 'Climate Conference',
    shortTitle: 'Climate Conf.',
    capacity: 3,
    category: 'hybrid',
    angleDeg: -135, // ~10:30 o'clock
    ruleSummary: 'Lowest LF player takes 1 card from supply; Highest LF player must discard 1 card.',
  },
  sustainableProduction: {
    type: 'sustainableProduction',
    title: 'Sustainable Production',
    shortTitle: 'Sust. Prod.',
    capacity: 4,
    category: 'green',
    angleDeg: -178, // ~9:00 o'clock
    ruleSummary: 'Player with the most Renewable Power Plants takes 1 Resource or Science card.',
  },
  governmentFunding: {
    type: 'governmentFunding',
    title: 'Government Funding',
    shortTitle: 'Gov. Funding',
    capacity: 3,
    category: 'green',
    angleDeg: 142, // ~7:30 o'clock
    ruleSummary: 'Player with the lowest Local Footprint draws 1 free Development Card.',
  },
  airPollution: {
    type: 'airPollution',
    title: 'Air Pollution',
    shortTitle: 'Air Pollution',
    capacity: 3,
    category: 'brown',
    angleDeg: 14, // ~3:30 o'clock
    ruleSummary: 'Highest LF player must place 1 Hazard token on one of their Cities (or Town if cities full).',
  },
  productionIncrease: {
    type: 'productionIncrease',
    title: 'Production Increase',
    shortTitle: 'Prod. Increase',
    capacity: 3,
    category: 'brown',
    angleDeg: 50, // ~4:40 o'clock
    ruleSummary: 'Highest LF player may build 1 free Fossil Plant and take 1 resource from its hex.',
  },
  environmentalPollution: {
    type: 'environmentalPollution',
    title: 'Environmental Pollution',
    shortTitle: 'Env. Pollution',
    capacity: 4,
    category: 'brown',
    angleDeg: 85, // ~5:50 o'clock
    ruleSummary: 'Roll dice (re-rolling 7s) and place 1 Hazard token on matching hexes (Inspector protects).',
  },
  rainAndFlooding: {
    type: 'rainAndFlooding',
    title: 'Rain & Flooding',
    shortTitle: 'Rain & Flood',
    capacity: 4,
    category: 'brown',
    angleDeg: 115, // ~6:50 o'clock
    ruleSummary: 'All players must place 1 Hazard token on one of their Towns or Cities.',
  },
};

export const DEV_CARD_METADATA: Record<
  DevelopmentCardType,
  { title: string; subtitle: string; color: string; description: string }
> = {
  cleanup: {
    title: 'Clean Up',
    subtitle: 'Environment Action',
    color: '#2e8540',
    description:
      'Move the inspector and take a card from a player with a building there, or remove a hazard and take a card from a player whose footprint is at least yours.',
  },
  roadConstruction: {
    title: 'Road Construction',
    subtitle: 'Progress Card',
    color: '#b65c3b',
    description: 'Build up to two roads for free, connected to your network.',
  },
  highYield: {
    title: 'High Yield',
    subtitle: 'Progress Card',
    color: '#dfb441',
    description: 'Collect one resource from each of up to three hexes where you have a renewable power plant.',
  },
  researchGrant: {
    title: 'Research Grant',
    subtitle: 'Progress Card',
    color: '#3676c8',
    description: 'Take any two resource or science cards from the supply.',
  },
  victoryPoint: {
    title: 'Victory Point',
    subtitle: '+1 Victory Point',
    color: '#f0b418',
    description: 'Keep it hidden. Reveal it on your turn when it takes you to 10 points.',
  },
};

// ============================================================================
// SVG Board Coordinate Geometry Helpers
// ============================================================================

export const HEX_RADIUS = 56; // Pointy-top outer radius in SVG units (board viewBox 1000x1000, center 500,500)
export const BOARD_CENTER_X = 500;
export const BOARD_CENTER_Y = 500;
export const SQRT3 = Math.sqrt(3);

/**
 * The 19-hex island (with its roads, pieces and harbors) is drawn in HEX_RADIUS units and then
 * scaled up around the board centre so it fills the sea frame like the printed board does.
 */
export const ISLAND_SCALE = 1.17;
export const ISLAND_TRANSFORM = `translate(${500 * (1 - ISLAND_SCALE)}, ${500 * (1 - ISLAND_SCALE)}) scale(${ISLAND_SCALE})`;

/**
 * Converts discrete integer lattice coordinates (u, v) from `board.ts`
 * into SVG (x, y) pixel coordinates around (BOARD_CENTER_X, BOARD_CENTER_Y).
 */
export function latticeToSvg(u: number, v: number, hexRadius = HEX_RADIUS): { x: number; y: number } {
  return {
    x: BOARD_CENTER_X + u * (SQRT3 / 2) * hexRadius,
    y: BOARD_CENTER_Y + v * 0.5 * hexRadius,
  };
}

/**
 * Converts axial hex coordinates (q, r) into SVG center (x, y).
 */
export function hexCoordToSvg(coord: HexCoord, hexRadius = HEX_RADIUS): { x: number; y: number } {
  const u0 = 2 * coord.q + coord.r;
  const v0 = 3 * coord.r;
  return latticeToSvg(u0, v0, hexRadius);
}

/**
 * Returns the 6 SVG polygon points string for a pointy-top hex centered at (cx, cy).
 */
export function getPointyHexPoints(cx: number, cy: number, radius: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleRad = ((60 * i - 90) * Math.PI) / 180;
    const px = cx + radius * Math.cos(angleRad);
    const py = cy + radius * Math.sin(angleRad);
    pts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return pts.join(' ');
}

/**
 * Returns the number of probability pips for a dice number (2..12).
 */
export function getNumberDiscPips(num: number): number {
  const map: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    8: 5,
    9: 4,
    10: 3,
    11: 2,
    12: 1,
  };
  return map[num] ?? 0;
}
