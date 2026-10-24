import { expect, test, type Page } from '@playwright/test';

/** Mid-game table with hazards on a hex and on two buildings, Orange holding a Clean Up card. */
const SHOWCASE = '/?scenario=showcase&bots=0';

const hazards = (page: Page) => page.locator('[data-testid^="hex-hazard-"], [data-testid^="node-hazard-"]');
const inspectorHexId = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-hex][aria-label*="has Environmental Inspector"]')?.getAttribute('data-hex') ?? null);

async function chooseVictimIfAsked(page: Page) {
  const chooser = page.getByTestId('steal-chooser');
  if (await chooser.isVisible().catch(() => false)) await chooser.locator('[data-testid^="steal-from-"]').first().click();
}

test.describe('Clean Up is move the inspector OR remove a hazard', () => {
  test('moving the inspector leaves every hazard token on the board', async ({ page }) => {
    await page.goto(SHOWCASE);
    const before = await hazards(page).count();
    const inspectorBefore = await inspectorHexId(page);
    expect(before).toBeGreaterThanOrEqual(3);

    await page.getByTestId('dev-card-dev_cleanup_01').click();
    await page.getByTestId('cleanup-option-inspector').click();
    await page.locator('[data-testid^="hex-target-"]').first().locator('xpath=..').click({ force: true });
    await chooseVictimIfAsked(page);
    await expect(page.getByTestId('dev-card-dev_cleanup_01')).toHaveCount(0);

    expect(await inspectorHexId(page)).not.toBe(inspectorBefore);
    await expect(hazards(page)).toHaveCount(before);
    await expect(page.getByTestId('game-log')).toContainText('moved Inspector');
    await expect(page.getByTestId('game-log')).not.toContainText('removed 1 hazard');
  });

  test('removing a hazard takes exactly one and leaves the inspector where it was', async ({ page }) => {
    await page.goto(SHOWCASE);
    const before = await hazards(page).count();
    const inspectorBefore = await inspectorHexId(page);

    await page.getByTestId('dev-card-dev_cleanup_01').click();
    await page.getByTestId('cleanup-option-hazard').click();
    await page.locator('[data-testid^="hex-target-"], [data-testid^="node-target-"]').first().locator('xpath=..').click({ force: true });
    await chooseVictimIfAsked(page);
    await expect(page.getByTestId('dev-card-dev_cleanup_01')).toHaveCount(0);

    await expect(hazards(page)).toHaveCount(before - 1);
    expect(await inspectorHexId(page)).toBe(inspectorBefore);
    await expect(page.getByTestId('game-log')).toContainText('removed 1 hazard');
    await expect(page.getByTestId('game-log')).not.toContainText('moved Inspector');
  });
});
