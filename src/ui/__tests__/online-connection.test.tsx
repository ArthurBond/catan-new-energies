import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVER_APP_ID, SERVER_INFO_META_NAME, type ServerInfo, type ServerMessage, type ShareInfo } from '../../network/server-protocol';
import { InviteCodeForm, InvitePanel, shareLinksFor } from '../online/OnlineLobby';
import {
  CONNECT_PROBE_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  detectGameServer,
  INVITE_CODE_STORAGE_KEY,
  parseServerInfo,
  PING_EVERY_MS,
  PONG_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  readEmbeddedServerInfo,
  showInviteCodeInAddressBar,
  takeInviteCodeFromUrl,
  useOnlineGame,
  type OnlineSession,
} from '../online/useOnlineGame';

const INFO: ServerInfo = {
  app: SERVER_APP_ID,
  protocolVersion: 2,
  port: 3210,
  lanUrls: [],
  started: false,
  inviteRequired: true,
  share: 'online',
};

/** A WebSocket the test drives by hand: it records what the page sends and plays the server. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  closedByPage = false;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close() {
    this.closedByPage = true;
    this.readyState = FakeSocket.CLOSED;
  }

  /** The server accepted the connection. */
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  /** A message from the server. */
  receive(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  /** The server (or the network) closed the connection. */
  drop(code = 1006) {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code });
  }

  ofType(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
}

/**
 * Browser storage for the tests. Newer Node versions have a `localStorage` of their own that is
 * switched off by default and hides the test DOM's, so the tests bring a simple one.
 */
function stubStorage(): void {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  });
}

const welcome: ServerMessage = { type: 'welcome', protocolVersion: 2, clientId: 'c1', isHost: false, playerId: null, seatToken: null };

describe('the page knows it is online without asking twice', () => {
  afterEach(() => {
    document.head.querySelectorAll(`meta[name="${SERVER_INFO_META_NAME}"]`).forEach((m) => m.remove());
    vi.unstubAllGlobals();
  });

  it('reads the server info the game server wrote into the page', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', SERVER_INFO_META_NAME);
    meta.setAttribute('content', JSON.stringify(INFO));
    document.head.appendChild(meta);
    expect(readEmbeddedServerInfo()).toEqual(INFO);
    // No request at all: a slow link cannot make the page give up and go offline.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await detectGameServer()).toEqual(INFO);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores a tag that is not from this game', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', SERVER_INFO_META_NAME);
    meta.setAttribute('content', '{"app":"something-else"}');
    document.head.appendChild(meta);
    expect(readEmbeddedServerInfo()).toBeNull();
    meta.setAttribute('content', 'not json');
    expect(readEmbeddedServerInfo()).toBeNull();
  });

  it('still asks the server when the page carries no tag, and fills in what an older server leaves out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ app: SERVER_APP_ID, protocolVersion: 1, port: 3210, lanUrls: ['http://192.168.1.5:3210'], started: true }),
      }))
    );
    expect(await detectGameServer()).toEqual({
      app: SERVER_APP_ID,
      protocolVersion: 1,
      port: 3210,
      lanUrls: ['http://192.168.1.5:3210'],
      started: true,
      inviteRequired: false,
      share: 'lan',
    });
    expect(parseServerInfo({ app: SERVER_APP_ID, share: 'carrier-pigeon', inviteRequired: 'yes' })).toMatchObject({ share: 'lan', inviteRequired: false });
    expect(parseServerInfo(null)).toBeNull();
  });
});

