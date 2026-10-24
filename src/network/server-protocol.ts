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
import type { RedactedGameState } from './redact';

/** Bumped when a message shape changes incompatibly. */
export const SERVER_PROTOCOL_VERSION = 1;

/** Value of `app` in `GET /api/server-info`; the client uses it to detect online mode. */
export const SERVER_APP_ID = 'catan-new-energies';

export const SERVER_DEFAULT_PORT = 3210;

/** Suggested browser `localStorage` key for the seat token (one server per origin). */
export const SEAT_TOKEN_STORAGE_KEY = 'catan-ne-online-seat-token';

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

export interface ServerInfo {
  app: typeof SERVER_APP_ID;
  protocolVersion: number;
  port: number;
  lanUrls: string[];
  started: boolean;
}

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'hello'; name: string; seatToken?: string | null; hostKey?: string | null }
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
  lastAction: GameAction | null;
  /**
   * The event disc that `lastAction` took out of the bag (now public), if any. The redacted state
   * has no `eventBag`, so the client cannot diff the bag itself.
   */
  drawnEventDisc: EventDiscType | null;
  yourPlayerId: PlayerId | null;
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
  | ErrorMessage;

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

/** WebSocket URL for the page's own origin (`wss:` behind https tunnels). */
export function serverWebSocketUrl(loc: { protocol: string; host: string }): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws`;
}
