// @vitest-environment node
/**
 * "Ask for cards" through the real room: the request, each player's reply (bots on their own, the
 * friend from their own browser), the requester's choice, and what every socket may see.
 */
import { describe, expect, it } from 'vitest';
import { getActingPlayerId } from '@/ai/bot';
import { legalActions } from '@/engine/actions';
import type { GameAction, GameState, PlayerId } from '@/engine/types';
import { hydrateRedactedState } from '@/network/hydrate';
import {
  createDefaultOnlineLobbyConfig,
  type ServerMessage,
  type StateMessage,
} from '@/network/server-protocol';
import { GameRoom, type GameRoomOptions, type RoomTimers, type SavedRoom } from '../room';

const HOST_KEY = 'test-host-key-123';
const NONE = { lumber: 0, brick: 0, natural_fiber: 0, food: 0, steel: 0 };

class FakeClient {
  readonly messages: ServerMessage[] = [];
  constructor(readonly id: string) {}
  send(message: ServerMessage) {
    this.messages.push(JSON.parse(JSON.stringify(message)) as ServerMessage);
  }
  close() {}
  last<T extends ServerMessage['type']>(type: T) {
    return [...this.messages].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

/** Bot timers the test fires by hand. */
function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 0;
  const timers: RoomTimers = {
    setTimeout: (fn) => {
      pending.set(++next, fn);
      return next;
    },
    clearTimeout: (h) => pending.delete(h as number),
  };
  /** Runs bot moves until a human has to act (or nothing is scheduled). */
  const pump = () => {
    for (let i = 0; i < 20 && pending.size > 0; i++) {
      const [id, fn] = [...pending.entries()][0]!;
      pending.delete(id);
      fn();
    }
  };
  return { timers, pump };
}

function makeRoom(extra: Partial<GameRoomOptions> = {}) {
  const saves: SavedRoom[] = [];
  const room = new GameRoom({
    hostKey: HOST_KEY,
    botDelayMs: 0,
    randomToken: (() => {
      let n = 0;
      return () => `token-${++n}`;
    })(),
    randomSeed: () => 4242,
    persist: (s) => saves.push(JSON.parse(JSON.stringify(s)) as SavedRoom),
    ...extra,
  });
  const join = (id: string, hello: Record<string, unknown>) => {
    const c = new FakeClient(id);
    room.connect(c);
    room.handleMessage(id, { type: 'hello', ...hello });
    return c;
  };
  return { room, saves, join };
}

/**
 * Orange (host) and Purple (friend) are people, Pink and Blue are bots; it is Orange's action
 * phase. Orange holds steel and food, Purple a brick, Pink a brick and lumber, Blue a brick.
 */
function tableAtActionPhase() {
  const first = makeRoom();
  first.join('h', { name: 'Hana', hostKey: HOST_KEY });
  const cfg = createDefaultOnlineLobbyConfig(99);
  cfg.seats.purple.controller = 'human';
  first.room.handleMessage('h', { type: 'configure', config: cfg });
  first.join('f', { name: 'Finn' });
  first.room.handleMessage('f', { type: 'claimSeat', playerId: 'purple' });
  first.room.handleMessage('h', { type: 'start' });
  const saved = first.saves.at(-1)!;
  first.room.shutdown();

  const game = saved.game!;
  game.playerOrder = ['orange', 'purple', 'pink', 'blue'];
  game.phase = 'ActionPhase';
  game.activePlayerId = 'orange';
  game.pendingDecisions = [];
  game.setupRolls = {};
  game.players.orange.resources = { ...NONE, steel: 3, food: 2 };
  game.players.purple.resources = { ...NONE, brick: 1, steel: 1 };
  game.players.pink.resources = { ...NONE, brick: 1, lumber: 1 };
  game.players.blue.resources = { ...NONE, brick: 1, food: 2 };
  for (const pid of game.playerOrder) {
    game.players[pid].science = 0;
    game.players[pid].energy = 0;
  }

  const { timers, pump } = manualTimers();
  const ctx = makeRoom({ saved, timers });
  const host = ctx.join('h', { name: 'Hana', hostKey: HOST_KEY });
  const friend = ctx.join('f', { name: 'Finn', seatToken: saved.seats.purple!.token });
  return { ...ctx, host, friend, pump };
}

const act = (room: GameRoom, clientId: string, action: GameAction, requestId = 'r') =>
  room.handleMessage(clientId, { type: 'action', action, requestId });

const headOf = (room: GameRoom) => room.gameState!.pendingDecisions[0];

describe('a request for cards through the room', () => {
  it('runs a whole request: a human reply, bot replies, the requester takes an offer', () => {
    const { room, host, friend, pump } = tableAtActionPhase();

    act(room, 'h', { type: 'REQUEST_TRADE', playerId: 'orange', ask: { brick: 1 } });
    // Purple is first after Orange, and is a person: the room waits for her
    expect(headOf(room)).toMatchObject({ type: 'TRADE_REQUEST_REPLY', playerId: 'purple', ask: { brick: 1 } });
    expect(getActingPlayerId(room.gameState!)).toBe('purple');
    const friendView = friend.last('state')!;
    expect(friendView.state.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_REPLY', playerId: 'purple' });

    // Nobody else can answer for her
    const before = room.stateVersion;
    act(room, 'h', { type: 'RESOLVE_PENDING_DECISION', playerId: 'orange', decisionId: headOf(room)!.id, response: { pass: true } }, 'x1');
    expect(host.last('rejected')).toMatchObject({ requestId: 'x1' });
    // A reply that breaks the rules is turned down with the reason, and changes nothing
    act(room, 'f', { type: 'RESOLVE_PENDING_DECISION', playerId: 'purple', decisionId: headOf(room)!.id, response: { want: { brick: 1 } } }, 'x2');
    expect(friend.last('rejected')).toMatchObject({ requestId: 'x2', message: expect.stringMatching(/Cannot trade brick for brick/) });
    expect(room.stateVersion).toBe(before);

    act(room, 'f', { type: 'RESOLVE_PENDING_DECISION', playerId: 'purple', decisionId: headOf(room)!.id, response: { want: { steel: 1 } } });
    // Pink and Blue are bots and answer on their own
    expect(headOf(room)).toMatchObject({ type: 'TRADE_REQUEST_REPLY', playerId: 'pink' });
    pump();
    const choice = headOf(room)!;
    expect(choice).toMatchObject({ type: 'TRADE_REQUEST_CHOICE', playerId: 'orange', ask: { brick: 1 } });
    const offers = (choice as { offers: { playerId: PlayerId }[] }).offers.map((o) => o.playerId);
    expect(offers[0]).toBe('purple');
    expect(host.last('state')!.state.pendingDecisions[0]).toMatchObject({ type: 'TRADE_REQUEST_CHOICE' });

    act(room, 'h', { type: 'RESOLVE_PENDING_DECISION', playerId: 'orange', decisionId: choice.id, response: { takeOfferFrom: 'purple' } });
    const game = room.gameState!;
    expect(game.pendingDecisions).toHaveLength(0);
    expect(game.players.orange.resources).toEqual({ ...NONE, steel: 2, food: 2, brick: 1 });
    expect(game.players.purple.resources).toEqual({ ...NONE, brick: 0, steel: 2 });
    expect(game.log.at(-1)!.message).toBe("Hana took Finn's offer."); // the seats' names
    expect(getActingPlayerId(game)).toBe('orange');
  });

  it('skips players without the cards on the server, where every hand is known', () => {
    const { room, friend, pump } = tableAtActionPhase();
    act(room, 'h', { type: 'REQUEST_TRADE', playerId: 'orange', ask: { lumber: 1 } });
    // Only Pink holds lumber: Purple (a person) is not even asked
    expect(headOf(room)).toMatchObject({ type: 'TRADE_REQUEST_REPLY', playerId: 'pink' });
    pump();
    expect(room.gameState!.log.map((l) => l.message)).toEqual(
      expect.arrayContaining(['Finn has no lumber and was skipped.', 'Blue has no lumber and was skipped.'])
    );
    expect(friend.last('state')!.state.log.some((l) => l.message === 'Finn has no lumber and was skipped.')).toBe(true);
  });

  it('only the requester can start one, and only in their action phase', () => {
    const { room, friend } = tableAtActionPhase();
    act(room, 'f', { type: 'REQUEST_TRADE', playerId: 'purple', ask: { brick: 1 } }, 'p1');
    expect(friend.last('rejected')).toMatchObject({ requestId: 'p1', message: expect.stringMatching(/not allowed/) });
    expect(headOf(room)).toBeUndefined();
  });

  it('shows each browser the same move list as the server for its own prompt, without seeing other hands', () => {
    const { room, friend, host, pump } = tableAtActionPhase();
    act(room, 'h', { type: 'REQUEST_TRADE', playerId: 'orange', ask: { brick: 1 } });

    const asView = (client: FakeClient, me: PlayerId): GameState => {
      const msg = client.last('state') as StateMessage;
      return hydrateRedactedState(msg.state, me);
    };
    const keys = (actions: GameAction[]) => actions.map((a) => JSON.stringify(a));

    // Purple's prompt: from her browser's view of the table, and from the server's real one
    const purpleView = asView(friend, 'purple');
    expect(purpleView.players.orange!.handHidden).toBe(true);
    expect(keys(legalActions(purpleView, 'purple'))).toEqual(keys(legalActions(room.gameState!, 'purple')));
    expect(legalActions(purpleView, 'purple').length).toBeGreaterThan(1);

    act(room, 'f', { type: 'RESOLVE_PENDING_DECISION', playerId: 'purple', decisionId: headOf(room)!.id, response: { pass: true } });
    pump();
    // Orange's choice
    const orangeView = asView(host, 'orange');
    const choices = legalActions(orangeView, 'orange');
    expect(keys(choices)).toEqual(keys(legalActions(room.gameState!, 'orange')));
    expect(choices.at(-1)).toMatchObject({ response: { decline: true } });

    // Never another player's hand in anything the sockets were sent
    const finnWire = JSON.stringify(friend.messages);
    expect(finnWire).not.toContain('"steel":3'); // Orange's steel, hidden from Purple
    const state = friend.last('state')!.state;
    expect(state.players.orange.resources).toEqual(NONE);
  });
});
