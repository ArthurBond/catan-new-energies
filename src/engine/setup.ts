/**
 * CATAN: New Energies — Game Setup
 *
 * Implements First Game (Fixed Setup) and Standard Game (Variable Snake Draft)
 * modes for 3 and 4 players, starting piece placement, starting hands,
 * component conservation, and Event Bag initialization.
 */

import {
  BOARD_CONSTANTS,
  BROWN_EVENT_DISC_COUNTS,
  DEV_CARD_COUNTS,
  GREEN_EVENT_DISC_COUNTS,
  TOTAL_ENERGY_TOKENS,
  TOTAL_HAZARD_TOKENS,
  TOTAL_RESOURCES_PER_TYPE,
  TOTAL_SCIENCE_CARDS,
} from './config';
import { createBoard } from './board';
import { clampGF, computePlayerLF, computeTrueTotalLF } from './footprint';
import { Mulberry32PRNG } from './prng';
import {
  Board,
  EventDiscType,
  GameState,
  GlobalSupplyState,
  HexTileConfig,
  PendingDecision,
  PlayerId,
  PlayerState,
  ResourceType,
  TerrainType,
} from './types';

export interface InitialGameOptions {
  setupMode?: 'first' | 'standard';
  playerCount?: 3 | 4;
  seed?: number;
  playerNames?: Partial<Record<PlayerId, string>>;
}

// Terrain to resource production mapping
export const TERRAIN_RESOURCE_MAP: Record<TerrainType, ResourceType | null> = {
  forest: 'lumber',
  hills: 'brick',
  pasture: 'natural_fiber',
  fields: 'food',
  mountains: 'steel',
  desert: null,
};

// Clockwise exterior-to-center spiral order of the 19 hexes
export const SPIRAL_HEX_ORDER: readonly number[] = [
  0, 1, 2, 6, 11, 15, 18, 17, 16, 12, 7, 3, 4, 5, 10, 14, 13, 8, 9,
] as const;

// Official A through R standard number disc values
export const SPIRAL_DISCS: readonly number[] = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11,
] as const;

// 19 standard terrain distribution tiles
export const STANDARD_TERRAIN_TILES: readonly TerrainType[] = [
  'forest', 'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields',
  'hills', 'hills', 'hills',
  'mountains', 'mountains', 'mountains',
  'desert',
] as const;

// First Game fixed starting settlement & road positions
interface FirstGamePlacement {
  cityNodeId: number;
  townNodeId: number;
}

const FIRST_GAME_PLACEMENTS: Record<PlayerId, FirstGamePlacement> = {
  orange: { cityNodeId: 10, townNodeId: 12 },
  purple: { cityNodeId: 23, townNodeId: 35 },
  pink:   { cityNodeId: 45, townNodeId: 39 },
  blue:   { cityNodeId: 25, townNodeId: 36 },
};

export function createInitialSupply(): GlobalSupplyState {
  // Construct 25 development cards
  const devDeck: string[] = [];
  for (let i = 0; i < DEV_CARD_COUNTS.cleanup; i++) devDeck.push('cleanup');
  for (let i = 0; i < DEV_CARD_COUNTS.roadConstruction; i++) devDeck.push('roadConstruction');
  for (let i = 0; i < DEV_CARD_COUNTS.highYield; i++) devDeck.push('highYield');
  for (let i = 0; i < DEV_CARD_COUNTS.researchGrant; i++) devDeck.push('researchGrant');
  for (let i = 0; i < DEV_CARD_COUNTS.victoryPoint; i++) devDeck.push('victoryPoint');

  return {
    resources: {
      lumber: TOTAL_RESOURCES_PER_TYPE,
      brick: TOTAL_RESOURCES_PER_TYPE,
      natural_fiber: TOTAL_RESOURCES_PER_TYPE,
      food: TOTAL_RESOURCES_PER_TYPE,
      steel: TOTAL_RESOURCES_PER_TYPE,
    },
    science: TOTAL_SCIENCE_CARDS,
    energy: TOTAL_ENERGY_TOKENS,
    hazards: TOTAL_HAZARD_TOKENS,
    devDeck,
  };
}

export function createInitialEventBag(prng: Mulberry32PRNG): EventDiscType[] {
  const bag: EventDiscType[] = [];
  for (let i = 0; i < BROWN_EVENT_DISC_COUNTS.climateConference; i++) bag.push('climateConference');
  for (let i = 0; i < BROWN_EVENT_DISC_COUNTS.rainAndFlooding; i++) bag.push('rainAndFlooding');
  for (let i = 0; i < BROWN_EVENT_DISC_COUNTS.airPollution; i++) bag.push('airPollution');
  for (let i = 0; i < BROWN_EVENT_DISC_COUNTS.productionIncrease; i++) bag.push('productionIncrease');
  for (let i = 0; i < BROWN_EVENT_DISC_COUNTS.environmentalPollution; i++) bag.push('environmentalPollution');

  return prng.shuffle(bag);
}

