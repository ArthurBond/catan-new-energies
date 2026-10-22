/**
 * CATAN: New Energies — visual test scenarios (dev only, `?scenario=showcase`)
 *
 * Builds a mid-game table from the First Game layout so every kind of component
 * (both plant types, hazards on hexes and buildings, a moved inspector, a full hand)
 * is visible at once for screenshots and visual checks. Not reachable from the lobby.
 */

import { computePlayerLF, computeTrueTotalLF, clampGF } from '../engine/footprint';
import { GameState, PlayerId, PowerPlantType } from '../engine/types';

function addPlant(state: GameState, nodeId: number, hexIdx: number, type: PowerPlantType) {
  const node = state.board.intersections[nodeId]!;
  const playerId = node.building!.playerId;
  const hexId = node.adjacentHexIds[hexIdx]!;
  node.powerPlants.push({ playerId, type, hexId });
  const p = state.players[playerId]!;
  if (type === 'fossil') {
    p.fossilPlantsBuilt++;
    p.fossilPlantsInReserve--;
  } else {
    p.renewablePlantsBuilt++;
    p.renewablePlantsInReserve--;
  }
}

function addRoadFrom(state: GameState, nodeId: number, playerId: PlayerId) {
  const node = state.board.intersections[nodeId]!;
  const edgeId = node.incidentEdgeIds.find((e) => state.board.edges[e]!.road === null);
  if (edgeId === undefined) return;
  state.board.edges[edgeId]!.road = { playerId };
  state.players[playerId]!.roadsBuilt++;
  state.players[playerId]!.roadsInReserve--;
}

export function applyShowcaseScenario(input: GameState): GameState {
  const state: GameState = structuredClone(input);
  if (state.phase === 'SetupRoll' || state.phase === 'SetupDraft') return state;

  addPlant(state, 10, 0, 'fossil');
  addPlant(state, 10, 1, 'renewable');
  addPlant(state, 35, 0, 'renewable');
  addPlant(state, 45, 0, 'fossil');
  addPlant(state, 23, 1, 'renewable');
  addRoadFrom(state, 12, 'orange');
  addRoadFrom(state, 45, 'pink');

  // Hazards: one on a hex (so the cog frames the number disc) and two on buildings
  const hazardHex = state.board.hexes.find((h) => h.numberDisc === 8 && !h.hasInspector)!;
  hazardHex.hasHazard = true;
  state.board.intersections[36]!.hasHazard = true;
  state.board.intersections[23]!.hasHazard = true;
  state.supply.hazards -= 3;

  // Inspector leaves the desert
  for (const h of state.board.hexes) h.hasInspector = false;
  state.board.hexes.find((h) => h.numberDisc === 9)!.hasInspector = true;

  const orange = state.players.orange!;
  orange.resources = { lumber: 2, brick: 1, natural_fiber: 1, food: 2, steel: 3 };
  orange.science = 3;
  orange.energy = 3;
  orange.devCards.unplayed = ['dev_cleanup_01', 'dev_roadConstruction_01'];

  for (const pid of state.playerOrder) {
    const p = state.players[pid]!;
    p.localFootprint = computePlayerLF(p);
  }
  state.trueTotalLF = computeTrueTotalLF(state.players);
  state.clampedGF = clampGF(state.trueTotalLF, state.playerCount);
  state.phase = 'ActionPhase';
  state.lastDiceRoll = [5, 3];
  state.log.push({ timestamp: state.log.length, message: 'Showcase scenario loaded.' });
  return state;
}
