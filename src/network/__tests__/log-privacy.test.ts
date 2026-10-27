import { describe, expect, it } from 'vitest';
import { applyAction } from '../../engine/reducer';
import { createInitialGameState } from '../../engine/setup';
import type { GameAction, GameState, PlayerId } from '../../engine/types';
import { hydrateRedactedState } from '../hydrate';
import { logMessageFor, redactActionFor, redactForPlayer, redactForSpectator } from '../redact';

const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const HIDDEN = { hideOpponentResources: true };

/** A real steal (orange from purple) and a real supply trade (purple), as the engine logs them. */
function stateWithPrivateLines(): GameState {
  let state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 209 });
  state.phase = 'ProductionPhase';
  state.players.purple.resources.steel = 2;
  const hexId = state.board.intersections[23]!.adjacentHexIds[0]!;
  state.board.hexes[hexId]!.hasHazard = false;
  state.pendingDecisions = [{ id: 'm', type: 'MOVE_INSPECTOR', playerId: 'orange' }];
  state = applyAction(state, {
    type: 'RESOLVE_PENDING_DECISION',
    playerId: 'orange',
    decisionId: 'm',
    response: { hexId },
  });
  state = applyAction(state, {
    type: 'RESOLVE_PENDING_DECISION',
    playerId: 'orange',
    decisionId: state.pendingDecisions[0]!.id,
    response: { targetPlayerId: 'purple' },
  });
  state.phase = 'ActionPhase';
  state.activePlayerId = 'purple';
  state.players.purple.resources.lumber = 4;
  return applyAction(state, {
    type: 'TRADE_SUPPLY',
    playerId: 'purple',
    give: { lumber: 4 },
    receive: 'brick',
  });
}

const steal = (s: { log: { message: string }[] }) => s.log.find((e) => e.message.includes('stole'))!;
const trade = (s: { log: { message: string }[] }) => s.log.find((e) => e.message.includes('traded with supply'))!;

describe('redactForPlayer and the log', () => {
  const truth = stateWithPrivateLines();
  const stealTruth = truth.log.find((e) => e.private && e.message.includes('stole'))!;
  const tradeTruth = truth.log.find((e) => e.private && e.message.includes('traded with supply'))!;

  it('gives each seat the text it may read when hands are hidden', () => {
    const expected: Record<PlayerId, [string, string]> = {
      orange: [stealTruth.message, tradeTruth.private!.publicMessage],
      purple: [stealTruth.message, tradeTruth.message],
      pink: [stealTruth.private!.publicMessage, tradeTruth.private!.publicMessage],
      blue: [stealTruth.private!.publicMessage, tradeTruth.private!.publicMessage],
    };
    for (const pid of Object.keys(expected) as PlayerId[]) {
      const view = wire(redactForPlayer(truth, pid, HIDDEN));
      expect([steal(view).message, trade(view).message]).toEqual(expected[pid]);
      expect(JSON.stringify(view.log)).not.toContain('"private"');
      // The viewer's own text is what logMessageFor says on the server copy
      expect(steal(view).message).toBe(logMessageFor(stealTruth, pid));
    }
  });

  it('spectators read the public text only', () => {
    const view = wire(redactForSpectator(truth, HIDDEN));
    expect(steal(view).message).toBe(stealTruth.private!.publicMessage);
    expect(trade(view).message).toBe(tradeTruth.private!.publicMessage);
    expect(JSON.stringify(view)).not.toContain('"private"');
  });

  it('keeps the full text when hands are open, but still strips the private field', () => {
    const view = wire(redactForPlayer(truth, 'blue'));
    expect(steal(view).message).toBe(stealTruth.message);
    expect(JSON.stringify(view.log)).not.toContain('"private"');
  });

  it('shows everything to everyone once the game is over', () => {
    const over = structuredClone(truth);
    over.phase = 'GameEnd';
    over.winner = 'orange';
    const view = wire(redactForSpectator(over, HIDDEN));
    expect(steal(view).message).toBe(stealTruth.message);
    expect(JSON.stringify(view.log)).not.toContain('"private"');
  });

  it('does not change the server copy of the state', () => {
    redactForPlayer(truth, 'blue', HIDDEN);
    expect(truth.log.find((e) => e.message.includes('stole'))!.private).toBeDefined();
  });

  it('survives hydration: the client shows exactly what the server sent', () => {
    const view = hydrateRedactedState(wire(redactForPlayer(truth, 'pink', HIDDEN)), 'pink');
    expect(steal(view).message).toBe(stealTruth.private!.publicMessage);
  });
});

describe('the last move on the wire', () => {
  const tradeSupply: GameAction = {
    type: 'TRADE_SUPPLY',
    playerId: 'orange',
    give: { lumber: 4 },
    receive: 'steel',
  };

  it('leaves the card received out of another seat’s trade', () => {
    expect(redactActionFor(tradeSupply, 'orange', HIDDEN)).toEqual(tradeSupply);
    for (const viewer of ['purple', null] as const) {
      const sent = wire(redactActionFor(tradeSupply, viewer, HIDDEN));
      expect(sent).toEqual({ type: 'TRADE_SUPPLY', playerId: 'orange', give: { lumber: 4 } });
      expect(JSON.stringify(sent)).not.toContain('steel');
    }
    const harbor: GameAction = { ...tradeSupply, type: 'TRADE_HARBOR', harborId: 3, give: { lumber: 3 } };
    expect(JSON.stringify(redactActionFor(harbor, 'purple', HIDDEN))).not.toContain('steel');
  });

  it('leaves out the card bought with energy, taken with Research Grant or picked from an event', () => {
    const energy: GameAction = { type: 'SPEND_ENERGY', playerId: 'orange', usage: 'BUY_CARD', params: { cardType: 'brick' } };
    expect(wire(redactActionFor(energy, 'purple', HIDDEN))).toEqual({ ...energy, params: {} });

    const grant: GameAction = {
      type: 'PLAY_DEV_CARD',
      playerId: 'orange',
      cardId: 'dev-1',
      params: { cardType: 'researchGrant', cards: ['brick', 'science'] },
    };
    expect(redactActionFor(grant, 'purple', HIDDEN)).toEqual({ ...grant, params: { cardType: 'researchGrant' } });

    const pick: GameAction = { type: 'RESOLVE_PENDING_DECISION', playerId: 'orange', decisionId: 'd1', response: { cardType: 'food' } };
    expect(redactActionFor(pick, 'purple', HIDDEN)).toEqual({ ...pick, response: {} });
  });

  it('keeps public moves and open-hand games as they are', () => {
    const reply: GameAction = { type: 'RESOLVE_PENDING_DECISION', playerId: 'orange', decisionId: 'd2', response: { want: { brick: 1 } } };
    expect(redactActionFor(reply, 'purple', HIDDEN)).toBe(reply);
    const clean: GameAction = { type: 'SPEND_ENERGY', playerId: 'orange', usage: 'CLEAN_HAZARD', params: { hazardTarget: { kind: 'hex', id: 4 } } };
    expect(redactActionFor(clean, 'purple', HIDDEN)).toBe(clean);
    expect(redactActionFor(tradeSupply, 'purple')).toBe(tradeSupply);
    expect(redactActionFor(null, 'purple', HIDDEN)).toBeNull();
  });
});
