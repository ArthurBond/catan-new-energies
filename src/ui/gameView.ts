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
  HexId,
  NodeId,
  PlayerId,
  ResourceType,
  TerrainType,
} from '../engine/types';
import { playerHandCount } from '../network/hydrate';
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
  /** What this build option does / grants */
  description?: string;
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

export const BUILD_DESCRIPTIONS: Record<BuildKind, string> = {
  road: 'Connects settlements and expands your road network along hex edges.',
  town: 'Worth 1 Victory Point. Produces 1 resource from adjacent hexes on dice rolls.',
  city: 'Worth 2 Victory Points. Upgrades a town; produces 2 resources (or 1 resource + 1 science) on dice rolls.',
  devCard: 'Gives you a development card from the deck (Clean Up, Progress cards, or +1 VP).',
  fossil: 'Builds a fossil power plant; produces energy and 1 resource when built, but adds pollution.',
  renewable: 'Builds a renewable power plant; produces clean energy and 1 resource when built with no pollution.',
  warehouse: 'Increases hand size to 10 on a roll of 7 (keep up to 10 cards instead of 7).',
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
    const description = BUILD_DESCRIPTIONS[kind];
    const available = canAct && has(legalType);
    let reason: string | undefined;
    if (!available) {
      if (!canAct) reason = 'Available in your action phase';
      else if (remaining === 0) reason = 'None left on your board';
      else reason = describeShortfall(state, playerId, cost) ?? extraReason ?? 'No legal spot';
    }
    return { kind, label, cost, remaining, available, reason, mode, description };
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
  // Online, other players' breakdown is blanked out but the server still sends the total.
  return playerHandCount(state.players[playerId]!);
}

/**
 * Players on `hexId` the active player could take a card from. Same as the engine's
 * `getEligibleStealVictims`, but counts hands with `handCount` so hidden online hands work.
 */
export function stealVictimsOnHex(state: GameState, hexId: HexId): PlayerId[] {
  const victims = new Set<PlayerId>();
  if (!state.board.hexes[hexId]) return [];
  for (const node of state.board.intersections) {
    const pid = node.building?.playerId;
    if (pid && pid !== state.activePlayerId && node.adjacentHexIds.includes(hexId) && handCount(state, pid) > 0) {
      victims.add(pid);
    }
  }
  return [...victims];
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
    .replace(/^Triggering event resolver for: .+$/, '')
    .replace(/^Event draw count locked at (\d+) disc\(s\) \(Clamped GF: (\d+)\)\.$/, (_, n: string, gf: string) =>
      `Global footprint ${gf}: ${n} event disc${n === '1' ? '' : 's'} this turn.`
    )
    .replace(/^Event Phase completed\. Entering Production Phase for (.+)\.$/, '$1 moves on to production.')
    .replace(/ \(\d+\)! Discs returned to box; event triggers!/, ' is full.')
    .replace(/ track reached capacity/, ' track')
    .replace(/ \(\d+\/\d+\)\.$/, '.')
    .replace(/ \(\+1 net VP, \+1 net LF\)| \(\+1 VP, \+1 LF\)/g, '');
  return m;
}

/** A piece of a log line: plain text, or a player's name (shown in that player's colour). */
export type LogSegment<T> = { text: string; player?: T };

/** Splits a log line around the player names in it, so the feed can colour each one. */
export function splitLogNames<T extends { name: string }>(message: string, players: T[]): LogSegment<T>[] {
  const named = players.filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
  const segments: LogSegment<T>[] = [];
  let plain = '';
  let i = 0;
  while (i < message.length) {
    const hit = named.find((p) => message.startsWith(p.name, i));
    if (hit) {
      if (plain) segments.push({ text: plain });
      plain = '';
      segments.push({ text: hit.name, player: hit });
      i += hit.name.length;
    } else {
      plain += message[i];
      i++;
    }
  }
  if (plain) segments.push({ text: plain });
  return segments;
}

export function eventName(type: string): string {
  return EVENT_NAMES[type] ?? type;
}

