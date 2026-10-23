/**
 * CATAN: New Energies — Event Resolvers & Universal Tie-Breakers
 *
 * Implements:
 * 1. Universal Tie-Breaker Protocol: all tied -> strict no-op; strict subset -> clockwise order from active player.
 * 2. All 7 event track resolvers:
 *    - Air Pollution (3 spaces, Brown, highest LF, City first, Hazard token).
 *    - Environmental Pollution (4 spaces, Brown, PRNG dice roll re-rolling 7s, Inspector protects).
 *    - Production Increase (3 spaces, Brown, highest LF, free Fossil plant + resource even on hazard).
 *    - Rain & Flooding (4 spaces, Brown, all players clockwise, Town or City hazard).
 *    - Climate Conference (3 spaces, Brown/Green, lowest LF reward, highest LF penalty).
 *    - Government Funding (3 spaces, Green, lowest LF free Dev Card).
 *    - Sustainable Production (4 spaces, Green, most built Renewables reward).
 * 3. Pure reducer functions to apply player decisions for pending event decisions.
 */

import { clampGF, computePlayerLF, computeTrueTotalLF } from './footprint';
import { Mulberry32PRNG } from './prng';
import { TERRAIN_RESOURCE_MAP } from './setup';
import {
  EventDiscType,
  GameState,
  NodeId,
  HexId,
  PendingDecision,
  PlayerId,
  PlayerState,
  ResourceType,
} from './types';

/**
 * Universal Event Tie-Breaker Function.
 * Returns sorted list of player IDs for strict subset ties in clockwise order from activePlayerId.
 * Returns null if ALL active players have identical metric values (strict no-op).
 */
export function getTiedPlayers(
  state: GameState,
  metricExtractor: (player: PlayerState) => number,
  target: 'highest' | 'lowest'
): PlayerId[] | null {
  const activePids = state.playerOrder.slice(0, state.playerCount);
  const values = activePids.map((pid) => metricExtractor(state.players[pid]!));

  // Check if ALL active players have identical values -> Total Tie -> No-op (R L398-403)
  const allIdentical = values.every((v) => v === values[0]);
  if (allIdentical) {
    return null;
  }

  const targetVal = target === 'highest' ? Math.max(...values) : Math.min(...values);
  const tied = activePids.filter((pid) => metricExtractor(state.players[pid]!) === targetVal);

  // Sort clockwise starting from activePlayerId
  const activeIdx = activePids.indexOf(state.activePlayerId);
  return tied.sort((a, b) => {
    const distA = (activePids.indexOf(a) - activeIdx + activePids.length) % activePids.length;
    const distB = (activePids.indexOf(b) - activeIdx + activePids.length) % activePids.length;
    return distA - distB;
  });
}

/**
 * Resolve Air Pollution:
 * The player(s) with the highest LF must place 1 hazard token on one of their cities.
 * If all cities have hazard tokens, place on town.
 */
export function resolveAirPollution(state: GameState): void {
  const targetPids = getTiedPlayers(state, (p) => p.localFootprint, 'highest');
  if (targetPids === null) {
    state.log.push({
      timestamp: state.log.length,
      message: 'Air Pollution: All players tied on Local Footprint. No effect.',
    });
    return;
  }

  for (const pid of targetPids) {
    if (state.supply.hazards <= 0) {
      state.log.push({
        timestamp: state.log.length,
        message: 'Air Pollution: Global hazard supply exhausted.',
      });
      break;
    }

    const unhazardedCities = state.board.intersections.filter(
      (node) => node.building?.playerId === pid && node.building.type === 'city' && !node.hasHazard
    );
    const unhazardedTowns = state.board.intersections.filter(
      (node) => node.building?.playerId === pid && node.building.type === 'town' && !node.hasHazard
    );

    if (unhazardedCities.length > 0 || unhazardedTowns.length > 0) {
      state.pendingDecisions.push({
        id: `air-pollution-${pid}-${state.log.length}`,
        type: 'EVENT_HAZARD_CHOICE',
        playerId: pid,
        source: 'AirPollution',
        targetType: 'CityFirst',
      });
    } else {
      state.log.push({
        timestamp: state.log.length,
        message: `Air Pollution: ${state.players[pid]!.name} has no eligible un-hazarded buildings.`,
      });
    }
  }
}

