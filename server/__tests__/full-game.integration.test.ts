// @vitest-environment node
/**
 * Whole-game soak test through the real server.
 *
 * Two seats are real WebSocket clients that behave like browsers: they only see the redacted
 * `state` messages, run them through `hydrateRedactedState`, ask `legalActions` for their own
 * seat and pick a move (the bot brain, with a few steered moves so dev cards and domestic trades
 * are exercised). The other seats are server bots. The game must reach its end without a
 * deadlock, nothing a client picks from `legalActions` may be rejected, and every client must
 * hold exactly the view the server owes it at every version (checked against an independent
 * replay of the broadcast actions).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { chooseBotAction, chooseRandomLegalAction, getActingPlayerId } from '@/ai/bot';
import { legalActions } from '@/engine/actions';
import { getDevCardType } from '@/engine/dev-cards';
import { canOfferTrade } from '@/engine/energy-trades';
import { Mulberry32PRNG } from '@/engine/prng';
import { applyAction } from '@/engine/reducer';
import type { GameAction, GameState, PlayerId, ResourceType } from '@/engine/types';
import { hydrateRedactedState } from '@/network/hydrate';
import { redactForPlayer } from '@/network/redact';
import {
  createDefaultOnlineLobbyConfig,
  type ClientMessage,
  type OnlineLobbyConfig,
  type ServerMessage,
  type StateMessage,
} from '@/network/server-protocol';
import { startServer, type RunningServer } from '../http-server';
import { createGameFromOnlineConfig, DEFAULT_ROOM_REDACT_OPTIONS } from '../room';

const RESOURCES: ResourceType[] = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'];

/** A JSON round trip, like a frame on the wire (drops `undefined`, normalises key order). */
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const keyOf = (a: GameAction) => JSON.stringify(a);

interface Rejection {
  seat: PlayerId;
  version: number;
  phase: string;
  head: string;
  action: GameAction | null;
  message: string;
}

/** The hydrated view offered a different move list than the real state would. */
interface LegalMismatch {
  seat: PlayerId;
  version: number;
  phase: string;
  head: string;
  onlyInBrowserView: string[];
  onlyOnServer: string[];
}

interface Tally {
  /** Accepted moves, counted from the server's own `lastAction`. */
  discard: number;
  steal: number;
  stealByCleanup: number;
  tradeOffer: number;
  tradeAccept: number;
  tradeDecline: number;
  supplyTrade: number;
  harborTrade: number;
  devBuy: number;
  devPlay: number;
  build: number;
  actions: number;
}

const emptyTally = (): Tally => ({
  discard: 0,
  steal: 0,
  stealByCleanup: 0,
  tradeOffer: 0,
  tradeAccept: 0,
  tradeDecline: 0,
  supplyTrade: 0,
  harborTrade: 0,
  devBuy: 0,
  devPlay: 0,
  build: 0,
  actions: 0,
});

/**
 * The truth the clients are compared with: the game replayed from the seed with the actions the
 * server broadcast. Independent of the server's own copy, so a client that drifts or a server
 * that sends a wrong view both show up.
 */
class Replay {
  private readonly states = new Map<number, GameState>();
  readonly actions: GameAction[] = [];
  constructor(initial: GameState) {
    this.states.set(0, initial);
  }

  truthAt(msg: StateMessage): GameState {
    const v = msg.version;
    if (!this.states.has(v)) {
      const prev = this.states.get(v - 1);
      if (!prev || !msg.lastAction) throw new Error(`State version ${v} arrived out of order.`);
      this.states.set(v, applyAction(prev, msg.lastAction));
      this.actions.push(msg.lastAction);
      this.states.delete(v - 64);
    }
    return this.states.get(v)!;
  }

  /** The true state at a version that has already been replayed. */
  at(version: number): GameState {
    const state = this.states.get(version);
    if (!state) throw new Error(`No replayed state for version ${version}.`);
    return state;
  }

  check(seat: PlayerId, msg: StateMessage): void {
    const expected = wire(redactForPlayer(this.truthAt(msg), seat, DEFAULT_ROOM_REDACT_OPTIONS));
    if (!isDeepStrictEqual(msg.state, expected)) {
      expect(msg.state, `${seat} view at version ${msg.version} drifted from the server's truth`).toEqual(expected);
    }
  }
}

interface Table {
  server: RunningServer;
  replay: Replay;
  humans: Human[];
  fail(error: Error): void;
}

