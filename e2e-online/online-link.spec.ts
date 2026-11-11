import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  ONLINE_HOST_URL,
  ONLINE_INVITE_CODE,
  ONLINE_INVITE_CODE_SHOWN,
  ONLINE_LINK_LATENCY_MS,
  ONLINE_PUBLIC_URL,
} from './online-constants';

/**
 * A game shared with `npm run host:online`: the host plays on their own computer, the friend
 * comes in through the public HTTPS link (here a stand-in for Tailscale Funnel on localhost, see
 * `fake-tailscale.mjs`), as they would from another network. One game, played in order.
 *
 * The stand-in delays everything by ONLINE_LINK_LATENCY_MS each way, so the friend's link is as
 * slow as mobile data on the other side of the world. The host, on their own computer, is not.
 */

const SAVES_DIR = process.env.CATAN_E2E_ONLINE_SAVES_DIR!;
const INVITE_LINK = `${ONLINE_PUBLIC_URL}/?join=${ONLINE_INVITE_CODE_SHOWN}`;

const readHostKey = () => fs.readFileSync(path.join(SAVES_DIR, 'host-key.txt'), 'utf8').trim();
const app = (page: Page) => page.getByTestId('tabletop-app');
const badge = (page: Page) => page.getByTestId('connection-badge');

/** Tells the stand-in tunnel to cut, silence or relabel connections. */
async function tunnel(context: BrowserContext, action: string): Promise<number> {
  const res = await context.request.get(`${ONLINE_PUBLIC_URL}/__fake/${action}`);
  expect(res.ok()).toBe(true);
  return Number(await res.text());
}

interface RecordedSocket {
  url: string;
  sent: string[];
  received: string[];
  closed: boolean;
}

/** Every WebSocket this page opens, with the frames that went each way. */
function recordSockets(page: Page): RecordedSocket[] {
  const sockets: RecordedSocket[] = [];
  page.on('websocket', (ws) => {
    const entry: RecordedSocket = { url: ws.url(), sent: [], received: [], closed: false };
    sockets.push(entry);
    ws.on('framesent', (f) => entry.sent.push(String(f.payload)));
    ws.on('framereceived', (f) => entry.received.push(String(f.payload)));
    ws.on('close', () => (entry.closed = true));
  });
  return sockets;
}

/** Moves by `playerId` that the server applied and reported back on this socket. */
function appliedMoves(socket: RecordedSocket, playerId: string): number {
  return socket.received.filter((frame) => {
    const msg = JSON.parse(frame) as { type: string; lastAction?: { playerId?: string } | null };
    return msg.type === 'state' && msg.lastAction?.playerId === playerId;
  }).length;
}

test.describe.configure({ mode: 'serial' });

let hostCtx: BrowserContext;
let friendCtx: BrowserContext;
let host: Page;
let friend: Page;
let friendSockets: ReturnType<typeof recordSockets>;

test.beforeAll(async ({ browser }) => {
  hostCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  // The friend's browser accepts the test certificate, as it would Tailscale's real one.
  friendCtx = await browser.newContext({ viewport: { width: 1366, height: 768 }, ignoreHTTPSErrors: true });
  host = await hostCtx.newPage();
  friend = await friendCtx.newPage();
  friendSockets = recordSockets(friend);
});

test.afterAll(async () => {
  await hostCtx?.close();
  await friendCtx?.close();
});

test('the host sees the invite link that works from any network', async () => {
  await host.goto(`${ONLINE_HOST_URL}/?host=${readHostKey()}`);
  await expect(host.getByTestId('online-host-lobby')).toBeVisible();
  await expect(badge(host)).toHaveAttribute('data-status', 'connected');
  await expect(host.getByTestId('online-invite')).toHaveAttribute('data-share-mode', 'online');
  await expect(host.getByTestId('online-join-link')).toHaveText(INVITE_LINK);
  await expect(host.getByTestId('online-invite-code')).toContainText(ONLINE_INVITE_CODE_SHOWN);
  await expect(host.getByTestId('online-invite')).toContainText('works from any network');
  // The host key and the home-network addresses are not part of what gets shared.
  await expect(host.getByTestId('online-invite')).not.toContainText('host=');
  await expect(host.getByTestId('online-share-hint')).toHaveCount(0);

  await host.getByTestId('online-name-input').fill('Hana');
  await host.getByTestId('online-name-input').blur();
  await host.getByTestId('online-seat-purple-friend').click();
  await host.getByTestId('online-bot-speed-instant').click();
  await expect(host.getByTestId('online-start-btn')).toContainText('Waiting for 1 friend');
});

