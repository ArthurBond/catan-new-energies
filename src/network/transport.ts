/**
 * CATAN: New Energies — Multiplayer Transport & Session Management
 *
 * Implements:
 * - TransportMessage union (ACTION_REQUEST, STATE_UPDATE, JOIN_ROOM, PLAYER_ASSIGNED, PING)
 * - MultiplayerTransport interface (send, onMessage, close, roomId)
 * - MockTransport & MockTransportHub (deterministic in-memory multi-client hub with reconnect support)
 * - BroadcastChannelTransport (browser multi-tab live sync via BroadcastChannel(`catan-ne-${roomId}`))
 * - PeerJSTransport (dynamic WebRTC wrapper around peerjs with graceful fallback in Node/non-WebRTC)
 * - MultiplayerHostSession & MultiplayerClientSession (seat tokens, authoritative applyAction on host,
 *   and per-player redacted state broadcasts via redactForPlayer(state, seat)).
 */

import { applyAction } from '../engine/reducer';
import { GameAction, GameState, PlayerId } from '../engine/types';
import { redactForPlayer, RedactedGameState, RedactOptions } from './redact';

// ============================================================================
// Transport Message Protocol & Interface
// ============================================================================

export type TransportMessage =
  | {
      type: 'ACTION_REQUEST';
      roomId: string;
      playerId: PlayerId;
      seatToken: string;
      action: GameAction;
      requestId?: string;
    }
  | {
      type: 'STATE_UPDATE';
      roomId: string;
      targetPlayerId?: PlayerId;
      state: RedactedGameState;
      version: number;
      lastAction?: GameAction;
    }
  | {
      type: 'JOIN_ROOM';
      roomId: string;
      clientId: string;
      playerName: string;
      preferredPlayerId?: PlayerId;
      seatToken?: string;
    }
  | {
      type: 'PLAYER_ASSIGNED';
      roomId: string;
      clientId: string;
      playerId: PlayerId;
      seatToken: string;
      state: RedactedGameState;
      version: number;
    }
  | {
      type: 'PING';
      roomId: string;
      senderId: string;
      timestamp: number;
    };

export interface MultiplayerTransport {
  readonly roomId: string;
  send(message: TransportMessage): void;
  onMessage(handler: (message: TransportMessage) => void): () => void;
  close(): void;
}

// ============================================================================
// MockTransport (Deterministic In-Memory Hub with Reconnect Support)
// ============================================================================

export class MockTransportHub {
  private rooms = new Map<string, Set<MockTransport>>();

  public register(transport: MockTransport): void {
    let peers = this.rooms.get(transport.roomId);
    if (!peers) {
      peers = new Set<MockTransport>();
      this.rooms.set(transport.roomId, peers);
    }
    peers.add(transport);
  }

  public unregister(transport: MockTransport): void {
    const peers = this.rooms.get(transport.roomId);
    if (peers) {
      peers.delete(transport);
      if (peers.size === 0) {
        this.rooms.delete(transport.roomId);
      }
    }
  }

  public broadcast(sender: MockTransport, message: TransportMessage): void {
    const peers = this.rooms.get(sender.roomId);
    if (!peers) return;

    for (const peer of Array.from(peers)) {
      if (peer !== sender && peer.isConnected()) {
        peer.deliver(structuredClone(message));
      }
    }
  }

  public createTransport(roomId: string): MockTransport {
    return new MockTransport(roomId, this);
  }

  public clear(): void {
    this.rooms.clear();
  }
}

const defaultMockHub = new MockTransportHub();

export class MockTransport implements MultiplayerTransport {
  public readonly roomId: string;
  private readonly hub: MockTransportHub;
  private handlers = new Set<(message: TransportMessage) => void>();
  private connected = true;
  private closed = false;

  constructor(roomId: string, hub: MockTransportHub = defaultMockHub) {
    this.roomId = roomId;
    this.hub = hub;
    this.hub.register(this);
  }

  public static clearDefaultHub(): void {
    defaultMockHub.clear();
  }

  public isConnected(): boolean {
    return this.connected && !this.closed;
  }

  /**
   * Simulates a temporary network drop without destroying the transport instance.
   */
  public disconnect(): void {
    this.connected = false;
  }

  /**
   * Restores connectivity after a simulated network drop.
   */
  public reconnect(): void {
    if (this.closed) {
      this.closed = false;
      this.hub.register(this);
    }
    this.connected = true;
  }

  public send(message: TransportMessage): void {
    if (!this.connected || this.closed) return;
    this.hub.broadcast(this, message);
  }