/**
 * Resolve Environmental Pollution:
 * Active player rolls dice (re-rolling 7s) and places 1 hazard token on all hexes with this number.
 * Hex with Inspector is protected. Existing hazards not duplicated.
 */
export function resolveEnvironmentalPollution(state: GameState): void {
  const prng = Mulberry32PRNG.fromState(state.prng);
  let roll = prng.rollDice();
  let sum = roll[0] + roll[1];

  while (sum === 7) {
    state.log.push({
      timestamp: state.log.length,
      message: `Environmental Pollution: Rolled 7 (${roll[0]}, ${roll[1]}). Re-rolling...`,
    });
    roll = prng.rollDice();
    sum = roll[0] + roll[1];
  }

  state.prng = prng.getState();

  state.log.push({
    timestamp: state.log.length,
    message: `Environmental Pollution: ${state.players[state.activePlayerId]!.name} rolled ${sum} (${roll[0]} + ${roll[1]}).`,
  });

  const matchingHexes = state.board.hexes.filter((h) => h.numberDisc === sum);

  for (const hex of matchingHexes) {
    if (hex.hasInspector) {
      state.log.push({
        timestamp: state.log.length,
        message: `Environmental Pollution: The Inspector protects hex ${hex.id} (${hex.terrain} #${hex.numberDisc}) from a hazard token.`,
      });
      continue;
    }

    if (hex.hasHazard) {
      state.log.push({
        timestamp: state.log.length,
        message: `Environmental Pollution: Hex ${hex.id} (${hex.terrain} #${hex.numberDisc}) already has a hazard token.`,
      });
      continue;
    }

    if (state.supply.hazards <= 0) {
      state.log.push({
        timestamp: state.log.length,
        message: 'Environmental Pollution: Hazard supply exhausted.',
      });
      break;
    }

    hex.hasHazard = true;
    state.supply.hazards--;
    state.log.push({
      timestamp: state.log.length,
      message: `Environmental Pollution: A hazard token was placed on hex ${hex.id} (${hex.terrain} #${hex.numberDisc}).`,
    });
  }
}

/**
 * Resolve Production Increase:
 * The player(s) with highest LF may build 1 fossil fuel plant for free and gain 1 resource from that hex
 * even if that hex currently has a hazard token.
 */
export function resolveProductionIncrease(state: GameState): void {
  const targetPids = getTiedPlayers(state, (p) => p.localFootprint, 'highest');
  if (targetPids === null) {
    state.log.push({
      timestamp: state.log.length,
      message: 'Production Increase: All players tied on Local Footprint. No effect.',
    });
    return;
  }

  for (const pid of targetPids) {
    const player = state.players[pid]!;
    if (player.fossilPlantsInReserve <= 0) {
      state.log.push({
        timestamp: state.log.length,
        message: `Production Increase: ${player.name} has no fossil fuel plants in reserve.`,
      });
      continue;
    }

    // Check if player has at least one valid cutout slot
    let hasValidSlot = false;
    for (const node of state.board.intersections) {
      if (node.building?.playerId !== pid) continue;
      const isTown = node.building.type === 'town';
      const isCity = node.building.type === 'city';
      if (isTown && node.powerPlants.length >= 1) continue;
      if (isCity && node.powerPlants.length >= 3) continue;

      for (const hexId of node.adjacentHexIds) {
        const hex = state.board.hexes[hexId]!;
        if (hex.terrain === 'desert' || hex.numberDisc === null) continue;
        if (node.powerPlants.some((p) => p.hexId === hexId)) continue;
        hasValidSlot = true;
        break;
      }
      if (hasValidSlot) break;
    }

    if (!hasValidSlot) {
      state.log.push({
        timestamp: state.log.length,
        message: `Production Increase: ${player.name} has no available plant location.`,
      });
      continue;
    }

    state.pendingDecisions.push({
      id: `prod-inc-${pid}-${state.log.length}`,
      type: 'EVENT_PRODUCTION_INCREASE',
      playerId: pid,
      isOptional: true,
    });
  }
}

/**
 * Resolve Rain & Flooding:
 * All players must place 1 hazard token on one of their towns or cities (clockwise from active player).
 */
