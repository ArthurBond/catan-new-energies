import { expect, test } from '@playwright/test';

test('no ocean whale is covered by an event track label', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  const overlaps = await page.evaluate(() => {
    const whales = [...document.querySelectorAll('[data-testid="ocean-whales"] .ocean-whale-animated')].map((w) => w.getBoundingClientRect());
    const labels = [...document.querySelectorAll('[data-testid^="event-label-"]:not([data-testid^="event-label-arc-"])')].map((l) => ({
      id: l.getAttribute('data-testid')!,
      rect: l.getBoundingClientRect(),
    }));
    const hits: string[] = [];
    for (const [i, w] of whales.entries()) {
      for (const l of labels) {
        const r = l.rect;
        if (w.left < r.right && w.right > r.left && w.top < r.bottom && w.bottom > r.top) hits.push(`whale ${i} / ${l.id}`);
      }
    }
    return { count: whales.length, labels: labels.length, hits };
  });
  expect(overlaps.count).toBeGreaterThanOrEqual(8);
  expect(overlaps.labels).toBe(7);
  expect(overlaps.hits).toEqual([]);
});
