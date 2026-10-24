import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import WebSocket from 'ws';

/**
 * Two browser contexts are two laptops: separate storage, one shared game on the host's server.
 * The server (BOT_DELAY_MS=0) runs the bots at once, so a test only ever waits on state.
 */

const SAVES_DIR = process.env.CATAN_E2E_SAVES_DIR!;
const RESOURCES = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const;

function readHostKey(): string {
  return fs.readFileSync(path.join(SAVES_DIR, 'host-key.txt'), 'utf8').trim();
}

interface WireState {
  type: 'state';
  yourPlayerId: string | null;
  version: number;
  state: {
    playerOrder: string[];
    players: Record<string, { resources: Record<string, number>; science: number; hiddenResourcesCount: number }>;
  };
}

/** Records every `state` frame this page receives from the server. */
function recordStates(page: Page): WireState[] {
  const states: WireState[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      try {
        const msg = JSON.parse(String(frame.payload)) as { type?: string };
        if (msg.type === 'state') states.push(msg as WireState);
      } catch {
        // not JSON: ignore
      }
    });
  });
  return states;
}

const app = (page: Page) => page.getByTestId('tabletop-app');
const mySeat = (page: Page) => app(page).getAttribute('data-my-seat');
const actingSeat = (page: Page) => app(page).getAttribute('data-acting-player');

/** Does one thing for this page's player if it is their move (roll, or click a glowing target). */
async function actIfMyMove(page: Page): Promise<boolean> {
  const roll = page.getByTestId('setup-roll-dialog-btn');
  if (await roll.isVisible()) {
    expect(await actingSeat(page)).toBe(await mySeat(page));
    await roll.click();
    return true;
  }
  const node = page.locator('[data-testid^="node-target-"]').first();
  if (await node.count()) {
    const id = (await node.getAttribute('data-testid'))!.replace('node-target-', '');
    // Glowing corners only ever appear on my own move
    expect(await actingSeat(page)).toBe(await mySeat(page));
    await page.locator(`[data-node="${id}"]`).click();
    return true;
  }
  const edge = page.locator('[data-testid^="edge-target-"]').first();
  if (await edge.count()) {
    const id = (await edge.getAttribute('data-testid'))!.replace('edge-target-', '');
    expect(await actingSeat(page)).toBe(await mySeat(page));
    await page.locator(`[data-edge="${id}"]`).click();
    return true;
  }
  return false;
}

async function ownHandTotal(page: Page): Promise<number> {
  let total = 0;
  for (const r of RESOURCES) total += Number(await page.getByTestId(`organiser-count-${r}`).textContent());
  return total;
}

