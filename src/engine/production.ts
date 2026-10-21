/**
 * CATAN: New Energies — Production & Roll of 7 Engine
 *
 * Implements:
 * 1. PRD-01: Non-7 dice roll resource & science payouts, and power plant energy generation
 *    (subject to 5-energy cap and double-unblocked requirement).
 * 2. PRD-02: End-of-Production hazard auto-clear algorithm with strict Inspector protection
 *    (Inspector blocks auto-clear from buildings).
 * 3. PRD-03: Roll of 7 discard mechanics (threshold 7, or 10 with active Warehouse; floor(hand/2)).
 * 4. PRD-04: Roll of 7 Environmental Inspector movement to a hazard-free hex and deterministic card steal.
 */

import { RESOURCE_TYPES, ResourceType } from './config';
import { Mulberry32PRNG } from './prng';
import { TERRAIN_RESOURCE_MAP } from './setup';
import {
  Board,
  GameState,
  GlobalSupplyState,
  HexId,
  NodeId,
  PlayerId,
  PlayerState,
} from './types';

export interface ProductionPayout {
  resources: Partial<Record<ResourceType, number>>;
  science: number;
  energy: number;
}

export interface ProductionResult {
  payouts: Record<PlayerId, ProductionPayout>;
  clearedHexIds: HexId[];
  clearedNodeIds: NodeId[];
}

/**
 * Evaluates payouts for all players for a non-7 dice roll.
 * Enforces:
 * - Town: 1 resource.
 * - City: 1 resource + 1 science.
 * - Power Plant: 1 energy up to 5 cap, only if BOTH hex and attached building are unblocked.
 * - Blocked hex (hazard or inspector): yields 0 resources, science, energy.
 * - Blocked building (hazard): yields 0 resources, science, energy.
 * - Supply limits: allocates available cards in clockwise order from active player if shortage.
 */
export function evaluateProduction(
  board: Board,
  players: Record<PlayerId, PlayerState>,
  supply: GlobalSupplyState,
  diceRoll: [number, number],
  activePlayerId: PlayerId,
  playerOrder: PlayerId[]
): ProductionResult {
  const sum = diceRoll[0] + diceRoll[1];
  const rolledHexes = board.hexes.filter((h) => h.numberDisc === sum);

  const payouts = {} as Record<PlayerId, ProductionPayout>;
  for (const pid of playerOrder) {
    payouts[pid] = {
      resources: {},
      science: 0,
      energy: 0,
    };
  }

  if (sum === 7 || rolledHexes.length === 0) {
    return { payouts, clearedHexIds: [], clearedNodeIds: [] };
  }

  // Track raw demand for each resource/science to handle supply rationing if needed
  for (const hex of rolledHexes) {
    // Hex block check (R L463-465, L504-506)
    if (hex.hasHazard || hex.hasInspector) {
      continue; // Blocked hex produces nothing
    }

    const resType = TERRAIN_RESOURCE_MAP[hex.terrain];

    // Find all intersections adjacent to this hex
    for (const node of board.intersections) {
      if (!node.adjacentHexIds.includes(hex.id) || !node.building) {
        continue;
      }

      const pid = node.building.playerId;
      const player = players[pid];
      if (!player) continue;

      // Building hazard check: blocked building receives zero resources and zero science
      if (!node.hasHazard && resType !== null) {
        if (node.building.type === 'town') {
          payouts[pid]!.resources[resType] = (payouts[pid]!.resources[resType] || 0) + 1;
        } else if (node.building.type === 'city') {
          payouts[pid]!.resources[resType] = (payouts[pid]!.resources[resType] || 0) + 1;
          payouts[pid]!.science += 1;
        }
      }

      // Power plants energy generation:
      // Requires BOTH hex unblocked AND building unblocked (R L457-460)
      if (!node.hasHazard) {
        for (const plant of node.powerPlants) {
          if (plant.hexId === hex.id) {
            // Check player energy cap of 5 (R L461-462)
            const currentEnergy = player.energy + payouts[plant.playerId]!.energy;
            if (currentEnergy < 5) {
              payouts[plant.playerId]!.energy += 1;
            }
          }
        }
      }
    }
  }

  // Supply rationing: adjust payouts so they do not exceed global supply
  // Resources:
  const activeIdx = playerOrder.indexOf(activePlayerId);
  const clockwisePlayers: PlayerId[] = [];
  for (let i = 0; i < playerOrder.length; i++) {
    clockwisePlayers.push(playerOrder[(activeIdx + i) % playerOrder.length]!);
  }

  for (const res of RESOURCE_TYPES) {
    let totalDemanded = 0;
    for (const pid of playerOrder) {
      totalDemanded += payouts[pid]!.resources[res] || 0;
    }

    if (totalDemanded > supply.resources[res]) {
      // Shortage: distribute in clockwise order from active player
      let available = supply.resources[res];
      for (const pid of clockwisePlayers) {
        const demand = payouts[pid]!.resources[res] || 0;
        const granted = Math.min(demand, available);
        payouts[pid]!.resources[res] = granted;
        available -= granted;
      }
    }
  }

  // Science:
  let totalScienceDemanded = 0;
  for (const pid of playerOrder) {
    totalScienceDemanded += payouts[pid]!.science;
  }
  if (totalScienceDemanded > supply.science) {
    let available = supply.science;
    for (const pid of clockwisePlayers) {
      const demand = payouts[pid]!.science;
      const granted = Math.min(demand, available);
      payouts[pid]!.science = granted;
      available -= granted;
    }
  }

  // Energy:
  let totalEnergyDemanded = 0;
  for (const pid of playerOrder) {
    totalEnergyDemanded += payouts[pid]!.energy;
  }
  if (totalEnergyDemanded > supply.energy) {
    let available = supply.energy;
    for (const pid of clockwisePlayers) {
      const demand = payouts[pid]!.energy;
      const granted = Math.min(demand, available);
      payouts[pid]!.energy = granted;
      available -= granted;
    }
  }

  return { payouts, clearedHexIds: [], clearedNodeIds: [] };
}