describe('the invite code in the link', () => {
  beforeEach(() => {
    stubStorage();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is taken from the address and remembered, and the address is left as it is', () => {
    window.history.replaceState(null, '', '/?join=abcd-efgh&other=1#top');
    expect(takeInviteCodeFromUrl()).toBe('ABCDEFGH');
    expect(localStorage.getItem(INVITE_CODE_STORAGE_KEY)).toBe('ABCDEFGH');
    expect(window.location.search).toBe('?join=abcd-efgh&other=1');
    expect(window.location.hash).toBe('#top');
    // Opened later without the code (a bookmark of the bare address): still remembered.
    window.history.replaceState(null, '', '/');
    expect(takeInviteCodeFromUrl()).toBe('ABCDEFGH');
  });

  it('can be put into the address bar, so the address is a complete invite link, and taken out again', () => {
    window.history.replaceState(null, '', '/?other=1#top');
    showInviteCodeInAddressBar('abcdefgh');
    expect(window.location.search).toBe('?other=1&join=ABCD-EFGH');
    expect(window.location.hash).toBe('#top');
    showInviteCodeInAddressBar('ABCD-EFGH');
    expect(window.location.search).toBe('?other=1&join=ABCD-EFGH');
    showInviteCodeInAddressBar(null);
    expect(window.location.search).toBe('?other=1');
  });

  it('a new link replaces the remembered code; an empty one does not', () => {
    localStorage.setItem(INVITE_CODE_STORAGE_KEY, 'OLDCODE1');
    window.history.replaceState(null, '', '/?join=');
    expect(takeInviteCodeFromUrl()).toBe('OLDCODE1');
    window.history.replaceState(null, '', '/?join=NEWC-ODE2');
    expect(takeInviteCodeFromUrl()).toBe('NEWCODE2');
    expect(localStorage.getItem(INVITE_CODE_STORAGE_KEY)).toBe('NEWCODE2');
  });

  it('is null when there is none', () => {
    expect(takeInviteCodeFromUrl()).toBeNull();
  });
});

