/**
 * CATAN: New Energies — Development Cards Engine
 *
 * Implements:
 * - DEV-01: Development card buying (1 fiber, 1 food, 1 steel), hidden in hand,
 *   max 1 dev card played per turn, cannot play on turn bought (except winning VP cards).
 * - DEV-02: Cleanup cards (14x):
 *   - Option 1: Move Inspector to hazard-free hex + steal 1 card from adjacent building owner.
 *   - Option 2: Remove 1 hazard from hex, town, or city + steal 1 card from player with same/higher LF.
 *   - Cleanest Environment award (2 VP at >= 3 Cleanup cards, strict exceedance transfer).
 * - DEV-03: Progress Cards:
 *   - Road Construction (2x): build up to 2 free roads (constrained by reserves), update Longest Road.
 *   - High Yield (2x): take 1 resource from up to 3 distinct hexes with own renewable plants (ignores hazards/inspector).
 *   - Research Grant (2x): take 2 cards (resource or science) of choice from supply.
 *   - Victory Point Cards (5x): 1 VP each, reveal to achieve winning >= 10 VP on own turn.
 */

import {
  BOARD_CONSTANTS,
  ResourceType,
} from './config';
import { executeStealCard, getHandSizeForSeven } from './production';
import { TERRAIN_RESOURCE_MAP } from './setup';
import { updateLongestRoadAward } from './longest-road';
import { checkOwnTurnVictory } from './victory';
import {
  Board,
  CleanupOption,
  DevelopmentCardType,
  DevCardPlayParams,
  EdgeId,
  GameState,
  HexId,
  PlayerId,
} from './types';

// ============================================================================
// Card Type & ID Classification
// ============================================================================

export function getDevCardType(cardId: string): DevelopmentCardType {
  if (cardId.startsWith('dev_cleanup') || cardId.includes('cleanup')) {
    return 'cleanup';
  }
  if (cardId.startsWith('dev_roadConstruction') || cardId.includes('roadConstruction')) {
    return 'roadConstruction';
  }
  if (cardId.startsWith('dev_highYield') || cardId.includes('highYield')) {
    return 'highYield';
  }
  if (cardId.startsWith('dev_researchGrant') || cardId.includes('researchGrant')) {
    return 'researchGrant';
  }
  if (cardId.startsWith('dev_victoryPoint') || cardId.includes('victoryPoint')) {
    return 'victoryPoint';
  }
  throw new Error(`Unknown development card ID: ${cardId}`);
}

// ============================================================================
// Cleanest Environment Award (DEV-02)
// ============================================================================

export function checkCleanestEnvironment(state: GameState, activePlayerId: PlayerId): void {
  const activePlayer = state.players[activePlayerId];
  if (!activePlayer) return;

  const activeCleanups = activePlayer.devCards.played.filter(
    (id) => getDevCardType(id) === 'cleanup'
  ).length;

  if (activeCleanups < BOARD_CONSTANTS.cleanestEnvMin) {
    return;
  }

  const currentHolderId = state.cleanestEnvironmentHolder;

  if (currentHolderId === null) {
    // First player to reach >= 3 Cleanup cards
    state.cleanestEnvironmentHolder = activePlayerId;
    state.specialAwards.cleanestEnvironment = {
      holder: activePlayerId,
      cleanupCount: activeCleanups,
    };
    activePlayer.victoryPoints += 2;
    state.log.push({
      timestamp: state.log.length,
      message: `${activePlayer.name} claimed the Cleanest Environment award (2 VP) with ${activeCleanups} Cleanup cards!`,
    });
    return;
  }

  if (currentHolderId !== activePlayerId) {
    const currentHolder = state.players[currentHolderId];
    const currentCleanups = currentHolder
      ? currentHolder.devCards.played.filter((id) => getDevCardType(id) === 'cleanup').length
      : 0;

    // Strict transfer: must strictly exceed current holder (R L793-796)
    if (activeCleanups > currentCleanups) {
      if (currentHolder) {
        currentHolder.victoryPoints -= 2;
      }
      activePlayer.victoryPoints += 2;
      state.cleanestEnvironmentHolder = activePlayerId;
      state.specialAwards.cleanestEnvironment = {
        holder: activePlayerId,
        cleanupCount: activeCleanups,
      };
      state.log.push({
        timestamp: state.log.length,
        message: `${activePlayer.name} took the Cleanest Environment award from ${
          currentHolder?.name ?? currentHolderId
        } with ${activeCleanups} Cleanup cards!`,
      });
    }
  } else {
    // Already holder, update cleanup count
    state.specialAwards.cleanestEnvironment.cleanupCount = activeCleanups;
  }
}

