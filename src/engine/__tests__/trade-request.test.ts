import { beforeEach, describe, expect, it } from 'vitest';
import { legalActions } from '../actions';
import { applyAction, IllegalActionError } from '../reducer';
import { createInitialGameState } from '../setup';
import type { GameAction, GameState, PlayerId, TradeItems } from '../types';

const NONE = { lumber: 0, brick: 0, natural_fiber: 0, food: 0, steel: 0 };

/** Orange's turn; Orange has steel, Purple and Blue each hold a brick, Pink holds none. */
function tableState(playerCount: 3 | 4 = 4): GameState {
  const state = createInitialGameState({ setupMode: 'first', placement: 'fixed', playerCount, seed: 42 });
  state.phase = 'ActionPhase';
  state.activePlayerId = 'orange';
  for (const pid of state.playerOrder) {
    const p = state.players[pid]!;
    p.resources = { ...NONE };
    p.science = 0;
    p.energy = 0;
  }
  state.players.orange!.resources = { ...NONE, steel: 3, lumber: 1, food: 2 };
  state.players.purple!.resources = { ...NONE, brick: 2, steel: 1 };
  state.players.pink!.resources = { ...NONE, lumber: 2 };
  if (state.players.blue) state.players.blue.resources = { ...NONE, brick: 1, food: 1 };
  return state;
}

const request = (s: GameState, ask: TradeItems, playerId: PlayerId = 'orange') =>
  applyAction(s, { type: 'REQUEST_TRADE', playerId, ask });

const answer = (s: GameState, response: unknown) => {
  const head = s.pendingDecisions[0]!;
  return applyAction(s, {
    type: 'RESOLVE_PENDING_DECISION',
    playerId: head.playerId,
    decisionId: head.id,
    response,
  });
};

const messages = (s: GameState) => s.log.map((l) => l.message);