export function dealGreenDiscs(
  prng: Mulberry32PRNG,
  playerCount: 3 | 4
): Record<PlayerId, string[]> {
  const pool: EventDiscType[] = [];

  if (playerCount === 4) {
    for (let i = 0; i < GREEN_EVENT_DISC_COUNTS.sustainableProduction.total; i++) {
      pool.push('sustainableProduction');
    }
    for (let i = 0; i < GREEN_EVENT_DISC_COUNTS.governmentFunding.total; i++) {
      pool.push('governmentFunding');
    }
    for (let i = 0; i < GREEN_EVENT_DISC_COUNTS.climateConference.total; i++) {
      pool.push('climateConference');
    }
  } else {
    // 3P: Exactly 9 '4P' discs removed
    for (let i = 0; i < GREEN_EVENT_DISC_COUNTS.sustainableProduction.base3P; i++) {
      pool.push('sustainableProduction');
    }
    for (let i = 0; i < GREEN_EVENT_DISC_COUNTS.governmentFunding.base3P; i++) {
      pool.push('governmentFunding');
    }
    for (let i = 0; i < GREEN_EVENT_DISC_COUNTS.climateConference.base3P; i++) {
      pool.push('climateConference');
    }
  }

  const shuffled = prng.shuffle(pool);
  const activePlayers: PlayerId[] =
    playerCount === 4 ? ['orange', 'purple', 'pink', 'blue'] : ['orange', 'purple', 'pink'];

  const dealt: Partial<Record<PlayerId, string[]>> = {};
  activePlayers.forEach((pid, idx) => {
    dealt[pid] = shuffled.slice(idx * 9, (idx + 1) * 9);
  });

  return dealt as Record<PlayerId, string[]>;
}

export function createInitialPlayer(id: PlayerId, name: string): PlayerState {
  return {
    id,
    color: id,
    name,
    victoryPoints: 0,
    localFootprint: 0,
    energy: 0,
    hasWarehouse: false,
    resources: {
      lumber: 0,
      brick: 0,
      natural_fiber: 0,
      food: 0,
      steel: 0,
    },
    science: 0,
    devCards: {
      unplayed: [],
      played: [],
    },
    hiddenGreenDiscs: [],
    townsBuilt: 0,
    citiesBuilt: 0,
    roadsBuilt: 0,
    fossilPlantsBuilt: 0,
    renewablePlantsBuilt: 0,
    townsInReserve: BOARD_CONSTANTS.maxPlantsOnTown === 1 ? 5 : 5,
    citiesInReserve: 4,
    roadsInReserve: 12,
    fossilPlantsInReserve: 6,
    renewablePlantsInReserve: 9,
  };
}

