import { beforeEach, describe, expect, it } from 'vitest';
import { applyAction } from '../../engine/reducer';
import { createInitialGameState } from '../../engine/setup';
import type { GameState, PlayerId, TradeItems } from '../../engine/types';
import { applyShowcaseScenario } from '../../ui/devScenarios';
import { BotConfig, chooseBotAction } from '../bot';

const NONE = { lumber: 0, brick: 0, natural_fiber: 0, food: 0, steel: 0 };
const NORMAL: BotConfig = { personality: 'Balanced', difficulty: 'Normal' };

function table(): GameState {
  const state = createInitialGameState({
    setupMode: 'first',
    placement: 'fixed',
    seed: 42,
    playerNames: { orange: 'Orange', purple: 'Purple', pink: 'Pink', blue: 'Blue' },
  });
  state.phase = 'ActionPhase';
  state.activePlayerId = 'orange';
  for (const pid of state.playerOrder) {
    const p = state.players[pid]!;
    p.resources = { ...NONE };
    p.science = 0;
    p.energy = 0;
  }
  return state;
}

const request = (s: GameState, ask: TradeItems, by: PlayerId = 'orange') =>
  applyAction(s, { type: 'REQUEST_TRADE', playerId: by, ask });

const botMove = (s: GameState, config: BotConfig = NORMAL) => {
  const head = s.pendingDecisions[0]!;
  return chooseBotAction(s, head.playerId, config);
};

const responseOf = (s: GameState, config?: BotConfig) =>
  (botMove(s, config) as { response: { pass?: boolean; want?: TradeItems; takeOfferFrom?: PlayerId; decline?: boolean } })
    .response;

describe('bots answering a request for cards', () => {
  let state: GameState;
  beforeEach(() => {
    state = table();
    // Orange holds what the bots could want; Purple holds the brick she asks for
    state.players.orange!.resources = { ...NONE, steel: 3, food: 2, lumber: 1 };
    state.players.purple!.resources = { ...NONE, brick: 2 };
  });

  it('offers the card for something the requester actually holds', () => {
    const s = request(state, { brick: 1 });
    const reply = responseOf(s);
    expect(reply.want).toBeDefined();
    const want = reply.want!;
    const held = state.players.orange!.resources;
    for (const [kind, n] of Object.entries(want)) {
      expect(held[kind as keyof typeof held] ?? 0, kind).toBeGreaterThanOrEqual(n);
    }
    // Never the card that was asked for, and the engine accepts the reply
    expect(want.brick).toBeUndefined();
    expect(() => applyAction(s, botMove(s))).not.toThrow();
  });

  it('asks roughly a fair price: as many cards back as asked for, plus a premium on hard or industrial bots', () => {
    const total = (want: TradeItems) => Object.values(want).reduce((a, b) => a + (b ?? 0), 0);
    const s = request(state, { brick: 1 });
    expect(total(responseOf(s, NORMAL).want!)).toBe(1);
    expect(total(responseOf(s, { personality: 'GreenInnovator', difficulty: 'Normal' }).want!)).toBe(1);
    expect(total(responseOf(s, { personality: 'Balanced', difficulty: 'Hard' }).want!)).toBe(2);
    expect(total(responseOf(s, { personality: 'IndustrialExpansionist', difficulty: 'Normal' }).want!)).toBe(2);
    // The price follows the number of cards asked for
    const two = request(state, { brick: 2 });
    expect(total(responseOf(two, NORMAL).want!)).toBe(2);
    expect(total(responseOf(two, { personality: 'Balanced', difficulty: 'Hard' }).want!)).toBe(3);
  });

  it('passes when the requester holds nothing it could ask for', () => {
    state.players.orange!.resources = { ...NONE };
    const s = request(state, { brick: 1 });
    expect(responseOf(s)).toEqual({ pass: true });
  });

  it('does not help a player who is about to win', () => {
    state.players.orange!.victoryPoints = 9;
    const s = request(state, { brick: 1 });
    expect(responseOf(s)).toEqual({ pass: true });
  });

  it('does not give up energy', () => {
    state.players.purple!.energy = 2;
    state.players.orange!.energy = 0;
    const s = request(state, { energy: 1 });
    expect(responseOf(s)).toEqual({ pass: true });
  });

  it('every kind of bot gives an answer the rules accept', () => {
    for (const personality of ['Balanced', 'GreenInnovator', 'IndustrialExpansionist'] as const) {
      for (const difficulty of ['Easy', 'Normal', 'Hard'] as const) {
        const s = request(state, { brick: 1 });
        const next = applyAction(s, botMove(s, { personality, difficulty }));
        expect(next.pendingDecisions[0]?.type ?? 'done').toMatch(/TRADE_REQUEST_CHOICE|done/);
      }
    }
  });

  it('plays a whole request with the seats it has: a request with bots answering reaches the choice', () => {
    state.players.pink!.resources = { ...NONE, brick: 1 };
    state.players.blue!.resources = { ...NONE, brick: 1 };
    let s = request(state, { brick: 1 });
    let guard = 0;
    while (s.pendingDecisions[0]?.type === 'TRADE_REQUEST_REPLY' && guard++ < 5) {
      s = applyAction(s, botMove(s));
    }
    const head = s.pendingDecisions[0];
    expect(head?.type).toBe('TRADE_REQUEST_CHOICE');
    expect((head as { offers: unknown[] }).offers.length).toBeGreaterThan(0);
  });
});