describe('asking everyone for cards', () => {
  let state: GameState;
  beforeEach(() => {
    state = tableState();
  });

  it('puts the request to one player at a time, in turn order, and logs it', () => {
    const s = request(state, { brick: 1 });
    expect(messages(s).at(-1)).toBe('Orange asked for 1 brick.');
    // Purple is first after Orange; Pink and Blue are asked after her (Pink holds no brick)
    expect(s.pendingDecisions).toHaveLength(1);
    expect(s.pendingDecisions[0]).toMatchObject({
      type: 'TRADE_REQUEST_REPLY',
      playerId: 'purple',
      requestingPlayerId: 'orange',
      ask: { brick: 1 },
      offers: [],
      waiting: ['pink', 'blue'],
    });
    // Pink is passed over, with a line in the log, once Purple has replied
    const afterPurple = answer(s, { pass: true });
    expect(messages(afterPurple).slice(-2)).toEqual(['Purple passed.', 'Pink has no brick and was skipped.']);
    expect(afterPurple.pendingDecisions[0]).toMatchObject({ playerId: 'blue', waiting: [] });
  });

  it('asks in the order the turns come after the requester', () => {
    let s = tableState();
    s.activePlayerId = 'pink';
    s.players.pink!.resources = { ...NONE };
    s.players.orange!.resources.brick = 1;
    s = request(s, { brick: 1 }, 'pink');
    // Pink -> Blue -> Orange -> Purple
    expect(s.pendingDecisions[0]!.playerId).toBe('blue');
    expect((s.pendingDecisions[0] as { waiting: PlayerId[] }).waiting).toEqual(['orange', 'purple']);
  });

  it('runs a full request: replies, a choice of offers, and the trade with the right hands', () => {
    let s = request(state, { brick: 1 });
    s = answer(s, { want: { steel: 2 } }); // Purple
    expect(s.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_REPLY', playerId: 'blue' });
    s = answer(s, { want: { food: 1 } }); // Blue
    expect(messages(s).slice(-4)).toEqual([
      'Orange asked for 1 brick.',
      'Purple offered 1 brick for 2 steel.',
      'Pink has no brick and was skipped.',
      'Blue offered 1 brick for 1 food.',
    ]);

    const choice = s.pendingDecisions[0]!;
    expect(choice).toMatchObject({ type: 'TRADE_REQUEST_CHOICE', playerId: 'orange', ask: { brick: 1 } });
    expect((choice as { offers: unknown[] }).offers).toEqual([
      { playerId: 'purple', want: { steel: 2 } },
      { playerId: 'blue', want: { food: 1 } },
    ]);

    s = answer(s, { takeOfferFrom: 'purple' });
    expect(s.pendingDecisions).toHaveLength(0);
    expect(messages(s).at(-1)).toBe("Orange took Purple's offer.");
    expect(s.players.orange!.resources).toEqual({ ...NONE, steel: 1, lumber: 1, food: 2, brick: 1 });
    expect(s.players.purple!.resources).toEqual({ ...NONE, brick: 1, steel: 3 });
    // Nobody else is touched
    expect(s.players.blue!.resources).toEqual({ ...NONE, brick: 1, food: 1 });
    expect(s.players.pink!.resources).toEqual({ ...NONE, lumber: 2 });
    // Orange may act again
    expect(legalActions(s, 'orange').some((a) => a.type === 'END_TURN')).toBe(true);
  });

  it('only the player being asked can act, and the requester cannot act meanwhile', () => {
    const s = request(state, { brick: 1 });
    expect(legalActions(s, 'orange')).toEqual([]);
    expect(legalActions(s, 'blue')).toEqual([]);
    expect(legalActions(s, 'purple').length).toBeGreaterThan(1);
    expect(() =>
      applyAction(s, { type: 'END_TURN', playerId: 'orange' })
    ).toThrow(IllegalActionError);
    expect(() =>
      applyAction(s, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'blue',
        decisionId: s.pendingDecisions[0]!.id,
        response: { pass: true },
      })
    ).toThrow(IllegalActionError);
  });

  it('records a pass and carries on; passing is a valid reply', () => {
    let s = request(state, { brick: 1 });
    s = answer(s, { pass: true });
    expect(messages(s)).toContain('Purple passed.');
    s = answer(s, { want: { food: 1 } });
    expect(s.pendingDecisions[0]).toMatchObject({
      type: 'TRADE_REQUEST_CHOICE',
      offers: [{ playerId: 'blue', want: { food: 1 } }],
    });
  });

  it('says so when nobody offers anything, and leaves the requester free to act', () => {
    let s = request(state, { brick: 1 });
    s = answer(s, { pass: true });
    s = answer(s, { pass: true });
    expect(s.pendingDecisions).toHaveLength(0);
    expect(messages(s).at(-1)).toBe('Nobody made Orange an offer.');
  });

  it('skips everyone when nobody holds the cards', () => {
    const s = request(state, { natural_fiber: 1 });
    expect(s.pendingDecisions).toHaveLength(0);
    expect(messages(s).slice(-5)).toEqual([
      'Orange asked for 1 natural_fiber.',
      'Purple has no natural_fiber and was skipped.',
      'Pink has no natural_fiber and was skipped.',
      'Blue has no natural_fiber and was skipped.',
      'Nobody made Orange an offer.',
    ]);
  });

  it('skips a player who has some of the cards but not enough', () => {
    let s = request(state, { brick: 2 }); // Purple holds 2, Blue only 1
    expect(s.pendingDecisions[0]).toMatchObject({ playerId: 'purple', waiting: ['pink', 'blue'] });
    s = answer(s, { pass: true });
    expect(messages(s).slice(-4)).toEqual([
      'Purple passed.',
      'Pink has no brick and was skipped.',
      'Blue does not have enough brick and was skipped.',
      'Nobody made Orange an offer.',
    ]);
  });

  it('can ask for several kinds at once; everyone asked must hold all of them', () => {
    let s = request(state, { brick: 1, steel: 1 });
    expect(messages(s).at(-1)).toBe('Orange asked for 1 brick, 1 steel.');
    // Only Purple holds both
    expect(s.pendingDecisions[0]).toMatchObject({ playerId: 'purple', ask: { brick: 1, steel: 1 } });
    s = answer(s, { want: { food: 1 } });
    expect(messages(s).slice(-3)).toEqual([
      'Purple offered 1 brick, 1 steel for 1 food.',
      'Pink has no brick or steel and was skipped.',
      'Blue has no steel and was skipped.',
    ]);
    expect(s.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_CHOICE' });
  });

  it('lets the requester turn every offer down', () => {
    let s = request(state, { brick: 1 });
    s = answer(s, { want: { steel: 1 } });
    s = answer(s, { want: { food: 1 } });
    s = answer(s, { decline: true });
    expect(s.pendingDecisions).toHaveLength(0);
    expect(messages(s).at(-1)).toBe('Orange turned down every offer.');
    expect(s.players.orange!.resources).toEqual(state.players.orange!.resources);
    expect(s.players.purple!.resources).toEqual(state.players.purple!.resources);
  });

  it('works with three players', () => {
    let s = request(tableState(3), { brick: 1 });
    expect(s.pendingDecisions[0]).toMatchObject({ playerId: 'purple', waiting: ['pink'] });
    s = answer(s, { want: { steel: 1 } });
    expect(s.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_CHOICE', offers: [{ playerId: 'purple' }] });
  });

  it('science and energy can be asked for and asked in return', () => {
    state.players.purple!.science = 2;
    state.players.orange!.energy = 1;
    state.players.purple!.energy = 3;
    let s = request(state, { science: 1 });
    s = answer(s, { want: { energy: 1 } });
    s = answer(s, { takeOfferFrom: 'purple' });
    expect(s.players.orange).toMatchObject({ science: 1, energy: 0 });
    expect(s.players.purple).toMatchObject({ science: 1, energy: 4 });
  });

  it('leaves the other trade types alone: a plain offer still works afterwards', () => {
    let s = request(state, { brick: 1 });
    s = answer(s, { pass: true });
    s = answer(s, { pass: true });
    s = applyAction(s, {
      type: 'OFFER_TRADE',
      playerId: 'orange',
      targetPlayerId: 'purple',
      give: { steel: 1 },
      want: { brick: 1 },
    });
    expect(s.pendingDecisions[0]).toMatchObject({ type: 'DOMESTIC_TRADE_RESPONSE' });
  });

  it('does not touch the supply or the log of anyone beyond the trade', () => {
    const before = structuredClone(state.supply);
    let s = request(state, { brick: 1 });
    s = answer(s, { want: { steel: 2 } });
    s = answer(s, { pass: true });
    s = answer(s, { takeOfferFrom: 'purple' });
    expect(s.supply).toEqual(before);
  });
});

describe('who may ask, and for what', () => {
  it('only in the action phase, on your own turn, with nothing pending', () => {
    const state = tableState();
    const wrongPhase = { ...state, phase: 'EventPhase' as const };
    expect(() => request(wrongPhase, { brick: 1 })).toThrow(IllegalActionError);
    expect(() => request(state, { brick: 1 }, 'purple')).toThrow(IllegalActionError);
    const busy = request(state, { brick: 1 });
    expect(() => request(busy, { brick: 1 })).toThrow(IllegalActionError);
  });

  it('refuses empty, fractional, negative and made-up asks', () => {
    const state = tableState();
    for (const ask of [{}, { brick: 0 }, { brick: 1.5 }, { brick: -1 }, { gold: 1 }, { brick: '1' }] as unknown as TradeItems[]) {
      expect(() => request(state, ask), JSON.stringify(ask)).toThrow(IllegalActionError);
    }
    expect(() => request(state, null as unknown as TradeItems)).toThrow(IllegalActionError);
  });

  it('refuses a request that would take the requester over 5 energy', () => {
    const state = tableState();
    state.players.orange!.energy = 4;
    state.players.purple!.energy = 3;
    expect(() => request(state, { energy: 2 })).toThrow(/5 energy/);
    const ok = request(state, { energy: 1 });
    expect(ok.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_REPLY', playerId: 'purple' });
  });

  it('is not part of the moves listed for a player (like a plain offer, it is checked by the rules)', () => {
    expect(legalActions(tableState(), 'orange').some((a) => a.type === 'REQUEST_TRADE')).toBe(false);
  });
});

describe('replying to a request', () => {
  let asked: GameState;
  beforeEach(() => {
    asked = request(tableState(), { brick: 1 });
  });

  const reply = (s: GameState, response: unknown, playerId?: PlayerId) => {
    const head = s.pendingDecisions[0]!;
    return applyAction(s, {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: playerId ?? head.playerId,
      decisionId: head.id,
      response,
    });
  };

  it('refuses anything that is not a pass or a real, different card', () => {
    const bad: unknown[] = [
      undefined,
      null,
      {},
      { want: {} },
      { want: { steel: 0 } },
      { want: { brick: 1 } }, // the same card on both sides
      { want: { steel: 1.5 } },
      { want: { steel: -1 } },
      { want: { gold: 1 } },
      { want: 'steel' },
      { want: [1] },
      { pass: false },
      { accept: true },
    ];
    for (const response of bad) {
      expect(() => reply(asked, response), JSON.stringify(response)).toThrow(IllegalActionError);
    }
  });

  it('refuses a reply from the wrong player or for another decision', () => {
    expect(() => reply(asked, { pass: true }, 'blue')).toThrow(IllegalActionError);
    expect(() =>
      applyAction(asked, {
        type: 'RESOLVE_PENDING_DECISION',
        playerId: 'purple',
        decisionId: 'not-it',
        response: { pass: true },
      })
    ).toThrow(IllegalActionError);
  });

  it('keeps the 5 energy limit for the player who would receive energy', () => {
    const state = tableState();
    state.players.purple!.energy = 5;
    state.players.orange!.energy = 2;
    const s = request(state, { brick: 1 });
    expect(() => reply(s, { want: { energy: 1 } })).toThrow(/5 energy/);
    const fine = reply(s, { want: { steel: 1 } });
    expect(fine.pendingDecisions[0]).toMatchObject({ playerId: 'blue' });
  });

  it('accepts a reply that names the requester\'s cards in any key order or with extra zeros', () => {
    const s = reply(asked, { want: { steel: 1, food: 0, lumber: 1 } });
    const choice = s.pendingDecisions.at(-1)!;
    expect(s.pendingDecisions[0]).toMatchObject({ playerId: 'blue' });
    expect(choice).toBeDefined();
    const done = reply(s, { pass: true });
    expect(done.pendingDecisions[0]).toMatchObject({
      type: 'TRADE_REQUEST_CHOICE',
      offers: [{ playerId: 'purple', want: { lumber: 1, steel: 1 } }],
    });
  });

  it('does not check the reply against what the requester holds (that would reveal their hand)', () => {
    const s = reply(asked, { want: { natural_fiber: 4 } });
    expect(s.pendingDecisions[0]).toMatchObject({ playerId: 'blue' });
  });

  it('lists a pass and sample counter-offers as the legal moves, all of which are accepted', () => {
    const moves = legalActions(asked, 'purple');
    expect(moves[0]).toMatchObject({ response: { pass: true } });
    expect(moves.length).toBeGreaterThan(5);
    for (const move of moves) {
      expect(() => applyAction(asked, move)).not.toThrow();
    }
    // Never the card that was asked for
    expect(moves.some((m) => JSON.stringify(m).includes('"brick"'))).toBe(false);
  });
});

describe('taking an offer', () => {
  /** Orange asked for a brick; Purple wants 2 steel, Blue wants 1 food. */
  function choiceState(): GameState {
    let s = request(tableState(), { brick: 1 });
    s = answer(s, { want: { steel: 2 } });
    s = answer(s, { want: { food: 1 } });
    return s;
  }

  it('lists each offer the requester can afford, and turning them all down', () => {
    const moves = legalActions(choiceState(), 'orange');
    expect(moves.map((m) => (m as { response: unknown }).response)).toEqual([
      { takeOfferFrom: 'purple' },
      { takeOfferFrom: 'blue' },
      { decline: true },
    ]);
  });

  it('cannot take an offer the requester cannot afford; the others and declining still work', () => {
    const s = choiceState();
    s.players.orange!.resources.steel = 1; // Purple's offer costs 2 steel
    const moves = legalActions(s, 'orange').map((m) => (m as { response: unknown }).response);
    expect(moves).toEqual([{ takeOfferFrom: 'blue' }, { decline: true }]);
    expect(() => answer(s, { takeOfferFrom: 'purple' })).toThrow(/does not have enough steel/);
    const taken = answer(s, { takeOfferFrom: 'blue' });
    expect(taken.players.orange!.resources).toMatchObject({ brick: 1, food: 1 });
  });

  it('checks holdings again when the offer is taken', () => {
    const s = choiceState();
    s.players.purple!.resources.brick = 0; // Purple has since lost the brick
    expect(() => answer(s, { takeOfferFrom: 'purple' })).toThrow(/no longer has enough brick/);
    // The offer that is still good can be taken
    const taken = answer(s, { takeOfferFrom: 'blue' });
    expect(taken.players.blue!.resources.brick).toBe(0);
    expect(taken.players.blue!.resources.food).toBe(2);
  });

  it('keeps the energy limit for both sides when an offer is taken', () => {
    const state = tableState();
    state.players.purple!.energy = 4;
    state.players.orange!.energy = 3;
    let s = request(state, { energy: 2 }); // Purple holds 4
    s = answer(s, { want: { steel: 1 } });
    expect(s.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_CHOICE' });
    expect(legalActions(s, 'orange').some((a) => JSON.stringify(a).includes('takeOfferFrom'))).toBe(true);
    // Orange has since picked up energy: taking 2 more would put her over 5
    s.players.orange!.energy = 4;
    expect(legalActions(s, 'orange').some((a) => JSON.stringify(a).includes('takeOfferFrom'))).toBe(false);
    expect(() => answer(s, { takeOfferFrom: 'purple' })).toThrow(/Orange would go over 5 energy/);

    // The offeror's side: Purple wants 1 energy for a steel but now sits on 5
    let t = request(state, { steel: 1 }); // Purple holds 1 steel
    t = answer(t, { want: { energy: 1 } });
    t.players.purple!.energy = 5;
    expect(() => answer(t, { takeOfferFrom: 'purple' })).toThrow(/Purple would go over 5 energy/);
  });

  it('refuses unknown players, offers nobody made and malformed answers', () => {
    const s = choiceState();
    for (const response of [{ takeOfferFrom: 'pink' }, { takeOfferFrom: 'orange' }, { takeOfferFrom: 'nobody' }, {}, null, { decline: false }, { accept: true }]) {
      expect(() => answer(s, response), JSON.stringify(response)).toThrow(IllegalActionError);
    }
    const asOther: GameAction = {
      type: 'RESOLVE_PENDING_DECISION',
      playerId: 'purple',
      decisionId: s.pendingDecisions[0]!.id,
      response: { decline: true },
    };
    expect(() => applyAction(s, asOther)).toThrow(IllegalActionError);
  });

  it('does not change the state it was given', () => {
    const s = choiceState();
    const snapshot = structuredClone(s);
    answer(s, { takeOfferFrom: 'blue' });
    expect(s).toEqual(snapshot);
  });
});

describe('in a browser view where other hands are hidden', () => {
  it('does not skip anyone (only the server can see their cards) and still asks in turn', () => {
    const state = tableState();
    for (const pid of ['purple', 'pink', 'blue'] as PlayerId[]) {
      state.players[pid]!.handHidden = true;
      state.players[pid]!.hiddenResourcesCount = 3;
    }
    const s = request(state, { brick: 1 });
    expect(s.pendingDecisions[0]).toMatchObject({ playerId: 'purple', waiting: ['pink', 'blue'] });
  });
});
