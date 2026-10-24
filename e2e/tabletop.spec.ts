import { test, expect } from '@playwright/test';

test.describe('CATAN: New Energies — Tabletop E2E Tests', () => {
  test('renders board, sea frame, hand dock, and the player board drawer', async ({ page }) => {
    // Beginner board with the rulebook starting positions
    await page.goto('/?seed=42&setup=first&placement=fixed&players=4');

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

    // The hand dock shows the human's cards and the build palette
    await expect(page.locator('[data-testid="bottom-player-dock"]')).toBeVisible();
    await expect(page.locator('[data-testid="organiser-slot-lumber"]')).toBeVisible();
    await expect(page.locator('[data-testid="build-town"]')).toBeVisible();

    // The detailed player board opens in a drawer
    await page.locator('[data-testid="toggle-player-mat-btn"]').click();
    await expect(page.locator('[data-testid="player-mat"]')).toBeVisible();
    await expect(page.locator('[data-testid="warehouse-tile"]')).toBeVisible();
    await expect(page.locator('[data-testid="energy-bar"]')).toBeVisible();
  });

  test('can open the new game sheet, choose options, and start', async ({ page }) => {
    await page.goto('/?lobby=1');

    const lobby = page.locator('[data-testid="setup-lobby"]');
    await expect(lobby).toBeVisible();
    await page.locator('[data-testid="lobby-setup-standard"]').click();
    // Fixed positions only exist on the beginner layout
    await expect(page.locator('[data-testid="lobby-placement-fixed"]')).toBeDisabled();
    await page.locator('[data-testid="start-game-btn"]').click();

    await expect(page.locator('[data-testid="tabletop-board"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="setup-roll-overlay"]')).toBeVisible();
  });
});
