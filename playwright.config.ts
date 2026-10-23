import { defineConfig, devices } from '@playwright/test';

// PW_PORT lets several checkouts (e.g. git worktrees) run their browser tests side by side,
// each against its own dev server instead of reusing whichever one is on 5173.
const port = Number(process.env.PW_PORT ?? 5173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: port === 5173 ? 'npm run dev' : `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
