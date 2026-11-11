/**
 * CATAN: New Energies — wire protocol between the browser and the game server (`server/`).
 *
 * JSON messages over a WebSocket at `/ws`. Shared by the Node server and the browser client, so
 * this file must stay free of Node and DOM imports (types and tiny pure helpers only).
 * The server is authoritative: it validates every action and sends each socket only its own
 * redacted view of the game (`redactForPlayer`).
 */

import type { StartingPlacement } from '../engine/setup';
import type { EventDiscType, GameAction, PlayerId } from '../engine/types';
import type { RedactedGameAction, RedactedGameState } from './redact';

/** Bumped when a message shape changes incompatibly. */
export const SERVER_PROTOCOL_VERSION = 2;

/** Value of `app` in `GET /api/server-info`; the client uses it to detect online mode. */
export const SERVER_APP_ID = 'catan-new-energies';

export const SERVER_DEFAULT_PORT = 3210;

/** Suggested browser `localStorage` key for the seat token (one server per origin). */
export const SEAT_TOKEN_STORAGE_KEY = 'catan-ne-online-seat-token';

/** Query parameter that carries the invite code in the link the host sends (`?join=ABCD-EFGH`). */
export const INVITE_QUERY_PARAM = 'join';

/** `<meta name>` the game server adds to the page it serves; its content is a JSON `ServerInfo`. */
export const SERVER_INFO_META_NAME = 'catan-game-server';

/** WebSocket close codes the server uses (4000-4999 are free for applications). */
export const CLOSE_SEAT_TAKEN_OVER = 4000;
/** The socket never said a valid hello (for example it sat on the invite prompt). */
export const CLOSE_HELLO_TIMEOUT = 4002;
/** The socket sent messages far faster than a person can play. */
export const CLOSE_TOO_MANY_MESSAGES = 4003;

export const ALL_PLAYER_IDS: readonly PlayerId[] = ['orange', 'purple', 'pink', 'blue'];

export type OnlineBotStrategy = 'Balanced' | 'GreenInnovator' | 'IndustrialExpansionist';
export type OnlineBotDifficulty = 'easy' | 'normal' | 'hard';
export type OnlineBotSpeed = 'normal' | 'fast' | 'instant';

/** Same shape as the UI's `SeatConfig` (src/ui/Modals.tsx). */
export interface OnlineSeatConfig {
  playerId: PlayerId;
  /** Name used for bots and for human seats nobody has claimed yet. */
  name: string;
  controller: 'human' | 'bot';
  botStrategy: OnlineBotStrategy;
  botDifficulty: OnlineBotDifficulty;
}

/**
 * Everything needed to create a game the way the UI does (`createGameFromConfig`): a subset of
 * the UI's `LobbyConfig` plus `hostPlayerId`. Plain JSON.
 */
export interface OnlineLobbyConfig {
  playerCount: 3 | 4;
  setupMode: 'first' | 'standard';
  placement: StartingPlacement;
  seed: number;
  botSpeed: OnlineBotSpeed;
  /** The seat the host plays. Must be a human seat that is part of the game. */
  hostPlayerId: PlayerId;
  seats: Record<PlayerId, OnlineSeatConfig>;
}

export type SeatRole = 'host' | 'friend' | 'bot';

export interface SeatInfo {
  playerId: PlayerId;
  role: SeatRole;
  /** Claimant's name for claimed human seats, otherwise the configured name. */
  name: string;
  claimed: boolean;
  connected: boolean;
}

/** How the host shares the game: home network, private Tailscale network, or a public link. */
export type ShareMode = 'lan' | 'tailnet' | 'online';

export interface ServerInfo {
  app: typeof SERVER_APP_ID;
  protocolVersion: number;
  port: number;
  /** Addresses on the host's own network. Only sent to a browser on the host's computer. */
  lanUrls: string[];
  started: boolean;
  /** Friends need the invite code (in their link, or typed in) before they see the lobby. */
  inviteRequired: boolean;
  share: ShareMode;
}

export interface ShareLink {
  /** Complete link a friend can open. It already carries the invite code when one is needed. */
  url: string;
  kind: ShareMode;
  /** Plain-language description, for example "Works from any network". */
  label: string;
}

/** What the host needs to invite friends. Only ever sent to a socket that holds the host key. */
export interface ShareInfo {
  mode: ShareMode;
  /** Best link first. Empty while the online link is still being set up. */
  links: ShareLink[];
  /** Formatted invite code (`ABCD-EFGH`), or null when no code is needed. */
  inviteCode: string | null;
  /** One line about the current state, for example "Setting up the online link…". */
  status: string | null;
}

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'hello'; name: string; seatToken?: string | null; hostKey?: string | null; inviteCode?: string | null }
  /** Keep-alive and dead-connection check; the server answers with `pong` and the same `t`. */
  | { type: 'ping'; t?: number }
  | { type: 'claimSeat'; playerId: PlayerId; name?: string }
  | { type: 'leaveSeat' }
  | { type: 'configure'; config: OnlineLobbyConfig }
  | { type: 'start' }
  | { type: 'action'; action: GameAction; requestId?: string }
  | { type: 'newGame' };

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

export interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: number;
  clientId: string;
  isHost: boolean;
  /** The seat this socket controls, or null while unseated. */
  playerId: PlayerId | null;
  /** Store this (e.g. under SEAT_TOKEN_STORAGE_KEY) and send it in the next `hello`. */
  seatToken: string | null;
}

export interface LobbyMessage {
  type: 'lobby';
  config: OnlineLobbyConfig;
  seats: SeatInfo[];
  started: boolean;
}

export interface StateMessage {
  type: 'state';
  state: RedactedGameState;
  /** Increments by one per applied action; resets to 0 when a new game starts. */
  version: number;
  /** The action that produced this state (null for a fresh game or a resync). */
  lastAction: RedactedGameAction | null;
  /**
   * The event disc that `lastAction` took out of the bag (now public), if any. The redacted state
   * has no `eventBag`, so the client cannot diff the bag itself.
   */
  drawnEventDisc: EventDiscType | null;
  yourPlayerId: PlayerId | null;
}

/** The hello was refused: the socket stays open so the browser can say hello again with a code. */
export interface DeniedMessage {
  type: 'denied';
  /** `missing`: no code sent. `wrong`: not the code. `locked`: too many wrong codes, wait. */
  reason: 'missing' | 'wrong' | 'locked';
  message: string;
  /** For `locked`: how long until codes are accepted again. */
  retryAfterSeconds: number | null;
}

export interface PongMessage {
  type: 'pong';
  t: number | null;
}

/** Host only: the links and invite code to send to friends (re-sent when they change). */
export interface ShareMessage {
  type: 'share';
  share: ShareInfo;
}

export interface RejectedMessage {
  type: 'rejected';
  requestId: string | null;
  message: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | LobbyMessage
  | StateMessage
  | RejectedMessage
  | ErrorMessage
  | DeniedMessage
  | PongMessage
  | ShareMessage;

/** Default lobby: host plays orange, the other three seats are bots. */
export function createDefaultOnlineLobbyConfig(seed = 1): OnlineLobbyConfig {
  const seat = (
    playerId: PlayerId,
    name: string,
    controller: OnlineSeatConfig['controller'],
    botStrategy: OnlineBotStrategy,
    botDifficulty: OnlineBotDifficulty
  ): OnlineSeatConfig => ({ playerId, name, controller, botStrategy, botDifficulty });
  return {
    playerCount: 4,
    setupMode: 'standard',
    placement: 'draft',
    seed,
    botSpeed: 'normal',
    hostPlayerId: 'orange',
    seats: {
      orange: seat('orange', 'Orange', 'human', 'Balanced', 'normal'),
      purple: seat('purple', 'Purple', 'bot', 'GreenInnovator', 'normal'),
      pink: seat('pink', 'Pink', 'bot', 'IndustrialExpansionist', 'normal'),
      blue: seat('blue', 'Blue', 'bot', 'Balanced', 'hard'),
    },
  };
}

/**
 * How long a bot waits before each step (setup placements are paced slower so people can follow
 * them). Used by the in-browser bots (TabletopApp) and the game server (`botDelayForSpeed`).
 * The stored keys predate the current pacing: 'normal' is shown as "Relaxed", 'fast' as "Fast".
 */
export function botStepDelayMs(speed: OnlineBotSpeed, isSetup: boolean): number {
  if (speed === 'instant') return 10;
  if (speed === 'fast') return isSetup ? 950 : 600;
  return isSetup ? 2000 : 1400;
}

/** Seats taking part in a game with this config, in turn order. */
export function activeSeatIds(config: Pick<OnlineLobbyConfig, 'playerCount'>): PlayerId[] {
  return config.playerCount === 3 ? ['orange', 'purple', 'pink'] : [...ALL_PLAYER_IDS];
}

/** `ABCD-EFGH` or `abcd efgh` -> `ABCDEFGH`: what people type is compared without case or separators. */
export function normalizeInviteCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64) : '';
}

/** `ABCDEFGH` -> `ABCD-EFGH`, easier to read out over the phone. */
export function formatInviteCode(code: string): string {
  const clean = normalizeInviteCode(code);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** The link a friend opens: the address plus the invite code, when one is needed. */
export function inviteLink(baseUrl: string, inviteCode: string | null): string {
  const base = baseUrl.replace(/\/+$/, '');
  return inviteCode ? `${base}/?${INVITE_QUERY_PARAM}=${formatInviteCode(inviteCode)}` : base;
}

/** WebSocket URL for the page's own origin (`wss:` behind https tunnels). */
export function serverWebSocketUrl(loc: { protocol: string; host: string }): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws`;
}
