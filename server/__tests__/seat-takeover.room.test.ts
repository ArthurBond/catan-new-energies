// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDefaultOnlineLobbyConfig, type ServerMessage } from '@/network/server-protocol';
import { GameRoom, SEAT_TAKEOVER_AFTER_MS, type SavedRoom } from '../room';

const HOST_KEY = 'test-host-key-123';

class FakeClient {
  readonly messages: ServerMessage[] = [];
  closedReason: string | null = null;
  constructor(readonly id: string) {}
  send(message: ServerMessage) {
    this.messages.push(JSON.parse(JSON.stringify(message)) as ServerMessage);
  }
  close(reason: string) {
    this.closedReason = reason;
  }
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return [...this.messages].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

/** A room with the host on orange, Finn on purple, two bots; optionally with the game started. */
function table({ started = true, saved }: { started?: boolean; saved?: SavedRoom } = {}) {
  let t = 1_000_000;
  let n = 0;
  const saves: SavedRoom[] = [];
  const room = new GameRoom({
    hostKey: HOST_KEY,
    botDelayMs: 0,
    randomToken: () => `token-${++n}`,
    randomSeed: () => 4242,
    now: () => t,
    saved,
    persist: (s) => saves.push(JSON.parse(JSON.stringify(s)) as SavedRoom),
    // Bots never move in these tests: they are about seats, not the game.
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
  });
  const join = (id: string, hello: Record<string, unknown> = {}) => {
    const client = new FakeClient(id);
    room.connect(client);
    room.handleMessage(id, { type: 'hello', name: id, ...hello });
    return client;
  };
  const host = join('Hana', { hostKey: HOST_KEY });
  let finn: FakeClient | null = null;
  if (!saved) {
    const cfg = createDefaultOnlineLobbyConfig(7);
    cfg.seats.purple.controller = 'human';
    room.handleMessage('Hana', { type: 'configure', config: cfg });
    finn = join('Finn');
    room.handleMessage('Finn', { type: 'claimSeat', playerId: 'purple' });
    if (started) room.handleMessage('Hana', { type: 'start' });
  }
  return {
    room,
    host,
    finn: finn!,
    join,
    saves,
    wait: (ms: number) => {
      t += ms;
    },
    purple: () => room.seatInfo().find((s) => s.playerId === 'purple')!,
  };
}

describe('taking over the seat of a friend who is offline', () => {
  it('is refused while the friend is connected', () => {
    const { room, join, purple } = table();
    const other = join('Olga');
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('rejected')?.message).toBe('Someone already sits there.');
    expect(purple()).toMatchObject({ name: 'Finn', claimed: true, connected: true });
  });

  it('is refused right after the friend dropped, so a Wi-Fi blip or a reload never costs a seat', () => {
    const { room, join, wait, purple } = table();
    room.disconnect('Finn');
    const other = join('Olga');
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('rejected')?.message).toBe('Finn was here a moment ago. If they do not come back, try again in 30 seconds.');
    wait(SEAT_TAKEOVER_AFTER_MS - 1000);
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('rejected')?.message).toMatch(/try again in 1 second\./);
    expect(purple()).toMatchObject({ name: 'Finn', claimed: true, connected: false });
    expect(other.last('welcome')?.playerId).toBeNull();
  });

  it('works once the friend has been away a while: the same person on another device keeps playing', () => {
    const { room, join, wait, purple, finn } = table();
    const oldToken = finn.last('welcome')!.seatToken!;
    room.disconnect('Finn');
    wait(SEAT_TAKEOVER_AFTER_MS);
    const laptop = join('Finn (laptop)');
    room.handleMessage('Finn (laptop)', { type: 'claimSeat', playerId: 'purple', name: 'Finn' });
    const welcome = laptop.last('welcome')!;
    expect(welcome.playerId).toBe('purple');
    expect(welcome.seatToken).toEqual(expect.any(String));
    expect(welcome.seatToken).not.toBe(oldToken);
    expect(purple()).toMatchObject({ name: 'Finn', claimed: true, connected: true });
    // The new device sees the game from that seat, hand and all.
    expect(laptop.last('state')?.yourPlayerId).toBe('purple');
    expect(room.gameState!.players.purple!.name).toBe('Finn');

    // The old device's token no longer opens the seat: it comes back as a spectator.
    const phone = join('Finn (phone)', { seatToken: oldToken });
    expect(phone.last('welcome')?.playerId).toBeNull();
    expect(laptop.closedReason).toBeNull();
  });

  it('the friend coming back in time keeps the seat and resets the wait', () => {
    const { room, join, wait, finn } = table();
    const token = finn.last('welcome')!.seatToken!;
    room.disconnect('Finn');
    wait(SEAT_TAKEOVER_AFTER_MS - 5000);
    const back = join('Finn', { seatToken: token });
    expect(back.last('welcome')?.playerId).toBe('purple');
    room.disconnect('Finn');
    wait(10_000);
    const other = join('Olga');
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('rejected')?.message).toMatch(/try again in 20 seconds/);
  });

  it('never applies to the host’s seat, and a player with a seat cannot grab a second one mid-game', () => {
    const { room, join, wait, host } = table();
    room.disconnect('Hana');
    room.disconnect('Finn');
    wait(SEAT_TAKEOVER_AFTER_MS * 10);
    const other = join('Olga');
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'orange' });
    expect(other.last('rejected')?.message).toBe('That is the host’s seat.');
    // Olga takes purple, then tries nothing else can be taken on top.
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('welcome')?.playerId).toBe('purple');
    expect(host.closedReason).toBeNull();
  });

  it('in the lobby a seated friend may move to an abandoned seat, freeing their own', () => {
    const { room, join, wait, host } = table({ started: false });
    const cfg = room.lobbyConfig;
    cfg.seats.pink.controller = 'human';
    room.handleMessage('Hana', { type: 'configure', config: cfg });
    const olga = join('Olga');
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'pink' });
    room.disconnect('Finn');
    wait(SEAT_TAKEOVER_AFTER_MS);
    room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(olga.last('welcome')?.playerId).toBe('purple');
    const seats = host.last('lobby')!.seats;
    expect(seats.find((s) => s.playerId === 'purple')).toMatchObject({ name: 'Olga', claimed: true, connected: true });
    expect(seats.find((s) => s.playerId === 'pink')).toMatchObject({ claimed: false });
  });

  it('after a server restart the wait starts again, so returning friends get their seats first', () => {
    const first = table();
    const token = first.finn.last('welcome')!.seatToken!;
    const saved = first.saves.at(-1)!;
    const second = table({ saved });
    const other = second.join('Olga');
    second.room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('rejected')?.message).toMatch(/try again in 30 seconds/);
    const finn = second.join('Finn', { seatToken: token });
    expect(finn.last('welcome')?.playerId).toBe('purple');
    second.wait(SEAT_TAKEOVER_AFTER_MS * 2);
    second.room.handleMessage('Olga', { type: 'claimSeat', playerId: 'purple' });
    expect(other.last('rejected')?.message).toBe('Someone already sits there.');
  });
});
