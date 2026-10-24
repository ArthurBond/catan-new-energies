// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getActingPlayerId } from '@/ai/bot';
import { legalActions } from '@/engine/actions';
import type { PlayerId } from '@/engine/types';
import {
  createDefaultOnlineLobbyConfig,
  type OnlineLobbyConfig,
  type ServerMessage,
  type StateMessage,
} from '@/network/server-protocol';
import { createFileStore } from '../persistence';
import {
  botDelayForSpeed,
  drawnEventDisc,
  GameRoom,
  type GameRoomOptions,
  type RoomTimers,
  type SavedRoom,
} from '../room';
import { createInitialGameState } from '@/engine/setup';

const HOST_KEY = 'test-host-key-123';

class FakeClient {
  readonly messages: ServerMessage[] = [];
  closedReason: string | null = null;
  constructor(readonly id: string) {}
  send(message: ServerMessage) {
    // Mimic the wire: the client only ever sees JSON.
    this.messages.push(JSON.parse(JSON.stringify(message)) as ServerMessage);
  }
  close(reason: string) {
    this.closedReason = reason;
  }
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return [...this.messages].reverse().find((m) => m.type === type) as
      | Extract<ServerMessage, { type: T }>
      | undefined;
  }
  all<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
}

function makeRoom(extra: Partial<GameRoomOptions> = {}) {
  let n = 0;
  const saves: SavedRoom[] = [];
  const room = new GameRoom({
    hostKey: HOST_KEY,
    botDelayMs: 0,
    randomToken: () => `token-${++n}`,
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

/** Two humans (host orange, friend purple) + two bots. */
function twoHumansConfig(overrides: Partial<OnlineLobbyConfig> = {}): OnlineLobbyConfig {
  const cfg = createDefaultOnlineLobbyConfig(99);
  cfg.seats.purple.controller = 'human';
  return { ...cfg, ...overrides };
}

describe('GameRoom seats', () => {
  it('binds the host to the host seat and lets a friend claim an open human seat', () => {
    const { room, join } = makeRoom();
    const host = join('h', { name: 'Hana', hostKey: HOST_KEY });
    expect(host.last('welcome')).toMatchObject({ isHost: true, playerId: 'orange' });

    room.handleMessage('h', { type: 'configure', config: twoHumansConfig() });
    const friend = join('f', { name: 'Finn' });
    expect(friend.last('welcome')).toMatchObject({ isHost: false, playerId: null, seatToken: null });

    room.handleMessage('f', { type: 'claimSeat', playerId: 'purple' });
    const w = friend.last('welcome')!;
    expect(w.playerId).toBe('purple');
    expect(w.seatToken).toEqual(expect.any(String));

    const seats = friend.last('lobby')!.seats;
    expect(seats.find((s) => s.playerId === 'orange')).toMatchObject({ role: 'host', name: 'Hana', claimed: true, connected: true });
    expect(seats.find((s) => s.playerId === 'purple')).toMatchObject({ role: 'friend', name: 'Finn', claimed: true, connected: true });
    expect(seats.find((s) => s.playerId === 'pink')).toMatchObject({ role: 'bot', claimed: false });
  });

  it('refuses bot seats, the host seat and taken seats to friends', () => {
    const { room, join } = makeRoom();
    join('h', { name: 'Hana', hostKey: HOST_KEY });
    room.handleMessage('h', { type: 'configure', config: twoHumansConfig() });
    const friend = join('f', { name: 'Finn' });
    room.handleMessage('f', { type: 'claimSeat', playerId: 'pink' });
    expect(friend.last('rejected')?.message).toMatch(/not open/);
    room.handleMessage('f', { type: 'claimSeat', playerId: 'orange' });
    expect(friend.last('rejected')?.message).toMatch(/host/);
    room.handleMessage('f', { type: 'claimSeat', playerId: 'purple' });
    const other = join('o', { name: 'Olga' });
    room.handleMessage('o', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('rejected')?.message).toMatch(/already sits/);
  });

  it('reconnects a seat token to the same seat; the newer socket wins', () => {
    const { room, join } = makeRoom();
    join('h', { name: 'Hana', hostKey: HOST_KEY });
    room.handleMessage('h', { type: 'configure', config: twoHumansConfig() });
    const friend = join('f1', { name: 'Finn' });
    room.handleMessage('f1', { type: 'claimSeat', playerId: 'purple' });
    const token = friend.last('welcome')!.seatToken!;

    room.disconnect('f1');
    const back = join('f2', { name: '', seatToken: token });
    expect(back.last('welcome')).toMatchObject({ playerId: 'purple', seatToken: token });
    expect(back.last('lobby')!.seats.find((s) => s.playerId === 'purple')!.name).toBe('Finn');

    const third = join('f3', { name: 'Finn', seatToken: token });
    expect(third.last('welcome')!.playerId).toBe('purple');
    expect(back.closedReason).not.toBeNull();
    expect(back.last('error')?.message).toMatch(/another window/);

    const stranger = join('s', { name: 'Sam', seatToken: 'not-a-token' });
    expect(stranger.last('welcome')).toMatchObject({ playerId: null, seatToken: null });
  });

  it('needs the host key for the host seat', () => {
    const { room, join } = makeRoom();
    const host = join('h', { name: 'Hana', hostKey: HOST_KEY });
    const hostToken = host.last('welcome')!.seatToken!;
    room.disconnect('h');
    const thief = join('t', { name: 'Tom', seatToken: hostToken, hostKey: 'wrong' });
    expect(thief.last('welcome')).toMatchObject({ isHost: false, playerId: null });
    expect(thief.last('error')?.message).toMatch(/host link is not valid/);
  });
});

describe('GameRoom host control', () => {
  it('rejects configure, start and newGame from non-hosts', () => {
    const { room, join } = makeRoom();
    join('h', { name: 'Hana', hostKey: HOST_KEY });
    const friend = join('f', { name: 'Finn' });
    room.handleMessage('f', { type: 'configure', config: twoHumansConfig() });
    expect(friend.last('rejected')?.message).toMatch(/Only the host/);
    room.handleMessage('f', { type: 'start' });
    expect(friend.last('rejected')?.message).toMatch(/Only the host/);
    room.handleMessage('f', { type: 'newGame' });
    expect(friend.last('rejected')?.message).toMatch(/Only the host/);
    expect(room.isStarted).toBe(false);
  });

  it('rejects invalid setups in plain language', () => {
    const { room, join } = makeRoom();
    const host = join('h', { name: 'Hana', hostKey: HOST_KEY });
    room.handleMessage('h', { type: 'configure', config: { ...twoHumansConfig(), playerCount: 5 } });
    expect(host.last('rejected')?.message).toBe('Choose 3 or 4 players.');
    const cfg = twoHumansConfig();
    cfg.seats.orange.controller = 'bot';
    room.handleMessage('h', { type: 'configure', config: cfg });
    expect(host.last('rejected')?.message).toMatch(/host seat must be played by a person/);
  });

  it('starts a game, then newGame returns everyone to the lobby with seats kept', () => {
    const { room, join } = makeRoom();
    const host = join('h', { name: 'Hana', hostKey: HOST_KEY });
    room.handleMessage('h', { type: 'configure', config: twoHumansConfig() });
    const friend = join('f', { name: 'Finn' });
    room.handleMessage('f', { type: 'claimSeat', playerId: 'purple' });
    room.handleMessage('h', { type: 'start' });
    expect(room.isStarted).toBe(true);
    expect(room.gameState!.players.purple.name).toBe('Finn');
    expect(friend.last('state')).toMatchObject({ version: 0, yourPlayerId: 'purple', lastAction: null });
    room.handleMessage('h', { type: 'configure', config: twoHumansConfig() });
    expect(host.last('rejected')?.message).toMatch(/Finish or restart/);

    room.handleMessage('h', { type: 'newGame' });
    expect(room.isStarted).toBe(false);
    expect(friend.last('lobby')).toMatchObject({ started: false });
    expect(friend.last('lobby')!.config.seed).toBe(4242);
    expect(friend.last('lobby')!.seats.find((s) => s.playerId === 'purple')!.claimed).toBe(true);
    room.shutdown();
  });
});

describe('GameRoom actions', () => {
  function startedRoom() {
    const ctx = makeRoom();
    const host = ctx.join('h', { name: 'Hana', hostKey: HOST_KEY });
    // Humans only, so nothing moves on its own.
    const cfg = twoHumansConfig({ playerCount: 3 });
    cfg.seats.pink.controller = 'human';
    ctx.room.handleMessage('h', { type: 'configure', config: cfg });
    const friend = ctx.join('f', { name: 'Finn' });
    ctx.room.handleMessage('f', { type: 'claimSeat', playerId: 'purple' });
    ctx.room.handleMessage('h', { type: 'start' });
    return { ...ctx, host, friend };
  }

  it('accepts a legal move for the own seat and sends every seat its own view', () => {
    const { room, host, friend } = startedRoom();
    const actor = getActingPlayerId(room.gameState!)!;
    expect(actor).toBe('orange');
    const action = legalActions(room.gameState!, 'orange')[0]!;
    room.handleMessage('h', { type: 'action', action, requestId: 'r1' });
    expect(room.stateVersion).toBe(1);
    for (const c of [host, friend]) {
      const s = c.last('state')!;
      expect(s.version).toBe(1);
      expect(s.lastAction).toEqual(action);
    }
    expect(host.last('state')!.yourPlayerId).toBe('orange');
    expect(friend.last('state')!.yourPlayerId).toBe('purple');
  });

  it('rejects moves for another seat, illegal moves and moves from unseated sockets', () => {
    const { room, join, friend } = startedRoom();
    const orangeMove = legalActions(room.gameState!, 'orange')[0]!;
    room.handleMessage('f', { type: 'action', action: orangeMove, requestId: 'r2' });
    expect(friend.last('rejected')).toEqual({
      type: 'rejected',
      requestId: 'r2',
      message: 'You can only make moves for your own seat.',
    });
    room.handleMessage('f', { type: 'action', action: { type: 'END_TURN', playerId: 'purple' }, requestId: 'r3' });
    expect(friend.last('rejected')).toMatchObject({ requestId: 'r3', message: expect.stringMatching(/not allowed/) });
    const watcher = join('w', { name: 'Wes' });
    room.handleMessage('w', { type: 'action', action: orangeMove });
    expect(watcher.last('rejected')?.message).toMatch(/Take a seat/);
    expect(room.stateVersion).toBe(0);
  });

  it('never sends a socket another player’s dev cards or hidden green discs', () => {
    const { room, saves } = startedRoom();
    // Resume from a save in which everyone holds secret cards, one bought this turn.
    const saved = saves.at(-1)!;
    const game = saved.game!;
    for (const pid of game.playerOrder) {
      game.players[pid].devCards.unplayed = [`dev_cleanup_secret_${pid}`];
    }
    game.devCardsBoughtThisTurn = ['dev_cleanup_secret_orange'];
    game.turnStats.devCardsBoughtThisTurn = ['dev_cleanup_secret_orange'];
    room.shutdown();

    const { room: room2, join } = makeRoom({ saved });
    const host = join('h', { name: 'Hana', hostKey: HOST_KEY });
    const friend = join('f', { name: 'Finn', seatToken: saved.seats.purple!.token });
    const watcher = join('w', { name: 'Wes' });
    room2.handleMessage('h', { type: 'action', action: legalActions(room2.gameState!, 'orange')[0]! });

    const views: [FakeClient, PlayerId | null][] = [
      [host, 'orange'],
      [friend, 'purple'],
      [watcher, null],
    ];
    for (const [client, me] of views) {
      const states = client.all('state');
      expect(states.length).toBeGreaterThan(0);
      const wire = JSON.stringify(client.messages);
      for (const s of states as StateMessage[]) {
        expect(s.yourPlayerId).toBe(me);
        for (const pid of s.state.playerOrder) {
          const p = s.state.players[pid];
          if (pid === me) {
            expect(p.devCards.unplayed).toEqual([`dev_cleanup_secret_${pid}`]);
            expect(p.hiddenGreenDiscs?.length).toBe(p.hiddenGreenDiscsCount);
          } else {
            expect(p.devCards.unplayed).toBeUndefined();
            expect(p.hiddenGreenDiscs).toBeUndefined();
            expect(p.devCards.unplayedCount).toBe(1);
            expect(wire).not.toContain(`dev_cleanup_secret_${pid}`);
          }
        }
        expect(s.state.supply.devDeck).toBeUndefined();
        expect(s.state.eventBag).toBeUndefined();
        expect(s.state.prng).toBeUndefined();
      }
    }
    expect(friend.last('state')!.state.devCardsBoughtThisTurn).toEqual(['hidden']);
    expect(host.last('state')!.state.devCardsBoughtThisTurn).toEqual(['dev_cleanup_secret_orange']);
  });

  it('never sends a socket another player’s resource breakdown, only the card count', () => {
    const { room, saves } = startedRoom();
    const saved = saves.at(-1)!;
    const game = saved.game!;
    // Distinct hands, so a leak of any single number would show.
    game.players.orange.resources = { lumber: 3, brick: 1, natural_fiber: 0, food: 2, steel: 0 };
    game.players.orange.science = 1;
    game.players.purple.resources = { lumber: 0, brick: 4, natural_fiber: 1, food: 0, steel: 2 };
    game.players.purple.science = 2;
    room.shutdown();

    const { room: room2, join } = makeRoom({ saved });
    const host = join('h', { name: 'Hana', hostKey: HOST_KEY });
    const friend = join('f', { name: 'Finn', seatToken: saved.seats.purple!.token });
    room2.handleMessage('h', { type: 'action', action: legalActions(room2.gameState!, 'orange')[0]! });

    const truth = room2.gameState!;
    const zero = { lumber: 0, brick: 0, natural_fiber: 0, food: 0, steel: 0 };
    for (const [client, me] of [
      [host, 'orange'],
      [friend, 'purple'],
    ] as const) {
      const states = client.all('state');
      expect(states.length).toBeGreaterThan(0);
      for (const s of states) {
        for (const pid of s.state.playerOrder) {
          const p = s.state.players[pid];
          const real = truth.players[pid];
          const total =
            Object.values(real.resources).reduce((a, b) => a + b, 0) + real.science;
          expect(p.hiddenResourcesCount).toBe(total);
          if (pid === me) {
            expect(p.resources).toEqual(real.resources);
            expect(p.science).toBe(real.science);
          } else {
            expect(p.resources).toEqual(zero);
            expect(p.science).toBe(0);
          }
        }
      }
    }
  });
});

describe('GameRoom game end', () => {
  it('keeps hands secret during play and shows every hand to every socket once the game is over', () => {
    const ctx = makeRoom();
    ctx.join('h', { name: 'Hana', hostKey: HOST_KEY });
    const cfg = twoHumansConfig({ playerCount: 3 });
    cfg.seats.pink.controller = 'human';
    ctx.room.handleMessage('h', { type: 'configure', config: cfg });
    ctx.join('f', { name: 'Finn' });
    ctx.room.handleMessage('f', { type: 'claimSeat', playerId: 'purple' });
    ctx.room.handleMessage('h', { type: 'start' });
    const saved = ctx.saves.at(-1)!;
    ctx.room.shutdown();

    // Resume one draw away from an empty bag: the next disc ends the game on the clean-energy
    // balance, and Finn holds a Victory Point card nobody else may see until then.
    const game = saved.game!;
    game.phase = 'EventPhase';
    game.activePlayerId = 'orange';
    game.pendingDecisions = [];
    game.eventBag = [];
    game.players.orange.renewablePlantsBuilt = 2;
    game.players.purple.devCards.unplayed = ['dev_victoryPoint_secret'];
    game.players.purple.hiddenGreenDiscs = ['green_secret'];
    game.players.purple.resources = { lumber: 0, brick: 4, natural_fiber: 1, food: 0, steel: 2 };
    game.players.pink.resources = { lumber: 3, brick: 0, natural_fiber: 0, food: 1, steel: 0 };

    const { room, join } = makeRoom({ saved });
    const host = join('h', { name: 'Hana', hostKey: HOST_KEY });
    const friend = join('f', { name: 'Finn', seatToken: saved.seats.purple!.token });
    const watcher = join('w', { name: 'Wes' });
    const clients: [FakeClient, PlayerId | null][] = [
      [host, 'orange'],
      [friend, 'purple'],
      [watcher, null],
    ];

    // During play: Finn's card, green disc and hand are hidden from the others.
    for (const [client, me] of clients) {
      const wire = JSON.stringify(client.messages);
      if (me !== 'purple') {
        expect(wire).not.toContain('dev_victoryPoint_secret');
        expect(wire).not.toContain('green_secret');
      }
      expect(client.last('state')!.state.phase).toBe('EventPhase');
    }
    expect(host.last('state')!.state.players.purple.resources.brick).toBe(0);

    room.handleMessage('h', { type: 'action', action: { type: 'DRAW_EVENT_DISC', playerId: 'orange' } });
    expect(room.gameState!.phase).toBe('GameEnd');

    // Game over: everyone sees everything about the players (but never the deck, bag or PRNG).
    for (const [client, me] of clients) {
      const s = client.last('state')!;
      expect(s.state.phase).toBe('GameEnd');
      expect(s.state.winner).toBe('orange');
      expect(s.yourPlayerId).toBe(me);
      for (const pid of s.state.playerOrder) {
        const p = s.state.players[pid];
        const real = room.gameState!.players[pid];
        expect(p.devCards.unplayed).toEqual(real.devCards.unplayed);
        expect(p.hiddenGreenDiscs).toEqual(real.hiddenGreenDiscs);
        expect(p.resources).toEqual(real.resources);
        expect(p.science).toBe(real.science);
      }
      expect(s.state.players.purple.devCards.unplayed).toEqual(['dev_victoryPoint_secret']);
      expect(s.state.supply.devDeck).toBeUndefined();
      expect(s.state.eventBag).toBeUndefined();
      expect(s.state.prng).toBeUndefined();
    }
  });
});

describe('GameRoom persistence', () => {
  it('round-trips a game, its version and seat tokens through a save', () => {
    const { room, saves, join } = makeRoom();
    join('h', { name: 'Hana', hostKey: HOST_KEY });
    const cfg = twoHumansConfig({ playerCount: 3 });
    cfg.seats.pink.controller = 'human';
    room.handleMessage('h', { type: 'configure', config: cfg });
    const friend = join('f', { name: 'Finn' });
    room.handleMessage('f', { type: 'claimSeat', playerId: 'purple' });
    room.handleMessage('h', { type: 'start' });
    room.handleMessage('h', { type: 'action', action: legalActions(room.gameState!, 'orange')[0]! });
    const token = friend.last('welcome')!.seatToken!;
    const saved = JSON.parse(JSON.stringify(saves.at(-1))) as SavedRoom;
    expect(saved.version).toBe(1);

    const { room: restored, join: join2 } = makeRoom({ saved });
    expect(restored.isStarted).toBe(true);
    expect(restored.stateVersion).toBe(1);
    expect(restored.gameState).toEqual(room.gameState);
    const back = join2('f2', { name: 'Finn', seatToken: token });
    expect(back.last('welcome')).toMatchObject({ playerId: 'purple', seatToken: token });
    expect(back.last('state')).toMatchObject({ version: 1, yourPlayerId: 'purple' });
  });

  it('stores saves and a stable host key on disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-saves-'));
    try {
      const store = createFileStore(dir);
      expect(store.load()).toBeNull();
      const key = store.hostKey();
      expect(createFileStore(dir).hostKey()).toBe(key);
      const { room, saves, join } = makeRoom();
      join('h', { name: 'Hana', hostKey: HOST_KEY });
      store.save(saves.at(-1)!);
      expect(createFileStore(dir).load()).toEqual(saves.at(-1));
      room.shutdown();
      fs.writeFileSync(path.join(dir, 'current-game.json'), '{oops');
      expect(createFileStore(dir).load()).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('GameRoom bots', () => {
  it('bots advance on their own until a human has to act', async () => {
    const { room, join } = makeRoom();
    join('h', { name: 'Hana', hostKey: HOST_KEY });
    room.handleMessage('h', { type: 'configure', config: createDefaultOnlineLobbyConfig(5) });
    room.handleMessage('h', { type: 'start' });
    // Orange (host) rolls first in the roll-off; the three bots follow by themselves.
    room.handleMessage('h', { type: 'action', action: { type: 'SETUP_ROLL_DICE', playerId: 'orange' } });
    await vi.waitFor(
      () => {
        expect(room.stateVersion).toBeGreaterThanOrEqual(4);
        expect(getActingPlayerId(room.gameState!)).toBe('orange');
      },
      { timeout: 5000, interval: 5 }
    );
    room.shutdown();
  });

  it('schedules at most one bot timer and clears it on shutdown', () => {
    const pending = new Map<number, () => void>();
    let next = 0;
    const timers: RoomTimers = {
      setTimeout: (fn) => {
        pending.set(++next, fn);
        return next;
      },
      clearTimeout: (h) => pending.delete(h as number),
    };
    const { room, join } = makeRoom({ timers });
    join('h', { name: 'Hana', hostKey: HOST_KEY });
    const cfg = createDefaultOnlineLobbyConfig(5);
    cfg.hostPlayerId = 'blue';
    cfg.seats.blue.controller = 'human';
    cfg.seats.orange.controller = 'bot';
    room.handleMessage('h', { type: 'configure', config: cfg });
    room.handleMessage('h', { type: 'start' });
    expect(pending.size).toBe(1); // orange (bot) rolls first
    join('x', { name: 'Xena' });
    room.handleMessage('h', { type: 'claimSeat', playerId: 'blue' });
    expect(pending.size).toBe(1);

    const [id, fn] = [...pending.entries()][0]!;
    pending.delete(id);
    fn();
    expect(room.stateVersion).toBe(1);
    expect(pending.size).toBe(1); // purple (bot) is next
    room.shutdown();
    expect(pending.size).toBe(0);
  });
});

describe('botDelayForSpeed', () => {
  const base = createInitialGameState({ seed: 3 });
  const rollState = { ...base, phase: 'SetupRoll' as const };
  const draftState = { ...base, phase: 'SetupDraft' as const };
  const playState = { ...base, phase: 'ActionPhase' as const };
  const withSpeed = (botSpeed: OnlineLobbyConfig['botSpeed']): OnlineLobbyConfig => ({
    ...createDefaultOnlineLobbyConfig(3),
    botSpeed,
  });

  it('paces server bots like the browser: Relaxed 1.4 s (2 s in setup), Fast 0.6 s (0.95 s), Instant 10 ms', () => {
    expect(botDelayForSpeed(withSpeed('normal'), playState)).toBe(1400);
    expect(botDelayForSpeed(withSpeed('normal'), rollState)).toBe(2000);
    expect(botDelayForSpeed(withSpeed('normal'), draftState)).toBe(2000);
    expect(botDelayForSpeed(withSpeed('fast'), playState)).toBe(600);
    expect(botDelayForSpeed(withSpeed('fast'), rollState)).toBe(950);
    expect(botDelayForSpeed(withSpeed('fast'), draftState)).toBe(950);
    expect(botDelayForSpeed(withSpeed('instant'), playState)).toBe(10);
    expect(botDelayForSpeed(withSpeed('instant'), draftState)).toBe(10);
  });

  it('a room with no fixed delay waits the lobby speed before each bot step', () => {
    const delays: number[] = [];
    const timers: RoomTimers = {
      setTimeout: (_fn, ms) => {
        delays.push(ms);
        return delays.length;
      },
      clearTimeout: () => {},
    };
    const { room, join } = makeRoom({ timers, botDelayMs: undefined });
    join('h', { name: 'Hana', hostKey: HOST_KEY });
    const cfg = createDefaultOnlineLobbyConfig(5);
    cfg.hostPlayerId = 'blue';
    cfg.seats.blue.controller = 'human';
    cfg.seats.orange.controller = 'bot';
    cfg.botSpeed = 'normal';
    room.handleMessage('h', { type: 'configure', config: cfg });
    room.handleMessage('h', { type: 'start' });
    expect(delays).toEqual([2000]); // orange (bot) rolls first in the setup roll-off
    room.shutdown();
  });
});

describe('drawnEventDisc', () => {
  it('names the disc that left the bag, so clients can reveal it without seeing the bag', () => {
    const prev = createInitialGameState({ seed: 3 });
    const next = { ...prev, eventBag: prev.eventBag.slice(0, -1) };
    expect(drawnEventDisc(prev, next)).toBe(prev.eventBag.at(-1));
    expect(drawnEventDisc(prev, prev)).toBeNull();
  });
});
