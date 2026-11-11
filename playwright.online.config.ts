import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ONLINE_GAME_PORT, ONLINE_INVITE_CODE, ONLINE_PUBLIC_PORT, ONLINE_PUBLIC_URL } from './e2e-online/online-constants';

/**
 * Two "laptops" (browser contexts) play on the built game server (`node dist-server/main.js`).
 * Run with `npm run test:e2e:online` (builds client + server first). The regular config
 * (`playwright.config.ts`, dev server, offline mode) is untouched.
 *
 * Two servers run: the home-network one (PORT) and one started like `npm run host:online`, with
 * a stand-in for Tailscale Funnel in front of it (`online-link.spec.ts`).
 */
const PORT = 3299;
const SAVES_DIR = path.join(os.tmpdir(), 'catan-ne-online-e2e-saves');
const ONLINE_SAVES_DIR = path.join(os.tmpdir(), 'catan-ne-online-link-e2e-saves');
// Workers inherit this, so the tests can read the host key the server writes into the saves dir.
process.env.CATAN_E2E_SAVES_DIR = SAVES_DIR;
process.env.CATAN_E2E_ONLINE_SAVES_DIR = ONLINE_SAVES_DIR;

export default defineConfig({
  testDir: './e2e-online',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // Google Chrome by default. On a computer without it, point PW_CHROMIUM_PATH at any
      // Chromium program (for example one Playwright downloaded earlier) to use that instead.
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : { channel: 'chrome' }),
      },
    },
  ],
  webServer: [
    {
      // Wipes the saves folder, then starts the server (see the script)
      command: 'node e2e-online/start-server.mjs',
      url: `http://localhost:${PORT}/api/server-info`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(PORT),
        NO_OPEN: '1',
        BOT_DELAY_MS: '0',
        SAVES_DIR,
      },
    },
    {
      // Ready once the game answers through the stand-in Funnel's HTTPS address
      command: 'node e2e-online/start-online-server.mjs',
      url: `${ONLINE_PUBLIC_URL}/api/server-info`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(ONLINE_GAME_PORT),
        FAKE_TS_PUBLIC_PORT: String(ONLINE_PUBLIC_PORT),
        INVITE_CODE: ONLINE_INVITE_CODE,
        BOT_DELAY_MS: '0',
        SAVES_DIR: ONLINE_SAVES_DIR,
      },
    },
  ],
});
