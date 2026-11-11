/**
 * CATAN: New Energies — browser side of the host's game server (`server/`).
 *
 * `detectGameServer` decides at startup whether the page was served by the game server (online
 * mode) or by anything else (`npm run dev`, a static host: offline mode, unchanged).
 * `useOnlineGame` owns the WebSocket: hello with name, seat token, host key and invite code,
 * auto-reconnect with backoff (never after close code 4000, when the seat was opened in another
 * window), and the latest lobby and hydrated game state.
 *
 * Friends play from other networks, on phones and laptops that sleep and change Wi-Fi. So the
 * hook also pings the server: a connection that went quiet without closing is dropped and
 * reopened within seconds, and coming back to the tab or back online checks the line at once.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { EventDiscType, GameAction, GameState, PlayerId } from '../../engine/types';
import { hydrateRedactedState } from '../../network/hydrate';
import type { RedactedGameAction } from '../../network/redact';
import {
  CLOSE_SEAT_TAKEN_OVER,
  INVITE_QUERY_PARAM,
  normalizeInviteCode,
  SEAT_TOKEN_STORAGE_KEY,
  SERVER_APP_ID,
  SERVER_INFO_META_NAME,
  serverWebSocketUrl,
  type ClientMessage,
  type DeniedMessage,
  type LobbyMessage,
  type ServerInfo,
  type ServerMessage,
  type ShareInfo,
  type ShareMode,
} from '../../network/server-protocol';

export const ONLINE_NAME_STORAGE_KEY = 'catan-ne-online-name';
export const HOST_KEY_STORAGE_KEY = 'catan-ne-online-host-key';
export const INVITE_CODE_STORAGE_KEY = 'catan-ne-online-invite';

/** Close code the server uses when this seat was opened in another window. */
export const SEAT_TAKEN_OVER_CLOSE_CODE = CLOSE_SEAT_TAKEN_OVER;

const RECONNECT_DELAYS_MS = [400, 1000, 2000, 4000, 8000];
/** After this many failed attempts in a row the badge says "Offline" (it keeps retrying). */
const OFFLINE_AFTER_ATTEMPTS = 3;

/** How often the heartbeat looks at the connection. */
export const HEARTBEAT_TICK_MS = 1000;
/** A ping goes out when nothing was sent for this long (also keeps tunnels from closing an idle line). */
export const PING_EVERY_MS = 10_000;
/** No word from the server this long after a ping: the connection is dead, open a new one. */
export const PONG_TIMEOUT_MS = 8000;
/** The same, when the tab was just brought back or the device came back online. */
export const PROBE_TIMEOUT_MS = 4000;
/** A connection attempt that has not opened after this long is given up and started again. */
export const CONNECT_TIMEOUT_MS = 10_000;
/** The same, when the tab was just brought back or the device came back online (new network). */
export const CONNECT_PROBE_TIMEOUT_MS = 3000;

/** `denied`: the server wants the invite code before it shows anything. */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'replaced' | 'denied';

/** Why the server refused this browser; the invite screen shows `message`. */
export type InviteDenial = Pick<DeniedMessage, 'reason' | 'message' | 'retryAfterSeconds'>;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode / storage disabled: the seat simply will not survive a reload.
  }
}

const SHARE_MODES: readonly ShareMode[] = ['lan', 'tailnet', 'online'];

/** A clean `ServerInfo` out of untrusted JSON, or null when it is not this game's server. */
export function parseServerInfo(raw: unknown): ServerInfo | null {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<ServerInfo>;
  if (body.app !== SERVER_APP_ID) return null;
  return {
    app: SERVER_APP_ID,
    protocolVersion: Number(body.protocolVersion) || 0,
    port: Number(body.port) || 0,
    lanUrls: Array.isArray(body.lanUrls) ? body.lanUrls.filter((u) => typeof u === 'string') : [],
    started: body.started === true,
    inviteRequired: body.inviteRequired === true,
    share: SHARE_MODES.includes(body.share as ShareMode) ? (body.share as ShareMode) : 'lan',
  };
}

/**
 * The `ServerInfo` the game server wrote into the page itself (see `injectServerInfo`). With it
 * the page knows it is online before any request, however slow the friend's connection is.
 */
export function readEmbeddedServerInfo(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): ServerInfo | null {
  const content = doc?.querySelector(`meta[name="${SERVER_INFO_META_NAME}"]`)?.getAttribute('content');
  if (!content) return null;
  try {
    return parseServerInfo(JSON.parse(content));
  } catch {
    return null;
  }
}

