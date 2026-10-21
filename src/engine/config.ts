/**
 * CATAN: New Energies — Authoritative Game Configuration & Constants
 *
 * All values confirmed via rules_text.txt (R L...), docs/rules-summary.md,
 * and UI-design-style.png.
 */

// ============================================================================
// Resources and Cards
// ============================================================================

export const RESOURCE_TYPES = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const CARD_TYPES = [...RESOURCE_TYPES, 'science'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const TOTAL_RESOURCES_PER_TYPE = 19; // R L37-42: 19 of each resource (95 total)
export const TOTAL_SCIENCE_CARDS = 20;      // R L33: 20 Science cards
export const TOTAL_ENERGY_TOKENS = 20;      // R L68: 20 Energy tokens
export const MAX_PLAYER_ENERGY = 5;         // R L461-462: Hard cap 5 energy per player
export const TOTAL_HAZARD_TOKENS = 10;      // R L57: 10 Hazard tokens
export const MAX_HAZARDS_PER_LOCATION = 1;  // R L413: Max 1 Hazard per hex, town, or city

// ============================================================================
// Building & Action Costs
// ============================================================================

export type ResourceCost = Partial<Record<ResourceType | 'fiber', number>>;

export interface BuildingCost {
  readonly resources?: ResourceCost;
  readonly science?: number;
  readonly energy?: number;
}

export const BUILDING_COSTS = {
  road: {
    resources: { lumber: 1, brick: 1 },
  },
  town: {
    resources: { lumber: 1, brick: 1, fiber: 1, food: 1 },
  },
  city: {
    resources: { food: 2, steel: 3 },
  },
  fossilPlant: {
    science: 1, // R L655, R L713-717
  },
  renewablePlant: {
    science: 3, // R L1026, R L730-735
  },
  warehouse: {
    energy: 2,  // R L763-769
  },
  devCard: {
    resources: { fiber: 1, food: 1, steel: 1 }, // R L771-774
  },
} as const;

export const ENERGY_ACTION_COSTS = {
  buyCardFromSupply: 2,   // R L752-754: 2 energy -> 1 resource or science
  cleanUpHazard: 1,       // R L755-758: 1 energy -> remove 1 hazard
  demolishFossilPlant: 1, // R L759-762: 1 energy -> demolish 1 fossil plant (max 1/turn)
} as const;

// ============================================================================
// Local Footprint (LF) Deltas
// ============================================================================

export const LF_DELTAS = {
  town: 1,              // R L704-708: +1 LF
  cityGross: 2,         // R L588-589: City slot exposes +2 LF
  cityNetUpgrade: 1,    // R L646-651: Town replaced (+2 - 1 = +1 net)
  fossilPlant: 1,       // R L713-717: +1 LF
  renewablePlant: -1,   // R L730-735: -1 LF
  demolishFossilPlant: -1, // R L718-724: -1 LF
} as const;

export const STARTING_LF_PER_PLAYER = 3; // R L609-610: 1 Town (+1) + 1 City (+2) = 3 LF

// ============================================================================
// Global Footprint (GF) Configuration & Draw Bands
// ============================================================================

export interface DrawBand {
  readonly min: number;
  readonly max: number;
  readonly drawCount: number;
}

export interface GlobalFootprintConfig {
  readonly min: number;
  readonly max: number;
  readonly startingGf: number;
  readonly drawBands: readonly DrawBand[];
}

// 4-Player Side (4 Whales, R L131, L314-315, L608-614, L741-742)
export const GF_CONFIG_4P: GlobalFootprintConfig = {
  min: 0,
  max: 28,
  startingGf: 12, // 4 players * 3 LF
  drawBands: [
    { min: 0, max: 5, drawCount: 2 },   // Green zone: R L741-742
    { min: 6, max: 17, drawCount: 1 },  // Neutral zone (starts at 12)
    { min: 18, max: 23, drawCount: 2 }, // Brown zone (includes 21 per R L314)
    { min: 24, max: 28, drawCount: 3 }, // Dark smog zone
  ],
} as const;

// 3-Player Side (3 Whales, R L130, L614, scaled to max 21)
export const GF_CONFIG_3P: GlobalFootprintConfig = {
  min: 0,
  max: 21,
  startingGf: 9, // 3 players * 3 LF
  drawBands: [
    { min: 0, max: 5, drawCount: 2 },
    { min: 6, max: 13, drawCount: 1 },  // Neutral zone (starts at 9)
    { min: 14, max: 17, drawCount: 2 },
    { min: 18, max: 21, drawCount: 3 },
  ],
} as const;

// Helper to look up disc draw count from clamped GF
export function getEventDiscDrawCount(gf: number, playerCount: 3 | 4): number {
  const config = playerCount === 4 ? GF_CONFIG_4P : GF_CONFIG_3P;
  const clamped = Math.max(config.min, Math.min(config.max, gf));
  for (const band of config.drawBands) {
    if (clamped >= band.min && clamped <= band.max) {
      return band.drawCount;
    }
  }
  return 1;
}

// ============================================================================
// Event Tracks on the Sea Frame (7 Event Tracks)
// ============================================================================

export const EVENT_TRACK_LENGTHS = {
  // Brown Event Islands
  environmentalPollution: 4, // CONFIRMED R L352-355 (4 spaces)
  rainAndFlooding: 4,        // R L366-370 (4 spaces)
  airPollution: 3,           // UI-design-style.png 3 o'clock island (3 spaces)
  productionIncrease: 3,     // Bottom-right rocky island (3 spaces)

  // Brown / Green Shared Island
  climateConference: 3,      // R L394-397 (3 spaces)

  // Green Event Islands
  sustainableProduction: 4,  // UI-design-style.png 9 o'clock island (4 spaces)
  governmentFunding: 3,      // UI-design-style.png 7-8 o'clock island (3 spaces)
} as const;

export type EventTrackName = keyof typeof EVENT_TRACK_LENGTHS;

// ============================================================================
// Event Disc Bag & Distribution
// ============================================================================

// 43 Brown Discs (all start in the bag, R L83-93, L140)
export const BROWN_EVENT_DISC_COUNTS = {
  climateConference: 9,
  rainAndFlooding: 8,
  airPollution: 9,
  productionIncrease: 9,
  environmentalPollution: 8,
} as const;
export const TOTAL_BROWN_DISCS = 43;

// Green Discs (dealt 9 per player under Renewable Plants, R L94-106, L281-291)
export const TOTAL_GREEN_DISCS_4P = 36; // 4 players * 9 discs
export const TOTAL_GREEN_DISCS_3P = 27; // 3 players * 9 discs (9 marked '4P' removed)
export const GREEN_DISCS_REMOVED_IN_3P = 9;

export const GREEN_EVENT_DISC_COUNTS = {
  sustainableProduction: { total: 12, marked4P: 4, base3P: 8 },
  governmentFunding: { total: 12, marked4P: 4, base3P: 8 },
  climateConference: { total: 12, marked4P: 1, base3P: 11 },
} as const;

// ============================================================================
// Player Reserves & Supply Limits
// ============================================================================

export const PLAYER_PIECE_RESERVES = {
  towns: 5,           // 1 placed in setup, 4 in reserve
  cities: 4,          // 1 placed in setup, 3 in reserve
  roads: 12,          // 2 placed in setup, 10 in reserve
  fossilPlants: 6,    // 6 brown fossil power plants
  renewablePlants: 9, // 9 green renewable power plants
  warehouse: 1,       // 1 flippable warehouse tile
  vpCylinder: 1,      // 1 VP cylinder marker
} as const;

// Development Cards (25 Total, R L46-51, L770-830)
export const DEV_CARD_COUNTS = {
  cleanup: 14,
  roadConstruction: 2,
  highYield: 2,
  researchGrant: 2,
  victoryPoint: 5,
} as const;
export const TOTAL_DEV_CARDS = 25;

// ============================================================================
// Board Topology & Victory Conditions
// ============================================================================

export const BOARD_CONSTANTS = {
  totalHexes: 19,
  totalIntersections: 54,
  totalPathEdges: 72,
  totalHarbors: 9,
  genericHarborCount: 4,     // 3:1
  specializedHarborCount: 5, // 2:1 (one for each resource)
  startingVp: 3,             // 1 Town + 1 City
  winningVp: 10,             // Own turn condition
  handLimitStandard: 7,      // 7 roll discard threshold
  handLimitWarehouse: 10,    // Active warehouse threshold
  longestRoadMin: 5,         // Longest Trade Route minimum
  cleanestEnvMin: 3,         // Cleanest Environment minimum
  maxPowerPlantsBuiltPerTurn: 1, // R L656
  maxPlantsOnTown: 1,
  maxPlantsOnCity: 3,
} as const;