describe('a bot that asked for cards picks an offer', () => {
  /** Pink asked for a brick (Orange has none); Blue wants 1 steel, Purple wants 1 lumber. */
  function pinkChoice(): GameState {
    const s = table();
    s.activePlayerId = 'pink';
    s.players.pink!.resources = { ...NONE, lumber: 1, steel: 1, natural_fiber: 1, food: 1 };
    s.players.purple!.resources = { ...NONE, brick: 1 };
    s.players.blue!.resources = { ...NONE, brick: 1 };
    let t = request(s, { brick: 1 }, 'pink');
    t = applyAction(t, { type: 'RESOLVE_PENDING_DECISION', playerId: 'blue', decisionId: t.pendingDecisions[0]!.id, response: { want: { steel: 1 } } });
    t = applyAction(t, { type: 'RESOLVE_PENDING_DECISION', playerId: 'purple', decisionId: t.pendingDecisions[0]!.id, response: { want: { lumber: 1 } } });
    return t;
  }

  it('takes an offer when one leaves its hand better placed', () => {
    const s = pinkChoice();
    expect(s.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_CHOICE', playerId: 'pink' });
    const reply = responseOf(s);
    expect(reply.takeOfferFrom).toBeDefined();
    const next = applyAction(s, botMove(s));
    expect(next.pendingDecisions).toHaveLength(0);
    expect(next.players.pink!.resources.brick).toBe(1);
  });

  it('takes the offer that pays with what it can spare', () => {
    // Pink holds lumber, fiber and food for a town and needs the brick for it. Purple would take the
    // lumber (which the town needs); Blue would take the spare steel.
    const s = pinkChoice();
    expect(responseOf(s)).toEqual({ takeOfferFrom: 'blue' });
    const next = applyAction(s, botMove(s));
    expect(next.players.pink!.resources).toEqual({ ...NONE, lumber: 1, brick: 1, natural_fiber: 1, food: 1 });
    expect(next.players.blue!.resources).toEqual({ ...NONE, steel: 1 });
  });

  it('turns every offer down when none can be afforded', () => {
    const s = pinkChoice();
    s.players.pink!.resources = { ...NONE };
    expect(responseOf(s)).toEqual({ decline: true });
    const next = applyAction(s, botMove(s));
    expect(next.pendingDecisions).toHaveLength(0);
    expect(next.log.at(-1)!.message).toBe('Pink turned down every offer.');
  });

  it('turns an offer down from a player about to win', () => {
    const s = pinkChoice();
    s.players.purple!.victoryPoints = 9;
    s.players.blue!.victoryPoints = 9;
    expect(responseOf(s)).toEqual({ decline: true });
  });
});

describe('bots in the showcase scenario (the table the browser test uses)', () => {
  it('Purple and Blue both offer for a brick, and Pink, who holds none, is skipped', () => {
    let s = applyShowcaseScenario(
      createInitialGameState({
        setupMode: 'first',
        placement: 'fixed',
        seed: 42,
        playerNames: { orange: 'Orange', purple: 'Purple', pink: 'Pink', blue: 'Blue' },
      })
    );
    const configs: Partial<Record<PlayerId, BotConfig>> = {
      purple: { personality: 'GreenInnovator', difficulty: 'Normal' },
      pink: { personality: 'IndustrialExpansionist', difficulty: 'Normal' },
      blue: { personality: 'Balanced', difficulty: 'Hard' },
    };
    s = request(s, { brick: 1 });
    while (s.pendingDecisions[0]?.type === 'TRADE_REQUEST_REPLY') {
      const head = s.pendingDecisions[0];
      s = applyAction(s, chooseBotAction(s, head.playerId, configs[head.playerId]!));
    }
    const head = s.pendingDecisions[0]!;
    expect(head.type).toBe('TRADE_REQUEST_CHOICE');
    expect((head as { offers: { playerId: PlayerId }[] }).offers.map((o) => o.playerId)).toEqual(['purple', 'blue']);
    expect(s.log.some((l) => l.message === 'Pink has no brick and was skipped.')).toBe(true);
  });
});