export function createInitialGameState(options?: InitialGameOptions): GameState {
  const setupMode = options?.setupMode ?? 'first';
  const playerCount = options?.playerCount ?? 4;
  const seed = options?.seed ?? 42;

  const prng = new Mulberry32PRNG(seed);
  const supply = createInitialSupply();
  supply.devDeck = prng.shuffle(supply.devDeck);

  const playerOrder: PlayerId[] =
    playerCount === 4 ? ['orange', 'purple', 'pink', 'blue'] : ['orange', 'purple', 'pink'];

  const greenDiscs = dealGreenDiscs(prng, playerCount);

  // Initialize player states
  const players: Partial<Record<PlayerId, PlayerState>> = {};
  playerOrder.forEach((pid) => {
    const defaultName = pid.charAt(0).toUpperCase() + pid.slice(1);
    const name = options?.playerNames?.[pid] ?? defaultName;
    const player = createInitialPlayer(pid, name);
    player.hiddenGreenDiscs = greenDiscs[pid] ?? [];
    players[pid] = player;
  });

  let board: Board;

  if (setupMode === 'first') {
    // First Game fixed board layout
    board = createBoard();

    // Place fixed settlements & roads for each player
    playerOrder.forEach((pid) => {
      const placement = FIRST_GAME_PLACEMENTS[pid]!;
      const player = players[pid]!;

      // 1. Place City
      const cityNode = board.intersections[placement.cityNodeId]!;
      cityNode.building = { playerId: pid, type: 'city' };
      player.citiesBuilt = 1;
      player.citiesInReserve = 3;

      // 2. Place Town
      const townNode = board.intersections[placement.townNodeId]!;
      townNode.building = { playerId: pid, type: 'town' };
      player.townsBuilt = 1;
      player.townsInReserve = 4;

      // 3. Place 2 Roads (one incident to City, one incident to Town)
      // Pick empty incident edge for city
      const cityEdgeId = cityNode.incidentEdgeIds.find((eId) => board.edges[eId]?.road === null)!;
      board.edges[cityEdgeId]!.road = { playerId: pid };

      // Pick empty incident edge for town
      const townEdgeId = townNode.incidentEdgeIds.find((eId) => board.edges[eId]?.road === null)!;
      board.edges[townEdgeId]!.road = { playerId: pid };

      player.roadsBuilt = 2;
      player.roadsInReserve = 10;

      // Starting VP = 1 (town) + 2 (city) = 3
      player.victoryPoints = 3;

      // Starting LF = 3
      player.localFootprint = computePlayerLF(player);

      // 4. Starting Hand: 1 Resource per non-desert land hex adjacent to City + 1 Science card
      cityNode.adjacentHexIds.forEach((hId) => {
        const hex = board.hexes[hId]!;
        const res = TERRAIN_RESOURCE_MAP[hex.terrain];
        if (res !== null && supply.resources[res] > 0) {
          player.resources[res]++;
          supply.resources[res]--;
        }
      });

      if (supply.science > 0) {
        player.science++;
        supply.science--;
      }
    });

    const activePlayers = playerOrder.map((pid) => players[pid]!);
    const trueTotalLF = computeTrueTotalLF(activePlayers);
    const clampedGF = clampGF(trueTotalLF, playerCount);

    return {
      setupMode,
      playerCount,
      playerOrder,
      activePlayerId: playerOrder[0]!,
      currentTurn: 1,
      phase: 'EventPhase',
      board,
      players: players as Record<PlayerId, PlayerState>,
      trueTotalLF,
      clampedGF,
      eventBag: createInitialEventBag(prng),
      eventTracks: {
        environmentalPollution: 0,
        rainAndFlooding: 0,
        airPollution: 0,
        productionIncrease: 0,
        climateConference: 0,
        sustainableProduction: 0,
        governmentFunding: 0,
      },
      lockedDrawCount: null,
      supply,
      pendingDecisions: [],
      prng: prng.getState(),
      log: [
        {
          timestamp: Date.now(),
          message: `Game initialized in First Game mode with ${playerCount} players.`,
        },
      ],
      winner: null,
    };
  } else {
    // Standard Variable Snake Draft Setup
    // 1. Shuffle 19 terrain tiles
    const shuffledTerrains = prng.shuffle(STANDARD_TERRAIN_TILES);

    // 2. Spiral number discs A through R skipping Desert
    let discIdx = 0;
    const hexConfigs: HexTileConfig[] = [];

    // Pre-allocate configs
    for (let i = 0; i < 19; i++) {
      hexConfigs.push({ terrain: 'desert', numberDisc: null });
    }

    // Assign shuffled terrains to hex 0..18
    for (let i = 0; i < 19; i++) {
      hexConfigs[i]!.terrain = shuffledTerrains[i]!;
    }

    // Traverse in spiral order to assign discs
    for (const hId of SPIRAL_HEX_ORDER) {
      const terrain = hexConfigs[hId]!.terrain;
      if (terrain === 'desert') {
        hexConfigs[hId]!.numberDisc = null;
      } else {
        hexConfigs[hId]!.numberDisc = SPIRAL_DISCS[discIdx]!;
        discIdx++;
      }
    }

    board = createBoard(hexConfigs);

    // Players start with 0 pieces built
    playerOrder.forEach((pid) => {
      const player = players[pid]!;
      player.victoryPoints = 0;
      player.localFootprint = 0;
    });

    const initialDecision: PendingDecision = {
      id: 'setup-0',
      type: 'SETUP_PLACE_SETTLEMENT',
      playerId: playerOrder[0]!,
      round: 1,
    };

    return {
      setupMode,
      playerCount,
      playerOrder,
      activePlayerId: playerOrder[0]!,
      currentTurn: 0,
      phase: 'SetupDraft',
      board,
      players: players as Record<PlayerId, PlayerState>,
      trueTotalLF: 0,
      clampedGF: 0,
      eventBag: createInitialEventBag(prng),
      eventTracks: {
        environmentalPollution: 0,
        rainAndFlooding: 0,
        airPollution: 0,
        productionIncrease: 0,
        climateConference: 0,
        sustainableProduction: 0,
        governmentFunding: 0,
      },
      lockedDrawCount: null,
      supply,
      pendingDecisions: [initialDecision],
      prng: prng.getState(),
      log: [
        {
          timestamp: Date.now(),
          message: `Game initialized in Standard Variable Draft mode with ${playerCount} players.`,
        },
      ],
      winner: null,
    };
  }
}
