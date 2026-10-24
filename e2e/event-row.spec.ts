import { expect, test, type Page } from '@playwright/test';

/** The row as shown: track, discs on it and spaces left, left to right. */
async function rowState(page: Page) {
  return page.locator('[data-testid^="event-row-item-"]').evaluateAll((els) =>
    els.map((el) => ({
      type: (el.getAttribute('data-testid') ?? '').replace('event-row-item-', ''),
      filled: Number(el.getAttribute('data-filled')),
      capacity: Number(el.getAttribute('data-capacity')),
      remaining: Number(el.getAttribute('data-remaining')),
    }))
  );
}

test('the rail shows the seven event icons, fewest spaces left first', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  await expect(page.getByTestId('event-row')).toBeVisible();
  const row = await rowState(page);
  expect(row).toHaveLength(7);

  // Showcase: Climate Conference 2/3 and Air Pollution 2/3 (nothing in the log, so board order breaks the tie),
  // then Government Funding 1/3, the untouched 3-space tracks, Rain & Flooding 1/4, the untouched 4-space ones
  expect(row.map((r) => r.type)).toEqual([
    'climateConference',
    'airPollution',
    'governmentFunding',
    'productionIncrease',
    'rainAndFlooding',
    'sustainableProduction',
    'environmentalPollution',
  ]);
  expect(row.map((r) => r.remaining)).toEqual([1, 1, 2, 3, 3, 4, 4]);

  // The board's own icon and the track's progress are on each item, with a label that says the same in words
  const air = page.getByTestId('event-row-item-airPollution');
  await expect(air).toHaveAttribute('aria-label', 'Air Pollution: 2 of 3 discs, 1 to go');
  await expect(air).toHaveAttribute('title', 'Air Pollution: 2 of 3 discs, 1 to go');
  await expect(air.locator('svg [data-token="event-disc"]')).toHaveCount(1);
  await expect(air.locator('.tt-event-pips i')).toHaveCount(3);
  await expect(air.locator('.tt-event-pips i[data-on="true"]')).toHaveCount(2);
  await expect(page.getByTestId('event-row-item-rainAndFlooding')).toHaveAttribute(
    'aria-label',
    'Rain & Flooding: 1 of 4 discs, 3 to go'
  );
  await expect(page.getByTestId('event-row-item-environmentalPollution').locator('.tt-event-pips i')).toHaveCount(4);
});

test('the order updates when a disc is drawn', async ({ page }) => {
  // Showcase with the next disc set to Air Pollution, which already holds two of its three discs
  await page.goto('/?scenario=airpollution&bots=0');
  const before = await rowState(page);
  expect(before.slice(0, 2).map((r) => r.type)).toEqual(['climateConference', 'airPollution']);

  await page.getByTestId('action-draw-event-btn').click();

  // The track filled and cleared: it is back to three spaces and drops behind the tracks that still hold discs
  await expect(page.getByTestId('event-row-item-airPollution')).toHaveAttribute('data-remaining', '3');
  const after = await rowState(page);
  expect(after.map((r) => r.type)).toEqual([
    'climateConference',
    'governmentFunding',
    'airPollution',
    'productionIncrease',
    'rainAndFlooding',
    'sustainableProduction',
    'environmentalPollution',
  ]);
  expect(after.find((r) => r.type === 'airPollution')).toMatchObject({ filled: 0, capacity: 3 });
});

test('a drawn disc moves its track ahead of tracks that are level with it', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  const before = await rowState(page);

  // Pass the turn: the next player draws an event disc (bots are off, so every seat is a person)
  await page.getByTestId('action-end-turn-btn').click();
  await page.getByTestId('action-draw-event-btn').click();
  await expect(page.getByTestId('hud-bag-count')).toHaveText(/42/);

  const after = await rowState(page);
  const sum = (rows: typeof before) => rows.reduce((n, r) => n + r.filled, 0);
  const changed = after.filter((a) => a.filled !== before.find((b) => b.type === a.type)!.filled);
  expect(changed).toHaveLength(1);
  const drawn = changed[0]!;

  // Always: fewest spaces left first
  for (let i = 1; i < after.length; i++) expect(after[i]!.remaining).toBeGreaterThanOrEqual(after[i - 1]!.remaining);

  if (drawn.filled > 0) {
    expect(sum(after)).toBe(sum(before) + 1);
    // Its disc is the newest, so no track with the same number of spaces left comes before it
    const level = after.filter((r) => r.remaining === drawn.remaining);
    expect(level[0]!.type).toBe(drawn.type);
  } else {
    // It filled and cleared, which is back to all of its spaces
    expect(drawn.remaining).toBe(drawn.capacity);
  }
});

