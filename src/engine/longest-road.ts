/**
 * CATAN: New Energies — Longest Trade Route Engine
 *
 * Implements:
 * - ACT-06: Continuous graph traversal (DFS) without edge reuse.
 * - Road interruption by opponent settlements/cities.
 * - Minimum threshold of 5 continuous road segments.
 * - Strict exceedance transfer rules (ties do not transfer).
 * - Break re-evaluation and fallback to supply on ties.
 * - 2 Victory Points synchronization.
 */

import { BOARD_CONSTANTS } from './config';
import { Board, EdgeId, GameState, NodeId, PlayerId } from './types';

/**
 * Calculates the length of the longest continuous road path for a given player.
 * Enforces:
 * - Each road edge can only be used once in the path.
 * - Path can cross itself / visit intersections multiple times.
 * - Opponent settlements/cities block road continuation through that intersection.
 */
export function calculateLongestRoad(board: Board, playerId: PlayerId): number {
  const playerEdgeIds = new Set<EdgeId>();
  for (const edge of board.edges) {
    if (edge.road && edge.road.playerId === playerId) {
      playerEdgeIds.add(edge.id);
    }
  }

  if (playerEdgeIds.size === 0) {
    return 0;
  }

  // Find all intersections touched by this player's roads
  const relevantNodes = new Set<NodeId>();
  for (const edgeId of playerEdgeIds) {
    const edge = board.edges[edgeId]!;
    relevantNodes.add(edge.v1);
    relevantNodes.add(edge.v2);
  }

  function dfs(currNode: NodeId, visitedEdges: Set<EdgeId>): number {
    let maxSubLen = 0;
    const node = board.intersections[currNode];
    if (!node) return 0;

    for (const edgeId of node.incidentEdgeIds) {
      if (visitedEdges.has(edgeId) || !playerEdgeIds.has(edgeId)) {
        continue;
      }

      visitedEdges.add(edgeId);
      const edge = board.edges[edgeId]!;
      const nextNode = edge.v1 === currNode ? edge.v2 : edge.v1;

      let pathLen = 1;

      // Check if nextNode has an opponent building
      const nextNodeObj = board.intersections[nextNode];
      const hasOpponentBuilding =
        nextNodeObj?.building !== null &&
        nextNodeObj?.building !== undefined &&
        nextNodeObj.building.playerId !== playerId;

      if (!hasOpponentBuilding) {
        pathLen = 1 + dfs(nextNode, visitedEdges);
      }

      maxSubLen = Math.max(maxSubLen, pathLen);
      visitedEdges.delete(edgeId);
    }

    return maxSubLen;
  }

  let longest = 0;
  for (const startNode of relevantNodes) {
    const len = dfs(startNode, new Set<EdgeId>());
    if (len > longest) {
      longest = len;
    }
  }

  return longest;
}

export interface LongestRoadUpdateResult {
  previousHolder: PlayerId | null;
  newHolder: PlayerId | null;
  transferred: boolean;
  lengths: Record<PlayerId, number>;
}

/**
 * Updates the Longest Trade Route award state and player victory points.
 */
export function updateLongestRoadAward(state: GameState): LongestRoadUpdateResult {
  const lengths = {} as Record<PlayerId, number>;
  for (const pid of state.playerOrder) {
    lengths[pid] = calculateLongestRoad(state.board, pid);
  }

  const currentHolder = state.specialAwards.longestRoad.holder;
  let newHolder = currentHolder;

  if (currentHolder === null) {
    // Find player with highest length >= 5
    let bestLength = BOARD_CONSTANTS.longestRoadMin - 1;
    let candidate: PlayerId | null = null;
    let tied = false;

    for (const pid of state.playerOrder) {
      const len = lengths[pid]!;
      if (len >= BOARD_CONSTANTS.longestRoadMin) {
        if (len > bestLength) {
          bestLength = len;
          candidate = pid;
          tied = false;
        } else if (len === bestLength) {
          tied = true;
        }
      }
    }

    if (candidate && !tied) {
      newHolder = candidate;
    }
  } else {
    const holderCurrentLength = lengths[currentHolder]!;

    if (holderCurrentLength < BOARD_CONSTANTS.longestRoadMin) {
      // Holder's route was broken and is now under minimum threshold!
      let bestLength = BOARD_CONSTANTS.longestRoadMin - 1;
      let candidate: PlayerId | null = null;
      let tied = false;

      for (const pid of state.playerOrder) {
        const len = lengths[pid]!;
        if (len >= BOARD_CONSTANTS.longestRoadMin) {
          if (len > bestLength) {
            bestLength = len;
            candidate = pid;
            tied = false;
          } else if (len === bestLength) {
            tied = true;
          }
        }
      }

      newHolder = tied ? null : candidate;
    } else {
      // Holder still >= 5. Requires strictly greater length to transfer (R L690-696)
      let strictlyBetterLength = holderCurrentLength;
      let candidate: PlayerId | null = null;
      let tied = false;

      for (const pid of state.playerOrder) {
        if (pid === currentHolder) continue;
        const len = lengths[pid]!;
        if (len > strictlyBetterLength) {
          strictlyBetterLength = len;
          candidate = pid;
          tied = false;
        } else if (len === strictlyBetterLength && candidate !== null) {
          tied = true;
        }
      }

      if (candidate && !tied) {
        newHolder = candidate;
      }
    }
  }

  const transferred = newHolder !== currentHolder;

  if (transferred) {
    if (currentHolder !== null) {
      state.players[currentHolder]!.victoryPoints -= 2;
      state.log.push({
        timestamp: state.log.length,
        message: `${state.players[currentHolder]!.name} lost Longest Trade Route.`,
      });
    }

    if (newHolder !== null) {
      state.players[newHolder]!.victoryPoints += 2;
      state.log.push({
        timestamp: state.log.length,
        message: `${state.players[newHolder]!.name} claimed Longest Trade Route (${lengths[newHolder]} roads, 2 VP).`,
      });
    }

    state.specialAwards.longestRoad.holder = newHolder;
    state.specialAwards.longestRoad.length = newHolder ? lengths[newHolder]! : 0;
    state.longestRoadHolder = newHolder;
  } else if (newHolder !== null) {
    state.specialAwards.longestRoad.length = lengths[newHolder]!;
  }

  return {
    previousHolder: currentHolder,
    newHolder,
    transferred,
    lengths,
  };
}
