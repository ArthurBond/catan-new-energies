/**
 * CATAN: New Energies — Events Engine & Event Bag Orchestration
 *
 * Implements:
 * 1. Event Phase Draw Locking based on clamped Global Footprint (GF) bands.
 *    Lock Invariant: Mid-turn GF changes do NOT alter remaining draws for that turn.
 * 2. Sequential disc draw & coastal island track routing.
 * 3. Track full detection: clears track (all discs permanently removed from play) and invokes resolver.
 * 4. Immediate Empty Bag Termination when a draw is required and bag is empty.
 * 5. Phase transition to ProductionPhase when all locked draws and pending decisions conclude.
 */

import { EVENT_TRACK_LENGTHS, getEventDiscDrawCount } from './config';
import { resolveEventTrack } from './event-resolvers';
import { evaluateEmptyBagVictory } from './victory';
import { GameState } from './types';

/**
 * Locks the event disc draw count at the beginning of the Event Phase for the active player's turn.
 * Stays strictly immutable until the Event Phase ends (R L346-349).
 */
export function lockEventDrawCount(state: GameState): void {
  if (state.lockedDrawCount === null) {
    const drawCount = getEventDiscDrawCount(state.clampedGF, state.playerCount);
    state.lockedDrawCount = drawCount;
    state.eventDiscsDrawnThisTurn = 0;
    state.log.push({
      timestamp: state.log.length,
      message: `Event draw count locked at ${drawCount} disc(s) (Clamped GF: ${state.clampedGF}).`,
    });
  }
}

/**
 * Performs a single sequential draw of an event disc from the event bag, routes it to its track,
 * and triggers track clearing / event resolution if the track fills.
 */
export function stepEventDraw(state: GameState): GameState {
  // Ensure draw count is locked
  lockEventDrawCount(state);

  // 1. Mandatory Empty Bag Check: if a draw is required and bag is empty -> immediate game end! (R L371-374, L836-844)
  if (state.eventBag.length === 0) {
    const victory = evaluateEmptyBagVictory(state);
    state.phase = 'GameEnd';
    state.winner = victory.winner;

    if (victory.winner === 'collapse') {
      state.log.push({
        timestamp: state.log.length,
        message:
          'The Event Bag is empty and no player has more renewable plants than fossil plants. Total environmental collapse! All players lose.',
      });
    } else {
      let winnerName = 'Unknown';
      if (Array.isArray(victory.winner)) {
        winnerName = victory.winner.map((id) => state.players[id]?.name).join(' & ');
      } else if (victory.winner) {
        winnerName = state.players[victory.winner]?.name ?? victory.winner;
      }
      state.log.push({
        timestamp: state.log.length,
        message: `The Event Bag is empty! Winner by sustainable energy balance: ${winnerName}.`,
      });
    }
    return state;
  }

  // 2. Draw 1 disc from bag
  const disc = state.eventBag.shift()!;
  state.eventDiscsDrawnThisTurn = (state.eventDiscsDrawnThisTurn || 0) + 1;

  state.log.push({
    timestamp: state.log.length,
    message: `${state.players[state.activePlayerId]!.name} drew a ${disc} event disc (${state.eventDiscsDrawnThisTurn}/${state.lockedDrawCount}).`,
  });

  // 3. Route to coastal island track on sea frame
  state.eventTracks[disc] = (state.eventTracks[disc] || 0) + 1;
  const trackCapacity = EVENT_TRACK_LENGTHS[disc];

  // 4. Track full check: all discs removed from play, trigger event
  if (state.eventTracks[disc] >= trackCapacity) {
    state.eventTracks[disc] = 0;
    state.log.push({
      timestamp: state.log.length,
      message: `The ${disc} track is full.`,
    });
    resolveEventTrack(state, disc);
  }

  // 5. Post-draw phase check
  // If no pending decisions exist AND we reached lockedDrawCount -> transition to ProductionPhase
  if (
    state.pendingDecisions.length === 0 &&
    state.eventDiscsDrawnThisTurn >= (state.lockedDrawCount || 1)
  ) {
    transitionToProductionPhase(state);
  }

  return state;
}

/**
 * Transitions from EventPhase to ProductionPhase.
 */
export function transitionToProductionPhase(state: GameState): void {
  state.phase = 'ProductionPhase';
  state.lockedDrawCount = null;
  state.eventDiscsDrawnThisTurn = 0;
  state.log.push({
    timestamp: state.log.length,
    message: `Event Phase completed. Entering Production Phase for ${state.players[state.activePlayerId]!.name}.`,
  });
}

/**
 * Check if the Event Phase should transition after a pending decision has been resolved.
 */
export function checkPostDecisionEventPhase(state: GameState): void {
  if (state.phase === 'EventPhase' && state.pendingDecisions.length === 0) {
    if (
      state.lockedDrawCount !== null &&
      state.eventDiscsDrawnThisTurn >= state.lockedDrawCount
    ) {
      transitionToProductionPhase(state);
    }
  }
}