export function resolveRainAndFlooding(state: GameState): void {
  const activeIdx = state.playerOrder.indexOf(state.activePlayerId);
  const sequence: PlayerId[] = [];
  for (let i = 0; i < state.playerCount; i++) {
    sequence.push(state.playerOrder[(activeIdx + i) % state.playerCount]!);
  }

  for (const pid of sequence) {
    if (state.supply.hazards <= 0) {
      state.log.push({
        timestamp: state.log.length,
        message: 'Rain & Flooding: Hazard supply exhausted.',
      });
      break;
    }

    const unhazardedBuildings = state.board.intersections.filter(
      (node) => node.building?.playerId === pid && !node.hasHazard
    );

    if (unhazardedBuildings.length > 0) {
      state.pendingDecisions.push({
        id: `rain-flooding-${pid}-${state.log.length}`,
        type: 'EVENT_HAZARD_CHOICE',
        playerId: pid,
        source: 'RainAndFlooding',
        targetType: 'TownOrCity',
      });
    } else {
      state.log.push({
        timestamp: state.log.length,
        message: `Rain & Flooding: ${state.players[pid]!.name} has no un-hazarded buildings.`,
      });
    }
  }
}

/**
 * Resolve Climate Conference:
 * Lowest LF player(s) may take 1 card from supply.
 * Highest LF player(s) must discard 1 card.
 */
export function resolveClimateConference(state: GameState): void {
  // Check total tie on LF
  const activePids = state.playerOrder.slice(0, state.playerCount);
  const values = activePids.map((pid) => state.players[pid]!.localFootprint);
  if (values.every((v) => v === values[0])) {
    state.log.push({
      timestamp: state.log.length,
      message: 'Climate Conference: All players tied on Local Footprint. No effect.',
    });
    return;
  }

  // Part 1: Lowest LF Reward (may take 1 resource or science)
  const lowestPids = getTiedPlayers(state, (p) => p.localFootprint, 'lowest');
  if (lowestPids) {
    for (const pid of lowestPids) {
      state.pendingDecisions.push({
        id: `climate-reward-${pid}-${state.log.length}`,
        type: 'EVENT_CARD_CHOICE',
        playerId: pid,
        event: 'ClimateConferenceReward',
        cardCount: 1,
        isOptional: true,
      });
    }
  }

  // Part 2: Highest LF Penalty (must discard 1 resource or science)
  const highestPids = getTiedPlayers(state, (p) => p.localFootprint, 'highest');
  if (highestPids) {
    for (const pid of highestPids) {
      const p = state.players[pid]!;
      const totalCards =
        p.resources.lumber +
        p.resources.brick +
        p.resources.natural_fiber +
        p.resources.food +
        p.resources.steel +
        p.science;

      if (totalCards > 0) {
        state.pendingDecisions.push({
          id: `climate-penalty-${pid}-${state.log.length}`,
          type: 'EVENT_CARD_CHOICE',
          playerId: pid,
          event: 'ClimateConferencePenalty',
          cardCount: 1,
          isOptional: false,
        });
      } else {
        state.log.push({
          timestamp: state.log.length,
          message: `Climate Conference: ${p.name} has no cards to discard.`,
        });
      }
    }
  }
}

/**
 * Resolve Government Funding:
 * The player(s) with the lowest LF may take 1 development card from the supply.
 */
export function resolveGovernmentFunding(state: GameState): void {
  const targetPids = getTiedPlayers(state, (p) => p.localFootprint, 'lowest');
  if (targetPids === null) {
    state.log.push({
      timestamp: state.log.length,
      message: 'Government Funding: All players tied on Local Footprint. No effect.',
    });
    return;
  }

  for (const pid of targetPids) {
    if (state.supply.devDeck.length > 0) {
      state.pendingDecisions.push({
        id: `govt-funding-${pid}-${state.log.length}`,
        type: 'EVENT_CARD_CHOICE',
        playerId: pid,
        event: 'GovernmentFunding',
        cardCount: 1,
        isOptional: true,
      });
    } else {
      state.log.push({
        timestamp: state.log.length,
        message: 'Government Funding: Development card deck is empty.',
      });
    }
  }
}

/**
 * Resolve Sustainable Production:
 * The player(s) with the most renewable power plants may take 1 resource or science card from supply.
 */