test('a stranger with the address but not the code gets the invite screen and nothing else', async ({ browser }) => {
  const strangerCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const stranger = await strangerCtx.newPage();
  const frames: string[] = [];
  stranger.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await tunnel(strangerCtx, 'visitor?ip=198.51.100.23');
  try {
    await stranger.goto(ONLINE_PUBLIC_URL);
    await expect(stranger.getByTestId('online-invite-gate')).toBeVisible();
    await expect(stranger.getByTestId('online-friend-lobby')).toHaveCount(0);
    // The field is set up for a code: no autocorrect, capitals, labelled.
    const input = stranger.getByTestId('online-invite-input');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('spellcheck', 'false');
    await expect(input).toHaveAttribute('autocapitalize', 'characters');
    await expect(input).toHaveAttribute('autocorrect', 'off');
    await expect(stranger.getByLabel('Invite code', { exact: true })).toBeVisible();
    await expect(stranger.getByTestId('online-invite-error')).toBeHidden();

    await input.fill('WRONG-CODE');
    await stranger.getByTestId('online-invite-submit').click();
    await expect(stranger.getByTestId('online-invite-error')).toContainText('not right');
    await expect(stranger.getByTestId('online-invite-gate')).toBeVisible();

    // The server told this browser nothing about the table: no seats, no names, no game.
    const types = frames.map((f) => (JSON.parse(f) as { type: string }).type);
    expect(types).toContain('denied');
    expect(types.filter((t) => t === 'lobby' || t === 'state' || t === 'welcome' || t === 'share')).toEqual([]);
    expect(frames.join('')).not.toContain('Hana');

    // Typed by hand, any case, with or without the dash: now it opens.
    await input.fill(` ${ONLINE_INVITE_CODE.toLowerCase()} `);
    await input.press('Enter');
    await expect(stranger.getByTestId('online-friend-lobby')).toBeVisible();
    await expect(badge(stranger)).toHaveAttribute('data-status', 'connected');
  } finally {
    await tunnel(strangerCtx, 'visitor?ip=203.0.113.7');
    await strangerCtx.close();
  }
});

test('the friend opens the invite link, over HTTPS and an encrypted WebSocket, and takes a seat', async () => {
  await friend.goto(INVITE_LINK);
  await expect(friend.getByTestId('online-friend-lobby')).toBeVisible();
  await expect(badge(friend)).toHaveAttribute('data-status', 'connected');
  // The code is remembered and gone from the address bar (screenshots, shared screens).
  expect(friend.url()).not.toContain('join=');
  expect(friend.url().startsWith(ONLINE_PUBLIC_URL)).toBe(true);
  expect(friendSockets).toHaveLength(1);
  expect(friendSockets[0]!.url).toBe(`${ONLINE_PUBLIC_URL.replace('https', 'wss')}/ws`);
  // The page knew it was online from the page itself: it never fell back to the offline game.
  await expect(friend.getByTestId('tabletop-app')).toHaveCount(0);

  await friend.getByTestId('online-name-input').fill('Finn');
  await friend.getByTestId('online-claim-purple').click();
  await expect(friend.getByTestId('online-waiting')).toBeVisible();
  await expect(host.getByTestId('online-seat-purple-status')).toHaveText('Connected');
  await expect(host.getByTestId('online-seat-purple')).toContainText('Finn');
});

test('host and friend play on the same board', async () => {
  await host.getByTestId('online-start-btn').click();
  await expect(host.getByTestId('tabletop-board')).toBeVisible();
  await expect(friend.getByTestId('tabletop-board')).toBeVisible();
  await expect(app(host)).toHaveAttribute('data-my-seat', 'orange');
  await expect(app(friend)).toHaveAttribute('data-my-seat', 'purple');
  // Orange rolls for order, then it is the friend's move on the friend's screen.
  await host.getByTestId('setup-roll-dialog-btn').click();
  await expect(friend.getByTestId('setup-roll-dialog-btn')).toBeVisible();
});

