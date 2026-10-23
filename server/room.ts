/**
 * GameRoom: the one authoritative table on the server.
 *
 * Transport-agnostic: sockets are plain `RoomClient`s with a `send` function, timers and
 * randomness are injectable, and persistence is a callback. `server/main.ts` wires it to `ws`.
 *
 * Guarantees:
 * - Every socket only ever receives its own seat's `redactForPlayer` view (or the spectator view).
 * - Actions are accepted only for the sender's own seat and only if `applyAction` accepts them.
 * - Only a socket that presented the host key can configure, start or restart the game.
 */

import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  chooseBotAction,
  chooseRandomLegalAction,
  getActingPlayerId,
  type BotDifficulty,
} from '@/ai/bot';
import { applyAction } from '@/engine/reducer';
import { createInitialGameState } from '@/engine/setup';
import type { GameAction, GameState, PlayerId } from '@/engine/types';
import { redactForPlayer, redactForSpectator, type RedactOptions } from '@/network/redact';
import {
  activeSeatIds,
  ALL_PLAYER_IDS,
  createDefaultOnlineLobbyConfig,
  SERVER_PROTOCOL_VERSION,
  type ClientMessage,
  type OnlineBotDifficulty,
  type OnlineLobbyConfig,
  type OnlineSeatConfig,
  type SeatInfo,
  type ServerMessage,
} from '@/network/server-protocol';

export interface RoomClient {
  readonly id: string;
  send(message: ServerMessage): void;
  /** Called when a newer connection takes over this client's seat. */
  close?(reason: string): void;
}

export interface RoomTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SeatClaim {
  token: string;
  name: string;
}

/** What `saves/current-game.json` holds. */
export interface SavedRoom {
  format: 1;
  savedAt: number;
  config: OnlineLobbyConfig;
  started: boolean;
  game: GameState | null;
  version: number;
  lastAction: GameAction | null;
  seats: Partial<Record<PlayerId, SeatClaim>>;
}

export interface GameRoomOptions {
  hostKey: string;
  saved?: SavedRoom | null;
  persist?: (snapshot: SavedRoom) => void;
  /** Fixed bot delay in ms (0 in tests). Default: derived from the lobby's bot speed. */
  botDelayMs?: number;
  timers?: RoomTimers;
  randomToken?: () => string;
  randomSeed?: () => number;
  log?: (message: string) => void;
  redactOptions?: RedactOptions;
}

interface ClientRecord {
  client: RoomClient;
  greeted: boolean;
  isHost: boolean;
  name: string;
  playerId: PlayerId | null;
}

const NAME_MAX_LENGTH = 20;
const STRATEGIES = ['Balanced', 'GreenInnovator', 'IndustrialExpansionist'] as const;
const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;

export function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
  return name || fallback;
}

function isPlayerId(v: unknown): v is PlayerId {
  return typeof v === 'string' && (ALL_PLAYER_IDS as readonly string[]).includes(v);
}

function oneOf<T extends string>(v: unknown, options: readonly T[]): v is T {
  return typeof v === 'string' && (options as readonly string[]).includes(v);
}