export function resolveSustainableProduction(state: GameState): void {
  const targetPids = getTiedPlayers(state, (p) => p.renewablePlantsBuilt, 'highest');
  if (targetPids === null) {
    state.log.push({
      timestamp: state.log.length,
      message: 'Sustainable Production: All players tied on renewable power plants. No effect.',
    });
    return;
  }

  for (const pid of targetPids) {
    state.pendingDecisions.push({
      id: `sustainable-prod-${pid}-${state.log.length}`,
      type: 'EVENT_CARD_CHOICE',
      playerId: pid,
      event: 'SustainableProduction',
      cardCount: 1,
      isOptional: true,
    });
  }
}

/**
 * Master dispatcher for resolving an event track when its track fills.
 */
export function resolveEventTrack(state: GameState, track: EventDiscType): void {
  switch (track) {
    case 'airPollution':
      resolveAirPollution(state);
      break;
    case 'environmentalPollution':
      resolveEnvironmentalPollution(state);
      break;
    case 'productionIncrease':
      resolveProductionIncrease(state);
      break;
    case 'rainAndFlooding':
      resolveRainAndFlooding(state);
      break;
    case 'climateConference':
      resolveClimateConference(state);
      break;
    case 'governmentFunding':
      resolveGovernmentFunding(state);
      break;
    case 'sustainableProduction':
      resolveSustainableProduction(state);
      break;
  }
}

/**
 * Who an event line is about, phrased by the rule that picked them, e.g.
 * "Air Pollution: Highest local footprint (Pink)". The activity feed colours the name.
 */
function hazardActor(source: 'AirPollution' | 'RainAndFlooding', name: string): string {
  return source === 'AirPollution' ? `Air Pollution: Highest local footprint (${name})` : `Rain & Flooding: ${name}`;
}

type CardChoiceEvent =
  | 'ClimateConferenceReward'
  | 'ClimateConferencePenalty'
  | 'GovernmentFunding'
  | 'SustainableProduction';

function cardChoiceActor(event: CardChoiceEvent, name: string): string {
  switch (event) {
    case 'ClimateConferenceReward':
      return `Climate Conference: Lowest local footprint (${name})`;
    case 'ClimateConferencePenalty':
      return `Climate Conference: Highest local footprint (${name})`;
    case 'GovernmentFunding':
      return `Government Funding: Lowest local footprint (${name})`;
    case 'SustainableProduction':
      return `Sustainable Production: Most renewable plants (${name})`;
  }
}

const CARD_CHOICE_PASS: Record<CardChoiceEvent, string> = {
  ClimateConferenceReward: 'a free card',
  ClimateConferencePenalty: 'discarding',
  GovernmentFunding: 'a free development card',
  SustainableProduction: 'a free card',
};

/**
 * Applies player's response to an event pending decision.
 */