  public onMessage(handler: (message: TransportMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public deliver(message: TransportMessage): void {
    if (!this.connected || this.closed) return;
    for (const handler of Array.from(this.handlers)) {
      handler(message);
    }
  }

  public close(): void {
    this.closed = true;
    this.connected = false;
    this.hub.unregister(this);
    this.handlers.clear();
  }
}

// ============================================================================
// BroadcastChannelTransport (Browser Multi-Tab Sync via `catan-ne-${roomId}`)
// ============================================================================

const fallbackBroadcastHub = new MockTransportHub();

export class BroadcastChannelTransport implements MultiplayerTransport {
  public readonly roomId: string;
  public readonly channelName: string;
  private channel: BroadcastChannel | null = null;
  private fallback: MockTransport | null = null;
  private handlers = new Set<(message: TransportMessage) => void>();
  private closed = false;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.channelName = `catan-ne-${roomId}`;

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event: MessageEvent<TransportMessage>) => {
        if (this.closed || !event.data) return;
        for (const handler of Array.from(this.handlers)) {
          handler(event.data);
        }
      };
    } else {
      this.fallback = new MockTransport(this.channelName, fallbackBroadcastHub);
      this.fallback.onMessage((msg) => {
        if (this.closed) return;
        for (const handler of Array.from(this.handlers)) {
          handler(msg);
        }
      });
    }
  }

  public send(message: TransportMessage): void {
    if (this.closed) return;
    if (this.channel) {
      this.channel.postMessage(structuredClone(message));
    } else if (this.fallback) {
      this.fallback.send(message);
    }
  }

  public onMessage(handler: (message: TransportMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.fallback) {
      this.fallback.close();
      this.fallback = null;
    }
  }
}

// ============================================================================
// PeerJSTransport (Safe WebRTC Wrapper with Graceful Fallback)
// ============================================================================

export interface PeerJSTransportOptions {
  isHost?: boolean;
  hostPeerId?: string;
  enableWebRTC?: boolean;
}

interface MinimalDataConnection {
  send(data: unknown): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  close(): void;
  open?: boolean;
}

interface MinimalPeer {
  id: string;
  connect(peerId: string): MinimalDataConnection;
  on(event: string, cb: (...args: unknown[]) => void): void;
  destroy(): void;
}

export class PeerJSTransport implements MultiplayerTransport {
  public readonly roomId: string;
  private readonly isHost: boolean;
  private readonly hostPeerId: string;
  private localFallback: BroadcastChannelTransport;
  private peer: MinimalPeer | null = null;
  private connections = new Set<MinimalDataConnection>();
  private handlers = new Set<(message: TransportMessage) => void>();
  private closed = false;

  constructor(roomId: string, options?: PeerJSTransportOptions) {
    this.roomId = roomId;
    this.isHost = options?.isHost ?? false;
    this.hostPeerId = options?.hostPeerId ?? `catan-ne-host-${roomId}`;

    // Always attach BroadcastChannelTransport so same-browser tabs and Node tests work seamlessly
    this.localFallback = new BroadcastChannelTransport(roomId);
    this.localFallback.onMessage((msg) => {
      if (this.closed) return;
      for (const handler of Array.from(this.handlers)) {
        handler(msg);
      }
    });

    const canUseWebRTC =
      (options?.enableWebRTC ?? false) &&
      typeof window !== 'undefined' &&
      typeof RTCPeerConnection !== 'undefined';

    if (canUseWebRTC) {
      void this.initPeerJS();
    }
  }

  private async initPeerJS(): Promise<void> {
    try {
      const peerModule = await import('peerjs');
      if (this.closed) return;
      const PeerClass = peerModule.Peer ?? peerModule.default;
      if (!PeerClass) return;

      const peerInstance: MinimalPeer = this.isHost
        ? (new PeerClass(this.hostPeerId) as unknown as MinimalPeer)
        : (new PeerClass() as unknown as MinimalPeer);

      this.peer = peerInstance;

      peerInstance.on('open', () => {
        if (this.closed) return;
        if (!this.isHost) {
          const conn = peerInstance.connect(this.hostPeerId);
          this.registerConnection(conn);
        }
      });

      peerInstance.on('connection', (connArg: unknown) => {
        if (this.closed) return;
        this.registerConnection(connArg as MinimalDataConnection);
      });

      peerInstance.on('error', () => {
        // Fallback to BroadcastChannelTransport remains active
      });
    } catch {
      // Graceful fallback when PeerJS cannot initialize in test/headless environment
    }
  }

