/**
 * CATAN: New Energies — UI view-model helpers
 *
 * Pure functions that turn engine state + legal actions into what the tabletop shows:
 * build palette options (with costs and why something is unavailable), the setup snake-draft
 * steps, and what an intersection would produce.
 */

import { getDevCardType } from '../engine/dev-cards';
import { TERRAIN_RESOURCE_MAP } from '../engine/setup';
import {
  Board,
  GameAction,
  GameState,
  NodeId,
  PlayerId,
  ResourceType,
  TerrainType,
} from '../engine/types';
import { getNumberDiscPips } from './theme';
import type { ActiveBuildMode } from './PlayerMat';

export type CostKey = ResourceType | 'science' | 'energy';

export type BuildKind =
  | 'road'
  | 'town'
  | 'city'
  | 'devCard'
  | 'fossil'
  | 'renewable'
  | 'warehouse';

export interface BuildOption {
  kind: BuildKind;
  label: string;
  cost: CostKey[];
  /** Pieces left on the player board (undefined for cards / one-off tiles) */
  remaining?: number;
  available: boolean;
  /** Short reason shown when not available */
  reason?: string;
  /** Board placement mode this option enters (null = immediate action) */
  mode: ActiveBuildMode;
}

export const BUILD_COSTS: Record<BuildKind, CostKey[]> = {
  road: ['lumber', 'brick'],
  town: ['lumber', 'brick', 'natural_fiber', 'food'],
  city: ['food', 'food', 'steel', 'steel', 'steel'],
  devCard: ['natural_fiber', 'food', 'steel'],
  fossil: ['science'],
  renewable: ['science', 'science', 'science'],
  warehouse: ['energy', 'energy'],
};

const COST_LABEL: Record<CostKey, string> = {
  lumber: 'lumber',
  brick: 'brick',
  natural_fiber: 'fiber',
  food: 'food',
  steel: 'steel',
  science: 'science',
  energy: 'energy',
};

function heldAmount(state: GameState, playerId: PlayerId, key: CostKey): number {
  const p = state.players[playerId]!;
  if (key === 'science') return p.science;
  if (key === 'energy') return p.energy;
  return p.resources[key];
}

/** "Needs 1 brick, 2 steel" for whatever the player is short of, or null if affordable. */
export function describeShortfall(
  state: GameState,
  playerId: PlayerId,
  cost: CostKey[]
): string | null {
  const need = new Map<CostKey, number>();
  for (const key of cost) need.set(key, (need.get(key) ?? 0) + 1);
  const missing: string[] = [];
  for (const [key, amount] of need) {
    const short = amount - heldAmount(state, playerId, key);
    if (short > 0) missing.push(`${short} ${COST_LABEL[key]}`);
  }
  return missing.length > 0 ? `Needs ${missing.join(', ')}` : null;
}

export function getBuildOptions(
  state: GameState,
  playerId: PlayerId,
  legal: GameAction[],
  canAct: boolean
): BuildOption[] {
  const p = state.players[playerId]!;
  const has = (type: GameAction['type']) => legal.some((a) => a.type === type);
  const plantLimit = state.turnStats.powerPlantsBuiltThisTurn >= 1;

  const option = (
    kind: BuildKind,
    label: string,
    legalType: GameAction['type'],
    mode: ActiveBuildMode,
    remaining: number | undefined,
    extraReason?: string | null
  ): BuildOption => {
    const cost = BUILD_COSTS[kind];
    const available = canAct && has(legalType);
    let reason: string | undefined;
    if (!available) {
      if (!canAct) reason = 'Available in your action phase';
      else if (remaining === 0) reason = 'None left on your board';
      else reason = describeShortfall(state, playerId, cost) ?? extraReason ?? 'No legal spot';
    }
    return { kind, label, cost, remaining, available, reason, mode };
  };

  return [
    option('road', 'Road', 'BUILD_ROAD', 'BUILD_ROAD', p.roadsInReserve),
    option('town', 'Town', 'BUILD_TOWN', 'BUILD_TOWN', p.townsInReserve),
    option(
      'city',
      'City',
      'BUILD_CITY',
      'BUILD_CITY',
      p.citiesInReserve,
      p.townsBuilt === 0 ? 'Upgrade one of your towns' : null
    ),
    option('devCard', 'Dev card', 'BUY_DEV_CARD', null, undefined,
      state.supply.devDeck.length === 0 ? 'Deck is empty' : null),
    option(
      'fossil',
      'Fossil plant',
      'BUILD_FOSSIL_PLANT',
      'BUILD_FOSSIL_PLANT',
      p.fossilPlantsInReserve,
      plantLimit ? 'One power plant per turn' : null
    ),
    option(
      'renewable',
      'Renewable',
      'BUILD_RENEWABLE_PLANT',
      'BUILD_RENEWABLE_PLANT',
      p.renewablePlantsInReserve,
      plantLimit ? 'One power plant per turn' : null
    ),
    {
      ...option('warehouse', 'Warehouse', 'BUILD_WAREHOUSE', null, undefined),
      ...(p.hasWarehouse ? { available: false, reason: 'Already built' } : {}),
    },
  ].map((o) => {
    // Plant limit is clearer than a resource shortfall once a plant has been built this turn
    if (!o.available && canAct && plantLimit && (o.kind === 'fossil' || o.kind === 'renewable')) {
      return { ...o, reason: 'One power plant per turn' };
    }
    return o;
  });
}

