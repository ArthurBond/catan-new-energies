import { expect, test } from '@playwright/test';

/**
 * The Climate Conference penalty is answered in the same docked panel as a discard on a 7
 * (board in view, no backdrop), but one tap on a card discards it: no steppers, no confirm button.
 * The dev scenario gives Orange the penalty (a card Orange holds none of is covered in the unit tests).
 */
const EVENT_DISCARD = '/?scenario=eventdiscard&bots=0';

test.describe('CATAN: New Energies — event penalty discard', () => {
  test('is docked under the board with no steppers or confirm button', async ({ page }) => {
    await page.goto(EVENT_DISCARD);
    const panel = page.getByTestId('pending-decision-modal');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Climate Conference: Orange discards 1 card');
    await expect(panel).toContainText('Tap a card to discard');

    await expect(page.getByTestId('bottom-player-dock').getByTestId('pending-decision-modal')).toBeVisible();
    await expect(page.locator('.md-stepper')).toHaveCount(0);
    await expect(page.getByTestId('confirm-discard-btn')).toHaveCount(0);

    // The island is not covered by a backdrop, and the hexes Orange builds on are lit
    const stage = (await page.getByTestId('tabletop-board').boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
    expect(await page.locator('[data-testid^="hex-yours-"]').count()).toBeGreaterThan(0);

    await page.screenshot({ path: test.info().outputPath('event-discard.png') });
  });

  test('one tap on a card discards it and the game moves on', async ({ page }) => {
    await page.goto(EVENT_DISCARD);
    const cards = page.getByTestId('corner-cards-orange');
    const before = Number(await cards.textContent());
    const food = page.getByTestId('discard-card-food');
    const foodBefore = Number(await page.getByTestId('discard-held-food').textContent());
    expect(foodBefore).toBeGreaterThan(0);

    await food.click();

    await expect(page.getByTestId('pending-decision-modal')).toHaveCount(0);
    await expect(cards).toHaveText(String(before - 1));
    await expect(page.getByTestId('game-log')).toContainText('discarded 1 food card');
    await expect(page.getByTestId('dock-hand')).toBeVisible();
  });
});
