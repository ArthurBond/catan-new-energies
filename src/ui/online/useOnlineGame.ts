/**
 * CATAN: New Energies — browser side of the host's game server (`server/`).
 *
 * `detectGameServer` decides at startup whether the page was served by the game server (online
 * mode) or by anything else (`npm run dev`, a static host: offline mode, unchanged).
 * `useOnlineGame` owns the WebSocket: hello with name, seat token and host key, auto-reconnect with
 * backoff (never after close code 4000, when the seat was opened in another window), and the
 * latest lobby and hydrated game state.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { EventDiscType, GameAction, GameState, PlayerId } from '../../engine/types';
import { hydrateRedactedState } from '../../network/hydrate';
import {
  SEAT_TOKEN_STORAGE_KEY,
  SERVER_APP_ID,
  serverWebSocketUrl,
  type ClientMessage,
  type LobbyMessage,
  type ServerInfo,
  type ServerMessage,
} from '../../network/server-protocol';

export const ONLINE_NAME_STORAGE_KEY = 'catan-ne-online-name';
export const HOST_KEY_STORAGE_KEY = 'catan-ne-online-host-key';

/** Close code the server uses when this seat was opened in another window. */
export const SEAT_TAKEN_OVER_CLOSE_CODE = 4000;

const RECONNECT_DELAYS_MS = [400, 1000, 2000, 4000, 8000];
/** After this many failed attempts in a row the badge says "Offline" (it keeps retrying). */
const OFFLINE_AFTER_ATTEMPTS = 3;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'replaced';

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

/** `ServerInfo` when this page is served by the game server, otherwise null (offline mode). */
export async function detectGameServer(timeoutMs = 1500): Promise<ServerInfo | null> {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch('/api/server-info', { cache: 'no-store', signal: controller?.signal });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const body = (await res.json()) as Partial<ServerInfo>;
    if (body?.app !== SERVER_APP_ID) return null;
    return {
      app: SERVER_APP_ID,
      protocolVersion: Number(body.protocolVersion) || 0,
      port: Number(body.port) || 0,
      lanUrls: Array.isArray(body.lanUrls) ? body.lanUrls.filter((u) => typeof u === 'string') : [],
      started: body.started === true,
    };
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

/** One `state` frame, hydrated for the UI. */
export interface OnlineGameUpdate {
  state: GameState;
  /** The state before `lastAction` (null on a resync or a fresh game). */
  prev: GameState | null;
  version: number;
  lastAction: GameAction | null;
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
}

export function useOnlineGame(info: ServerInfo): OnlineSession {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [game, setGame] = useState<OnlineGameUpdate | null>(null);
  const [notice, setNotice] = useState<OnlineNotice | null>(null);
  const [name, setNameState] = useState<string>(() => readStorage(ONLINE_NAME_STORAGE_KEY) ?? '');

  const wsRef = useRef<WebSocket | null>(null);
  const hostKeyRef = useRef<string | null>(null);
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
      case 'welcome': {
        setIsHost(msg.isHost);
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

  const scheduleReconnect = () => {
    if (stoppedRef.current || retryTimerRef.current) return;
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
    ws.onopen = () => {
      attemptsRef.current = 0;
      setStatus('connected');
      const hostKey = hostKeyRef.current;
      const hello: ClientMessage = {
        type: 'hello',
        name: nameRef.current.trim() || (hostKey ? 'Host' : ''),
        seatToken: readStorage(SEAT_TOKEN_STORAGE_KEY),
        hostKey,
      };
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (ev) => {
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
        setStatus('replaced');
        return;
      }
      scheduleReconnect();
    };
  };

  useEffect(() => {
    stoppedRef.current = false;
    hostKeyRef.current = takeHostKeyFromUrl();
    connectRef.current();
    // Coming back online (Wi-Fi reconnects): try straight away instead of waiting for the backoff
    const onOnline = () => {
      if (wsRef.current) return;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      connectRef.current();
    };
    window.addEventListener('online', onOnline);
    return () => {
      stoppedRef.current = true;
      window.removeEventListener('online', onOnline);
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
    setStatus('connecting');
    connectRef.current();
  }, []);

  return { info, status, isHost, playerId, lobby, game, notice, name, setName, send, sendAction, reconnect };
}
