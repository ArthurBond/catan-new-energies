/**
 * CATAN: New Energies — visual test scenarios (dev only, `?scenario=showcase`)
 *
 * Builds a mid-game table from the First Game layout so every kind of component
 * (both plant types, hazards on hexes and buildings, a moved inspector, a full hand)
 * is visible at once for screenshots and visual checks. Not reachable from the lobby.
 *
 * Variants: `showcase` (action phase), `discard` (roll of 7 discard prompt),
 * `cardchoice` (Climate Conference reward prompt), `victory` (game over summary),
 * `draws2` / `draws3` (global footprint low / high, so the HUD shows 2 / 3 draws per turn),
 * `cityfit` (roads on every side of every building, to check how pieces meet roads),
 * `plantfit` (a power plant in every notch of every building, to check plant layering).
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
  // A few discs already on their island tracks
  state.eventTracks.airPollution = 2;
  state.eventTracks.rainAndFlooding = 1;
  state.eventTracks.governmentFunding = 1;
  state.eventTracks.climateConference = 2;

  state.phase = 'ActionPhase';
  state.lastDiceRoll = [5, 3];
  state.log.push({ timestamp: state.log.length, message: 'Showcase scenario loaded.' });
  return state;
}

export type DevScenario = 'showcase' | 'discard' | 'cardchoice' | 'victory' | 'draws2' | 'draws3' | 'cityfit' | 'plantfit' | 'airpollution';

export function applyDevScenario(input: GameState, scenario: string): GameState {
  if (!['showcase', 'discard', 'cardchoice', 'victory', 'draws2', 'draws3', 'cityfit', 'plantfit', 'airpollution'].includes(scenario)) return input;
  const state = applyShowcaseScenario(input);
  if (scenario === 'discard') {
    state.phase = 'ProductionPhase';
    state.lastDiceRoll = [3, 4];
    state.pendingDecisions = [
      { id: 'dev-discard', type: 'DISCARD_ON_SEVEN', playerId: 'orange', cardsToDiscard: 6 },
    ];
  } else if (scenario === 'cardchoice') {
    state.phase = 'EventPhase';
    state.pendingDecisions = [
      {
        id: 'dev-card-choice',
        type: 'EVENT_CARD_CHOICE',
        playerId: 'orange',
        event: 'ClimateConferenceReward',
        cardCount: 1,
        isOptional: false,
      },
    ];
  } else if (scenario === 'plantfit') {
    // A plant in every notch of every building (and a second city in each of the other direction types)
    // so all six notch directions can be checked at once
    let flip = 0;
    for (const node of state.board.intersections) {
      if (!node.building) continue;
      const room = node.building.type === 'city' ? 3 : 1;
      for (const hexId of node.adjacentHexIds) {
        if (node.powerPlants.length >= room) break;
        const hex = state.board.hexes[hexId]!;
        if (hex.numberDisc === null || node.powerPlants.some((p) => p.hexId === hexId)) continue;
        node.powerPlants.push({ playerId: node.building.playerId, type: flip++ % 2 === 0 ? 'fossil' : 'renewable', hexId });
      }
    }
  } else if (scenario === 'cityfit') {
    // Roads on every side of every town and city, to check how pieces meet roads in all directions
    for (const node of state.board.intersections) {
      if (!node.building) continue;
      for (const edgeId of node.incidentEdgeIds) {
        const edge = state.board.edges[edgeId]!;
        if (edge.road === null) edge.road = { playerId: node.building.playerId };
      }
    }
  } else if (scenario === 'airpollution') {
    // The next disc fills the Air Pollution track (it already holds two) and orange has the highest footprint
    state.phase = 'EventPhase';
    state.eventBag = ['airPollution', ...state.eventBag.filter((d) => d !== 'airPollution')];
    state.players.orange!.localFootprint = 9;
  } else if (scenario === 'draws2') {
    // Low global footprint: 2 event discs per turn
    state.trueTotalLF = 3;
    state.clampedGF = 3;
  } else if (scenario === 'draws3') {
    // Very high global footprint: 3 event discs per turn
    state.trueTotalLF = 26;
    state.clampedGF = 26;
  } else if (scenario === 'victory') {
    state.players.orange!.victoryPoints = 10;
    state.winner = 'orange';
    state.phase = 'GameEnd';
  }
  return state;
}