export interface EnergyOption {
  usage: 'BUY_CARD' | 'CLEAN_HAZARD' | 'DEMOLISH_PLANT';
  label: string;
  cost: number;
  available: boolean;
  reason?: string;
}

export function getEnergyOptions(
  state: GameState,
  playerId: PlayerId,
  legal: GameAction[],
  canAct: boolean
): EnergyOption[] {
  const p = state.players[playerId]!;
  const has = (usage: EnergyOption['usage']) =>
    canAct && legal.some((a) => a.type === 'SPEND_ENERGY' && a.usage === usage);
  const why = (cost: number, fallback: string) =>
    !canAct ? 'Available in your action phase' : p.energy < cost ? `Needs ${cost} energy` : fallback;
  return [
    {
      usage: 'BUY_CARD',
      label: 'Buy a card',
      cost: 2,
      available: has('BUY_CARD'),
      reason: has('BUY_CARD') ? undefined : why(2, 'Supply is empty'),
    },
    {
      usage: 'CLEAN_HAZARD',
      label: 'Clean a hazard',
      cost: 1,
      available: has('CLEAN_HAZARD'),
      reason: has('CLEAN_HAZARD') ? undefined : why(1, 'No hazards on the board'),
    },
    {
      usage: 'DEMOLISH_PLANT',
      label: 'Remove fossil plant',
      cost: 1,
      available: has('DEMOLISH_PLANT'),
      reason: has('DEMOLISH_PLANT') ? undefined : why(1, 'No fossil plant to remove this turn'),
    },
  ];
}

// ============================================================================
// Setup snake draft
// ============================================================================

export interface SetupStep {
  playerId: PlayerId;
  piece: 'town' | 'city';
  state: 'done' | 'current' | 'upcoming';
}

export interface SetupProgress {
  steps: SetupStep[];
  currentIndex: number;
  /** The piece being placed right now, and whether the road is the pending part */
  piece: 'town' | 'city' | null;
  placingRoad: boolean;
  playerId: PlayerId | null;
  roadFromNodeId: NodeId | null;
}

export function getSetupProgress(state: GameState): SetupProgress {
  const order = state.playerOrder;
  const n = order.length;
  const head = state.pendingDecisions[0];
  let currentIndex = -1;
  let piece: 'town' | 'city' | null = null;
  let placingRoad = false;
  let playerId: PlayerId | null = null;
  let roadFromNodeId: NodeId | null = null;

  if (
    state.phase === 'SetupDraft' &&
    head &&
    (head.type === 'SETUP_PLACE_SETTLEMENT' || head.type === 'SETUP_PLACE_ROAD')
  ) {
    const idx = order.indexOf(head.playerId);
    currentIndex = head.round === 1 ? idx : n + (n - 1 - idx);
    piece = head.round === 1 ? 'town' : 'city';
    placingRoad = head.type === 'SETUP_PLACE_ROAD';
    playerId = head.playerId;
    roadFromNodeId = head.type === 'SETUP_PLACE_ROAD' ? head.connectedToNodeId : null;
  } else if (state.phase !== 'SetupRoll' && state.phase !== 'SetupDraft') {
    currentIndex = 2 * n;
  }

  const steps: SetupStep[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const pid = i < n ? order[i]! : order[2 * n - 1 - i]!;
    steps.push({
      playerId: pid,
      piece: i < n ? 'town' : 'city',
      state: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming',
    });
  }

  return { steps, currentIndex, piece, placingRoad, playerId, roadFromNodeId };
}