class Human {
  readonly rejections: Rejection[] = [];
  readonly legalMismatches: LegalMismatch[] = [];
  readonly tally = emptyTally();
  readonly errors: string[] = [];
  view: GameState | null = null;
  version = -1;
  finalVersion = -1;
  private lastState: StateMessage | null = null;
  private actedVersion = -1;
  private requestSeq = 0;
  private readonly inFlight = new Map<string, GameAction>();
  private readonly refused = new Set<string>();
  private lastOfferTurn = -99;
  private readonly rng: Mulberry32PRNG;
  private constructor(
    private readonly ws: WebSocket,
    readonly seat: PlayerId,
    private readonly difficulty: 'Easy' | 'Normal' | 'Hard',
    private readonly table: () => Table
  ) {
    this.rng = new Mulberry32PRNG(0xc0ffee ^ seat.length ^ seat.charCodeAt(0));
    ws.on('message', (data) => {
      try {
        this.onMessage(JSON.parse(data.toString()) as ServerMessage);
      } catch (e) {
        this.table().fail(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  static async open(url: string, seat: PlayerId, difficulty: 'Easy' | 'Normal' | 'Hard', table: () => Table) {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new Human(ws, seat, difficulty, table);
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws.close();
  }

  waitForMessage(pred: (m: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for a message')), timeoutMs);
      const onMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (!pred(msg)) return;
        clearTimeout(timer);
        this.ws.off('message', onMessage);
        resolve(msg);
      };
      this.ws.on('message', onMessage);
    });
  }

  // -------------------------------------------------------------------------

  private onMessage(msg: ServerMessage): void {
    if (msg.type === 'error') {
      this.errors.push(msg.message);
      return;
    }
    if (msg.type === 'rejected') return this.onRejected(msg.requestId, msg.message);
    if (msg.type !== 'state') return;

    const table = this.table();
    table.replay.check(this.seat, msg);
    const before = this.view;
    this.lastState = msg;
    this.version = msg.version;
    this.view = hydrateRedactedState(msg.state, msg.yourPlayerId);
    if (msg.lastAction && msg.lastAction.playerId === this.seat && before) this.count(before, msg.lastAction);
    this.maybeAct();
  }

  private onRejected(requestId: string | null, message: string): void {
    const action = (requestId && this.inFlight.get(requestId)) || null;
    const view = this.view;
    this.rejections.push({
      seat: this.seat,
      version: this.version,
      phase: view?.phase ?? '?',
      head: view?.pendingDecisions[0]?.type ?? '-',
      action,
      message,
    });
    if (action) this.refused.add(keyOf(action));
    if (!view) return;
    // Keep the game moving so one mismatch does not hide the next: try another legal move.
    const alternatives = legalActions(view, this.seat).filter((a) => !this.refused.has(keyOf(a)));
    if (alternatives.length === 0 || this.refused.size > 40) {
      this.table().fail(
        new Error(`${this.seat} has no accepted move left at version ${this.version}: ${JSON.stringify(this.rejections.slice(-3))}`)
      );
      return;
    }
    this.sendAction(this.rng.pickRandom(alternatives));
  }

  private count(before: GameState, a: GameAction): void {
    const t = this.tally;
    t.actions++;
    const head = before.pendingDecisions[0];
    switch (a.type) {
      case 'RESOLVE_PENDING_DECISION': {
        if (head?.type === 'DISCARD_ON_SEVEN') t.discard++;
        else if (head?.type === 'STEAL_TARGET') t.steal++;
        else if (head?.type === 'DOMESTIC_TRADE_RESPONSE') {
          if ((a.response as { accept?: boolean }).accept) t.tradeAccept++;
          else t.tradeDecline++;
        }
        break;
      }
      case 'PLAY_DEV_CARD': {
        t.devPlay++;
        const p = a.params as { cardType?: string; option?: { targetPlayerId?: PlayerId } } | undefined;
        if (p?.cardType === 'cleanup' && p.option?.targetPlayerId) t.stealByCleanup++;
        break;
      }
      case 'BUY_DEV_CARD':
        t.devBuy++;
        break;
      case 'OFFER_TRADE':
        t.tradeOffer++;
        break;
      case 'TRADE_SUPPLY':
        t.supplyTrade++;
        break;
      case 'TRADE_HARBOR':
        t.harborTrade++;
        break;
      case 'BUILD_ROAD':
      case 'BUILD_TOWN':
      case 'BUILD_CITY':
      case 'BUILD_FOSSIL_PLANT':
      case 'BUILD_RENEWABLE_PLANT':
      case 'BUILD_WAREHOUSE':
        t.build++;
        break;
      default:
    }
  }

  private maybeAct(): void {
    const state = this.view;
    if (!state || this.version === this.actedVersion) return;
    if (state.phase === 'GameEnd' || state.winner !== null) {
      this.finalVersion = this.version;
      return;
    }
    if (getActingPlayerId(state) !== this.seat) return;
    this.actedVersion = this.version;
    this.refused.clear();
    this.sendAction(this.choose(state));
  }

  private sendAction(action: GameAction): void {
    const requestId = `${this.seat}-${++this.requestSeq}`;
    this.inFlight.set(requestId, action);
    this.send({ type: 'action', action, requestId });
  }

  /**
   * The move list from the hydrated view must equal the one the real state gives this seat.
   * (The server judges every move against the real state, so a difference is a client-side blind
   * spot: a move the player can never pick, or one the server turns down.)
   */
  private compareLegal(view: GameState, legal: GameAction[]): void {
    const truth = legalActions(this.table().replay.at(this.version), this.seat);
    const mine = new Set(legal.map(keyOf));
    const theirs = new Set(truth.map(keyOf));
    const onlyInBrowserView = [...mine].filter((k) => !theirs.has(k));
    const onlyOnServer = [...theirs].filter((k) => !mine.has(k));
    if (onlyInBrowserView.length === 0 && onlyOnServer.length === 0) return;
    this.legalMismatches.push({
      seat: this.seat,
      version: this.version,
      phase: view.phase,
      head: view.pendingDecisions[0]?.type ?? '-',
      onlyInBrowserView: onlyInBrowserView.slice(0, 3),
      onlyOnServer: onlyOnServer.slice(0, 3),
    });
  }

  /** What a person at this seat would do: steer toward the less common moves, else play on. */
  private choose(state: GameState): GameAction {
    const me = this.seat;
    const legal = legalActions(state, me);
    if (legal.length === 0) {
      throw new Error(`${me} has no legal action at version ${this.version} (phase ${state.phase}, head ${state.pendingDecisions[0]?.type}).`);
    }
    this.compareLegal(state, legal);
    const head = state.pendingDecisions[0];
    const t = this.tally;

    if (head?.type === 'DOMESTIC_TRADE_RESPONSE') {
      // A friend's offer: take it whenever the rules let this seat.
      const accept = legal.find(
        (a) => a.type === 'RESOLVE_PENDING_DECISION' && (a.response as { accept?: boolean }).accept === true
      );
      if (accept) return accept;
    } else if (!head) {
      const plays = legal.filter((a) => a.type === 'PLAY_DEV_CARD');
      if (plays.length > 0 && t.devPlay < 2) {
        const withVictim = plays.find(
          (a) =>
            a.type === 'PLAY_DEV_CARD' &&
            (a.params as { option?: { targetPlayerId?: PlayerId } } | undefined)?.option?.targetPlayerId
        );
        return withVictim ?? plays[0]!;
      }
      if (state.phase === 'ActionPhase') {
        const buy = legal.find((a) => a.type === 'BUY_DEV_CARD');
        if (buy && t.devBuy < 2) return buy;
        const offer = this.tryOffer(state);
        if (offer) return offer;
      }
    }

    try {
      return chooseBotAction(state, me, { personality: 'Balanced', difficulty: this.difficulty });
    } catch {
      return chooseRandomLegalAction(state, me, this.rng);
    }
  }

  /**
   * A domestic trade to the other person at the table. Like a player who heard what their friend
   * holds, it asks for a card the friend really has (read from the server's copy); the rules check
   * itself still runs on this client's own hydrated view.
   */
  private tryOffer(state: GameState): GameAction | null {
    const { humans, server } = this.table();
    if (this.tally.tradeOffer >= 3 || state.currentTurn - this.lastOfferTurn < 4) return null;
    const peer = humans.find((h) => h !== this)?.seat;
    const real = server.room.gameState;
    if (!peer || !real) return null;
    const mine = state.players[this.seat]!.resources;
    const theirs = real.players[peer]!.resources;
    const give = RESOURCES.filter((r) => mine[r] > 0).sort((a, b) => mine[b] - mine[a])[0];
    const want = RESOURCES.filter((r) => r !== give && theirs[r] > 0).sort((a, b) => theirs[b] - theirs[a])[0];
    if (!give || !want) return null;
    // Alternate between an offer to the friend alone and one to the whole table.
    const target = this.tally.tradeOffer % 2 === 0 ? peer : undefined;
    if (!canOfferTrade(state, this.seat, target, { [give]: 1 }, { [want]: 1 }).canOffer) return null;
    this.lastOfferTurn = state.currentTurn;
    return { type: 'OFFER_TRADE', playerId: this.seat, targetPlayerId: target, give: { [give]: 1 }, want: { [want]: 1 } };
  }

  /** Dev cards this seat holds, for the report. */
  heldDevCards(): string[] {
    return (this.view?.players[this.seat]?.devCards.unplayed ?? []).map(getDevCardType);
  }

  /** Last state message, for the end-of-game checks. */
  get last(): StateMessage {
    return this.lastState!;
  }
}

interface GameOutcome {
  server: RunningServer;
  humans: Human[];
  replay: Replay;
  state: GameState;
  seconds: number;
}

async function playWholeGame(
  tmpRoot: string,
  seed: number,
  playerCount: 3 | 4,
  setup: Partial<Pick<OnlineLobbyConfig, 'setupMode' | 'placement'>> = {},
  timeoutMs = 240_000
): Promise<GameOutcome> {
  const distDir = path.join(tmpRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>Catan test</title>');
  const server = await startServer({
    port: 0,
    savesDir: path.join(tmpRoot, `saves-${seed}-${playerCount}`),
    distDir,
    openBrowser: false,
    botDelayMs: 0,
    log: () => {},
  });
  servers.push(server);

  const cfg = createDefaultOnlineLobbyConfig(seed);
  cfg.playerCount = playerCount;
  cfg.seats.purple.controller = 'human';
  cfg.botSpeed = 'instant';
  Object.assign(cfg, setup);

  const names = { orange: 'Hana', purple: 'Finn' } as const;
  const humans: Human[] = [];
  let failure: ((e: Error) => void) | undefined;
  const failed = new Promise<never>((_, reject) => {
    failure = reject;
  });
  const table: Table = {
    server,
    replay: new Replay(createGameFromOnlineConfig(cfg, names)),
    humans,
    fail: (e) => failure?.(e),
  };
  const wsUrl = `ws://127.0.0.1:${server.port}/ws`;
  const host = await Human.open(wsUrl, 'orange', 'Normal', () => table);
  const friend = await Human.open(wsUrl, 'purple', 'Easy', () => table);
  humans.push(host, friend);
  sockets.push(host, friend);

  host.send({ type: 'hello', name: names.orange, hostKey: server.hostKey });
  await host.waitForMessage((m) => m.type === 'welcome');
  host.send({ type: 'configure', config: cfg });
  friend.send({ type: 'hello', name: names.purple });
  await friend.waitForMessage((m) => m.type === 'welcome');
  const seated = friend.waitForMessage((m) => m.type === 'welcome' && m.playerId === 'purple');
  friend.send({ type: 'claimSeat', playerId: 'purple' });
  await seated;

  const started = Date.now();
  host.send({ type: 'start' });

  const room = server.room;
  const finished = (async () => {
    for (;;) {
      const g = room.gameState;
      if (g && (g.phase === 'GameEnd' || g.winner !== null) && humans.every((h) => h.version === room.stateVersion)) return;
      await new Promise((r) => setTimeout(r, 20));
    }
  })();

  let lastVersion = -1;
  let lastProgress = Date.now();
  const watchdog = setInterval(() => {
    if (room.stateVersion !== lastVersion) {
      lastVersion = room.stateVersion;
      lastProgress = Date.now();
    } else if (Date.now() - lastProgress > 15_000) {
      const g = room.gameState;
      table.fail(
        new Error(
          `Deadlock at version ${lastVersion}: phase ${g?.phase}, active ${g?.activePlayerId}, ` +
            `acting ${g ? getActingPlayerId(g) : '-'}, head ${JSON.stringify(g?.pendingDecisions[0])}, ` +
            `rejections ${JSON.stringify(humans.flatMap((h) => h.rejections).slice(-3))}`
        )
      );
    }
  }, 500);
  const deadline = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`The game did not finish within ${timeoutMs / 1000}s (version ${room.stateVersion}).`)), timeoutMs).unref();
  });

  try {
    await Promise.race([finished, failed, deadline]);
  } finally {
    clearInterval(watchdog);
  }
  const state = room.gameState!;
  return { server, humans, replay: table.replay, state, seconds: (Date.now() - started) / 1000 };
}

