import { expect, test } from '@playwright/test';

/**
 * Production Increase: the player with the highest footprint may place a free fossil plant or pass.
 * Passing works from the banner and from the dock's main button (there are two Pass buttons).
 */
const PRODUCTION_INCREASE = '/?scenario=productionincrease&bots=0';

test.describe('CATAN: New Energies — production increase pass', () => {
  test('the dock offers Pass next to the banner, and both say what else can be done', async ({ page }) => {
    await page.goto(PRODUCTION_INCREASE);
    const banner = page.getByTestId('pending-decision-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('free fossil plant');
    await expect(page.getByTestId('pass-production-increase-btn')).toBeVisible();

    const dockPass = page.getByTestId('action-pass-production-increase-btn');
    await expect(dockPass).toBeEnabled();
    await expect(dockPass).toHaveText(/Pass/);
    await expect(page.getByTestId('bottom-player-dock')).toContainText('Or click a glowing spot on the board to build');
  });

  test('passing from the dock resolves the event', async ({ page }) => {
    await page.goto(PRODUCTION_INCREASE);
    await page.getByTestId('action-pass-production-increase-btn').click();

    await expect(page.getByTestId('pending-decision-banner')).toHaveCount(0);
    await expect(page.getByTestId('action-pass-production-increase-btn')).toHaveCount(0);
    await expect(page.getByTestId('game-log')).toContainText('passed on a free fossil fuel plant');
    // Back to the normal turn flow
    await expect(page.getByTestId('action-draw-event-btn')).toBeVisible();
  });

  test('passing from the banner still works', async ({ page }) => {
    await page.goto(PRODUCTION_INCREASE);
    await page.getByTestId('pass-production-increase-btn').click();
    await expect(page.getByTestId('pending-decision-banner')).toHaveCount(0);
    await expect(page.getByTestId('game-log')).toContainText('passed on a free fossil fuel plant');
  });
});