// ============================================================================
// Buying Development Cards (DEV-01)
// ============================================================================

export function canBuyDevCard(
  state: GameState,
  playerId: PlayerId
): { canBuy: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canBuy: false, reason: 'Can only buy development cards in ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canBuy: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canBuy: false, reason: 'Unresolved pending decisions exist' };
  }
  if (state.supply.devDeck.length === 0) {
    return { canBuy: false, reason: 'Development card deck is empty' };
  }

  const player = state.players[playerId];
  if (!player) {
    return { canBuy: false, reason: 'Invalid player ID' };
  }

  if (
    player.resources.natural_fiber < 1 ||
    player.resources.food < 1 ||
    player.resources.steel < 1
  ) {
    return {
      canBuy: false,
      reason: 'Insufficient resources (requires 1 natural fiber, 1 food, 1 steel)',
    };
  }

  return { canBuy: true };
}

export function applyBuyDevCard(state: GameState, playerId: PlayerId): string {
  const check = canBuyDevCard(state, playerId);
  if (!check.canBuy) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;

  // Deduct cost
  player.resources.natural_fiber -= 1;
  player.resources.food -= 1;
  player.resources.steel -= 1;
  state.supply.resources.natural_fiber += 1;
  state.supply.resources.food += 1;
  state.supply.resources.steel += 1;

  // Draw card from deck
  const cardId = state.supply.devDeck.pop()!;
  player.devCards.unplayed.push(cardId);

  // Track turn bought
  state.devCardsBoughtThisTurn.push(cardId);
  state.turnStats.devCardsBoughtThisTurn.push(cardId);

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} bought a Development Card.`,
  });

  return cardId;
}

// ============================================================================
// Road Connectivity Helper for Road Construction
// ============================================================================

export function isEdgeConnectedToPlayerNetwork(
  board: Board,
  playerId: PlayerId,
  edgeId: EdgeId,
  additionalEdges: EdgeId[] = []
): boolean {
  const edge = board.edges[edgeId];
  if (!edge || edge.road !== null) return false;

  for (const nodeId of [edge.v1, edge.v2]) {
    const node = board.intersections[nodeId]!;
    if (node.building && node.building.playerId === playerId) {
      return true;
    }
    const hasOpponentBuilding = node.building && node.building.playerId !== playerId;
    if (!hasOpponentBuilding) {
      for (const incEdgeId of node.incidentEdgeIds) {
        if (incEdgeId === edgeId) continue;
        if (board.edges[incEdgeId]?.road?.playerId === playerId) {
          return true;
        }
        if (additionalEdges.includes(incEdgeId)) {
          return true;
        }
      }
    }
  }
  return false;
}

// ============================================================================
// Playing Development Cards (DEV-01, DEV-02, DEV-03)
// ============================================================================

export function canPlayDevCard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  params?: DevCardPlayParams | unknown
): { canPlay: boolean; reason?: string } {
  // Timing windows: ActionPhase or EventPhase (pre-event window before drawing)
  const isValidPhase =
    state.phase === 'ActionPhase' ||
    (state.phase === 'EventPhase' && state.eventDiscsDrawnThisTurn === 0);

  if (!isValidPhase) {
    return {
      canPlay: false,
      reason: 'Can only play development cards in ActionPhase or Pre-Event window',
    };
  }
  if (state.activePlayerId !== playerId) {
    return { canPlay: false, reason: 'Not active player turn' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canPlay: false, reason: 'Unresolved pending decisions exist' };
  }

  const player = state.players[playerId];
  if (!player) {
    return { canPlay: false, reason: 'Invalid player ID' };
  }

  if (!player.devCards.unplayed.includes(cardId)) {
    return { canPlay: false, reason: 'Player does not have this unplayed card' };
  }

  const cardType = getDevCardType(cardId);

  // Victory Point cards are revealed to win, not played as standard action cards
  if (cardType === 'victoryPoint') {
    if (player.victoryPoints + 1 < 10) {
      return {
        canPlay: false,
        reason: 'Victory Point cards may only be revealed to reach winning 10 VP',
      };
    }
    return { canPlay: true };
  }

  // Max 1 dev card played per turn
  if (state.devCardPlayedThisTurn || state.turnStats.devCardsPlayedThisTurn >= 1) {
    return { canPlay: false, reason: 'Already played a development card this turn' };
  }

  // Cannot play card bought on current turn
  if (
    state.devCardsBoughtThisTurn.includes(cardId) ||
    state.turnStats.devCardsBoughtThisTurn.includes(cardId)
  ) {
    return { canPlay: false, reason: 'Cannot play a development card on the turn it was bought' };
  }

  // Specific card parameter validations
  const typedParams = params as DevCardPlayParams | undefined;

  if (cardType === 'cleanup') {
    if (!typedParams || typedParams.cardType !== 'cleanup' || !typedParams.option) {
      return { canPlay: false, reason: 'Cleanup card requires option parameters' };
    }

    const opt = typedParams.option;
    // The card is move the Inspector OR remove a hazard: never both in one play
    const picked = opt as { newHexId?: unknown; hazardTarget?: unknown };
    if (opt.type === 'INSPECTOR_MOVE_STEAL' && picked.hazardTarget !== undefined) {
      return { canPlay: false, reason: 'Cleanup is move the Inspector OR remove a hazard, not both' };
    }
    if (opt.type === 'REMOVE_HAZARD_STEAL' && picked.newHexId !== undefined) {
      return { canPlay: false, reason: 'Cleanup is move the Inspector OR remove a hazard, not both' };
    }
    if (opt.type === 'INSPECTOR_MOVE_STEAL') {
      const hex = state.board.hexes[opt.newHexId];
      if (!hex) {
        return { canPlay: false, reason: 'Invalid new hex ID' };
      }
      if (hex.hasInspector) {
        return { canPlay: false, reason: 'Inspector is already on this hex' };
      }
      if (hex.hasHazard) {
        return { canPlay: false, reason: 'Cannot move Inspector to a hex with a hazard' };
      }
      if (opt.targetPlayerId) {
        const victim = state.players[opt.targetPlayerId];
        if (!victim || opt.targetPlayerId === playerId) {
          return { canPlay: false, reason: 'Invalid target player for steal' };
        }
        const hasAdjacentBuilding = state.board.intersections.some(
          (n) =>
            n.adjacentHexIds.includes(opt.newHexId) &&
            n.building &&
            n.building.playerId === opt.targetPlayerId
        );
        if (!hasAdjacentBuilding) {
          return {
            canPlay: false,
            reason: 'Target player has no town or city adjacent to the new Inspector hex',
          };
        }
      }
    } else if (opt.type === 'REMOVE_HAZARD_STEAL') {
      const boardHasHazards =
        state.board.hexes.some((h) => h.hasHazard) ||
        state.board.intersections.some((n) => n.hasHazard);

      if (boardHasHazards && opt.hazardTarget) {
        if (opt.hazardTarget.kind === 'hex') {
          const hex = state.board.hexes[opt.hazardTarget.id];
          if (!hex || !hex.hasHazard) {
            return { canPlay: false, reason: 'Target hex has no hazard' };
          }
        } else {
          const node = state.board.intersections[opt.hazardTarget.id];
          if (!node || !node.hasHazard) {
            return { canPlay: false, reason: 'Target intersection has no hazard' };
          }
        }
      }

      if (opt.targetPlayerId) {
        const victim = state.players[opt.targetPlayerId];
        if (!victim || opt.targetPlayerId === playerId) {
          return { canPlay: false, reason: 'Invalid target player for steal' };
        }
        if (victim.localFootprint < player.localFootprint) {
          return {
            canPlay: false,
            reason: 'Target player must have same or higher local footprint than active player',
          };
        }
      }
    } else {
      return { canPlay: false, reason: 'Unknown cleanup option' };
    }

    return { canPlay: true };
  }

  if (cardType === 'roadConstruction') {
    if (!typedParams || typedParams.cardType !== 'roadConstruction') {
      return { canPlay: false, reason: 'Road Construction requires edge parameters' };
    }
    if (player.roadsInReserve === 0) {
      return { canPlay: false, reason: 'No road pieces remaining in reserve' };
    }

    const { edge1, edge2 } = typedParams;
    const e1 = state.board.edges[edge1];
    if (!e1 || e1.road !== null) {
      return { canPlay: false, reason: 'Edge 1 is invalid or already occupied' };
    }
    if (!isEdgeConnectedToPlayerNetwork(state.board, playerId, edge1)) {
      return { canPlay: false, reason: 'Edge 1 is not connected to your road network' };
    }

    if (edge2 !== undefined) {
      if (player.roadsInReserve < 2) {
        return { canPlay: false, reason: 'Only 1 road piece in reserve; cannot place 2 roads' };
      }
      if (edge1 === edge2) {
        return { canPlay: false, reason: 'Edge 1 and Edge 2 must be different' };
      }
      const e2 = state.board.edges[edge2];
      if (!e2 || e2.road !== null) {
        return { canPlay: false, reason: 'Edge 2 is invalid or already occupied' };
      }
      if (!isEdgeConnectedToPlayerNetwork(state.board, playerId, edge2, [edge1])) {
        return { canPlay: false, reason: 'Edge 2 is not connected to your road network' };
      }
    }

    return { canPlay: true };
  }

  if (cardType === 'highYield') {
    if (!typedParams || typedParams.cardType !== 'highYield' || !Array.isArray(typedParams.hexIds)) {
      return { canPlay: false, reason: 'High Yield requires hexIds array' };
    }
    const hexIds = typedParams.hexIds;
    if (hexIds.length > 3) {
      return { canPlay: false, reason: 'High Yield allows at most 3 hexes' };
    }
    const distinctHexes = new Set(hexIds);
    if (distinctHexes.size !== hexIds.length) {
      return { canPlay: false, reason: 'Selected hexes must be distinct' };
    }

    for (const hId of hexIds) {
      const hex = state.board.hexes[hId];
      if (!hex) {
        return { canPlay: false, reason: `Invalid hex ID ${hId}` };
      }
      const hasRenewablePlant = state.board.intersections.some(
        (n) =>
          n.adjacentHexIds.includes(hId) &&
          n.powerPlants.some(
            (p) => p.playerId === playerId && p.type === 'renewable' && p.hexId === hId
          )
      );
      if (!hasRenewablePlant) {
        return {
          canPlay: false,
          reason: `Hex ${hId} does not have a renewable power plant owned by player`,
        };
      }
    }

    return { canPlay: true };
  }

  if (cardType === 'researchGrant') {
    if (!typedParams || typedParams.cardType !== 'researchGrant' || !Array.isArray(typedParams.cards)) {
      return { canPlay: false, reason: 'Research Grant requires cards parameter with 2 cards' };
    }
    const cards = typedParams.cards;
    if (cards.length !== 2) {
      return { canPlay: false, reason: 'Research Grant requires exactly 2 cards' };
    }

    const c1 = cards[0];
    const c2 = cards[1];
    const grantable = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'];
    if (!grantable.includes(c1) || !grantable.includes(c2)) {
      return { canPlay: false, reason: 'Research Grant takes resource or science cards only' };
    }

    if (c1 === c2) {
      if (c1 === 'science') {
        if (state.supply.science < 2) return { canPlay: false, reason: 'Supply has fewer than 2 science cards' };
      } else {
        if (state.supply.resources[c1] < 2) return { canPlay: false, reason: `Supply has fewer than 2 ${c1} cards` };
      }
    } else {
      if (c1 === 'science') {
        if (state.supply.science < 1) return { canPlay: false, reason: 'Supply has 0 science cards' };
      } else {
        if (state.supply.resources[c1] < 1) return { canPlay: false, reason: `Supply has 0 ${c1} cards` };
      }

      if (c2 === 'science') {
        if (state.supply.science < 1) return { canPlay: false, reason: 'Supply has 0 science cards' };
      } else {
        if (state.supply.resources[c2] < 1) return { canPlay: false, reason: `Supply has 0 ${c2} cards` };
      }
    }

    return { canPlay: true };
  }

  return { canPlay: true };
}

export function applyPlayDevCard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  params?: DevCardPlayParams | unknown
): void {
  const check = canPlayDevCard(state, playerId, cardId, params);
  if (!check.canPlay) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;
  const cardType = getDevCardType(cardId);

  // Remove card from unplayed
  const idx = player.devCards.unplayed.indexOf(cardId);
  if (idx !== -1) {
    player.devCards.unplayed.splice(idx, 1);
  }

  if (cardType === 'cleanup') {
    player.devCards.played.push(cardId);
    const opt = (params as DevCardPlayParams as { cardType: 'cleanup'; option: CleanupOption }).option;

    if (opt.type === 'INSPECTOR_MOVE_STEAL') {
      // 1. Move Inspector
      const currentInspectorHex = state.board.hexes.find((h) => h.hasInspector);
      if (currentInspectorHex) {
        currentInspectorHex.hasInspector = false;
      }
      const newHex = state.board.hexes[opt.newHexId]!;
      newHex.hasInspector = true;

      state.log.push({
        timestamp: state.log.length,
        message: `${player.name} played Cleanup: moved Inspector to hex ${newHex.id} (${newHex.terrain} #${newHex.numberDisc}).`,
      });

      // 2. Steal card if eligible target exists
      let victimId = opt.targetPlayerId;
      if (!victimId) {
        const adjacentOpponents = state.board.intersections
          .filter((n) => n.adjacentHexIds.includes(opt.newHexId) && n.building && n.building.playerId !== playerId)
          .map((n) => n.building!.playerId);
        const uniqueVictims = Array.from(new Set(adjacentOpponents)).filter(
          (vid) => getHandSizeForSeven(state.players[vid]!) > 0
        );
        if (uniqueVictims.length > 0) {
          victimId = uniqueVictims[0];
        }
      }

      if (victimId && getHandSizeForSeven(state.players[victimId]!) > 0) {
        executeStealCard(state, playerId, victimId);
      }
    } else {
      // REMOVE_HAZARD_STEAL
      // 1. Remove 1 hazard
      let removed = false;
      if (opt.hazardTarget) {
        if (opt.hazardTarget.kind === 'hex') {
          const hex = state.board.hexes[opt.hazardTarget.id];
          if (hex && hex.hasHazard) {
            hex.hasHazard = false;
            state.supply.hazards = Math.min(10, state.supply.hazards + 1);
            removed = true;
          }
        } else {
          const node = state.board.intersections[opt.hazardTarget.id];
          if (node && node.hasHazard) {
            node.hasHazard = false;
            state.supply.hazards = Math.min(10, state.supply.hazards + 1);
            removed = true;
          }
        }
      } else {
        // Auto-remove first available hazard
        const hexHazard = state.board.hexes.find((h) => h.hasHazard);
        if (hexHazard) {
          hexHazard.hasHazard = false;
          state.supply.hazards = Math.min(10, state.supply.hazards + 1);
          removed = true;
        } else {
          const nodeHazard = state.board.intersections.find((n) => n.hasHazard);
          if (nodeHazard) {
            nodeHazard.hasHazard = false;
            state.supply.hazards = Math.min(10, state.supply.hazards + 1);
            removed = true;
          }
        }
      }

      state.log.push({
        timestamp: state.log.length,
        message: `${player.name} played Cleanup: ${
          removed ? 'removed 1 hazard token' : 'no hazards to remove'
        }.`,
      });

      // 2. Steal from player with same or higher LF
      let victimId = opt.targetPlayerId;
      if (!victimId) {
        const eligible = state.playerOrder.filter(
          (pid) =>
            pid !== playerId &&
            state.players[pid]!.localFootprint >= player.localFootprint &&
            getHandSizeForSeven(state.players[pid]!) > 0
        );
        if (eligible.length > 0) {
          victimId = eligible[0];
        }
      }

      if (victimId && getHandSizeForSeven(state.players[victimId]!) > 0) {
        executeStealCard(state, playerId, victimId);
      }
    }

    checkCleanestEnvironment(state, playerId);
    state.devCardPlayedThisTurn = true;
    state.turnStats.devCardsPlayedThisTurn++;
    checkOwnTurnVictory(state);
    return;
  }

  if (cardType === 'roadConstruction') {
    state.discardedDevCards.push(cardId);
    const p = params as { cardType: 'roadConstruction'; edge1: EdgeId; edge2?: EdgeId };

    const edge1 = state.board.edges[p.edge1]!;
    edge1.road = { playerId };
    player.roadsBuilt++;
    player.roadsInReserve--;

    if (p.edge2 !== undefined && player.roadsInReserve > 0) {
      const edge2 = state.board.edges[p.edge2]!;
      edge2.road = { playerId };
      player.roadsBuilt++;
      player.roadsInReserve--;
    }

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} played Road Construction: placed free road(s).`,
    });

    state.devCardPlayedThisTurn = true;
    state.turnStats.devCardsPlayedThisTurn++;
    updateLongestRoadAward(state);
    checkOwnTurnVictory(state);
    return;
  }

  if (cardType === 'highYield') {
    state.discardedDevCards.push(cardId);
    const p = params as { cardType: 'highYield'; hexIds: HexId[] };

    let totalGained = 0;
    for (const hId of p.hexIds) {
      const hex = state.board.hexes[hId]!;
      const res = TERRAIN_RESOURCE_MAP[hex.terrain];
      if (res !== null && state.supply.resources[res] > 0) {
        player.resources[res]++;
        state.supply.resources[res]--;
        totalGained++;
      }
    }

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} played High Yield: took ${totalGained} resource card(s) from renewable power plant hexes.`,
    });

    state.devCardPlayedThisTurn = true;
    state.turnStats.devCardsPlayedThisTurn++;
    return;
  }

  if (cardType === 'researchGrant') {
    state.discardedDevCards.push(cardId);
    const p = params as { cardType: 'researchGrant'; cards: [ResourceType | 'science', ResourceType | 'science'] };

    for (const card of p.cards) {
      if (card === 'science') {
        player.science++;
        state.supply.science--;
      } else {
        player.resources[card]++;
        state.supply.resources[card]--;
      }
    }

    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} played Research Grant: took 2 cards (${p.cards.join(', ')}) from supply.`,
    });

    state.devCardPlayedThisTurn = true;
    state.turnStats.devCardsPlayedThisTurn++;
    return;
  }

  if (cardType === 'victoryPoint') {
    player.devCards.played.push(cardId);
    player.victoryPoints++;
    state.log.push({
      timestamp: state.log.length,
      message: `${player.name} revealed a Victory Point card (+1 VP).`,
    });
    checkOwnTurnVictory(state);
    return;
  }
}

// ============================================================================
// Revealing Victory Point Cards (DEV-03)
// ============================================================================

export function canRevealVpCards(
  state: GameState,
  playerId: PlayerId,
  cardIds: string[]
): { canReveal: boolean; reason?: string } {
  if (state.activePlayerId !== playerId) {
    return { canReveal: false, reason: 'Not active player turn' };
  }
  const player = state.players[playerId];
  if (!player) {
    return { canReveal: false, reason: 'Invalid player ID' };
  }
  if (!cardIds || cardIds.length === 0) {
    return { canReveal: false, reason: 'Must specify at least one Victory Point card to reveal' };
  }

  for (const cid of cardIds) {
    if (!player.devCards.unplayed.includes(cid)) {
      return { canReveal: false, reason: `Player does not hold unplayed card ${cid}` };
    }
    if (getDevCardType(cid) !== 'victoryPoint') {
      return { canReveal: false, reason: `Card ${cid} is not a Victory Point card` };
    }
  }

  if (player.victoryPoints + cardIds.length < 10) {
    return {
      canReveal: false,
      reason: 'Victory Point cards may only be revealed if they bring total VP to at least 10',
    };
  }

  return { canReveal: true };
}

export function applyRevealVpCards(
  state: GameState,
  playerId: PlayerId,
  cardIds: string[]
): void {
  const check = canRevealVpCards(state, playerId, cardIds);
  if (!check.canReveal) {
    throw new Error(check.reason);
  }

  const player = state.players[playerId]!;

  for (const cid of cardIds) {
    const idx = player.devCards.unplayed.indexOf(cid);
    if (idx !== -1) {
      player.devCards.unplayed.splice(idx, 1);
    }
    player.devCards.played.push(cid);
    player.victoryPoints++;
  }

  state.log.push({
    timestamp: state.log.length,
    message: `${player.name} revealed ${cardIds.length} Victory Point card(s) to reach ${player.victoryPoints} VP!`,
  });

  checkOwnTurnVictory(state);
}