  private registerConnection(conn: MinimalDataConnection): void {
    this.connections.add(conn);
    conn.on('data', (data: unknown) => {
      if (this.closed || !data || typeof data !== 'object') return;
      const msg = data as TransportMessage;
      for (const handler of Array.from(this.handlers)) {
        handler(msg);
      }
      // If host receives message from one WebRTC peer, relay to other WebRTC peers if needed
    });
    conn.on('close', () => {
      this.connections.delete(conn);
    });
  }

  public send(message: TransportMessage): void {
    if (this.closed) return;
    this.localFallback.send(message);
    for (const conn of Array.from(this.connections)) {
      try {
        if (conn.open !== false) {
          conn.send(message);
        }
      } catch {
        // Ignore broken peer connection send errors
      }
    }
  }

  public onMessage(handler: (message: TransportMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();
    this.localFallback.close();
    for (const conn of Array.from(this.connections)) {
      try {
        conn.close();
      } catch {
        // Ignore close errors
      }
    }
    this.connections.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.peer = null;
    }
  }
}

// ============================================================================
// MultiplayerHostSession
// ============================================================================

export interface HostSessionOptions {
  roomId: string;
  initialState: GameState;
  transport: MultiplayerTransport;
  /**
   * Seat occupied by the host player themselves (default: 'orange').
   * Pass `null` if the host is acting as a headless arbiter without occupying a seat.
   */
  hostPlayerId?: PlayerId | null;
  hostPlayerName?: string;
  redactOptions?: RedactOptions;
}

export class MultiplayerHostSession {
  public readonly roomId: string;
  public readonly hostPlayerId: PlayerId | null;
  private state: GameState;
  private version = 1;
  private readonly transport: MultiplayerTransport;
  private readonly redactOptions?: RedactOptions;
  private readonly seatTokens = new Map<PlayerId, string>();
  private readonly tokenToPlayer = new Map<string, PlayerId>();
  private readonly clientToPlayer = new Map<string, PlayerId>();
  private readonly lastPingBySender = new Map<string, number>();
  private readonly listeners = new Set<
    (state: GameState, version: number, lastAction?: GameAction) => void
  >();
  private unsubscribeTransport: (() => void) | null = null;
  private tokenCounter = 0;

  constructor(options: HostSessionOptions) {
    this.roomId = options.roomId;
    this.state = structuredClone(options.initialState);
    this.transport = options.transport;
    this.redactOptions = options.redactOptions;
    this.hostPlayerId =
      options.hostPlayerId === undefined
        ? (this.state.playerOrder[0] ?? 'orange')
        : options.hostPlayerId;

    if (this.hostPlayerId !== null && this.state.players[this.hostPlayerId]) {
      const hostToken = `seat-${this.roomId}-${this.hostPlayerId}-host`;
      this.seatTokens.set(this.hostPlayerId, hostToken);
      this.tokenToPlayer.set(hostToken, this.hostPlayerId);
      if (options.hostPlayerName) {
        this.state.players[this.hostPlayerId]!.name = options.hostPlayerName;
      }
    }

    this.unsubscribeTransport = this.transport.onMessage((msg) => {
      this.handleTransportMessage(msg);
    });
  }

  private handleTransportMessage(msg: TransportMessage): void {
    if (msg.roomId !== this.roomId) return;

    switch (msg.type) {
      case 'PING': {
        this.lastPingBySender.set(msg.senderId, msg.timestamp);
        break;
      }

      case 'JOIN_ROOM': {
        this.handleJoinRoom(msg);
        break;
      }

      case 'ACTION_REQUEST': {
        this.handleActionRequest(msg);
        break;
      }

      default:
        break;
    }
  }