test('an item opens the same rules popover as its island', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  await page.getByTestId('event-row-item-governmentFunding').click();
  const popover = page.getByTestId('event-info-popover');
  await expect(popover).toContainText('Government Funding');
  await expect(popover).toContainText('1 of 3 discs');
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`the row fits the rail without overlap or scrolling at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?scenario=showcase&bots=0');
    await expect(page.getByTestId('event-row')).toBeVisible();

    const m = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="right-table-margin"]') as HTMLElement;
      const railRect = rail.getBoundingClientRect();
      const cards = Array.from(rail.children).map((el) => el.getBoundingClientRect());
      const card = document.querySelector('[data-testid="event-row"]') as HTMLElement;
      const cardRect = card.getBoundingClientRect();
      const items = Array.from(card.querySelectorAll('[data-testid^="event-row-item-"]')).map((el) => {
        const r = el.getBoundingClientRect();
        const svg = el.querySelector('svg')!.getBoundingClientRect();
        const pips = el.querySelector('.tt-event-pips')!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, svgW: svg.width, pipsBottom: pips.bottom };
      });
      const dock = document.querySelector('[data-testid="bottom-player-dock"]')!.getBoundingClientRect();
      const head = card.querySelector('.tt-events-head') as HTMLElement;
      const title = head.querySelector('.tt-card-title') as HTMLElement;
      return {
        railScrolls: rail.scrollHeight > rail.clientHeight + 1,
        cardCount: cards.length,
        // each card starts below the one before it
        stacked: cards.every((c, i) => i === 0 || c.top >= cards[i - 1]!.bottom),
        cardLeft: cardRect.left - railRect.left,
        cardRight: railRect.right - cardRect.right,
        cardLeftEdge: cardRect.left,
        cardRightEdge: cardRect.right,
        cardBottom: cardRect.bottom,
        railBottom: railRect.bottom,
        dockTop: dock.top,
        cardOverflowsX: card.scrollWidth > card.clientWidth,
        items,
        headOneLine: head.getBoundingClientRect().height < 22 && title.getBoundingClientRect().height < 22,
        pageScrolls:
          document.documentElement.scrollWidth > document.documentElement.clientWidth ||
          document.documentElement.scrollHeight > document.documentElement.clientHeight,
      };
    });

    expect(m.cardCount).toBe(5);
    expect(m.stacked).toBe(true);
    expect(m.railScrolls).toBe(false);
    expect(m.cardBottom).toBeLessThanOrEqual(m.railBottom);
    expect(m.cardBottom).toBeLessThanOrEqual(m.dockTop);
    expect(m.cardOverflowsX).toBe(false);
    expect(m.cardLeft).toBeGreaterThanOrEqual(-0.5);
    expect(m.cardRight).toBeGreaterThanOrEqual(-0.5);
    expect(m.headOneLine).toBe(true);
    expect(m.pageScrolls).toBe(false);

    // One straight row: seven items side by side, none overlapping, all inside the card
    expect(m.items).toHaveLength(7);
    const tops = m.items.map((i) => Math.round(i.top));
    expect(new Set(tops).size).toBe(1);
    for (let i = 0; i < m.items.length; i++) {
      const it = m.items[i]!;
      expect(it.left).toBeGreaterThanOrEqual(m.cardLeftEdge);
      expect(it.right).toBeLessThanOrEqual(m.cardRightEdge);
      expect(it.svgW).toBeGreaterThanOrEqual(24);
      expect(it.pipsBottom).toBeLessThanOrEqual(it.bottom + 0.5);
      if (i > 0) expect(it.left).toBeGreaterThanOrEqual(m.items[i - 1]!.right - 0.5);
    }
  });
}