/**
 * Applies production payouts to game state.
 */
export function applyProductionPayouts(state: GameState, prod: ProductionResult): void {
  for (const pid of state.playerOrder) {
    const payout = prod.payouts[pid];
    if (!payout) continue;

    const player = state.players[pid]!;
    for (const res of RESOURCE_TYPES) {
      const count = payout.resources[res] || 0;
      if (count > 0) {
        player.resources[res] += count;
        state.supply.resources[res] -= count;
      }
    }

    if (payout.science > 0) {
      player.science += payout.science;
      state.supply.science -= payout.science;
    }

    if (payout.energy > 0) {
      player.energy += payout.energy;
      state.supply.energy -= payout.energy;
    }
  }
}

/**
 * End-of-Production Hazard Auto-Clear algorithm (PRD-02).
 * Removes hazards from rolled hexes and buildings blocked by hazards.
 * STRICT EXCEPTION: Inspector blocks auto-clear from buildings on the hex with the Inspector!
 */
export function autoClearHazards(
  board: Board,
  rolledNumber: number,
  supply: GlobalSupplyState
): { clearedHexIds: HexId[]; clearedNodeIds: NodeId[] } {
  const clearedHexIds: HexId[] = [];
  const clearedNodeIds: NodeId[] = [];

  const rolledHexes = board.hexes.filter((h) => h.numberDisc === rolledNumber);

  for (const hex of rolledHexes) {
    // 1. Clear hex hazard if present (hex hazard is removed regardless of Inspector)
    if (hex.hasHazard) {
      hex.hasHazard = false;
      clearedHexIds.push(hex.id);
      supply.hazards = Math.min(10, supply.hazards + 1);
    }

    // 2. Clear building hazards on adjacent intersections UNLESS Inspector is present (R L436-439, L507-509)
    if (!hex.hasInspector) {
      for (const node of board.intersections) {
        if (node.adjacentHexIds.includes(hex.id) && node.building && node.hasHazard) {
          if (!clearedNodeIds.includes(node.id)) {
            node.hasHazard = false;
            clearedNodeIds.push(node.id);
            supply.hazards = Math.min(10, supply.hazards + 1);
          }
        }
      }
    }
  }

  return { clearedHexIds, clearedNodeIds };
}