/** `ServerInfo` when this page is served by the game server, otherwise null (offline mode). */
export async function detectGameServer(timeoutMs = 1500): Promise<ServerInfo | null> {
  const embedded = readEmbeddedServerInfo();
  if (embedded) return embedded;
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch('/api/server-info', { cache: 'no-store', signal: controller?.signal });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return parseServerInfo(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The host key: taken from `?host=` once, kept in localStorage, and removed from the address bar
 * so it is not shared by accident (e.g. when the host copies the page address).
 */
export function takeHostKeyFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('host');
  if (fromUrl) {
    writeStorage(HOST_KEY_STORAGE_KEY, fromUrl);
    url.searchParams.delete('host');
    try {
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Ignore: the key still works, it just stays visible.
    }
    return fromUrl;
  }
  return readStorage(HOST_KEY_STORAGE_KEY);
}

/**
 * The invite code: taken from `?join=` in the link the host sent, kept in localStorage so a
 * reload or a reconnect needs no typing, and removed from the address bar so a screenshot or a
 * shared screen does not hand it on.
 */
export function takeInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const fromUrl = normalizeInviteCode(url.searchParams.get(INVITE_QUERY_PARAM));
  if (url.searchParams.has(INVITE_QUERY_PARAM)) {
    url.searchParams.delete(INVITE_QUERY_PARAM);
    try {
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Ignore: the code still works, it just stays visible.
    }
  }
  if (fromUrl) {
    writeStorage(INVITE_CODE_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return normalizeInviteCode(readStorage(INVITE_CODE_STORAGE_KEY)) || null;
}

/** One `state` frame, hydrated for the UI. */
export interface OnlineGameUpdate {
  state: GameState;
  /** The state before `lastAction` (null on a resync or a fresh game). */
  prev: GameState | null;
  version: number;
  lastAction: RedactedGameAction | null;
  drawnEventDisc: EventDiscType | null;
  yourPlayerId: PlayerId | null;
}

export interface OnlineNotice {
  id: number;
  kind: 'rejected' | 'error';
  message: string;
}

export interface OnlineSession {
  info: ServerInfo;
  status: ConnectionStatus;
  isHost: boolean;
  playerId: PlayerId | null;
  lobby: LobbyMessage | null;
  game: OnlineGameUpdate | null;
  notice: OnlineNotice | null;
  /** The name this browser plays under (stored locally; sent with hello and seat claims). */
  name: string;
  setName: (name: string) => void;
  send: (msg: ClientMessage) => boolean;
  sendAction: (action: GameAction) => void;
  /** Reconnect now, also after the seat was opened in another window ("Use this window"). */
  reconnect: () => void;
  /** Set while the server is refusing this browser for want of the right invite code. */
  denied: InviteDenial | null;
  /** Try this invite code (typed into the invite screen). */
  submitInviteCode: (code: string) => void;
  /** Host only: the links and code to pass on to friends. */
  share: ShareInfo | null;
}

export function useOnlineGame(info: ServerInfo): OnlineSession {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [game, setGame] = useState<OnlineGameUpdate | null>(null);
  const [notice, setNotice] = useState<OnlineNotice | null>(null);
  const [name, setNameState] = useState<string>(() => readStorage(ONLINE_NAME_STORAGE_KEY) ?? '');
  const [denied, setDenied] = useState<InviteDenial | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const hostKeyRef = useRef<string | null>(null);
  const inviteCodeRef = useRef<string | null>(null);
  /** True while the invite screen is up: no automatic reconnecting behind it. */
  const deniedRef = useRef(false);
  /** True after this seat was opened in another window: only "Use this window" reconnects. */
  const replacedRef = useRef(false);
  /** When the current socket was created (a stuck connection attempt is abandoned). */
  const connectStartedRef = useRef(0);
  /** Heartbeat: when the last ping went out, and since when an answer is overdue. */
  const lastSentRef = useRef(0);
  const awaitingRef = useRef<{ since: number; timeoutMs: number } | null>(null);
  const nameRef = useRef(name);
  const attemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const gameRef = useRef<OnlineGameUpdate | null>(null);
  const requestSeqRef = useRef(0);
  const noticeSeqRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});

  const pushNotice = (kind: OnlineNotice['kind'], message: string) =>
    setNotice({ id: ++noticeSeqRef.current, kind, message });

  const handleMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'pong':
        return;
      case 'denied': {
        deniedRef.current = true;
        // A code the server calls wrong is not worth keeping (the host may have made a new one).
        if (msg.reason === 'wrong') {
          inviteCodeRef.current = null;
          writeStorage(INVITE_CODE_STORAGE_KEY, null);
        }
        setDenied({ reason: msg.reason, message: msg.message, retryAfterSeconds: msg.retryAfterSeconds });
        setStatus('denied');
        return;
      }
      case 'share':
        setShare(msg.share);
        return;
      case 'welcome': {
        deniedRef.current = false;
        setDenied(null);
        setStatus('connected');
        setIsHost(msg.isHost);
        if (!msg.isHost) setShare(null);
        setPlayerId(msg.playerId);
        if (msg.seatToken) writeStorage(SEAT_TOKEN_STORAGE_KEY, msg.seatToken);
        else if (!msg.isHost) writeStorage(SEAT_TOKEN_STORAGE_KEY, null);
        // A stale host key (e.g. the saves folder was deleted) must not be sent forever.
        if (!msg.isHost && hostKeyRef.current) {
          hostKeyRef.current = null;
          writeStorage(HOST_KEY_STORAGE_KEY, null);
        }
        return;
      }
      case 'lobby':
        setLobby(msg);
        if (!msg.started) {
          gameRef.current = null;
          setGame(null);
        }
        return;
      case 'state': {
        const before = gameRef.current;
        const state = hydrateRedactedState(msg.state, msg.yourPlayerId);
        const continues = msg.lastAction !== null && before !== null && msg.version === before.version + 1;
        const update: OnlineGameUpdate = {
          state,
          prev: continues ? before.state : null,
          version: msg.version,
          lastAction: continues ? msg.lastAction : null,
          drawnEventDisc: continues ? msg.drawnEventDisc : null,
          yourPlayerId: msg.yourPlayerId,
        };
        gameRef.current = update;
        setGame(update);
        return;
      }
      case 'rejected':
        pushNotice('rejected', msg.message);
        return;
      case 'error':
        pushNotice('error', msg.message);
        return;
    }
  };
  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  const sendHello = (ws: WebSocket) => {
    const hostKey = hostKeyRef.current;
    const hello: ClientMessage = {
      type: 'hello',
      name: nameRef.current.trim() || (hostKey ? 'Host' : ''),
      seatToken: readStorage(SEAT_TOKEN_STORAGE_KEY),
      hostKey,
      inviteCode: inviteCodeRef.current,
    };
    ws.send(JSON.stringify(hello));
    lastSentRef.current = Date.now();
  };

  const scheduleReconnect = () => {
    if (stoppedRef.current || retryTimerRef.current || deniedRef.current || replacedRef.current) return;
    const attempt = attemptsRef.current++;
    setStatus(attempt + 1 >= OFFLINE_AFTER_ATTEMPTS ? 'offline' : 'reconnecting');
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]!;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      connectRef.current();
    }, delay);
  };

  connectRef.current = () => {
    if (stoppedRef.current) return;
    const old = wsRef.current;
    if (old && (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING)) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverWebSocketUrl(window.location));
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;
    awaitingRef.current = null;
    connectStartedRef.current = Date.now();
    ws.onopen = () => {
      attemptsRef.current = 0;
      // "Connected" is only shown once the server has let this browser in (see `welcome`).
      sendHello(ws);
    };
    ws.onmessage = (ev) => {
      // Any word from the server proves the line is alive.
      awaitingRef.current = null;
      try {
        handleMessageRef.current(JSON.parse(String(ev.data)) as ServerMessage);
      } catch (err) {
        console.warn('Bad message from the game server:', err);
      }
    };
    ws.onclose = (ev) => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (ev.code === SEAT_TAKEN_OVER_CLOSE_CODE) {
        replacedRef.current = true;
        setStatus('replaced');
        return;
      }
      scheduleReconnect();
    };
  };

  /** Gives up on a connection that stopped answering and opens a new one straight away. */
  const dropDeadConnection = (ws: WebSocket) => {
    if (wsRef.current !== ws) return;
    wsRef.current = null;
    awaitingRef.current = null;
    // A dead line may take minutes to finish closing: do not wait for `onclose`.
    ws.onopen = null;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // Already closing.
    }
    scheduleReconnect();
  };

  const sendPing = (ws: WebSocket, timeoutMs: number) => {
    const now = Date.now();
    try {
      ws.send(JSON.stringify({ type: 'ping', t: now } satisfies ClientMessage));
    } catch {
      dropDeadConnection(ws);
      return;
    }
    lastSentRef.current = now;
    const waiting = awaitingRef.current;
    // An answer already overdue keeps its own, earlier deadline.
    if (!waiting || now + timeoutMs < waiting.since + waiting.timeoutMs) awaitingRef.current = { since: now, timeoutMs };
  };

  useEffect(() => {
    stoppedRef.current = false;
    hostKeyRef.current = takeHostKeyFromUrl();
    inviteCodeRef.current = takeInviteCodeFromUrl();
    connectRef.current();

    const heartbeat = setInterval(() => {
      const ws = wsRef.current;
      if (!ws) return;
      const now = Date.now();
      // An attempt that never opens (the network changed under it) would otherwise hang for
      // as long as the system allows, which can be minutes.
      if (ws.readyState === WebSocket.CONNECTING) {
        if (now - connectStartedRef.current > CONNECT_TIMEOUT_MS) dropDeadConnection(ws);
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      const waiting = awaitingRef.current;
      if (waiting) {
        if (now - waiting.since > waiting.timeoutMs) dropDeadConnection(ws);
      } else if (now - lastSentRef.current >= PING_EVERY_MS) {
        sendPing(ws, PONG_TIMEOUT_MS);
      }
    }, HEARTBEAT_TICK_MS);

    // Back online, back on this tab, or restored from the back/forward cache: the old connection
    // may be gone without a word (new Wi-Fi, phone woke up). Reconnect now, or check the line.
    const connectNow = () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      connectRef.current();
    };
    const checkNow = () => {
      // Not behind the invite screen, and never for a window that was told its seat is open
      // elsewhere: that one waits for "Use this window".
      if (stoppedRef.current || deniedRef.current || replacedRef.current) return;
      const ws = wsRef.current;
      if (!ws) {
        connectNow();
      } else if (ws.readyState === WebSocket.OPEN) {
        sendPing(ws, PROBE_TIMEOUT_MS);
      } else if (ws.readyState === WebSocket.CONNECTING && Date.now() - connectStartedRef.current > CONNECT_PROBE_TIMEOUT_MS) {
        // Still trying over the network the device just left: start again on the new one.
        dropDeadConnection(ws);
        connectNow();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkNow();
    };
    window.addEventListener('online', checkNow);
    window.addEventListener('pageshow', checkNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stoppedRef.current = true;
      clearInterval(heartbeat);
      window.removeEventListener('online', checkNow);
      window.removeEventListener('pageshow', checkNow);
      document.removeEventListener('visibilitychange', onVisible);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pushNotice('error', 'Not connected to the host right now. Trying again…');
      return false;
    }
    ws.send(JSON.stringify(msg));
    lastSentRef.current = Date.now();
    return true;
  }, []);

  const sendAction = useCallback(
    (action: GameAction) => {
      send({ type: 'action', action, requestId: `r${++requestSeqRef.current}` });
    },
    [send]
  );

  const setName = useCallback((next: string) => {
    nameRef.current = next;
    setNameState(next);
    writeStorage(ONLINE_NAME_STORAGE_KEY, next.trim() ? next : null);
  }, []);

  const reconnect = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    attemptsRef.current = 0;
    replacedRef.current = false;
    setStatus('connecting');
    connectRef.current();
  }, []);

  const submitInviteCode = useCallback((code: string) => {
    const clean = normalizeInviteCode(code);
    if (!clean) return;
    inviteCodeRef.current = clean;
    writeStorage(INVITE_CODE_STORAGE_KEY, clean);
    deniedRef.current = false;
    setDenied(null);
    setStatus('connecting');
    const ws = wsRef.current;
    // The refused socket is normally still open: say hello again on it. If the server closed it
    // while the code was being typed, open a new one (which says hello by itself).
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendHello(ws);
    } else {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      attemptsRef.current = 0;
      connectRef.current();
    }
  }, []);

  return {
    info,
    status,
    isHost,
    playerId,
    lobby,
    game,
    notice,
    name,
    setName,
    send,
    sendAction,
    reconnect,
    denied,
    submitInviteCode,
    share,
  };
}
