import { expect, test, type Page } from '@playwright/test';

const feed = (page: Page) => page.locator('[data-testid="game-log"] .tt-feed-item').allInnerTexts();

const KINDS = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const;

/** The cards in the hand shown on the player board. */
async function hand(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const kind of KINDS) {
    out[kind] = Number(await page.getByTestId(`organiser-count-${kind}`).innerText());
  }
  return out;
}

async function openAskTab(page: Page) {
  await page.getByTestId('action-open-trade-btn').click();
  await page.getByTestId('trade-tab-domestic').click();
  await page.getByTestId('trade-mode-ask').click();
}

/** What an offer row asks of the requester ("You give" chips), e.g. { food: 1 }. */
async function youGive(page: Page, playerId: string): Promise<Record<string, number>> {
  const chips = page.getByTestId(`request-offer-${playerId}`).locator('.tr-chips').nth(1).locator('.tr-chip');
  const out: Record<string, number> = {};
  for (const chip of await chips.all()) {
    const kind = (await chip.getAttribute('data-kind'))!;
    out[kind] = Number((await chip.locator('b').innerText()).replace('×', ''));
  }
  return out;
}

test('ask for a card: the bots name their price, you take one offer and the hands change', async ({ page }) => {
  // Orange is the only human; Purple, Pink and Blue are bots
  await page.goto('/?scenario=showcase&bots=3');
  const before = await hand(page);
  expect(before.brick).toBe(1);

  await openAskTab(page);
  await expect(page.getByTestId('ask-for-cards-panel')).toBeVisible();
  await expect(page.getByTestId('send-trade-request-btn')).toBeDisabled();
  await page.getByTestId('request-ask-brick').click();
  await expect(page.getByTestId('send-trade-request-btn')).toHaveText('Ask everyone for 1 brick');
  await page.getByTestId('send-trade-request-btn').click();

  // The bots reply on their own; then every offer is shown together
  const choice = page.getByTestId('trade-request-choice');
  await expect(choice).toBeVisible({ timeout: 15000 });
  await expect(choice).toContainText('2 offers for 1 brick');
  // Pink holds no brick: not asked, no offer from her
  await expect(page.getByTestId('request-offer-purple')).toBeVisible();
  await expect(page.getByTestId('request-offer-blue')).toBeVisible();
  await expect(page.getByTestId('request-offer-pink')).toHaveCount(0);
  const lines = await feed(page);
  expect(lines).toContain('Orange asked for 1 brick.');
  expect(lines).toContain('Pink has no brick and was skipped.');
  expect(lines.some((l) => /^Purple offered 1 brick for /.test(l))).toBe(true);
  expect(lines.some((l) => /^Blue offered 1 brick for /.test(l))).toBe(true);

  // Take Purple's offer: the brick comes in, what she asked for goes out
  const price = await youGive(page, 'purple');
  await page.getByTestId('accept-request-offer-purple').click();
  await expect(page.getByTestId('pending-decision-modal')).toHaveCount(0);
  const after = await hand(page);
  const expected: Record<string, number> = { ...before, brick: before.brick! + 1 };
  for (const [kind, n] of Object.entries(price)) expected[kind] = expected[kind]! - n;
  expect(after).toEqual(expected);
  expect((await feed(page))[0]).toBe("Orange took Purple's offer.");

  // Orange can carry on with her turn
  await expect(page.getByTestId('action-end-turn-btn')).toBeVisible();
});

test('saying no thanks to every offer ends the request and changes nothing', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=3');
  const before = await hand(page);
  await openAskTab(page);
  await page.getByTestId('request-ask-brick').click();
  await page.getByTestId('send-trade-request-btn').click();
  await expect(page.getByTestId('trade-request-choice')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('decline-request-offers-btn').click();
  await expect(page.getByTestId('pending-decision-modal')).toHaveCount(0);
  expect(await hand(page)).toEqual(before);
  expect((await feed(page))[0]).toBe('Orange turned down every offer.');
});

test('people answer in turn on a shared screen: reply, pass, then the requester chooses', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  await openAskTab(page);
  await page.getByTestId('request-ask-brick').click();
  await page.getByTestId('send-trade-request-btn').click();

  // Purple is first after Orange and holds a brick: she gets the prompt
  const prompt = page.getByTestId('pending-decision-modal');
  await expect(prompt).toContainText('Orange wants 1 brick');
  await expect(prompt).toContainText('What would you want for it, Purple?');
  await expect(page.getByTestId('trade-reply-offer-btn')).toBeDisabled();
  await page.getByTestId('trade-reply-want-steel').click();
  await page.getByTestId('trade-reply-want-steel').click();
  await expect(page.getByTestId('trade-reply-offer-btn')).toHaveText('Offer 1 brick for 2 steel');
  await page.getByTestId('trade-reply-offer-btn').click();

  // Pink holds no brick and is skipped; Blue is asked and passes
  await expect(prompt).toContainText('What would you want for it, Blue?');
  await page.getByTestId('trade-reply-pass-btn').click();

  // Orange sees the one offer and takes it
  await expect(page.getByTestId('trade-request-choice')).toContainText('An offer for 1 brick');
  const lines = await feed(page);
  expect(lines).toContain('Purple offered 1 brick for 2 steel.');
  expect(lines).toContain('Pink has no brick and was skipped.');
  expect(lines).toContain('Blue passed.');
  const before = await hand(page);
  expect(before.steel).toBe(3);
  await page.getByTestId('accept-request-offer-purple').click();
  await expect(prompt).toHaveCount(0);
  const after = await hand(page);
  expect(after).toEqual({ ...before, brick: before.brick! + 1, steel: before.steel! - 2 });
});
