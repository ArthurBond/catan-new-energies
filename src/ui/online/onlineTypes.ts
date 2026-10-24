import type { ComponentChildren } from 'preact';
import type { GameAction, PlayerId } from '../../engine/types';
import type { LobbyConfig } from '../Modals';
import type { OnlineGameUpdate, OnlineNotice } from './useOnlineGame';

/** What `TabletopApp` needs to play a game that lives on the host's server. */
export interface OnlineTable {
  update: OnlineGameUpdate;
  /** This browser's seat (null while watching). The dock and player board always show it. */
  myPlayerId: PlayerId | null;
  isHost: boolean;
  /** Seats and bot speed in the shape the table components already use. */
  config: LobbyConfig;
  /** Per-seat caption for the players rail ("You", "Friend · offline", "Bot · Balanced, hard"). */
  roleLabels: Partial<Record<PlayerId, string>>;
  notice: OnlineNotice | null;
  sendAction: (action: GameAction) => void;
  /** Host only: end this game for everyone and go back to the lobby (asks first). */
  onNewGame: () => void;
  /** The connection badge shown in the top bar. */
  badge: ComponentChildren;
}