/** Validates an untrusted lobby config; returns a clean copy or a plain-language problem. */
export function validateLobbyConfig(raw: unknown): OnlineLobbyConfig | string {
  if (!raw || typeof raw !== 'object') return 'The game setup is missing.';
  const c = raw as Partial<OnlineLobbyConfig>;
  if (c.playerCount !== 3 && c.playerCount !== 4) return 'Choose 3 or 4 players.';
  if (!oneOf(c.setupMode, ['first', 'standard'] as const)) return 'Choose a board layout.';
  if (!oneOf(c.placement, ['fixed', 'draft'] as const)) return 'Choose how starting pieces are placed.';
  if (typeof c.seed !== 'number' || !Number.isFinite(c.seed)) return 'The board seed must be a number.';
  if (!oneOf(c.botSpeed, SPEEDS)) return 'Choose a bot speed.';
  if (!isPlayerId(c.hostPlayerId)) return 'Choose the host seat.';
  if (!c.seats || typeof c.seats !== 'object') return 'The seats are missing.';
  const inGame = activeSeatIds({ playerCount: c.playerCount });
  if (!inGame.includes(c.hostPlayerId)) return 'The host seat is not part of this game.';

  const seats = {} as Record<PlayerId, OnlineSeatConfig>;
  for (const pid of ALL_PLAYER_IDS) {
    const s = (c.seats as Partial<Record<PlayerId, Partial<OnlineSeatConfig>>>)[pid];
    if (!s || typeof s !== 'object') return `Seat ${pid} is missing.`;
    if (s.controller !== 'human' && s.controller !== 'bot') return `Seat ${pid} needs a player or a bot.`;
    if (!oneOf(s.botStrategy, STRATEGIES)) return `Seat ${pid} has an unknown bot style.`;
    if (!oneOf(s.botDifficulty, DIFFICULTIES)) return `Seat ${pid} has an unknown bot level.`;
    const defaultName = pid.charAt(0).toUpperCase() + pid.slice(1);
    seats[pid] = {
      playerId: pid,
      name: cleanName(s.name, defaultName),
      controller: s.controller,
      botStrategy: s.botStrategy,
      botDifficulty: s.botDifficulty,
    };
  }
  if (seats[c.hostPlayerId].controller !== 'human') return 'The host seat must be played by a person.';
  return {
    playerCount: c.playerCount,
    setupMode: c.setupMode,
    placement: c.setupMode === 'first' ? c.placement : 'draft',
    seed: Math.trunc(c.seed),
    botSpeed: c.botSpeed,
    hostPlayerId: c.hostPlayerId,
    seats,
  };
}