export function applyEventDecision(
  state: GameState,
  decision: PendingDecision,
  response: unknown
): void {
  const player = state.players[decision.playerId]!;
  const resp = (response ?? {}) as Record<string, unknown>;

  if (decision.type === 'EVENT_HAZARD_CHOICE') {
    const nodeId = resp.nodeId as NodeId;
    const node = state.board.intersections[nodeId];
    if (!node || node.building?.playerId !== decision.playerId || node.hasHazard) {
      throw new Error(`Invalid node ${nodeId} for hazard placement`);
    }

    if (decision.targetType === 'CityFirst') {
      const hasUnhazardedCity = state.board.intersections.some(
        (n) => n.building?.playerId === decision.playerId && n.building.type === 'city' && !n.hasHazard
      );
      if (hasUnhazardedCity && node.building.type !== 'city') {
        throw new Error(`Must place hazard on City first`);
      }
    }

    if (state.supply.hazards > 0) {
      node.hasHazard = true;
      state.supply.hazards--;
      state.log.push({
        timestamp: state.log.length,
        message: `${hazardActor(decision.source, player.name)} placed a hazard token on one of their ${node.building.type === 'city' ? 'cities' : 'towns'}.`,
      });
    } else {
      state.log.push({
        timestamp: state.log.length,
        message: `${hazardActor(decision.source, player.name)} could not place a hazard token: none left.`,
      });
    }
  } else if (decision.type === 'EVENT_CARD_CHOICE') {
    if (resp.pass) {
      state.log.push({
        timestamp: state.log.length,
        message: `${cardChoiceActor(decision.event, player.name)} passed on ${CARD_CHOICE_PASS[decision.event] ?? 'the card'}.`,
      });
      return;
    }

    if (decision.event === 'GovernmentFunding') {
      if (resp.take && state.supply.devDeck.length > 0) {
        const devCard = state.supply.devDeck.pop()!;
        player.devCards.unplayed.push(devCard);
        state.log.push({
          timestamp: state.log.length,
          message: `${cardChoiceActor(decision.event, player.name)} took a development card from the supply.`,
        });
      }
    } else if (
      decision.event === 'ClimateConferenceReward' ||
      decision.event === 'SustainableProduction'
    ) {
      const cardType = resp.cardType as ResourceType | 'science' | undefined;
      if (cardType === 'science') {
        if (state.supply.science > 0) {
          player.science++;
          state.supply.science--;
          state.log.push({
            timestamp: state.log.length,
            message: `${cardChoiceActor(decision.event, player.name)} took 1 science card from the supply.`,
          });
        }
      } else if (cardType) {
        if (state.supply.resources[cardType] > 0) {
          player.resources[cardType]++;
          state.supply.resources[cardType]--;
          state.log.push({
            timestamp: state.log.length,
            message: `${cardChoiceActor(decision.event, player.name)} took 1 ${cardType} card from the supply.`,
          });
        }
      }
    } else if (decision.event === 'ClimateConferencePenalty') {
      const cardType = resp.cardType as ResourceType | 'science' | undefined;
      if (cardType === 'science') {
        if (player.science > 0) {
          player.science--;
          state.supply.science++;
          state.log.push({
            timestamp: state.log.length,
            message: `${cardChoiceActor(decision.event, player.name)} discarded 1 science card.`,
          });
        }
      } else if (cardType) {
        if (player.resources[cardType] > 0) {
          player.resources[cardType]--;
          state.supply.resources[cardType]++;
          state.log.push({
            timestamp: state.log.length,
            message: `${cardChoiceActor(decision.event, player.name)} discarded 1 ${cardType} card.`,
          });
        }
      }
    }
  } else if (decision.type === 'EVENT_PRODUCTION_INCREASE') {
    if (resp.pass) {
      state.log.push({
        timestamp: state.log.length,
        message: `Production Increase: Highest local footprint (${player.name}) passed on a free fossil fuel plant.`,
      });
      return;
    }

    if (resp.build) {
      const nodeId = resp.nodeId as NodeId;
      const hexId = resp.hexId as HexId;
      const node = state.board.intersections[nodeId];
      const hex = state.board.hexes[hexId];

      if (!node || node.building?.playerId !== decision.playerId) {
        throw new Error(`Invalid intersection for fossil fuel plant placement`);
      }
      if (!hex || hex.terrain === 'desert' || hex.numberDisc === null) {
        throw new Error(`Cannot place power plant facing desert or sea`);
      }
      if (!node.adjacentHexIds.includes(hexId)) {
        throw new Error(`Hex is not adjacent to intersection`);
      }
      if (node.powerPlants.some((p) => p.hexId === hexId)) {
        throw new Error(`Cutout slot already has a power plant`);
      }
      if (node.building.type === 'town' && node.powerPlants.length >= 1) {
        throw new Error(`Town can hold at most 1 power plant`);
      }
      if (node.building.type === 'city' && node.powerPlants.length >= 3) {
        throw new Error(`City can hold at most 3 power plants`);
      }
      if (player.fossilPlantsInReserve <= 0) {
        throw new Error(`No fossil fuel plants in reserve`);
      }

      // Attach fossil plant
      node.powerPlants.push({
        playerId: decision.playerId,
        type: 'fossil',
        hexId,
      });

      player.fossilPlantsBuilt++;
      player.fossilPlantsInReserve--;
      player.localFootprint = computePlayerLF(player);

      state.trueTotalLF = computeTrueTotalLF(state.players);
      state.clampedGF = clampGF(state.trueTotalLF, state.playerCount);

      // Grant 1 resource even if hex has hazard! (R L875-876)
      const res = TERRAIN_RESOURCE_MAP[hex.terrain];
      if (res !== null && state.supply.resources[res] > 0) {
        player.resources[res]++;
        state.supply.resources[res]--;
      }

      state.log.push({
        timestamp: state.log.length,
        message: `Production Increase: Highest local footprint (${player.name}) built a free fossil fuel plant at node ${nodeId} facing hex ${hexId} and took 1 ${res}.`,
      });
    }
  }
}