  private handleJoinRoom(msg: Extract<TransportMessage, { type: 'JOIN_ROOM' }>): void {
    // 1. Check if client is reconnecting with a valid existing seatToken
    if (msg.seatToken && this.tokenToPlayer.has(msg.seatToken)) {
      const restoredPid = this.tokenToPlayer.get(msg.seatToken)!;
      this.clientToPlayer.set(msg.clientId, restoredPid);
      if (msg.playerName && this.state.players[restoredPid]) {
        this.state.players[restoredPid]!.name = msg.playerName;
      }

      this.transport.send({
        type: 'PLAYER_ASSIGNED',
        roomId: this.roomId,
        clientId: msg.clientId,
        playerId: restoredPid,
        seatToken: msg.seatToken,
        state: redactForPlayer(this.state, restoredPid, this.redactOptions),
        version: this.version,
      });

      this.broadcastStateUpdates();
      return;
    }

    // 2. Check if clientId already has an assigned seat
    const existingByClient = this.clientToPlayer.get(msg.clientId);
    if (existingByClient && this.seatTokens.has(existingByClient)) {
      const token = this.seatTokens.get(existingByClient)!;
      this.transport.send({
        type: 'PLAYER_ASSIGNED',
        roomId: this.roomId,
        clientId: msg.clientId,
        playerId: existingByClient,
        seatToken: token,
        state: redactForPlayer(this.state, existingByClient, this.redactOptions),
        version: this.version,
      });
      return;
    }

    // 3. Assign a new available seat in playerOrder
    let assignedPid: PlayerId | undefined;
    if (
      msg.preferredPlayerId &&
      this.state.playerOrder.includes(msg.preferredPlayerId) &&
      !this.seatTokens.has(msg.preferredPlayerId)
    ) {
      assignedPid = msg.preferredPlayerId;
    } else {
      assignedPid = this.state.playerOrder.find((pid) => !this.seatTokens.has(pid));
    }

    if (!assignedPid) {
      return; // Room is full
    }

    this.tokenCounter++;
    const seatToken = `seat-${this.roomId}-${assignedPid}-${this.tokenCounter}`;
    this.seatTokens.set(assignedPid, seatToken);
    this.tokenToPlayer.set(seatToken, assignedPid);
    this.clientToPlayer.set(msg.clientId, assignedPid);

    if (msg.playerName && this.state.players[assignedPid]) {
      this.state.players[assignedPid]!.name = msg.playerName;
    }

    this.transport.send({
      type: 'PLAYER_ASSIGNED',
      roomId: this.roomId,
      clientId: msg.clientId,
      playerId: assignedPid,
      seatToken,
      state: redactForPlayer(this.state, assignedPid, this.redactOptions),
      version: this.version,
    });

    this.broadcastStateUpdates();
  }

  private handleActionRequest(msg: Extract<TransportMessage, { type: 'ACTION_REQUEST' }>): void {
    const expectedToken = this.seatTokens.get(msg.playerId);
    if (!expectedToken || expectedToken !== msg.seatToken) {
      return; // Reject unauthorized seat token
    }
    if (msg.action.playerId !== msg.playerId) {
      return; // Reject mismatched playerId in action payload
    }

    this.applyAction(msg.action);
  }

  /**
   * Applies an authoritative action on the host, increments version, notifies host listeners,
   * and broadcasts per-player redacted state updates to all seats.
   */
  public applyAction(action: GameAction): GameState {
    this.state = applyAction(this.state, action);
    this.version++;

    for (const listener of Array.from(this.listeners)) {
      listener(this.state, this.version, action);
    }

    this.broadcastStateUpdates(action);
    return this.state;
  }

  public broadcastStateUpdates(lastAction?: GameAction): void {
    for (const pid of this.state.playerOrder) {
      if (!this.seatTokens.has(pid)) continue;
      if (pid === this.hostPlayerId) continue; // Host already has local state

      const redacted = redactForPlayer(this.state, pid, this.redactOptions);
      this.transport.send({
        type: 'STATE_UPDATE',
        roomId: this.roomId,
        targetPlayerId: pid,
        state: redacted,
        version: this.version,
        lastAction,
      });
    }
  }

  public getState(): GameState {
    return this.state;
  }

  public getRedactedState(playerId: PlayerId): RedactedGameState {
    return redactForPlayer(this.state, playerId, this.redactOptions);
  }

  public getVersion(): number {
    return this.version;
  }

  public getSeatToken(playerId: PlayerId): string | undefined {
    return this.seatTokens.get(playerId);
  }

  public getAssignedPlayers(): PlayerId[] {
    return Array.from(this.seatTokens.keys());
  }

  public getLastPing(senderId: string): number | undefined {
    return this.lastPingBySender.get(senderId);
  }

  public onStateChange(
    listener: (state: GameState, version: number, lastAction?: GameAction) => void
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public close(): void {
    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }
    this.listeners.clear();
  }
}

// ============================================================================
// MultiplayerClientSession
// ============================================================================

export interface ClientSessionOptions {
  roomId: string;
  transport: MultiplayerTransport;
  clientId?: string;
  playerName?: string;
  seatToken?: string;
  playerId?: PlayerId;
}

let clientCounter = 0;

