import 'preact/compat';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './ui/tabletop.css';
import type { ServerInfo } from './network/server-protocol';
import { OnlineApp } from './ui/online/OnlineApp';
import { detectGameServer } from './ui/online/useOnlineGame';
import { TabletopApp } from './ui/TabletopApp';

type Mode = { kind: 'detecting' } | { kind: 'offline' } | { kind: 'online'; info: ServerInfo };

/**
 * Served by the host's game server (`GET /api/server-info` answers): online mode. Anywhere else
 * (a static host) the app plays on its own: bots, hotseat, tab sync, resume.
 * The Vite dev server (`npm run dev`) never probes: the app is offline from the first frame, so
 * the offline tests do not wait on a network round trip. Neither does a GitHub Pages build (served
 * under /<repo>/, so its base is not `/`): no game server can be behind a static site.
 */
const NO_GAME_SERVER = import.meta.env.DEV || import.meta.env.BASE_URL !== '/';

export function App() {
  const [mode, setMode] = useState<Mode>(NO_GAME_SERVER ? { kind: 'offline' } : { kind: 'detecting' });
  useEffect(() => {
    if (NO_GAME_SERVER) return;
    let cancelled = false;
    void detectGameServer().then((info) => {
      if (!cancelled) setMode(info ? { kind: 'online', info } : { kind: 'offline' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode.kind === 'detecting') return <div className="ol-page" data-testid="detecting-server" aria-busy="true" />;
  if (mode.kind === 'online') return <OnlineApp info={mode.info} />;
  return <TabletopApp />;
}

const container = document.getElementById('app');
if (container) {
  render(<App />, container);
}