const servers: RunningServer[] = [];
const sockets: Human[] = [];
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  for (const s of servers.splice(0)) await s.close();
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-full-game-'));
  tmpDirs.push(d);
  return d;
}

function report(label: string, outcome: GameOutcome): string {
  const { humans, state, seconds } = outcome;
  const lines = humans.map((h) => `${h.seat}: ${JSON.stringify(h.tally)}`);
  return [
    `${label}: ${state.currentTurn} turns, ${outcome.replay.actions.length} actions, ` +
      `winner ${JSON.stringify(state.winner)} (${state.log.at(-1)?.message}), ${seconds.toFixed(1)}s`,
    ...lines,
  ].join('\n  ');
}

function expectCleanFinish(outcome: GameOutcome): void {
  const { humans, state, server } = outcome;
  // The game ended with a winner and nobody was left waiting.
  expect(state.phase).toBe('GameEnd');
  expect(state.winner).not.toBeNull();
  expect(getActingPlayerId(state)).toBeNull();
  // No move a client picked from its own legal actions was refused, and its move list was right.
  expect(humans.flatMap((h) => h.rejections)).toEqual([]);
  expect(humans.flatMap((h) => h.legalMismatches).slice(0, 5)).toEqual([]);
  expect(humans.flatMap((h) => h.errors)).toEqual([]);
  // Every client ended on the server's final version and board.
  for (const h of humans) {
    expect(h.version).toBe(server.room.stateVersion);
    expect(h.view!.phase).toBe('GameEnd');
    expect(h.view!.winner).toEqual(state.winner);
    expect(h.view!.currentTurn).toBe(state.currentTurn);
    expect(h.view!.activePlayerId).toBe(state.activePlayerId);
    expect(wire(h.view!.board)).toEqual(wire(state.board));
  }
}

