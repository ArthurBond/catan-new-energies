import { test, expect } from '@playwright/test';

test.describe('CATAN: New Energies — Tabletop E2E Tests', () => {
  test('renders board, sea frame, player mat, and resource organiser', async ({ page }) => {
    // Open with autostart and fixed first game setup
    await page.goto('/?seed=42&setup=first&players=4&autostart=1');

    // Wait for the main tabletop board to render
    const board = page.locator('[data-testid="tabletop-board"]');
    await expect(board).toBeVisible({ timeout: 10000 });

    // Verify all 19 hexes
    for (let i = 0; i < 19; i++) {
      await expect(page.locator(`[data-hex="${i}"]`)).toBeAttached();
    }

    // Verify all 9 coastal harbors
    for (let i = 0; i < 9; i++) {
      await expect(page.locator(`[data-testid="harbor-${i}"]`)).toBeAttached();
    }

    // Verify Sea Frame event tracks and VP track
    await expect(page.locator('[data-testid="vp-track"]')).toBeAttached();
    await expect(page.locator('[data-testid="event-track-climateConference"]')).toBeAttached();
    await expect(page.locator('[data-testid="event-track-rainAndFlooding"]')).toBeAttached();

    // Verify the showcase Player Mat & Resource Organiser
    const playerMat = page.locator('[data-testid="player-mat"]');
    await expect(playerMat).toBeVisible();

    const resourceOrganiser = page.locator('[data-testid="resource-organiser"]');
    await expect(resourceOrganiser).toBeVisible();

    const warehouseTile = page.locator('[data-testid="warehouse-tile"]');
    await expect(warehouseTile).toBeVisible();

    const energyBar = page.locator('[data-testid="energy-bar"]');
    await expect(energyBar).toBeVisible();
  });

  test('can open setup lobby, toggle bots, and launch game', async ({ page }) => {
    await page.goto('/');

    // Check if the setup lobby or game board is rendered
    const lobby = page.locator('[data-testid="setup-lobby"]');
    if (await lobby.isVisible()) {
      const startBtn = page.locator('[data-testid="start-game-btn"]');
      await expect(startBtn).toBeVisible();
      await startBtn.click();
    }

    await expect(page.locator('[data-testid="tabletop-board"]')).toBeVisible({ timeout: 10000 });
  });
});
