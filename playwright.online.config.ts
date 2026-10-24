import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Two "laptops" (browser contexts) play on the built game server (`node dist-server/main.js`).
 * Run with `npm run test:e2e:online` (builds client + server first). The regular config
 * (`playwright.config.ts`, dev server, offline mode) is untouched.
 */
const PORT = 3299;
const SAVES_DIR = path.join(os.tmpdir(), 'catan-ne-online-e2e-saves');
// Workers inherit this, so the tests can read the host key the server writes into the saves dir.
process.env.CATAN_E2E_SAVES_DIR = SAVES_DIR;

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
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
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
});
