import { expect, test } from '@playwright/test';

/**
 * A card-choice prompt (Climate Conference reward, Sustainable Production, Government Funding) can be
 * hidden to look at the board and the player's hand. A floating note and the dock's main button bring it back.
 */
const CARD_CHOICE = '/?scenario=cardchoice&bots=0';

test.describe('CATAN: New Energies — peeking at the board during a card choice', () => {
  test('the prompt shows the supply on each card and the hand under it', async ({ page }) => {
    await page.goto(CARD_CHOICE);
    const modal = page.getByTestId('pending-decision-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Climate Conference: Orange is rewarded');

    // Orange starts the scenario with 2 lumber and 3 science
    await expect(page.getByTestId('in-hand-lumber')).toHaveText('×2');
    await expect(page.getByTestId('in-hand-science')).toHaveText('×3');
    await expect(page.getByTestId('in-hand-natural_fiber')).toHaveText('×1');

    // The badge fits under its 72px card
    const card = (await page.getByTestId('decision-card-lumber').boundingBox())!;
    const badge = (await page.getByTestId('in-hand-lumber').boundingBox())!;
    expect(badge.width).toBeLessThanOrEqual(card.width);
    expect(Math.abs(badge.x + badge.width / 2 - (card.x + card.width / 2))).toBeLessThan(2);

    await page.screenshot({ path: test.info().outputPath('card-choice.png') });
  });

  test('peek hides the prompt, and either Unhide button brings it back', async ({ page }) => {
    await page.goto(CARD_CHOICE);
    await page.getByTestId('peek-board-btn').click();

    await expect(page.getByTestId('pending-decision-modal')).toHaveCount(0);
    const note = page.getByTestId('peeking-card-choice-banner');
    await expect(note).toBeVisible();
    const dockBtn = page.getByTestId('unhide-card-choice-btn');
    await expect(dockBtn).toHaveText('Unhide card selection');
    await expect(dockBtn).toHaveClass(/is-resume/);
    await expect(page.getByTestId('bottom-player-dock')).toContainText('Return to pick your free card');
    // The floating note is not hidden behind the top bar
    const noteBox = (await note.boundingBox())!;
    const barBox = (await page.getByTestId('status-hud-bar').boundingBox())!;
    expect(noteBox.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 1);

    await page.screenshot({ path: test.info().outputPath('card-choice-peeking.png') });

    await dockBtn.click();
    await expect(page.getByTestId('pending-decision-modal')).toBeVisible();
    await expect(note).toHaveCount(0);

    // The note's own button and Escape work too
    await page.getByTestId('peek-board-btn-bottom').click();
    await page.getByTestId('banner-unhide-card-choice-btn').click();
    await expect(page.getByTestId('pending-decision-modal')).toBeVisible();
    await page.getByTestId('peek-board-btn').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pending-decision-modal')).toBeVisible();
  });

  test('the next tied player starts with the prompt open', async ({ page }) => {
    await page.goto('/?scenario=cardchoicetie&bots=0');
    await page.getByTestId('peek-board-btn').click();
    await page.getByTestId('unhide-card-choice-btn').click();
    await page.getByTestId('decision-card-lumber').click();

    // Blue is next, with the prompt showing and nothing hidden
    await expect(page.getByTestId('pending-decision-modal')).toContainText('Blue');
    await expect(page.getByTestId('peeking-card-choice-banner')).toHaveCount(0);
  });

  test('taking a card works after a peek', async ({ page }) => {
    await page.goto(CARD_CHOICE);
    await page.getByTestId('peek-board-btn').click();
    await page.getByTestId('unhide-card-choice-btn').click();
    await page.getByTestId('decision-card-steel').click();
    await expect(page.getByTestId('pending-decision-modal')).toHaveCount(0);
    await expect(page.getByTestId('game-log')).toContainText('took 1 steel card from the supply');
  });
});
