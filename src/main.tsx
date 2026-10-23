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
 * the offline tests do not wait on a network round trip.
 */
export function App() {
  const [mode, setMode] = useState<Mode>(import.meta.env.DEV ? { kind: 'offline' } : { kind: 'detecting' });
  useEffect(() => {
    if (import.meta.env.DEV) return;
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