/** Creates the engine state exactly like the UI's `createGameFromConfig`. */
export function createGameFromOnlineConfig(
  config: OnlineLobbyConfig,
  names: Partial<Record<PlayerId, string>>
): GameState {
  const drafted = config.setupMode === 'standard' || config.placement === 'draft';
  const playerNames: Partial<Record<PlayerId, string>> = {};
  for (const pid of ALL_PLAYER_IDS) playerNames[pid] = names[pid] ?? config.seats[pid].name;
  return createInitialGameState({
    setupMode: config.setupMode,
    placement: config.placement,
    playerCount: config.playerCount,
    seed: config.seed,
    setupRoll: drafted,
    playerNames,
  });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function mapDifficulty(d: OnlineBotDifficulty): BotDifficulty {
  if (d === 'easy') return 'Easy';
  if (d === 'hard') return 'Hard';
  return 'Normal';
}

/** Same pacing as the in-browser bots (TabletopApp). */
export function botDelayForSpeed(config: OnlineLobbyConfig, state: GameState): number {
  const isSetup = state.phase === 'SetupRoll' || state.phase === 'SetupDraft';
  if (config.botSpeed === 'instant') return 10;
  if (config.botSpeed === 'fast') return isSetup ? 420 : 150;
  return isSetup ? 950 : 600;
}

const defaultTimers: RoomTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class GameRoom {
  private readonly hostKey: string;
  private readonly opts: GameRoomOptions;
  private readonly timers: RoomTimers;
  private readonly clients = new Map<string, ClientRecord>();

  private config: OnlineLobbyConfig;
  private started = false;
  private game: GameState | null = null;
  private version = 0;
  private lastAction: GameAction | null = null;
  private claims: Partial<Record<PlayerId, SeatClaim>> = {};

  private botTimer: unknown = null;
  private closed = false;

  constructor(options: GameRoomOptions) {
    this.opts = options;
    this.hostKey = options.hostKey;
    this.timers = options.timers ?? defaultTimers;
    const saved = options.saved;
    if (saved && saved.format === 1) {
      const cfg = validateLobbyConfig(saved.config);
      this.config = typeof cfg === 'string' ? createDefaultOnlineLobbyConfig(this.newSeed()) : cfg;
      this.started = saved.started && !!saved.game;
      this.game = this.started ? saved.game : null;
      this.version = this.started ? saved.version : 0;
      this.lastAction = this.started ? saved.lastAction : null;
      this.claims = { ...saved.seats };
    } else {
      this.config = createDefaultOnlineLobbyConfig(this.newSeed());
    }
  }

  // -------------------------------------------------------------------------
  // Read-only accessors (tests, server-info)
  // -------------------------------------------------------------------------

  get isStarted(): boolean {
    return this.started;
  }

  get gameState(): GameState | null {
    return this.game;
  }

  get stateVersion(): number {
    return this.version;
  }

  get lobbyConfig(): OnlineLobbyConfig {
    return structuredClone(this.config);
  }

  snapshot(): SavedRoom {
    return {
      format: 1,
      savedAt: Date.now(),
      config: structuredClone(this.config),
      started: this.started,
      game: this.game,
      version: this.version,
      lastAction: this.lastAction,
      seats: structuredClone(this.claims),
    };
  }

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  connect(client: RoomClient): void {
    if (this.closed) return;
    this.clients.set(client.id, { client, greeted: false, isHost: false, name: 'Player', playerId: null });
  }

  disconnect(clientId: string): void {
    const rec = this.clients.get(clientId);
    if (!rec) return;
    this.clients.delete(clientId);
    if (rec.greeted) this.broadcastLobby();
  }

  /** Resumes bots after a restart (call once the room is wired up). */
  resume(): void {
    this.scheduleBot();
  }

  shutdown(): void {
    this.closed = true;
    this.clearBotTimer();
  }

  handleMessage(clientId: string, raw: unknown): void {
    const rec = this.clients.get(clientId);
    if (!rec || this.closed) return;
    if (!raw || typeof raw !== 'object' || typeof (raw as { type?: unknown }).type !== 'string') {
      this.send(rec, { type: 'error', message: 'The server did not understand that message.' });
      return;
    }
    const msg = raw as ClientMessage;
    if (msg.type !== 'hello' && !rec.greeted) {
      this.send(rec, { type: 'error', message: 'Say hello first.' });
      return;
    }
    switch (msg.type) {
      case 'hello':
        return this.onHello(rec, msg);
      case 'claimSeat':
        return this.onClaimSeat(rec, msg.playerId, msg.name);
      case 'leaveSeat':
        return this.onLeaveSeat(rec);
      case 'configure':
        return this.onConfigure(rec, msg.config);
      case 'start':
        return this.onStart(rec);
      case 'newGame':
        return this.onNewGame(rec);
      case 'action':
        return this.onAction(rec, msg.action, msg.requestId);
      default:
        this.send(rec, { type: 'error', message: 'The server did not understand that message.' });
    }
  }

  // -------------------------------------------------------------------------
  // Message handlers
  // -------------------------------------------------------------------------

  private onHello(rec: ClientRecord, msg: Extract<ClientMessage, { type: 'hello' }>): void {
    if (rec.greeted) {
      this.send(rec, { type: 'error', message: 'Already connected.' });
      return;
    }
    rec.greeted = true;
    const sentName = cleanName(msg.name, '');
    rec.name = sentName || 'Player';
    const namesBefore = this.game ? this.game.playerOrder.map((p) => this.game!.players[p]!.name).join('|') : '';

    if (typeof msg.hostKey === 'string' && msg.hostKey.length > 0) {
      if (safeEqual(msg.hostKey, this.hostKey)) {
        rec.isHost = true;
      } else {
        this.send(rec, {
          type: 'error',
          message: 'That host link is not valid. You joined as a guest; use the link the server printed.',
        });
      }
    }

    if (rec.isHost) {
      this.bindHost(rec);
    } else if (typeof msg.seatToken === 'string' && msg.seatToken) {
      const pid = this.seatForToken(msg.seatToken);
      if (pid && pid !== this.config.hostPlayerId && this.isHumanSeatInGame(pid)) {
        this.bind(rec, pid);
        // A returning friend keeps the name they joined with unless they send a new one.
        if (sentName) this.renameSeat(pid, sentName);
        else rec.name = this.claims[pid]!.name;
      }
    }

    this.sendWelcome(rec);
    this.broadcastLobby();
    this.persist();
    if (this.started && this.game) {
      const namesAfter = this.game.playerOrder.map((p) => this.game!.players[p]!.name).join('|');
      if (namesAfter !== namesBefore) this.broadcastState(null);
      else this.sendState(rec, null);
    }
  }

  private onClaimSeat(rec: ClientRecord, playerId: unknown, name: unknown): void {
    if (!isPlayerId(playerId)) return this.reject(rec, null, 'That seat does not exist.');
    if (!this.isHumanSeatInGame(playerId)) return this.reject(rec, null, 'That seat is not open for a player.');
    if (name !== undefined) rec.name = cleanName(name, rec.name);
    if (rec.playerId === playerId) {
      this.renameSeat(playerId, rec.name);
      this.sendWelcome(rec);
      this.broadcastLobby();
      this.afterSeatChange();
      return;
    }
    const claimedByOther = this.claims[playerId] !== undefined;
    if (rec.isHost) {
      if (this.started) return this.reject(rec, null, 'The host keeps the same seat during a game.');
      if (claimedByOther) return this.reject(rec, null, 'Someone already sits there.');
      // In the lobby the host may move to another open seat.
      const old = this.config.hostPlayerId;
      delete this.claims[old];
      this.config.hostPlayerId = playerId;
      this.bindHost(rec);
    } else {
      if (playerId === this.config.hostPlayerId) return this.reject(rec, null, 'That is the host’s seat.');
      if (claimedByOther) return this.reject(rec, null, 'Someone already sits there.');
      if (rec.playerId) {
        if (this.started) return this.reject(rec, null, 'You already have a seat in this game.');
        this.releaseSeat(rec.playerId);
      }
      this.claims[playerId] = { token: this.newToken(), name: rec.name };
      this.bind(rec, playerId);
      this.renameSeat(playerId, rec.name);
    }
    this.sendWelcome(rec);
    this.broadcastLobby();
    this.afterSeatChange();
  }

  private onLeaveSeat(rec: ClientRecord): void {
    if (!rec.playerId) return;
    if (rec.isHost) return this.reject(rec, null, 'The host cannot leave their seat.');
    this.releaseSeat(rec.playerId);
    this.sendWelcome(rec);
    this.broadcastLobby();
    this.afterSeatChange();
  }

  private onConfigure(rec: ClientRecord, raw: unknown): void {
    if (!rec.isHost) return this.reject(rec, null, 'Only the host can change the game setup.');
    if (this.started) return this.reject(rec, null, 'Finish or restart the game before changing the setup.');
    const cfg = validateLobbyConfig(raw);
    if (typeof cfg === 'string') return this.reject(rec, null, cfg);

    const oldHostSeat = this.config.hostPlayerId;
    this.config = cfg;
    if (oldHostSeat !== cfg.hostPlayerId) {
      const hostClaim = this.claims[oldHostSeat];
      delete this.claims[oldHostSeat];
      this.releaseSeat(cfg.hostPlayerId); // a friend sitting there is moved off
      if (hostClaim) this.claims[cfg.hostPlayerId] = hostClaim;
    }
    // Seats that became bots or left the game lose their players.
    for (const pid of ALL_PLAYER_IDS) {
      if (pid !== cfg.hostPlayerId && !this.isHumanSeatInGame(pid)) this.releaseSeat(pid);
    }
    for (const r of this.greetedClients()) {
      if (r.isHost) this.bindHost(r);
    }
    for (const r of this.greetedClients()) this.sendWelcome(r);
    this.broadcastLobby();
    this.persist();
  }

  private onStart(rec: ClientRecord): void {
    if (!rec.isHost) return this.reject(rec, null, 'Only the host can start the game.');
    if (this.started) return this.reject(rec, null, 'The game is already running.');
    const names: Partial<Record<PlayerId, string>> = {};
    for (const pid of ALL_PLAYER_IDS) {
      const claim = this.claims[pid];
      if (claim && this.isHumanSeatInGame(pid)) names[pid] = claim.name;
    }
    this.game = createGameFromOnlineConfig(this.config, names);
    this.started = true;
    this.version = 0;
    this.lastAction = null;
    this.log(`Game started (${this.config.playerCount} players, seed ${this.config.seed}).`);
    this.persist();
    this.broadcastLobby();
    this.broadcastState();
    this.scheduleBot();
  }

  private onNewGame(rec: ClientRecord): void {
    if (!rec.isHost) return this.reject(rec, null, 'Only the host can start a new game.');
    this.clearBotTimer();
    this.started = false;
    this.game = null;
    this.version = 0;
    this.lastAction = null;
    this.config = { ...this.config, seed: this.newSeed() };
    this.log('Back to the lobby for a new game.');
    this.persist();
    this.broadcastLobby();
  }

  private onAction(rec: ClientRecord, action: unknown, requestIdRaw: unknown): void {
    const requestId = typeof requestIdRaw === 'string' ? requestIdRaw : null;
    if (!this.started || !this.game) return this.reject(rec, requestId, 'The game has not started yet.');
    if (!rec.playerId) return this.reject(rec, requestId, 'Take a seat before making a move.');
    if (!action || typeof action !== 'object' || typeof (action as GameAction).type !== 'string') {
      return this.reject(rec, requestId, 'The server did not understand that move.');
    }
    const a = action as GameAction;
    if (a.playerId !== rec.playerId) {
      return this.reject(rec, requestId, 'You can only make moves for your own seat.');
    }
    const error = this.commit(a);
    if (error) this.reject(rec, requestId, error);
  }

  // -------------------------------------------------------------------------
  // Game progression
  // -------------------------------------------------------------------------

  /** Applies an action through the engine; returns a plain-language error or null. */
  private commit(action: GameAction): string | null {
    if (!this.game) return 'The game has not started yet.';
    let next: GameState;
    try {
      next = applyAction(this.game, action);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return `That move is not allowed right now (${detail}).`;
    }
    this.game = next;
    this.version += 1;
    this.lastAction = action;
    this.persist();
    this.broadcastState();
    if (next.phase === 'GameEnd' || next.winner !== null) this.log('Game over.');
    this.scheduleBot();
    return null;
  }

  private scheduleBot(): void {
    if (this.closed || this.botTimer !== null || !this.started || !this.game) return;
    const actor = getActingPlayerId(this.game);
    if (!actor || this.config.seats[actor]?.controller !== 'bot') return;
    const delay = this.opts.botDelayMs ?? botDelayForSpeed(this.config, this.game);
    this.botTimer = this.timers.setTimeout(() => {
      this.botTimer = null;
      this.runBot();
    }, delay);
  }

  private runBot(): void {
    if (this.closed || !this.started || !this.game) return;
    const state = this.game;
    const actor = getActingPlayerId(state);
    const seat = actor ? this.config.seats[actor] : undefined;
    if (!actor || !seat || seat.controller !== 'bot') return;
    let action: GameAction;
    try {
      action = chooseBotAction(state, actor, {
        personality: seat.botStrategy,
        difficulty: mapDifficulty(seat.botDifficulty),
      });
    } catch (e) {
      this.log(`Bot ${actor} could not choose a move: ${e instanceof Error ? e.message : e}`);
      try {
        action = chooseRandomLegalAction(state, actor);
      } catch {
        this.log(`Bot ${actor} has no legal move; the game is stuck.`);
        return;
      }
    }
    const error = this.commit(action);
    if (error) {
      this.log(`Bot ${actor} move was rejected: ${error}`);
      try {
        const fallback = chooseRandomLegalAction(state, actor);
        const second = this.commit(fallback);
        if (second) this.log(`Bot ${actor} fallback move was rejected too: ${second}`);
      } catch {
        this.log(`Bot ${actor} has no legal move; the game is stuck.`);
      }
    }
  }

  private clearBotTimer(): void {
    if (this.botTimer !== null) {
      this.timers.clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Seats
  // -------------------------------------------------------------------------

  private isHumanSeatInGame(pid: PlayerId): boolean {
    return activeSeatIds(this.config).includes(pid) && this.config.seats[pid].controller === 'human';
  }

  private seatForToken(token: string): PlayerId | null {
    for (const pid of ALL_PLAYER_IDS) {
      if (this.claims[pid]?.token === token) return pid;
    }
    return null;
  }

  /** Binds the host socket to the host seat, creating the host's claim if needed. */
  private bindHost(rec: ClientRecord): void {
    const pid = this.config.hostPlayerId;
    const claim = this.claims[pid];
    if (claim) claim.name = rec.name;
    else this.claims[pid] = { token: this.newToken(), name: rec.name };
    this.bind(rec, pid);
    this.renameSeat(pid, rec.name);
  }

  /** Points a socket at a seat; an older socket on the same seat is told and dropped. */
  private bind(rec: ClientRecord, pid: PlayerId): void {
    for (const other of this.clients.values()) {
      if (other !== rec && other.playerId === pid) {
        other.playerId = null;
        this.send(other, { type: 'error', message: 'This seat was opened in another window.' });
        this.clients.delete(other.client.id);
        other.client.close?.('seat taken over');
      }
    }
    rec.playerId = pid;
  }

  /** Frees a seat: forgets its token and unseats whoever sat there. */
  private releaseSeat(pid: PlayerId): void {
    delete this.claims[pid];
    for (const r of this.clients.values()) {
      if (r.playerId === pid) {
        r.playerId = null;
        if (r.greeted) this.sendWelcome(r);
      }
    }
  }

  /** Keeps the seat's display name (claim and, mid-game, the engine state) in sync. */
  private renameSeat(pid: PlayerId, name: string): void {
    const claim = this.claims[pid];
    if (claim) claim.name = name;
    const player = this.game?.players[pid];
    if (this.game && player && player.name !== name) {
      this.game = { ...this.game, players: { ...this.game.players, [pid]: { ...player, name } } };
    }
  }

  private afterSeatChange(): void {
    this.persist();
    if (this.started) this.broadcastState(null);
  }

  // -------------------------------------------------------------------------
  // Outgoing messages
  // -------------------------------------------------------------------------

  seatInfo(): SeatInfo[] {
    const connected = new Set<PlayerId>();
    for (const r of this.greetedClients()) if (r.playerId) connected.add(r.playerId);
    return activeSeatIds(this.config).map((pid) => {
      const seat = this.config.seats[pid];
      const claim = this.claims[pid];
      const isBot = seat.controller === 'bot';
      return {
        playerId: pid,
        role: isBot ? 'bot' : pid === this.config.hostPlayerId ? 'host' : 'friend',
        name: !isBot && claim ? claim.name : seat.name,
        claimed: !isBot && !!claim,
        connected: connected.has(pid),
      };
    });
  }

  private greetedClients(): ClientRecord[] {
    return [...this.clients.values()].filter((r) => r.greeted);
  }

  private send(rec: ClientRecord, message: ServerMessage): void {
    try {
      rec.client.send(message);
    } catch (e) {
      this.log(`Send to ${rec.client.id} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  private reject(rec: ClientRecord, requestId: string | null, message: string): void {
    this.send(rec, { type: 'rejected', requestId, message });
  }

  private sendWelcome(rec: ClientRecord): void {
    this.send(rec, {
      type: 'welcome',
      protocolVersion: SERVER_PROTOCOL_VERSION,
      clientId: rec.client.id,
      isHost: rec.isHost,
      playerId: rec.playerId,
      seatToken: rec.playerId ? (this.claims[rec.playerId]?.token ?? null) : null,
    });
  }

  private broadcastLobby(): void {
    const message: ServerMessage = {
      type: 'lobby',
      config: structuredClone(this.config),
      seats: this.seatInfo(),
      started: this.started,
    };
    for (const r of this.greetedClients()) this.send(r, message);
  }

  /** Each socket gets its own redaction; nothing is shared between sockets. */
  private broadcastState(lastAction: GameAction | null = this.lastAction): void {
    for (const r of this.greetedClients()) this.sendState(r, lastAction);
  }

  private sendState(rec: ClientRecord, lastAction: GameAction | null): void {
    if (!this.game) return;
    const state = rec.playerId
      ? redactForPlayer(this.game, rec.playerId, this.opts.redactOptions)
      : redactForSpectator(this.game, this.opts.redactOptions);
    this.send(rec, { type: 'state', state, version: this.version, lastAction, yourPlayerId: rec.playerId });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private persist(): void {
    if (!this.opts.persist) return;
    try {
      this.opts.persist(this.snapshot());
    } catch (e) {
      this.log(`Could not save the game: ${e instanceof Error ? e.message : e}`);
    }
  }

  private newToken(): string {
    return this.opts.randomToken ? this.opts.randomToken() : randomBytes(18).toString('base64url');
  }

  private newSeed(): number {
    return this.opts.randomSeed ? this.opts.randomSeed() : randomInt(1, 2 ** 31 - 1);
  }

  private log(message: string): void {
    this.opts.log?.(message);
  }
}