export interface HexYield {
  terrain: TerrainType;
  resource: ResourceType | null;
  numberDisc: number | null;
  pips: number;
}

export interface IntersectionPreview {
  hexes: HexYield[];
  totalPips: number;
  /** Starting hand a City here would collect (one card per productive adjacent hex) */
  startingCards: ResourceType[];
  harbor: string | null;
}

export function describeIntersection(board: Board, nodeId: NodeId): IntersectionPreview {
  const node = board.intersections[nodeId]!;
  const hexes: HexYield[] = node.adjacentHexIds.map((hId) => {
    const hex = board.hexes[hId]!;
    return {
      terrain: hex.terrain,
      resource: TERRAIN_RESOURCE_MAP[hex.terrain],
      numberDisc: hex.numberDisc,
      pips: hex.numberDisc ? getNumberDiscPips(hex.numberDisc) : 0,
    };
  });
  const harbor =
    node.harborId !== null
      ? (() => {
          const h = board.harbors[node.harborId]!;
          return h.ratio === 3 ? '3:1 harbor' : `2:1 ${h.resource?.replace('_', ' ')} harbor`;
        })()
      : null;
  return {
    hexes,
    totalPips: hexes.reduce((acc, h) => acc + h.pips, 0),
    startingCards: hexes.map((h) => h.resource).filter((r): r is ResourceType => r !== null),
    harbor,
  };
}

/** Number of hidden cards for a player (resources + science), as everyone at the table can see. */
export function handCount(state: GameState, playerId: PlayerId): number {
  const p = state.players[playerId]!;
  return (
    p.resources.lumber +
    p.resources.brick +
    p.resources.natural_fiber +
    p.resources.food +
    p.resources.steel +
    p.science
  );
}

export function vpCardIdsOf(state: GameState, playerId: PlayerId): string[] {
  return state.players[playerId]!.devCards.unplayed.filter(
    (cid) => getDevCardType(cid) === 'victoryPoint'
  );
}

// ============================================================================
// Human-readable log lines
// ============================================================================

const EVENT_NAMES: Record<string, string> = {
  climateConference: 'Climate Conference',
  rainAndFlooding: 'Rain & Flooding',
  airPollution: 'Air Pollution',
  productionIncrease: 'Production Increase',
  environmentalPollution: 'Environmental Pollution',
  sustainableProduction: 'Sustainable Production',
  governmentFunding: 'Government Funding',
};

/**
 * Rewrites engine log lines for people: event ids become names, board ids (intersection 12,
 * path 26, hex 3) are dropped, and bookkeeping lines are phrased plainly.
 */
export function humanizeLog(message: string): string {
  let m = message;
  for (const [id, name] of Object.entries(EVENT_NAMES)) {
    m = m.split(id).join(name);
  }
  m = m
    .replace(/\ba (Air|Environmental)\b/g, 'an $1')
    .replace(/natural_fiber/g, 'fiber')
    .replace(/\bhex \d+ \((\w+) #(\d+|null)\)/g, (_, terrain: string, num: string) =>
      num === 'null' ? `the ${terrain}` : `the ${terrain} ${num}`
    )
    .replace(/ (on|at) (intersection|node|path) \d+( facing hex \d+)?/g, '')
    .replace(/ on hex \d+/g, '')
    .replace(/ on (node|hex) \d+\./g, '.')
    .replace(/^Triggering event resolver for: (.+)$/, '$1 takes effect')
    .replace(/^Event draw count locked at (\d+) disc\(s\) \(Clamped GF: (\d+)\)\.$/, (_, n: string, gf: string) =>
      `Global footprint ${gf}: ${n} event disc${n === '1' ? '' : 's'} this turn.`
    )
    .replace(/^Event Phase completed\. Entering Production Phase for (.+)\.$/, '$1 moves on to production.')
    .replace(/ Discs returned to box; event triggers!/, ' The event happens.')
    .replace(/ \(\d+\/\d+\)\.$/, '.')
    .replace(/ \(\+1 net VP, \+1 net LF\)| \(\+1 VP, \+1 LF\)/g, '');
  return m;
}

export function eventName(type: string): string {
  return EVENT_NAMES[type] ?? type;
}
