import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialGameState } from '../setup';
import { applyAction, IllegalActionError } from '../reducer';
import type { GameState, PlayerId } from '../types';

describe('offering one trade to several players in turn', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    state.phase = 'ActionPhase';
    state.players.orange!.resources.lumber = 2;
    for (const pid of ['purple', 'pink', 'blue'] as PlayerId[]) state.players[pid]!.resources.brick = 1;
  });

  const offer = (s: GameState, thenOffer: PlayerId[]) =>
    applyAction(s, {
      type: 'OFFER_TRADE',
      playerId: 'orange',
      targetPlayerId: 'purple',
      thenOffer,
      give: { lumber: 1 },
      want: { brick: 1 },
    });

  const respond = (s: GameState, accept: boolean) => {
    const head = s.pendingDecisions[0]!;
    return applyAction(s, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: head.playerId,
      decisionId: head.id,
      response: { accept },
    });
  };

  it('asks only the first player at first', () => {
    const s = offer(state, ['pink', 'blue']);
    expect(s.pendingDecisions.map((d) => d.playerId)).toEqual(['purple']);
  });

  it('offers it to the next player when one declines, in the chosen order', () => {
    let s = offer(state, ['blue', 'pink']);
    s = respond(s, false);
    expect(s.pendingDecisions.map((d) => d.playerId)).toEqual(['blue']);
    expect(s.log.at(-1)!.message).toBe('Orange offered the trade to Blue next.');
    s = respond(s, false);
    expect(s.pendingDecisions.map((d) => d.playerId)).toEqual(['pink']);
  });

  it('stops asking once someone accepts, and the trade goes through', () => {
    let s = offer(state, ['pink', 'blue']);
    s = respond(s, false);
    s = respond(s, true);
    expect(s.pendingDecisions).toHaveLength(0);
    expect(s.players.pink!.resources.lumber).toBe(state.players.pink!.resources.lumber + 1);
    expect(s.players.pink!.resources.brick).toBe(0);
    expect(s.players.orange!.resources.brick).toBe(state.players.orange!.resources.brick + 1);
    expect(s.players.blue!.resources.brick).toBe(1);
  });

  it('says so when everyone declined, and lets the offerer act again', () => {
    let s = offer(state, ['pink']);
    s = respond(s, false);
    s = respond(s, false);
    expect(s.pendingDecisions).toHaveLength(0);
    expect(s.log.at(-1)!.message).toBe("Nobody took Orange's trade offer.");
  });

  it('skips players who cannot cover what is asked instead of prompting them', () => {
    state.players.pink!.resources.brick = 0;
    let s = offer(state, ['pink', 'blue']);
    s = respond(s, false);
    expect(s.pendingDecisions.map((d) => d.playerId)).toEqual(['blue']);
    expect(s.log.some((e) => e.message === 'Pink cannot cover the trade offer and was skipped.')).toBe(true);
  });

  it('ignores repeats, the offerer and unknown seats in the list', () => {
    let s = offer(state, ['purple', 'orange', 'pink', 'pink', 'nobody' as PlayerId]);
    s = respond(s, false);
    expect(s.pendingDecisions.map((d) => d.playerId)).toEqual(['pink']);
    s = respond(s, false);
    expect(s.pendingDecisions).toHaveLength(0);
  });

  it('a plain single-player offer still ends at the first decline', () => {
    let s = offer(state, []);
    s = respond(s, false);
    expect(s.pendingDecisions).toHaveLength(0);
    expect(s.log.at(-1)!.message).toBe('Purple declined the trade offer.');
  });

  it('the offerer still cannot act while an offer is out', () => {
    const s = offer(state, ['pink']);
    expect(() => offer(s, [])).toThrow(IllegalActionError);
  });
});