test('a cut connection (new Wi-Fi) comes back by itself with the same seat', async () => {
  const before = friendSockets.length;
  expect(await tunnel(friendCtx, 'drop')).toBeGreaterThan(0);
  await expect.poll(() => friendSockets.length, { timeout: 10_000 }).toBeGreaterThan(before);
  await expect(badge(friend)).toHaveAttribute('data-status', 'connected', { timeout: 10_000 });
  await expect(app(friend)).toHaveAttribute('data-my-seat', 'purple');
  await expect(host.getByTestId('corner-station-purple')).not.toContainText('offline');
  // Still the friend's move, and the move goes through on the new connection: the server applies
  // it and reports it back there. (A tie in the roll-off means rolling again, so the button may stay.)
  const current = friendSockets.at(-1)!;
  expect(current.url).toBe(`${ONLINE_PUBLIC_URL.replace('https', 'wss')}/ws`);
  await friend.getByTestId('setup-roll-dialog-btn').click();
  await expect.poll(() => appliedMoves(current, 'purple'), { timeout: 10_000 }).toBeGreaterThan(0);
  expect(current.sent.some((f) => f.includes('"action"'))).toBe(true);
});

test('the friend really is on a slow link, and play keeps up', async () => {
  // A ping through the tunnel takes at least the delay there and back.
  const started = Date.now();
  const res = await friendCtx.request.get(`${ONLINE_PUBLIC_URL}/api/server-info`);
  expect(res.ok()).toBe(true);
  expect(Date.now() - started).toBeGreaterThanOrEqual(ONLINE_LINK_LATENCY_MS * 2);

  // Host and friend take turns until the opening placements are done; bots play at once.
  const actIfMyMove = async (page: Page): Promise<void> => {
    const roll = page.getByTestId('setup-roll-dialog-btn');
    if (await roll.isVisible()) return roll.click();
    for (const kind of ['node', 'edge'] as const) {
      const target = page.locator(`[data-testid^="${kind}-target-"]`).first();
      if (await target.count()) {
        const id = (await target.getAttribute('data-testid'))!.replace(`${kind}-target-`, '');
        return page.locator(`[data-${kind}="${id}"]`).click();
      }
    }
  };
  await expect
    .poll(
      async () => {
        for (const page of [host, friend]) await actIfMyMove(page).catch(() => {});
        return app(host).getAttribute('data-phase');
      },
      { timeout: 90_000, intervals: [150, 300, 500] }
    )
    .toBe('EventPhase');
  // Both screens show the same finished opening: four towns and four cities.
  for (const page of [host, friend]) {
    await expect(page.locator('[data-testid="island-layer"] [data-piece="town"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="island-layer"] [data-piece="city"]')).toHaveCount(4);
  }
  await expect(app(friend)).toHaveAttribute('data-phase', 'EventPhase');
  await expect(badge(friend)).toHaveAttribute('data-status', 'connected');
});

test('a phone that moves from Wi-Fi to mobile data (a new address) keeps its seat', async () => {
  const before = friendSockets.length;
  // The friend's address changes and the old connection dies with the old network.
  await tunnel(friendCtx, 'visitor?ip=198.51.100.77');
  expect(await tunnel(friendCtx, 'drop')).toBeGreaterThan(0);
  try {
    await expect.poll(() => friendSockets.length, { timeout: 10_000 }).toBeGreaterThan(before);
    await expect(badge(friend)).toHaveAttribute('data-status', 'connected', { timeout: 10_000 });
    await expect(app(friend)).toHaveAttribute('data-my-seat', 'purple');
    await expect(friend.getByTestId('online-invite-gate')).toHaveCount(0);
    await expect(host.getByTestId('corner-station-purple')).not.toContainText('offline');
    // The board the friend sees after coming back is the one the host sees.
    await expect(friend.locator('[data-testid="island-layer"] [data-piece="city"]')).toHaveCount(4);
  } finally {
    await tunnel(friendCtx, 'visitor?ip=203.0.113.7');
  }
});

test('a connection that goes silent without closing is noticed and replaced', async () => {
  test.setTimeout(60_000);
  const before = friendSockets.length;
  const current = friendSockets.at(-1)!;
  expect(await tunnel(friendCtx, 'stall')).toBeGreaterThan(0);
  // Nothing closes: only the heartbeat can tell. It pings, hears nothing, and reconnects.
  await expect.poll(() => friendSockets.length, { timeout: 30_000, intervals: [500] }).toBeGreaterThan(before);
  expect(current.sent.some((f) => f.includes('"ping"'))).toBe(true);
  await expect(badge(friend)).toHaveAttribute('data-status', 'connected', { timeout: 10_000 });
  await expect(app(friend)).toHaveAttribute('data-my-seat', 'purple');
  await expect(host.getByTestId('corner-station-purple')).not.toContainText('offline');
});