describe('the connection to the host', () => {
  let container: HTMLDivElement;
  let session: OnlineSession;

  function Probe() {
    session = useOnlineGame(INFO);
    return <span data-status={session.status} />;
  }
  const mount = () => act(() => render(<Probe />, container));
  const latest = () => FakeSocket.instances.at(-1)!;
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  /** Connects and gets let in. */
  const connect = () => {
    mount();
    const ws = latest();
    act(() => {
      ws.open();
      ws.receive(welcome);
    });
    return ws;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    stubStorage();
    window.history.replaceState(null, '', '/');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('says hello with the invite code from the link, and is connected once the server lets it in', () => {
    window.history.replaceState(null, '', '/?join=abcd-efgh');
    mount();
    const ws = latest();
    expect(ws.url).toMatch(/\/ws$/);
    act(() => ws.open());
    expect(ws.ofType('hello')).toEqual([expect.objectContaining({ type: 'hello', inviteCode: 'ABCDEFGH' })]);
    expect(session.status).toBe('connecting');
    act(() => ws.receive(welcome));
    expect(session.status).toBe('connected');
    expect(session.denied).toBeNull();
    // The address bar stays a complete invite link: it can be copied to another device.
    expect(window.location.search).toBe('?join=ABCD-EFGH');
  });

  it('a device let in on a remembered code shows the full invite link in its address bar', () => {
    localStorage.setItem(INVITE_CODE_STORAGE_KEY, 'ABCDEFGH');
    mount();
    const ws = latest();
    act(() => ws.open());
    expect(ws.ofType('hello')[0]).toMatchObject({ inviteCode: 'ABCDEFGH' });
    // Not before the server has accepted it...
    expect(window.location.search).toBe('');
    act(() => ws.receive(welcome));
    // ...and then the address someone copies from this screen works on the next device.
    expect(window.location.search).toBe('?join=ABCD-EFGH');
  });

  it('a wrong code in the link is taken out of the address, so a reload does not send it again', () => {
    window.history.replaceState(null, '', '/?join=WRONGONE');
    mount();
    const ws = latest();
    act(() => {
      ws.open();
      ws.receive({ type: 'denied', reason: 'wrong', message: 'That invite code is not right.', retryAfterSeconds: null });
    });
    expect(session.status).toBe('denied');
    expect(window.location.search).toBe('');
    expect(localStorage.getItem(INVITE_CODE_STORAGE_KEY)).toBeNull();
    // Typing the right one puts the working link in the address bar.
    act(() => session.submitInviteCode('abcd-efgh'));
    act(() => ws.receive(welcome));
    expect(window.location.search).toBe('?join=ABCD-EFGH');
  });

  it('the host’s address never gets an invite code added', () => {
    localStorage.setItem(INVITE_CODE_STORAGE_KEY, 'ABCDEFGH');
    mount();
    const ws = latest();
    act(() => {
      ws.open();
      ws.receive({ ...welcome, isHost: true, playerId: 'orange' } as ServerMessage);
    });
    expect(window.location.search).toBe('');
  });

  it('shows the invite screen when the server wants a code, and does not hammer the server meanwhile', () => {
    mount();
    const ws = latest();
    act(() => {
      ws.open();
      ws.receive({ type: 'denied', reason: 'missing', message: 'This game needs an invite code.', retryAfterSeconds: null });
    });
    expect(session.status).toBe('denied');
    expect(session.denied).toMatchObject({ reason: 'missing' });
    // The server hangs up on sockets that sit at the prompt; the page waits for the code.
    act(() => ws.drop(4002));
    advance(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(session.status).toBe('denied');

    // Typing the code opens a new connection that carries it.
    act(() => session.submitInviteCode(' abcd efgh '));
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => latest().open());
    expect(latest().ofType('hello')[0]).toMatchObject({ inviteCode: 'ABCDEFGH' });
    act(() => latest().receive(welcome));
    expect(session.status).toBe('connected');
    expect(localStorage.getItem(INVITE_CODE_STORAGE_KEY)).toBe('ABCDEFGH');
  });

  it('tries a typed code on the connection that is still open', () => {
    mount();
    const ws = latest();
    act(() => {
      ws.open();
      ws.receive({ type: 'denied', reason: 'missing', message: 'needs a code', retryAfterSeconds: null });
    });
    act(() => session.submitInviteCode('WRONGONE'));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(ws.ofType('hello')).toHaveLength(2);
    expect(ws.ofType('hello')[1]).toMatchObject({ inviteCode: 'WRONGONE' });
    expect(session.status).toBe('connecting');
    // A wrong code is forgotten, so it is not sent again after a reload.
    act(() => ws.receive({ type: 'denied', reason: 'wrong', message: 'That invite code is not right.', retryAfterSeconds: null }));
    expect(session.status).toBe('denied');
    expect(session.denied).toMatchObject({ reason: 'wrong', message: 'That invite code is not right.' });
    expect(localStorage.getItem(INVITE_CODE_STORAGE_KEY)).toBeNull();
  });

  it('keeps the host’s invite links, and only for the host', () => {
    const ws = connect();
    const share: ShareInfo = { mode: 'online', links: [{ url: 'https://pc.ts.net/?join=AB', kind: 'online', label: 'x' }], inviteCode: 'AB', status: null };
    act(() => ws.receive({ type: 'share', share }));
    expect(session.share).toEqual(share);
    act(() => ws.receive(welcome));
    expect(session.share).toBeNull();
  });

  it('pings a quiet connection and carries on when the server answers', () => {
    const ws = connect();
    advance(PING_EVERY_MS - 1500);
    expect(ws.ofType('ping')).toHaveLength(0);
    advance(2000);
    expect(ws.ofType('ping')).toHaveLength(1);
    act(() => ws.receive({ type: 'pong', t: 1 }));
    advance(PONG_TIMEOUT_MS + 2000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(session.status).toBe('connected');
    // Game traffic counts as proof of life too: no ping is needed while moves arrive.
    for (let i = 0; i < 10; i++) {
      advance(3000);
      act(() => {
        session.send({ type: 'leaveSeat' });
      });
    }
    expect(ws.ofType('ping').length).toBeLessThanOrEqual(2);
  });

  it('drops a connection that went silent and opens a new one, without waiting for it to close', () => {
    const ws = connect();
    advance(PING_EVERY_MS + 1000);
    expect(ws.ofType('ping')).toHaveLength(1);
    // No answer: the line is dead (new Wi-Fi, laptop lid, tunnel hiccup) though it never closed.
    advance(PONG_TIMEOUT_MS + 1500);
    expect(ws.closedByPage).toBe(true);
    expect(session.status).toBe('reconnecting');
    advance(500);
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => {
      latest().open();
      latest().receive(welcome);
    });
    expect(session.status).toBe('connected');
    // The old socket finally closing changes nothing.
    act(() => ws.onclose?.({ code: 1006 }));
    advance(5000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(session.status).toBe('connected');
  });

  it('checks the line at once when the tab comes back or the device is online again', () => {
    const ws = connect();
    advance(2000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(ws.ofType('ping')).toHaveLength(1);
    advance(PROBE_TIMEOUT_MS + 1500);
    expect(ws.closedByPage).toBe(true);
    advance(500);
    expect(FakeSocket.instances).toHaveLength(2);

    // Already disconnected and waiting to retry: `online` reconnects immediately.
    act(() => latest().drop());
    act(() => latest().drop());
    const before = FakeSocket.instances.length;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(FakeSocket.instances.length).toBe(before + 1);
  });

  it('gives up on a connection attempt that never opens, instead of waiting minutes for the system to', () => {
    mount();
    const stuck = latest();
    // The handshake hangs: the phone changed network while it was connecting.
    advance(CONNECT_TIMEOUT_MS - 1500);
    expect(FakeSocket.instances).toHaveLength(1);
    advance(3000);
    expect(stuck.closedByPage).toBe(true);
    advance(600);
    expect(FakeSocket.instances).toHaveLength(2);
    // The abandoned attempt opening late changes nothing.
    act(() => stuck.onopen?.());
    expect(stuck.ofType('hello')).toHaveLength(0);
    act(() => {
      latest().open();
      latest().receive(welcome);
    });
    expect(session.status).toBe('connected');
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('coming back online restarts an attempt that was hanging on the old network', () => {
    mount();
    const stuck = latest();
    advance(CONNECT_PROBE_TIMEOUT_MS - 1000);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    // Too fresh to call stuck: it gets its chance.
    expect(FakeSocket.instances).toHaveLength(1);
    advance(2000);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(stuck.closedByPage).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('a window told its seat is open elsewhere stays put until "Use this window"', () => {
    const ws = connect();
    act(() => ws.drop(4000));
    expect(session.status).toBe('replaced');
    // Looking at the old tab, a Wi-Fi change or time passing must not take the seat back.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('pageshow'));
    });
    advance(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(session.status).toBe('replaced');

    act(() => session.reconnect());
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => {
      latest().open();
      latest().receive(welcome);
    });
    expect(session.status).toBe('connected');
    // Back to normal: a drop reconnects by itself again.
    act(() => latest().drop());
    advance(500);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('reconnects with growing pauses when the host cannot be reached, and shows offline', () => {
    const ws = connect();
    act(() => ws.drop());
    expect(session.status).toBe('reconnecting');
    advance(400);
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => latest().drop());
    advance(1000);
    act(() => latest().drop());
    expect(session.status).toBe('offline');
    advance(2000);
    expect(FakeSocket.instances).toHaveLength(4);
    act(() => {
      latest().open();
      latest().receive(welcome);
    });
    expect(session.status).toBe('connected');
  });
});

describe('the host’s invite panel', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });
  const text = (testId: string) => container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;

  it('online: shows the one link that works everywhere, and the code', () => {
    const share: ShareInfo = {
      mode: 'online',
      links: [{ url: 'https://pc.tail1.ts.net/?join=ABCD-EFGH', kind: 'online', label: 'Works from any network' }],
      inviteCode: 'ABCD-EFGH',
      status: null,
    };
    act(() => render(<InvitePanel share={share} lanUrls={[]} />, container));
    expect(text('online-join-link')).toBe('https://pc.tail1.ts.net/?join=ABCD-EFGH');
    expect(container.textContent).toContain('works from any network');
    expect(container.textContent).toContain('encrypted');
    expect(text('online-invite-code')).toContain('ABCD-EFGH');
    expect(text('online-share-hint')).toBeNull();
    expect(container.querySelector('[data-testid="online-invite"]')?.getAttribute('data-share-mode')).toBe('online');
  });

  it('online, link not up yet: says what it is waiting for instead of showing a link that does not work', () => {
    const share: ShareInfo = { mode: 'online', links: [], inviteCode: 'ABCD-EFGH', status: 'Setting up the online link…' };
    act(() => render(<InvitePanel share={share} lanUrls={['http://192.168.1.5:3210']} />, container));
    expect(text('online-join-link')).toBeNull();
    expect(container.querySelector('[data-testid="copy-join-link"]')).toBeNull();
    expect(text('online-share-status')).toContain('Setting up the online link…');
  });

  it('tailnet: lists the Tailscale link first and the other ways after it', () => {
    const share: ShareInfo = {
      mode: 'tailnet',
      links: [
        { url: 'http://100.64.0.7:3210', kind: 'tailnet', label: 'For friends on your Tailscale network' },
        { url: 'http://192.168.1.5:3210', kind: 'lan', label: 'Same Wi-Fi only' },
      ],
      inviteCode: null,
      status: null,
    };
    act(() => render(<InvitePanel share={share} lanUrls={[]} />, container));
    expect(text('online-join-link')).toBe('http://100.64.0.7:3210');
    expect(container.textContent).toContain('Tailscale');
    expect(text('online-lan-urls')).toContain('http://192.168.1.5:3210 (same wi-fi only)');
    expect(text('online-invite-code')).toBeNull();
  });

  it('home network: as before, plus how to reach friends elsewhere', () => {
    expect(shareLinksFor(null, ['http://192.168.1.5:3210']).map((l) => l.url)).toContain('http://192.168.1.5:3210');
    // No network at all: the page's own address is still shown.
    expect(shareLinksFor({ mode: 'lan', links: [], inviteCode: null, status: null }, []).length).toBeGreaterThan(0);
    act(() => render(<InvitePanel share={null} lanUrls={['http://192.168.1.5:3210']} />, container));
    expect(text('online-join-link')).toContain('http');
    expect(text('online-share-hint')).toContain('npm run host:online');
  });
});

describe('the invite-code screen', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const show = (denied: OnlineSession['denied'], submitInviteCode = vi.fn()) => {
    const session = { denied, submitInviteCode } as unknown as OnlineSession;
    act(() => render(<InviteCodeForm session={session} />, container));
    const input = container.querySelector<HTMLInputElement>('[data-testid="online-invite-input"]')!;
    const form = container.querySelector<HTMLFormElement>('[data-testid="online-invite-form"]')!;
    const error = container.querySelector<HTMLElement>('[data-testid="online-invite-error"]')!;
    const type = (value: string) =>
      act(() => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    const submit = () =>
      act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    return { input, error, type, submit, submitInviteCode };
  };

  it('is a labelled field set up for a code, not for prose', () => {
    const { input, error } = show({ reason: 'missing', message: 'This game needs an invite code.', retryAfterSeconds: null });
    const label = container.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toBe('Invite code');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('characters');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    // Needing a code is why the screen is there, not an error.
    expect(error.hidden).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('sends the typed code to the server', () => {
    const { type, submit, submitInviteCode } = show({ reason: 'missing', message: 'x', retryAfterSeconds: null });
    type('abcd-efgh');
    submit();
    expect(submitInviteCode).toHaveBeenCalledWith('abcd-efgh');
  });

  it('asks for a code instead of sending nothing, and stops complaining once typing starts', () => {
    const { input, error, type, submit, submitInviteCode } = show({ reason: 'missing', message: 'x', retryAfterSeconds: null });
    submit();
    expect(submitInviteCode).not.toHaveBeenCalled();
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('Type the invite code first.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    type('A');
    expect(error.hidden).toBe(true);
  });

  it('shows what the server said about a wrong code or a lockout', () => {
    const wrong = show({ reason: 'wrong', message: 'That invite code is not right. Check it with the host and try again.', retryAfterSeconds: null });
    expect(wrong.error.hidden).toBe(false);
    expect(wrong.error.textContent).toMatch(/not right/);
    expect(wrong.error.getAttribute('role')).toBe('alert');
    const locked = show({ reason: 'locked', message: 'Too many wrong codes. Wait 3 minutes, then try again.', retryAfterSeconds: 170 });
    expect(locked.error.textContent).toMatch(/Wait 3 minutes/);
  });
});
