import { describe, expect, it } from 'vitest';
import { applyAction } from '../reducer';
import { resolveClimateConference, resolveProductionIncrease } from '../event-resolvers';
import { logMessageFor } from '../redact';
import { createInitialGameState } from '../setup';
import { legalActions } from '../actions';
import type { GameAction, GameEventLog, GameState, PlayerId } from '../types';

/**
 * Every log line that names a card a player got privately is written by the engine with a
 * `private` field; these tests run the real engine paths and read what each seat may see.
 */

const CARD_WORDS = /lumber|brick|natural_fiber|fiber|food|steel|science/i;
const ALL: PlayerId[] = ['orange', 'purple', 'pink', 'blue'];

function actionState(seed = 42): GameState {
  const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed });
  state.phase = 'ActionPhase';
  return state;
}

function newPrivateLines(state: GameState, from: number): GameEventLog[] {
  return state.log.slice(from).filter((e) => e.private);
}

/** The one private line a scenario produced; checks it hides the card from everyone but `seen`. */
function expectPrivateLine(entry: GameEventLog | undefined, seen: PlayerId[], card: string) {
  expect(entry).toBeDefined();
  const line = entry!;
  expect(line.private!.playerIds.slice().sort()).toEqual(seen.slice().sort());
  expect(line.message).toContain(card);
  expect(line.private!.publicMessage).not.toMatch(CARD_WORDS);
  for (const pid of ALL) {
    const text = logMessageFor(line, pid);
    if (seen.includes(pid)) expect(text).toBe(line.message);
    else expect(text).toBe(line.private!.publicMessage);
  }
  // Nobody at the device (curtain up) reads the public version
  expect(logMessageFor(line, null)).toBe(line.private!.publicMessage);
}