/**
 * Which player a log line is about: the one named earliest in the message, which is the actor
 * ("Blue rolled 6. Orange rolled highest" is Blue's line). Where two names start at the same place
 * the longer one wins, so "Ann" does not steal a line about "Anna".
 */
export function logActor<T extends { name: string }>(message: string, players: T[]): T | undefined {
  let best: { player: T; index: number } | undefined;
  for (const player of players) {
    if (!player.name) continue;
    const index = message.indexOf(player.name);
    if (index < 0) continue;
    if (!best || index < best.index || (index === best.index && player.name.length > best.player.name.length)) {
      best = { player, index };
    }
  }
  return best?.player;
}

// ============================================================================
// Offering a trade to other players: what to remember, and who to ask in which order
// ============================================================================

export type TradeItems = Partial<Record<ResourceType | 'science' | 'energy', number>>;

/** A player's choices for who a trade offer goes to. */
export interface TradePrefs {
  /** true: ask everyone in `order` (minus `skip`) one after another; false: ask `single` only */
  everyone: boolean;
  /** Everyone else at the table, in the order they are asked */
  order: PlayerId[];
  /** Players left out of the sequence */
  skip: PlayerId[];
  single: PlayerId | null;
}

/** The last trade offer sent this turn, so it can be sent again to someone else. */
export interface TradeMemory {
  turnKey: string;
  give: TradeItems;
  want: TradeItems;
}

/** Changes whenever the turn passes to someone else (or comes round again), which resets the draft. */
export function tradeTurnKey(state: GameState): string {
  return `${state.currentTurn}:${state.activePlayerId}`;
}

/** By default: ask every other player, in the order their turns come after yours. */
export function defaultTradePrefs(state: GameState, playerId: PlayerId): TradePrefs {
  const seats = state.playerOrder.slice(0, state.playerCount);
  const at = seats.indexOf(playerId);
  const order = seats.map((_, i) => seats[(at + 1 + i) % seats.length]!).filter((pid) => pid !== playerId);
  return { everyone: true, order, skip: [], single: order[0] ?? null };
}

/** Drops players who are no longer at the table and adds any that are missing, keeping the player's order. */
export function normaliseTradePrefs(state: GameState, playerId: PlayerId, prefs?: TradePrefs): TradePrefs {
  const fresh = defaultTradePrefs(state, playerId);
  if (!prefs) return fresh;
  const valid = new Set(fresh.order);
  const order = [...new Set(prefs.order.filter((pid) => valid.has(pid)))];
  for (const pid of fresh.order) if (!order.includes(pid)) order.push(pid);
  return {
    everyone: prefs.everyone,
    order,
    skip: prefs.skip.filter((pid) => valid.has(pid)),
    single: prefs.single && valid.has(prefs.single) ? prefs.single : fresh.single,
  };
}

/** The players an offer goes to, first to last. */
export function tradeRecipients(prefs: TradePrefs): PlayerId[] {
  if (!prefs.everyone) return prefs.single ? [prefs.single] : [];
  return prefs.order.filter((pid) => !prefs.skip.includes(pid));
}

/** What to send: the first player, and the others to try in turn as each one declines. */
export function tradeOfferTargets(prefs: TradePrefs): { targetPlayerId: PlayerId; thenOffer: PlayerId[] } | null {
  const [first, ...rest] = tradeRecipients(prefs);
  return first ? { targetPlayerId: first, thenOffer: rest } : null;
}

/** The remembered offer for this turn, cut down to what the player can still give; empty on a new turn. */
export function rememberedTrade(
  state: GameState,
  memory: TradeMemory | null | undefined
): { give: TradeItems; want: TradeItems } | null {
  if (!memory || memory.turnKey !== tradeTurnKey(state)) return null;
  const player = state.players[state.activePlayerId]!;
  const give: TradeItems = {};
  for (const [kind, n] of Object.entries(memory.give) as [keyof TradeItems, number][]) {
    const held = kind === 'energy' ? player.energy : kind === 'science' ? player.science : player.resources[kind];
    const count = Math.min(n, held);
    if (count > 0) give[kind] = count;
  }
  return { give, want: { ...memory.want } };
}
