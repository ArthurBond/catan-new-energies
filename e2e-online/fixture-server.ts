import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { FIXTURE_FRIEND_TOKEN, FIXTURE_HOST_KEY, type FixtureName } from './fixture-constants';

/**
 * Starts the built game server (dist-server/main.js) on a free port, resuming a prepared game
 * from `make-fixture.ts`. One server per test file keeps every fixture's first move untouched.
 */
export interface FixtureServer {
  baseURL: string;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

export async function startFixtureServer(fixture: FixtureName): Promise<FixtureServer> {
  const root = process.cwd();
  const savesDir = fs.mkdtempSync(path.join(os.tmpdir(), `catan-ne-fixture-${fixture}-`));
  const viteNode = path.join(root, 'node_modules', 'vite-node', 'vite-node.mjs');
  execFileSync(process.execPath, [viteNode, 'e2e-online/make-fixture.ts'], {
    cwd: root,
    env: { ...process.env, FIXTURE: fixture, SAVES_DIR: savesDir },
    stdio: 'inherit',
  });

  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [path.join(root, 'dist-server', 'main.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NO_OPEN: '1', BOT_DELAY_MS: '0', SAVES_DIR: savesDir },
    stdio: 'ignore',
  });
  const baseURL = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(savesDir, { recursive: true, force: true });
  };

  const started = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error('The game server stopped while starting.');
    try {
      const res = await fetch(`${baseURL}/api/server-info`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - started > 20_000) {
      await stop();
      throw new Error('The game server did not start in time.');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { baseURL, stop };
}

/** The host's laptop: the host link puts the page straight on the host seat (orange). */
export async function openHost(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('catan-ne-online-name', 'Hana');
    } catch {
      /* storage blocked: the test will show it */
    }
  });
  const page = await context.newPage();
  await page.goto(`/?host=${FIXTURE_HOST_KEY}`);
  return { context, page };
}

/** The friend's laptop, already holding the seat token of purple (Finn). */
export async function openFriend(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript((token) => {
    try {
      localStorage.setItem('catan-ne-online-seat-token', token);
    } catch {
      /* storage blocked: the test will show it */
    }
  }, FIXTURE_FRIEND_TOKEN);
  const page = await context.newPage();
  await page.goto('/');
  return { context, page };
}