/**
 * Seeds (4 seats, host = orange, friend = purple) that together reach every flow below for each
 * of the two browsers. The bots' choices decide this, so a change to the bot brain can move it:
 * re-pick seeds by reading the per-game report lines this test prints.
 */
const PINNED_SEEDS = [1, 2, 3];

describe('a whole game through the real server (2 browsers + bots)', () => {
  it.each([[11], [12]])('plays a 4-seat game to the end (seed %i)', async (seed) => {
    const outcome = await playWholeGame(tmp(), seed, 4);
    console.log(report(`4p seed ${seed}`, outcome));
    expectCleanFinish(outcome);
  }, 300_000);

  it('plays a 3-seat game to the end', async () => {
    const outcome = await playWholeGame(tmp(), 7, 3);
    console.log(report('3p seed 7', outcome));
    expectCleanFinish(outcome);
  }, 300_000);

  it('has both browsers discard, steal, trade and use dev cards', async () => {
    const perSeat: Record<'orange' | 'purple', Tally[]> = { orange: [], purple: [] };
    for (const seed of PINNED_SEEDS) {
      const outcome = await playWholeGame(tmp(), seed, 4);
      console.log(report(`4p seed ${seed}`, outcome));
      expectCleanFinish(outcome);
      for (const h of outcome.humans) perSeat[h.seat as 'orange' | 'purple'].push(h.tally);
    }
    for (const seat of ['orange', 'purple'] as const) {
      const total = (key: keyof Tally) => perSeat[seat].reduce((n, t) => n + t[key], 0);
      const label = (what: string) => `${seat}: ${what}`;
      expect(total('discard'), label('discard on a 7')).toBeGreaterThan(0);
      expect(total('steal') + total('stealByCleanup'), label('steal')).toBeGreaterThan(0);
      expect(total('tradeOffer'), label('domestic trade offered')).toBeGreaterThan(0);
      expect(total('tradeAccept'), label('domestic trade accepted')).toBeGreaterThan(0);
      expect(total('supplyTrade') + total('harborTrade'), label('bank or harbor trade')).toBeGreaterThan(0);
      expect(total('devBuy'), label('dev card bought')).toBeGreaterThan(0);
      expect(total('devPlay'), label('dev card played')).toBeGreaterThan(0);
    }
  }, 600_000);
});