test('coming back to the tab checks the line at once instead of waiting', async () => {
  const before = friendSockets.length;
  expect(await tunnel(friendCtx, 'stall')).toBeGreaterThan(0);
  const stalledAt = Date.now();
  await friend.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => friendSockets.length, { timeout: 9000, intervals: [250] }).toBeGreaterThan(before);
  // Well inside the 18 seconds the quiet heartbeat alone would need.
  expect(Date.now() - stalledAt).toBeLessThan(9000);
  await expect(badge(friend)).toHaveAttribute('data-status', 'connected', { timeout: 10_000 });
});

test('reloading keeps the seat: the code and the seat are remembered', async () => {
  await friend.reload();
  await expect(friend.getByTestId('tabletop-board')).toBeVisible();
  await expect(app(friend)).toHaveAttribute('data-my-seat', 'purple');
  await expect(friend.getByTestId('online-invite-gate')).toHaveCount(0);
  await expect(friend.getByTestId('corner-station-purple')).toContainText('Finn');
});

test('a friend who changes device takes their own seat over, once the old device has been gone a while', async ({ browser }) => {
  test.setTimeout(120_000);
  // Finn's phone is put away mid-game...
  await friend.close();
  await expect(host.getByTestId('corner-station-purple')).toContainText('offline');
  const goneAt = Date.now();

  // ...and Finn opens the invite link on a laptop, which knows nothing about the seat.
  const laptopCtx = await browser.newContext({ viewport: { width: 1366, height: 768 }, ignoreHTTPSErrors: true });
  const laptop = await laptopCtx.newPage();
  laptop.on('dialog', (dialog) => void dialog.accept());
  try {
    await laptop.goto(INVITE_LINK);
    await expect(laptop.getByTestId('online-midgame-join')).toBeVisible();
    // The host's seat can never be taken; the offline friend's can.
    await expect(laptop.getByTestId('online-takeover-orange')).toHaveCount(0);
    const takeOver = laptop.getByTestId('online-takeover-purple');
    await expect(takeOver).toBeDisabled();
    await laptop.getByTestId('online-name-input').fill('Finn');
    await expect(takeOver).toBeEnabled();

    // Too soon: a blip must not cost anyone their seat. The server says how long to wait.
    await takeOver.click();
    await expect(laptop.getByTestId('online-notice')).toContainText('was here a moment ago');
    await expect(laptop.getByTestId('online-midgame-join')).toBeVisible();

    // After half a minute offline the seat can be taken over.
    await laptop.waitForTimeout(Math.max(0, 31_000 - (Date.now() - goneAt)));
    await takeOver.click();
    await expect(laptop.getByTestId('online-midgame-join')).toHaveCount(0);
    await expect(app(laptop)).toHaveAttribute('data-my-seat', 'purple');
    await expect(laptop.getByTestId('corner-station-purple')).toContainText('Finn');
    await expect(host.getByTestId('corner-station-purple')).not.toContainText('offline');

    // A friend can call a new game, on a phone-sized screen too: the button is there, it says
    // what it is, it asks first, and everyone lands in the lobby knowing who pressed it.
    await laptop.setViewportSize({ width: 390, height: 844 });
    const newGame = laptop.getByTestId('online-new-game-btn');
    await expect(newGame).toBeVisible();
    await expect(newGame).toContainText('New game');
    await expect(newGame.getByText('New game')).toBeVisible();
    await newGame.click();
    await expect(laptop.getByTestId('online-friend-lobby')).toBeVisible();
    await expect(laptop.getByTestId('online-waiting')).toBeVisible();
    await expect(host.getByTestId('online-host-lobby')).toBeVisible();
    await expect(host.getByTestId('online-notice')).toContainText('Finn started a new game');
    await expect(host.getByTestId('online-notice')).toHaveAttribute('data-kind', 'info');
    // The seats are kept, so the host can start the next game straight away.
    await expect(host.getByTestId('online-seat-purple')).toContainText('Finn');
    await expect(host.getByTestId('online-start-btn')).toBeEnabled();
    await host.getByTestId('online-start-btn').click();
    await expect(laptop.getByTestId('tabletop-board')).toBeVisible();
    await expect(app(laptop)).toHaveAttribute('data-my-seat', 'purple');
  } finally {
    await laptopCtx.close();
  }
});