/**
 * Counts a player's resource + science cards in hand (PRD-03).
 * Development cards and Energy tokens do NOT count.
 */
export function getHandSizeForSeven(player: PlayerState): number {
  return (
    player.resources.lumber +
    player.resources.brick +
    player.resources.natural_fiber +
    player.resources.food +
    player.resources.steel +
    player.science
  );
}

/**
 * Queues DISCARD_ON_SEVEN decisions in clockwise order from active player (PRD-03).
 * Threshold is 7 cards (standard) or 10 cards (with active Warehouse).
 * If exceeding threshold, player must discard floor(hand / 2) cards.
 */
export function queueDiscardsOnSeven(state: GameState): void {
  const activeIdx = state.playerOrder.indexOf(state.activePlayerId);
  const clockwisePlayers: PlayerId[] = [];
  for (let i = 0; i < state.playerCount; i++) {
    clockwisePlayers.push(state.playerOrder[(activeIdx + i) % state.playerCount]!);
  }

  for (const pid of clockwisePlayers) {
    const player = state.players[pid]!;
    const handSize = getHandSizeForSeven(player);
    const limit = player.hasWarehouse ? 10 : 7;

    if (handSize > limit) {
      const cardsToDiscard = Math.floor(handSize / 2);
      state.pendingDecisions.push({
        id: `discard-7-${pid}-${state.currentTurn}`,
        type: 'DISCARD_ON_SEVEN',
        playerId: pid,
        cardsToDiscard,
      });
    }
  }
}

/**
 * Prompts active player to move the Environmental Inspector to a new hazard-free hex (PRD-04).
 */
export function promptMoveInspector(state: GameState): void {
  state.pendingDecisions.push({
    id: `move-inspector-${state.currentTurn}`,
    type: 'MOVE_INSPECTOR',
    playerId: state.activePlayerId,
  });
}

/**
 * Finds eligible opponents to steal from on the Inspector's new hex (PRD-04).
 */
export function getEligibleStealVictims(state: GameState, hexId: HexId): PlayerId[] {
  const victims: Set<PlayerId> = new Set();
  const hex = state.board.hexes[hexId];
  if (!hex) return [];

  for (const node of state.board.intersections) {
    if (node.adjacentHexIds.includes(hexId) && node.building) {
      const pid = node.building.playerId;
      if (pid !== state.activePlayerId) {
        const victim = state.players[pid]!;
        if (getHandSizeForSeven(victim) > 0) {
          victims.add(pid);
        }
      }
    }
  }

  return Array.from(victims);
}

/**
 * Executes a card steal from a chosen victim using seeded PRNG (PRD-04).
 */
export function executeStealCard(
  state: GameState,
  thiefId: PlayerId,
  victimId: PlayerId
): ResourceType | 'science' | null {
  const victim = state.players[victimId]!;
  const thief = state.players[thiefId]!;

  const cards: (ResourceType | 'science')[] = [];
  for (const res of RESOURCE_TYPES) {
    for (let i = 0; i < victim.resources[res]; i++) cards.push(res);
  }
  for (let i = 0; i < victim.science; i++) cards.push('science');

  if (cards.length === 0) return null;

  const prng = Mulberry32PRNG.fromState(state.prng);
  const chosenIndex = prng.nextInt(0, cards.length - 1);
  state.prng = prng.getState();

  const stolenCard = cards[chosenIndex]!;

  if (stolenCard === 'science') {
    victim.science--;
    thief.science++;
  } else {
    victim.resources[stolenCard]--;
    thief.resources[stolenCard]++;
  }

  state.log.push({
    timestamp: state.log.length,
    message: `${thief.name} stole 1 card from ${victim.name}.`,
  });

  return stolenCard;
}
