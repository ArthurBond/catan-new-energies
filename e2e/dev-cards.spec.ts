import { expect, test } from '@playwright/test';

/** Mid-game table where Orange holds a Clean Up and a Road Construction card. */
const SHOWCASE = '/?scenario=showcase&bots=0';

test.describe('CATAN: New Energies — development cards played on the board', () => {
  test('Road Construction places two free roads by clicking paths', async ({ page }) => {
    await page.goto(SHOWCASE);
    const roads = page.locator('[data-testid="island-layer"] [data-testid^="road-"]:not([data-testid^="road-preview"])');
    const before = await roads.count();

    await page.getByTestId('dev-card-dev_roadConstruction_01').click();
    const prompt = page.getByTestId('dev-card-board-prompt');
    await expect(prompt).toContainText('first free road');

    const firstTarget = page.locator('[data-testid^="edge-target-"]').first();
    const firstId = (await firstTarget.getAttribute('data-testid'))!.replace('edge-target-', '');
    await page.locator(`[data-edge="${firstId}"]`).click();
    await expect(prompt).toContainText('second free road');
    // The first road waits on the board as a ghost
    await expect(page.getByTestId(`road-preview-${firstId}`)).toBeAttached();

    const secondTarget = page.locator('[data-testid^="edge-target-"]').first();
    const secondId = (await secondTarget.getAttribute('data-testid'))!.replace('edge-target-', '');
    await page.locator(`[data-edge="${secondId}"]`).click();

    await expect(prompt).toHaveCount(0);
    await expect(roads).toHaveCount(before + 2);
    await expect(page.getByTestId('dev-card-dev_roadConstruction_01')).toHaveCount(0);
  });

  test('Clean Up moves the inspector by clicking a hex', async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.getByTestId('dev-card-dev_cleanup_01').click();
    await page.getByTestId('cleanup-option-inspector').click();
    await expect(page.getByTestId('dev-card-board-prompt')).toContainText('move the inspector');

    const target = page.locator('[data-testid^="hex-target-"]').first();
    await target.locator('xpath=..').click({ force: true });

    // Either a victim chooser appears or the card resolves straight away
    const chooser = page.getByTestId('steal-chooser');
    if (await chooser.isVisible().catch(() => false)) {
      await chooser.locator('[data-testid^="steal-from-"]').first().click();
    }
    await expect(page.getByTestId('dev-card-board-prompt')).toHaveCount(0);
    await expect(page.getByTestId('dev-card-dev_cleanup_01')).toHaveCount(0);
    await expect(page.getByTestId('live-action-banner')).toContainText('played Clean Up');
  });

  test('Escape cancels a card being played on the board', async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.getByTestId('dev-card-dev_roadConstruction_01').click();
    await expect(page.getByTestId('dev-card-board-prompt')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('dev-card-board-prompt')).toHaveCount(0);
    await expect(page.getByTestId('dev-card-dev_roadConstruction_01')).toBeVisible();
  });
});
