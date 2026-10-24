/**
 * CATAN: New Energies — the app in online mode (served by the host's game server).
 *
 * Connection screens, the online lobby, and the table: `TabletopApp` renders the server's state
 * for this browser's seat and sends moves to the server instead of applying them.
 */

import 'preact/compat';
import { useMemo, useState } from 'preact/hooks';
import type { PlayerId } from '../../engine/types';
import type { ServerInfo } from '../../network/server-protocol';
import { TabletopApp } from '../TabletopApp';
import { ConnectionBadge, OnlineLobby, OnlinePage, SeatPicker, seatRoleLabel } from './OnlineLobby';
import type { OnlineTable } from './onlineTypes';
import { useOnlineGame } from './useOnlineGame';

const NEW_GAME_CONFIRM = 'Start a new game? This game ends for everyone and all players go back to the lobby.';

export function OnlineApp({ info }: { info: ServerInfo }) {
  const session = useOnlineGame(info);
  const [watching, setWatching] = useState(false);
  const { lobby, game } = session;

  const table = useMemo<OnlineTable | null>(() => {
    if (!lobby || !game) return null;
    const roleLabels: Partial<Record<PlayerId, string>> = {};
    for (const s of lobby.seats) {
      const label = seatRoleLabel(s, lobby.config.seats[s.playerId], session.playerId);
      roleLabels[s.playerId] = s.role === 'friend' && s.claimed && !s.connected ? `${label} · offline` : label;
    }
    return {
      update: game,
      myPlayerId: session.playerId,
      isHost: session.isHost,
      config: { ...lobby.config, privacyCurtain: false, roomCode: '' },
      roleLabels,
      notice: session.notice,
      sendAction: session.sendAction,
      onNewGame: () => {
        if (window.confirm(NEW_GAME_CONFIRM)) session.send({ type: 'newGame' });
      },
      badge: <ConnectionBadge status={session.status} />,
    };
  }, [lobby, game, session.playerId, session.isHost, session.notice, session.status]);

  if (session.status === 'replaced') {
    return (
      <OnlinePage>
        <div className="lb-sheet ol-sheet ol-small" data-testid="online-replaced" role="alertdialog" aria-labelledby="ol-replaced-title">
          <div className="lb-head">
            <div>
              <h2 id="ol-replaced-title">Open in another window</h2>
              <p>This seat was opened in another window or tab, so this one stopped. Only one window can play a seat.</p>
            </div>
          </div>
          <button type="button" className="tt-cta is-ready" data-testid="online-use-this-window" onClick={session.reconnect}>
            Use this window
          </button>
        </div>
      </OnlinePage>
    );
  }

  if (!lobby || (lobby.started && !table)) {
    return (
      <OnlinePage>
        <div className="lb-sheet ol-sheet ol-small" data-testid="online-connecting">
          <div className="lb-head">
            <div>
              <h2>Joining the game</h2>
              <p>Connecting to the game on the host’s PC…</p>
            </div>
            <ConnectionBadge status={session.status} />
          </div>
        </div>
      </OnlinePage>
    );
  }

  if (!lobby.started || !table) return <OnlineLobby session={session} />;

  return (
    <>
      <TabletopApp online={table} />
      {session.playerId === null && !watching && (
        <div className="ol-overlay" data-testid="online-midgame-join">
          <div className="lb-sheet ol-sheet ol-small" role="dialog" aria-labelledby="ol-midgame-title">
            <div className="lb-head">
              <div>
                <h2 id="ol-midgame-title">The game has started</h2>
                <p>Take a free seat to play, or watch the table.</p>
              </div>
              <ConnectionBadge status={session.status} />
            </div>
            <label className="lb-field ol-name">
              <span>Your name</span>
              <input
                type="text"
                className="lb-input"
                data-testid="online-name-input"
                placeholder="Type your name"
                maxLength={20}
                value={session.name}
                onInput={(e) => session.setName((e.target as HTMLInputElement).value)}
              />
            </label>
            <SeatPicker session={session} midGame />
            <button type="button" className="tt-icon-btn" data-testid="online-watch-btn" onClick={() => setWatching(true)}>
              Just watch
            </button>
          </div>
        </div>
      )}
    </>
  );
}
