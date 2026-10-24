import { expect, test, type Page } from '@playwright/test';

const feed = (page: Page) => page.locator('[data-testid="game-log"] .tt-feed-item').allInnerTexts();

async function openPlayersTab(page: Page) {
  await page.getByTestId('action-open-trade-btn').click();
  await page.getByTestId('trade-tab-domestic').click();
}

test('an offer goes to each player in turn until someone takes it, and is remembered for the turn', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  await openPlayersTab(page);

  // Default: everyone, in turn order after the active player
  const toggle = page.getByTestId('trade-auto-offer-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-testid^="offer-order-"]')).toHaveCount(3);
  await page.getByTestId('domestic-give-steel').click();
  await page.getByTestId('domestic-want-brick').click();
  const send = page.getByTestId('send-domestic-offer-btn');
  await expect(send).toHaveText('Offer 1 steel for 1 brick to Purple, then Pink, then Blue');

  // Change the order: Blue first, then Purple, then Pink
  await page.getByTestId('offer-up-blue').click();
  await page.getByTestId('offer-up-blue').click();
  await expect(send).toHaveText('Offer 1 steel for 1 brick to Blue, then Purple, then Pink');
  await send.click();

  // Blue is asked first; declining passes the same offer to Purple
  const prompt = page.getByTestId('pending-decision-modal');
  await expect(prompt).toContainText('Orange offers Blue a trade');
  await page.getByTestId('decline-trade-btn').click();
  await expect(prompt).toContainText('Orange offers Purple a trade');
  await expect(prompt).toContainText('1x steel in exchange for your 1x brick');
  await page.getByTestId('decline-trade-btn').click();

  // Pink holds no brick, so is not shown an offer she could only decline; nobody is left
  await expect(prompt).toHaveCount(0);
  const lines = await feed(page);
  expect(lines).toContain('Orange offered the trade to Purple next.');
  expect(lines).toContain('Pink cannot cover the trade offer and was skipped.');
  expect(lines).toContain("Nobody took Orange's trade offer.");

  // Later in the same turn the same offer and order are waiting
  await openPlayersTab(page);
  await expect(page.getByTestId('send-domestic-offer-btn')).toHaveText(
    'Offer 1 steel for 1 brick to Blue, then Purple, then Pink'
  );
  await expect(page.getByTestId('domestic-give-steel')).toHaveAttribute('data-selected', 'true');

  // One player only: just Pink, and a decline ends it
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('domestic-target-pink').click();
  await expect(page.getByTestId('send-domestic-offer-btn')).toHaveText('Offer 1 steel for 1 brick to Pink');
  await page.getByTestId('send-domestic-offer-btn').click();
  await expect(prompt).toContainText('Orange offers Pink a trade');
  await page.getByTestId('decline-trade-btn').click();
  await expect(prompt).toHaveCount(0);
  expect((await feed(page))[0]).toBe('Pink declined the trade offer.');
});

test('the offer starts fresh on the first trade of a new turn', async ({ page }) => {
  // Orange is the only human; the bots take their turns on their own
  await page.goto(`/?scenario=showcase&bots=3&seed=42`);
  await openPlayersTab(page);
  await page.getByTestId('domestic-give-steel').click();
  await page.getByTestId('domestic-want-brick').click();
  await page.getByTestId('send-domestic-offer-btn').click();
  // The bots answer for themselves
  await expect(page.getByTestId('pending-decision-modal')).toHaveCount(0, { timeout: 15000 });
  await page.getByTestId('action-open-trade-btn').click();
  await expect(page.getByTestId('send-domestic-offer-btn')).toHaveText(/^Offer 1 steel for 1 brick to /);
  await page.getByTestId('close-trade-modal').click();

  // Pass the turn and wait for it to come round again, clearing any discard a bot's 7 asks of Orange
  await page.getByTestId('action-end-turn-btn').click();
  const cards = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'];
  const myTurn = page.getByTestId('action-draw-event-btn');
  for (let step = 0; step < 120 && !(await myTurn.isVisible()); step++) {
    if (await page.getByTestId('confirm-discard-btn').isVisible()) {
      for (const card of cards) {
        const pick = page.getByTestId(`discard-card-${card}`);
        while ((await pick.isEnabled()) && !(await page.getByTestId('confirm-discard-btn').isEnabled())) await pick.click();
      }
      await page.getByTestId('confirm-discard-btn').click();
    }
    await page.waitForTimeout(250);
  }
  await expect(myTurn).toBeVisible();
  await myTurn.click();
  await page.getByTestId('action-roll-dice-btn').click();
  await expect(page.getByTestId('action-end-turn-btn')).toBeVisible();

  // A new turn: the first trade starts empty, but who offers go to is still as chosen
  await page.getByTestId('action-open-trade-btn').click();
  await page.getByTestId('trade-tab-domestic').click();
  await expect(page.getByTestId('domestic-give-steel')).toHaveAttribute('data-selected', 'false');
  await expect(page.getByTestId('send-domestic-offer-btn')).toHaveText('Choose what you offer and what you ask for');
  await expect(page.getByTestId('trade-auto-offer-toggle')).toHaveAttribute('aria-checked', 'true');
});