test('host and a friend on separate laptops play the opening on the host server', async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const friendCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const host = await hostCtx.newPage();
  const friend = await friendCtx.newPage();
  const hostStates = recordStates(host);
  const friendStates = recordStates(friend);

  await test.step('host opens the host link; the key leaves the address bar', async () => {
    await host.goto(`/?host=${readHostKey()}`);
    await expect(host.getByTestId('online-host-lobby')).toBeVisible();
    await expect(host.getByTestId('connection-badge')).toHaveAttribute('data-status', 'connected');
    expect(host.url()).not.toContain('host=');
    // Shown to friends without the host key
    await expect(host.getByTestId('online-join-link')).toContainText('http');
    await expect(host.getByTestId('online-join-link')).not.toContainText('host=');
  });

  await test.step('host sets seats: host + friend + two bots, instant bots', async () => {
    await host.getByTestId('online-name-input').fill('Hana');
    await host.getByTestId('online-name-input').blur();
    await host.getByTestId('online-seat-purple-friend').click();
    await host.getByTestId('online-bot-speed-instant').click();
    await expect(host.getByTestId('online-seat-purple')).toHaveAttribute('data-role', 'friend');
    await expect(host.getByTestId('online-start-btn')).toBeDisabled();
    await expect(host.getByTestId('online-start-btn')).toContainText('Waiting for 1 friend');
  });

  await test.step('friend opens the plain link, enters a name and claims the seat', async () => {
    await friend.goto('/');
    await expect(friend.getByTestId('online-friend-lobby')).toBeVisible();
    // Nothing can be claimed before a name is typed
    await expect(friend.getByTestId('online-claim-purple')).toBeDisabled();
    await expect(friend.getByTestId('online-claim-orange')).toHaveCount(0);
    await friend.getByTestId('online-name-input').fill('Finn');
    await friend.getByTestId('online-claim-purple').click();
    await expect(friend.getByTestId('online-waiting')).toBeVisible();
    // The host sees who sits where, and can now start
    await expect(host.getByTestId('online-seat-purple-status')).toHaveText('Connected');
    await expect(host.getByTestId('online-seat-purple')).toContainText('Finn');
    await expect(host.getByTestId('online-start-btn')).toBeEnabled();
  });

  await test.step('host starts: both laptops show the same board', async () => {
    await host.getByTestId('online-start-btn').click();
    await expect(host.getByTestId('tabletop-board')).toBeVisible();
    await expect(friend.getByTestId('tabletop-board')).toBeVisible();
    expect(await mySeat(host)).toBe('orange');
    expect(await mySeat(friend)).toBe('purple');
    const board = (p: Page) => p.getByTestId('tabletop-board').evaluate((el) => el.textContent);
    const hostBoard = await board(host);
    expect(hostBoard).toBeTruthy();
    expect(await board(friend)).toBe(hostBoard);
    await expect(host.getByTestId('corner-station-purple')).toContainText('Finn');
    await expect(friend.getByTestId('corner-station-orange')).toContainText('Hana');
  });

  await test.step('the roll-off goes seat by seat: nobody can act on another turn', async () => {
    // Orange (the host) rolls first
    await expect(host.getByTestId('setup-roll-dialog-btn')).toBeVisible();
    await expect(friend.getByTestId('setup-roll-dialog-btn')).toHaveCount(0);
    await expect(app(friend)).toHaveAttribute('data-acting-player', 'orange');
    await host.getByTestId('setup-roll-dialog-btn').click();
    // ...then it is the friend's turn (the host sees no button)
    await expect(friend.getByTestId('setup-roll-dialog-btn')).toBeVisible();
    await expect(host.getByTestId('setup-roll-dialog-btn')).toHaveCount(0);
    await friend.getByTestId('setup-roll-dialog-btn').click();
  });

  await test.step('towns, cities and roads: each player places on their own turn', async () => {
    await expect
      .poll(
        async () => {
          for (const page of [host, friend]) await actIfMyMove(page);
          return app(host).getAttribute('data-phase');
        },
        { timeout: 45_000, intervals: [50, 100, 250] }
      )
      .toBe('EventPhase');
    // 4 towns and 4 cities on both boards
    for (const page of [host, friend]) {
      await expect(page.locator('[data-testid="island-layer"] [data-piece="town"]')).toHaveCount(4);
      await expect(page.locator('[data-testid="island-layer"] [data-piece="city"]')).toHaveCount(4);
    }
  });

  await test.step('reloading the friend page keeps the seat and the game', async () => {
    await friend.reload();
    await expect(friend.getByTestId('tabletop-board')).toBeVisible();
    await expect(app(friend)).toHaveAttribute('data-my-seat', 'purple');
    await expect(friend.getByTestId('corner-station-purple')).toContainText('Finn');
    await expect(friend.locator('[data-testid="island-layer"] [data-piece="city"]')).toHaveCount(4);
    // The host sees the friend connected again
    await expect(host.getByTestId('corner-station-purple')).not.toContainText('offline');
  });

  await test.step('neither laptop ever sees the other player’s resource cards', async () => {
    for (const [page, states, me] of [
      [host, hostStates, 'orange'],
      [friend, friendStates, 'purple'],
    ] as const) {
      expect(states.length).toBeGreaterThan(5);
      for (const s of states) {
        expect(s.yourPlayerId).toBe(me);
        for (const pid of s.state.playerOrder) {
          if (pid === me) continue;
          const p = s.state.players[pid]!;
          expect(Object.values(p.resources).every((n) => n === 0)).toBe(true);
          expect(p.science).toBe(0);
        }
      }
      // The rail shows other players only as a card count, which matches their own hand
      const other = me === 'orange' ? 'purple' : 'orange';
      const otherPage = me === 'orange' ? friend : host;
      const count = Number(await page.getByTestId(`corner-cards-${other}`).textContent());
      expect(count).toBe(await ownHandTotal(otherPage));
      // The dock only ever shows my own hand
      await expect(page.getByTestId('dock-hand')).toContainText(me === 'orange' ? 'Hana' : 'Finn');
    }
    // The starting hands are real, so the check above is not just zeros against zeros
    const lastHost = hostStates[hostStates.length - 1]!;
    expect(lastHost.state.players.purple!.hiddenResourcesCount).toBeGreaterThan(0);
  });

  await test.step('a third visitor can only watch: every seat is taken', async () => {
    const watcherCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const watcher = await watcherCtx.newPage();
    await watcher.goto('/');
    await expect(watcher.getByTestId('online-midgame-join')).toBeVisible();
    await expect(watcher.locator('[data-testid^="online-claim-"]')).toHaveCount(0);
    await watcher.getByTestId('online-watch-btn').click();
    await expect(watcher.getByTestId('tabletop-board')).toBeVisible();
    await expect(app(watcher)).toHaveAttribute('data-my-seat', 'none');
    await watcherCtx.close();
  });

  await test.step('the same seat in a second window: the older one stops until reclaimed', async () => {
    const second = await friendCtx.newPage();
    await second.goto('/');
    await expect(second.getByTestId('tabletop-board')).toBeVisible();
    await expect(app(second)).toHaveAttribute('data-my-seat', 'purple');
    await expect(friend.getByTestId('online-replaced')).toBeVisible();
    await friend.getByTestId('online-use-this-window').click();
    await expect(friend.getByTestId('tabletop-board')).toBeVisible();
    await expect(second.getByTestId('online-replaced')).toBeVisible();
    await second.close();
  });

  await test.step('a freed seat can be claimed mid-game by a late joiner', async () => {
    const lateCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const late = await lateCtx.newPage();
    await late.goto('/');
    await expect(late.getByTestId('online-midgame-join')).toBeVisible();
    await expect(late.locator('[data-testid^="online-claim-"]')).toHaveCount(0);

    // The friend gives up the seat (sent straight to the server with the friend's seat token)
    const token = await friend.evaluate(() => localStorage.getItem('catan-ne-online-seat-token'));
    expect(token).toBeTruthy();
    const ws = new WebSocket(`ws://localhost:${new URL(friend.url()).port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'hello', name: '', seatToken: token }));
    ws.send(JSON.stringify({ type: 'leaveSeat' }));

    await expect(late.getByTestId('online-claim-purple')).toBeDisabled();
    await late.getByTestId('online-name-input').fill('Lena');
    await late.getByTestId('online-claim-purple').click();
    await expect(late.getByTestId('online-midgame-join')).toHaveCount(0);
    await expect(app(late)).toHaveAttribute('data-my-seat', 'purple');
    await expect(late.getByTestId('corner-station-purple')).toContainText('Lena');
    await expect(host.getByTestId('corner-station-purple')).toContainText('Lena');
    ws.close();
    await lateCtx.close();
  });

  await hostCtx.close();
  await friendCtx.close();
});
