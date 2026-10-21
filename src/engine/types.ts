/**
 * CATAN: New Energies — Engine Type Definitions
 */

export type HexId = number;        // 0..18
export type NodeId = number;       // 0..53 (intersections)
export type EdgeId = number;       // 0..71 (path edges)
export type HarborId = number;     // 0..8
export type PlayerId = 'blue' | 'orange' | 'pink' | 'purple';

export interface HexCoord {
  readonly q: number;
  readonly r: number;
}

export type TerrainType =
  | 'forest'
  | 'hills'
  | 'pasture'
  | 'fields'
  | 'mountains'
  | 'desert';

export type ResourceType =
  | 'lumber'
  | 'brick'
  | 'natural_fiber'
  | 'food'
  | 'steel';

export type BuildingType = 'town' | 'city';
export type PowerPlantType = 'fossil' | 'renewable';

export type HarborType = 'generic' | ResourceType;

export interface Building {
  readonly playerId: PlayerId;
  type: BuildingType;
}

export interface Road {
  readonly playerId: PlayerId;
}

export interface PowerPlant {
  readonly playerId: PlayerId;
  readonly type: PowerPlantType;
  readonly hexId: HexId;
}

export interface CutoutSlot {
  readonly nodeId: NodeId;
  readonly hexId: HexId;
  readonly plant: PowerPlant | null;
}

export interface Hex {
  readonly id: HexId;
  readonly coord: HexCoord;
  readonly terrain: TerrainType;
  readonly numberDisc: number | null; // null for Desert
  hasInspector: boolean;
  hasHazard: boolean;
}

export interface Intersection {
  readonly id: NodeId;
  readonly u: number;
  readonly v: number;
  readonly adjacentHexIds: HexId[];
  readonly adjacentNodeIds: NodeId[];
  readonly incidentEdgeIds: EdgeId[];
  building: Building | null;
  powerPlants: PowerPlant[];
  hasHazard: boolean;
  harborId: HarborId | null;
}

export interface PathEdge {
  readonly id: EdgeId;
  readonly v1: NodeId;
  readonly v2: NodeId;
  readonly adjacentHexIds: HexId[];
  readonly isCoastal: boolean;
  road: Road | null;
  harborId: HarborId | null;
}

export interface Harbor {
  readonly id: HarborId;
  readonly type: HarborType;
  readonly ratio: 2 | 3;
  readonly resource: ResourceType | null; // null for 3:1 generic
  readonly edgeId: EdgeId;
  readonly nodeIds: [NodeId, NodeId];
}

export interface Board {
  hexes: Hex[];
  intersections: Intersection[];
  edges: PathEdge[];
  harbors: Harbor[];
}

export interface HexTileConfig {
  terrain: TerrainType;
  numberDisc: number | null;
}

// ============================================================================
// Player & Component State
// ============================================================================

export interface PlayerState {
  readonly id: PlayerId;
  readonly color: PlayerId;
  name: string;
  victoryPoints: number;
  localFootprint: number;
  energy: number;
  hasWarehouse: boolean;
  resources: Record<ResourceType, number>;
  science: number;
  devCards: {
    unplayed: string[];
    played: string[];
  };
  hiddenGreenDiscs: string[];
  townsBuilt: number;
  citiesBuilt: number;
  roadsBuilt: number;
  fossilPlantsBuilt: number;
  renewablePlantsBuilt: number;
  townsInReserve: number;
  citiesInReserve: number;
  roadsInReserve: number;
  fossilPlantsInReserve: number;
  renewablePlantsInReserve: number;
}

export type GamePhase =
  | 'SetupDraft'
  | 'EventPhase'
  | 'ProductionPhase'
  | 'ActionPhase'
  | 'GameEnd';

export type EventDiscType =
  | 'climateConference'
  | 'rainAndFlooding'
  | 'airPollution'
  | 'productionIncrease'
  | 'environmentalPollution'
  | 'sustainableProduction'
  | 'governmentFunding';

export interface GlobalSupplyState {
  resources: Record<ResourceType, number>;
  science: number;
  energy: number;
  hazards: number;
  devDeck: string[];
}

export interface PRNGState {
  seed: number;
  calls: number;
}

export interface GameEventLog {
  timestamp: number;
  message: string;
  data?: unknown;
}

// ============================================================================
// Actions & Decisions
// ============================================================================