describe('log lines naming a private card carry a public version', () => {
  it('inspector steal: thief and victim see the card, others do not', () => {
    const state = actionState(209);
    state.phase = 'ProductionPhase';
    state.players.purple.resources.natural_fiber = 1;
    const targetHexId = state.board.intersections[23]!.adjacentHexIds[0]!;
    state.board.hexes[targetHexId]!.hasHazard = false;
    state.pendingDecisions = [{ id: 'move-test', type: 'MOVE_INSPECTOR', playerId: 'orange' }];
    const moved = applyAction(state, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: 'move-test',
      response: { hexId: targetHexId },
    });
    const from = moved.log.length;
    const next = applyAction(moved, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'orange',
      decisionId: moved.pendingDecisions[0]!.id,
      response: { targetPlayerId: 'purple' },
    });
    const [line] = newPrivateLines(next, from);
    expectPrivateLine(line, ['orange', 'purple'], 'stole 1 ');
    expect(line!.private!.publicMessage).toBe(
      `${next.players.orange.name} stole 1 card from ${next.players.purple.name}.`
    );
    // The raw card type is named, not a UI label
    expect(line!.message).toMatch(/stole 1 (lumber|brick|natural_fiber|food|steel|science) card from/);
  });

  it('Cleanup dev card steal uses the same private line', () => {
    const state = actionState(100);
    state.players.orange.devCards.unplayed = ['dev_cleanup_01'];
    const targetHexId = state.board.intersections[23]!.adjacentHexIds[0]!;
    state.board.hexes[targetHexId]!.hasHazard = false;
    state.board.hexes[targetHexId]!.hasInspector = false;
    state.players.purple.resources.food = 3;
    const from = state.log.length;
    const next = applyAction(state, {
      type: 'PLAY_DEV_CARD',
      playerId: 'orange',
      cardId: 'dev_cleanup_01',
      params: {
        cardType: 'cleanup',
        option: { type: 'INSPECTOR_MOVE_STEAL', newHexId: targetHexId, targetPlayerId: 'purple' },
      },
    });
    const [line] = newPrivateLines(next, from);
    expectPrivateLine(line, ['orange', 'purple'], 'stole 1 ');
  });

  it('Climate Conference reward: only the taker sees the card (resource and science)', () => {
    for (const cardType of ['steel', 'science'] as const) {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 112 });
      state.players.orange.localFootprint = 1;
      state.players.blue.localFootprint = 5;
      resolveClimateConference(state);
      const decision = state.pendingDecisions[0]!;
      const from = state.log.length;
      const next = applyAction(state, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: decision.playerId,
        decisionId: decision.id,
        response: { cardType },
      });
      const [line] = newPrivateLines(next, from);
      expectPrivateLine(line, ['orange'], `took 1 ${cardType} card from the supply.`);
      expect(line!.private!.publicMessage).toBe(
        'Climate Conference: Lowest local footprint (Orange) took 1 card from the supply.'
      );
    }
  });

  it('Production Increase: only the builder sees the resource', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 109 });
    state.players.orange.localFootprint = 5;
    resolveProductionIncrease(state);
    const build = legalActions(state, 'orange').find(
      (a) => a.type === 'RESOLVE_PENDING_DECISION' && (a.response as { build?: boolean })?.build
    )!;
    const from = state.log.length;
    const next = applyAction(state, build);
    const [line] = newPrivateLines(next, from);
    expectPrivateLine(line, ['orange'], ' and took 1 ');
    expect(line!.private!.publicMessage).toMatch(/ and took 1 card\.$/);
  });

  it('supply trade, harbor trade, energy purchase and Research Grant are private to the actor', () => {
    let state = actionState();
    const pid: PlayerId = 'orange';
    state.players[pid].resources.lumber = 4;

    let from = state.log.length;
    state = applyAction(state, { type: 'TRADE_SUPPLY', playerId: pid, give: { lumber: 4 }, receive: 'brick' });
    let [line] = newPrivateLines(state, from);
    expectPrivateLine(line, [pid], 'to receive 1 brick.');
    expect(line!.private!.publicMessage).toBe('Orange traded with supply to receive 1 card.');

    const harbor = state.board.harbors.find((h) => h.type === 'generic')!;
    state.board.intersections[harbor.nodeIds[0]]!.building = { playerId: pid, type: 'town' };
    state.players[pid].resources.food = 3;
    from = state.log.length;
    state = applyAction(state, { type: 'TRADE_HARBOR', playerId: pid, harborId: harbor.id, give: { food: 3 }, receive: 'steel' });
    [line] = newPrivateLines(state, from);
    expectPrivateLine(line, [pid], 'to receive 1 steel.');
    expect(line!.private!.publicMessage).toMatch(/^Orange traded at harbor \d+ to receive 1 card\.$/);

    state.players[pid].energy = 2;
    from = state.log.length;
    state = applyAction(state, {
      type: 'SPEND_ENERGY',
      playerId: pid,
      usage: 'BUY_CARD',
      params: { cardType: 'natural_fiber' },
    } as GameAction);
    [line] = newPrivateLines(state, from);
    expectPrivateLine(line, [pid], 'take 1 natural_fiber from supply.');
    expect(line!.private!.publicMessage).toBe('Orange spent 2 energy to take 1 card from supply.');

    state.players[pid].devCards.unplayed = ['dev_researchGrant_01'];
    from = state.log.length;
    state = applyAction(state, {
      type: 'PLAY_DEV_CARD',
      playerId: pid,
      cardId: 'dev_researchGrant_01',
      params: { cardType: 'researchGrant', cards: ['steel', 'science'] },
    });
    [line] = newPrivateLines(state, from);
    expectPrivateLine(line, [pid], '(steel, science)');
    expect(line!.private!.publicMessage).toBe('Orange played Research Grant: took 2 cards from supply.');
  });

  it('lines without a private field read the same for everyone', () => {
    const entry: GameEventLog = { timestamp: 0, message: 'Orange rolled 8.' };
    for (const pid of [...ALL, null]) expect(logMessageFor(entry, pid)).toBe('Orange rolled 8.');
  });
});
