import { expect, test } from '@playwright/test';

test('an event is logged by what it did, with the affected player in their colour', async ({ page }) => {
  await page.goto('/?scenario=airpollution&bots=0');
  await page.getByTestId('action-draw-event-btn').click();

  // Air Pollution fills up: the highest footprint (Orange) must put a hazard token on one of their cities
  const nodes = page.locator('[data-testid^="node-target-"]');
  await expect(nodes.first()).toBeAttached();
  await nodes.first().dispatchEvent('click');

  const feed = page.locator('[data-testid="game-log"] .tt-feed-item');
  const items = await feed.evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent ?? '',
      names: [...el.querySelectorAll('.tt-feed-name')].map((n) => ({
        text: n.textContent ?? '',
        colour: getComputedStyle(n).color,
      })),
    }))
  );
  const texts = items.map((i) => i.text);
  const placed = items.find((i) => i.text.includes('placed a hazard token'));
  expect(placed?.text).toBe(
    'Air Pollution: Highest local footprint (Orange) placed a hazard token on one of their cities.'
  );
  expect(texts).toContain('The Air Pollution track is full.');
  for (const t of texts) expect(t).not.toMatch(/event happens|takes effect|capacity|returned to box/i);

  // The player's name is in their own (readable) colour rather than the muted grey of older lines
  expect(placed?.names).toEqual([{ text: 'Orange', colour: 'rgb(181, 130, 5)' }]);
  await page.screenshot({ path: test.info().outputPath('event-log.png') });
});