export type PendingDecision =
  | { id: string; type: 'SETUP_PLACE_SETTLEMENT'; playerId: PlayerId; round: 1 | 2 }
  | { id: string; type: 'SETUP_PLACE_ROAD'; playerId: PlayerId; round: 1 | 2; connectedToNodeId: NodeId }
  | { id: string; type: 'PRE_EVENT_WINDOW'; playerId: PlayerId }
  | { id: string; type: 'EVENT_HAZARD_CHOICE'; playerId: PlayerId; source: 'AirPollution' | 'RainAndFlooding'; targetType: 'CityFirst' | 'TownOrCity' }
  | { id: string; type: 'EVENT_CARD_CHOICE'; playerId: PlayerId; event: 'ClimateConferenceReward' | 'ClimateConferencePenalty' | 'GovernmentFunding' | 'SustainableProduction'; cardCount: number; isOptional: boolean }
  | { id: string; type: 'EVENT_PRODUCTION_INCREASE'; playerId: PlayerId; isOptional: true }
  | { id: string; type: 'DISCARD_ON_SEVEN'; playerId: PlayerId; cardsToDiscard: number }
  | { id: string; type: 'MOVE_INSPECTOR'; playerId: PlayerId }
  | { id: string; type: 'STEAL_TARGET'; playerId: PlayerId; targetNodeIds: NodeId[] }
  | { id: string; type: 'DOMESTIC_TRADE_RESPONSE'; offeringPlayerId: PlayerId; targetPlayerId: PlayerId; offer: unknown; demand: unknown };

export type GameAction =
  // Setup Draft Actions
  | { type: 'SETUP_BUILD_TOWN'; playerId: PlayerId; nodeId: NodeId }
  | { type: 'SETUP_BUILD_ROAD'; playerId: PlayerId; edgeId: EdgeId }
  | { type: 'SETUP_BUILD_CITY'; playerId: PlayerId; nodeId: NodeId }

  // Turn Phase Progression Actions
  | { type: 'PRE_EVENT_PASS'; playerId: PlayerId }
  | { type: 'DRAW_EVENT_DISC'; playerId: PlayerId }
  | { type: 'ROLL_DICE'; playerId: PlayerId }
  | { type: 'END_TURN'; playerId: PlayerId }

  // Action Phase Building Actions
  | { type: 'BUILD_ROAD'; playerId: PlayerId; edgeId: EdgeId }
  | { type: 'BUILD_TOWN'; playerId: PlayerId; nodeId: NodeId }
  | { type: 'BUILD_CITY'; playerId: PlayerId; nodeId: NodeId }
  | { type: 'BUILD_FOSSIL_PLANT'; playerId: PlayerId; nodeId: NodeId; hexId: HexId }
  | { type: 'BUILD_RENEWABLE_PLANT'; playerId: PlayerId; nodeId: NodeId; hexId: HexId }
  | { type: 'BUILD_WAREHOUSE'; playerId: PlayerId }
  | { type: 'BUY_DEV_CARD'; playerId: PlayerId }
  | { type: 'PLAY_DEV_CARD'; playerId: PlayerId; cardId: string; params?: unknown }

  // Energy & Trading Actions
  | { type: 'SPEND_ENERGY'; playerId: PlayerId; usage: 'BUY_CARD' | 'CLEAN_HAZARD' | 'DEMOLISH_PLANT'; params?: unknown }
  | { type: 'TRADE_SUPPLY'; playerId: PlayerId; give: Partial<Record<ResourceType | 'science', number>>; receive: ResourceType | 'science' }
  | { type: 'TRADE_HARBOR'; playerId: PlayerId; harborId: HarborId; give: Partial<Record<ResourceType, number>>; receive: ResourceType | 'science' }
  | { type: 'OFFER_TRADE'; playerId: PlayerId; targetPlayerId?: PlayerId; give: Partial<Record<ResourceType | 'science' | 'energy', number>>; want: Partial<Record<ResourceType | 'science' | 'energy', number>> }

  // Pending Decision Resolution
  | { type: 'RESOLVE_PENDING_DECISION'; playerId: PlayerId; decisionId: string; response: unknown };

// ============================================================================
// Overall Game State
// ============================================================================

export interface GameState {
  setupMode: 'first' | 'standard';
  playerCount: 3 | 4;
  playerOrder: PlayerId[];
  activePlayerId: PlayerId;
  currentTurn: number;
  phase: GamePhase;
  board: Board;
  players: Record<PlayerId, PlayerState>;
  trueTotalLF: number;
  clampedGF: number;
  eventBag: EventDiscType[];
  eventTracks: Record<string, number>;
  lockedDrawCount: number | null;
  supply: GlobalSupplyState;
  pendingDecisions: PendingDecision[];
  prng: PRNGState;
  log: GameEventLog[];
  winner: PlayerId | 'collapse' | null;
}
