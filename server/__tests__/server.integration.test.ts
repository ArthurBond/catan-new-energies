// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { getActingPlayerId } from '@/ai/bot';
import { legalActions } from '@/engine/actions';
import type { PlayerId } from '@/engine/types';
import {
  createDefaultOnlineLobbyConfig,
  SERVER_APP_ID,
  type ClientMessage,
  type ServerInfo,
  type ServerMessage,
  type StateMessage,
} from '@/network/server-protocol';
import { startServer, type RunningServer } from '../http-server';

class TestClient {
  readonly messages: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(msg)) return true;
        w.resolve(msg);
        return false;
      });
    });
  }

  static async open(url: string): Promise<TestClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new TestClient(ws);
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Resolves with the first message (already received or future) matching `pred`. */
  waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, timeoutMs?: number): Promise<T>;
  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> {
    const found = this.messages.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for a message')), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  states(): StateMessage[] {
    return this.messages.filter((m): m is StateMessage => m.type === 'state');
  }

  close() {
    this.ws.close();
  }
}

const isWelcome = (m: ServerMessage): m is Extract<ServerMessage, { type: 'welcome' }> => m.type === 'welcome';

async function until(check: () => boolean, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('game server over HTTP and WebSocket', () => {
  let tmp: string;
  let server: RunningServer;
  let base: string;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-server-'));
    const distDir = path.join(tmp, 'dist');
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>Catan test</title>');
    fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log("hi")');
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'top secret');
    server = await startServer({
      port: 0,
      savesDir: path.join(tmp, 'saves'),
      distDir,
      openBrowser: false,
      botDelayMs: 0,
      log: () => {},
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('answers /api/server-info and serves the built client', async () => {
    const info = (await (await fetch(`${base}/api/server-info`)).json()) as ServerInfo;
    expect(info).toMatchObject({ app: SERVER_APP_ID, port: server.port, started: false });
    expect(Array.isArray(info.lanUrls)).toBe(true);

    const index = await fetch(`${base}/`);
    expect(index.headers.get('content-type')).toMatch(/text\/html/);
    expect(await index.text()).toContain('Catan test');
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toMatch(/text\/javascript/);
    const spa = await fetch(`${base}/some/route`);
    expect(await spa.text()).toContain('Catan test');
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    const traversal = await fetch(`${base}/..%5c..%5csecret.txt`);
    expect([400, 404]).toContain(traversal.status);
    expect(await traversal.text()).not.toContain('top secret');
  });

  it('host + friend + two bots play through the roll-off into opening placements', async () => {
    const wsUrl = `ws://127.0.0.1:${server.port}/ws`;
    const host = await TestClient.open(wsUrl);
    host.send({ type: 'hello', name: 'Hana', hostKey: server.hostKey });
    expect(await host.waitFor(isWelcome)).toMatchObject({ isHost: true, playerId: 'orange' });

    const cfg = createDefaultOnlineLobbyConfig(123);
    cfg.seats.purple.controller = 'human';
    cfg.botSpeed = 'instant';
    host.send({ type: 'configure', config: cfg });

    const friend = await TestClient.open(wsUrl);
    friend.send({ type: 'hello', name: 'Finn' });
    await friend.waitFor(isWelcome);
    friend.send({ type: 'claimSeat', playerId: 'purple' });
    const seated = await friend.waitFor((m): m is Extract<ServerMessage, { type: 'welcome' }> => isWelcome(m) && m.playerId === 'purple');
    expect(seated.seatToken).toEqual(expect.any(String));

    // Friends cannot start the game.
    friend.send({ type: 'start' });
    expect(await friend.waitFor((m) => m.type === 'rejected')).toMatchObject({ message: expect.stringMatching(/Only the host/) });

    host.send({ type: 'start' });
    await host.waitFor((m) => m.type === 'state');
    expect(server.room.gameState!.phase).toBe('SetupRoll');

    const seats: Record<string, TestClient> = { orange: host, purple: friend };
    let sawDraft = false;
    let requestId = 0;
    // Drive the humans with legal moves; the bots must move on their own.
    while (true) {
      await until(() => {
        const g = server.room.gameState!;
        const actor = getActingPlayerId(g);
        return !['SetupRoll', 'SetupDraft'].includes(g.phase) || (actor !== null && actor in seats);
      });
      const g = server.room.gameState!;
      if (g.phase === 'SetupDraft') sawDraft = true;
      if (!['SetupRoll', 'SetupDraft'].includes(g.phase)) break;
      const actor = getActingPlayerId(g)! as PlayerId;
      const action = legalActions(g, actor)[0]!;
      const before = server.room.stateVersion;
      seats[actor]!.send({ type: 'action', action, requestId: `r${++requestId}` });
      await until(() => server.room.stateVersion > before);
    }
    expect(sawDraft).toBe(true);

    // If a bot opens the first turn it keeps playing; wait until a human has to act.
    await until(() => {
      const actor = getActingPlayerId(server.room.gameState!);
      return actor !== null && actor in seats;
    });

    // Moves for someone else's seat are refused.
    const g = server.room.gameState!;
    const version = server.room.stateVersion;
    friend.send({ type: 'action', action: { type: 'END_TURN', playerId: 'orange' }, requestId: 'cheat' });
    expect(await friend.waitFor((m) => m.type === 'rejected' && m.requestId === 'cheat')).toMatchObject({
      message: 'You can only make moves for your own seat.',
    });
    expect(server.room.stateVersion).toBe(version);

    // Every opening placement is on the board; the bots placed theirs by themselves.
    const buildingsOf = (pid: PlayerId) =>
      g.board.intersections.filter((n) => n.building?.playerId === pid).length;
    for (const pid of g.playerOrder) expect(buildingsOf(pid)).toBeGreaterThanOrEqual(2);
    const botMoves = host.states().filter((s) => s.lastAction && ['pink', 'blue'].includes(s.lastAction.playerId));
    expect(botMoves.length).toBeGreaterThanOrEqual(6);

    // Both sockets are up to date, and each only ever saw its own secrets.
    await until(() => host.states().at(-1)!.version === server.room.stateVersion);
    await until(() => friend.states().at(-1)!.version === server.room.stateVersion);
    for (const [client, me] of [
      [host, 'orange'],
      [friend, 'purple'],
    ] as const) {
      for (const s of client.states()) {
        expect(s.yourPlayerId).toBe(me);
        for (const pid of s.state.playerOrder) {
          const p = s.state.players[pid];
          expect(p.hiddenGreenDiscs === undefined).toBe(pid !== me);
          expect(p.devCards.unplayed === undefined).toBe(pid !== me);
        }
      }
    }
    expect(fs.existsSync(path.join(tmp, 'saves', 'current-game.json'))).toBe(true);
    host.close();
    friend.close();
  });
});