export class MultiplayerClientSession {
  public readonly roomId: string;
  public readonly clientId: string;
  private playerName: string;
  private transport: MultiplayerTransport;
  private playerId: PlayerId | null = null;
  private seatToken: string | null = null;
  private state: RedactedGameState | null = null;
  private version = 0;
  private unsubscribeTransport: (() => void) | null = null;
  private readonly stateListeners = new Set<
    (state: RedactedGameState, version: number, lastAction?: GameAction) => void
  >();
  private readonly assignmentListeners = new Set<
    (playerId: PlayerId, seatToken: string, state: RedactedGameState) => void
  >();

  constructor(options: ClientSessionOptions) {
    this.roomId = options.roomId;
    clientCounter++;
    this.clientId = options.clientId ?? `client-${this.roomId}-${clientCounter}`;
    this.playerName = options.playerName ?? `Player ${clientCounter}`;
    this.transport = options.transport;
    this.seatToken = options.seatToken ?? null;
    this.playerId = options.playerId ?? null;

    this.bindTransport(this.transport);
  }

  private bindTransport(transport: MultiplayerTransport): void {
    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
    }
    this.transport = transport;
    this.unsubscribeTransport = this.transport.onMessage((msg) => {
      this.handleTransportMessage(msg);
    });
  }

  private handleTransportMessage(msg: TransportMessage): void {
    if (msg.roomId !== this.roomId) return;

    if (msg.type === 'PLAYER_ASSIGNED') {
      const matchesClient = msg.clientId === this.clientId;
      const matchesToken = this.seatToken !== null && msg.seatToken === this.seatToken;
      if (matchesClient || matchesToken) {
        this.playerId = msg.playerId;
        this.seatToken = msg.seatToken;
        this.state = msg.state;
        this.version = msg.version;

        for (const listener of Array.from(this.assignmentListeners)) {
          listener(this.playerId, this.seatToken, this.state);
        }
        for (const listener of Array.from(this.stateListeners)) {
          listener(this.state, this.version);
        }
      }
      return;
    }

    if (msg.type === 'STATE_UPDATE') {
      if (this.playerId && (!msg.targetPlayerId || msg.targetPlayerId === this.playerId)) {
        if (msg.version >= this.version) {
          this.state = msg.state;
          this.version = msg.version;
          for (const listener of Array.from(this.stateListeners)) {
            listener(this.state, this.version, msg.lastAction);
          }
        }
      }
    }
  }

  public joinRoom(options?: {
    playerName?: string;
    preferredPlayerId?: PlayerId;
    seatToken?: string;
  }): void {
    if (options?.playerName) {
      this.playerName = options.playerName;
    }
    const tokenToUse = options?.seatToken ?? this.seatToken ?? undefined;
    this.transport.send({
      type: 'JOIN_ROOM',
      roomId: this.roomId,
      clientId: this.clientId,
      playerName: this.playerName,
      preferredPlayerId: options?.preferredPlayerId ?? this.playerId ?? undefined,
      seatToken: tokenToUse,
    });
  }

  /**
   * Reconnects to the room using the saved seatToken (optionally over a new transport instance).
   */
  public reconnect(newTransport?: MultiplayerTransport): void {
    if (newTransport) {
      this.bindTransport(newTransport);
    }
    this.joinRoom({
      playerName: this.playerName,
      preferredPlayerId: this.playerId ?? undefined,
      seatToken: this.seatToken ?? undefined,
    });
  }

  public sendAction(action: GameAction): void {
    if (!this.playerId || !this.seatToken) {
      throw new Error('Cannot send action before seat assignment');
    }
    this.transport.send({
      type: 'ACTION_REQUEST',
      roomId: this.roomId,
      playerId: this.playerId,
      seatToken: this.seatToken,
      action,
    });
  }

  public ping(timestamp: number = Date.now()): void {
    this.transport.send({
      type: 'PING',
      roomId: this.roomId,
      senderId: this.clientId,
      timestamp,
    });
  }

  public getState(): RedactedGameState | null {
    return this.state;
  }

  public getPlayerId(): PlayerId | null {
    return this.playerId;
  }

  public getSeatToken(): string | null {
    return this.seatToken;
  }

  public getVersion(): number {
    return this.version;
  }

  public onStateUpdate(
    listener: (state: RedactedGameState, version: number, lastAction?: GameAction) => void
  ): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onAssigned(
    listener: (playerId: PlayerId, seatToken: string, state: RedactedGameState) => void
  ): () => void {
    this.assignmentListeners.add(listener);
    return () => {
      this.assignmentListeners.delete(listener);
    };
  }

  public close(): void {
    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }
    this.stateListeners.clear();
    this.assignmentListeners.clear();
  }
}
