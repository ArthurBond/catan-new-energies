import { expect, test } from '@playwright/test';

/** A fresh beginner game: Orange has 10 roads left, a two-digit count. */
const URL = '/?placement=fixed&seed=3&bots=0';

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1000, height: 760 },
  { width: 560, height: 900 },
]) {
  test(`build tiles: the pieces-left count never overlaps the label or costs at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(URL);
    const road = page.getByTestId('build-road');
    await expect(road.locator('.tt-build-left')).toHaveText('10');

    const m = await page.evaluate(() => {
      const hit = (a: DOMRect, b: DOMRect, margin = 0.5) =>
        a.left < b.right - margin && a.right > b.left + margin && a.top < b.bottom - margin && a.bottom > b.top + margin;
      return Array.from(document.querySelectorAll('[data-testid^="build-"]'))
        .filter((tile) => tile.querySelector('.tt-build-left'))
        .map((tile) => {
          const badge = tile.querySelector('.tt-build-left')!.getBoundingClientRect();
          const others = [tile.querySelector('b')!, ...Array.from(tile.querySelectorAll('.tt-build-cost svg'))].map((el) =>
            el.getBoundingClientRect()
          );
          const box = tile.getBoundingClientRect();
          const icon = tile.querySelector(':scope > svg')!.getBoundingClientRect();
          return {
            id: tile.getAttribute('data-testid'),
            overlapsText: others.some((o) => hit(badge, o)),
            // never pokes out of the tile, and ends at the icon column's right edge
            outsideTile: badge.left < box.left || badge.right > box.right || badge.bottom > box.bottom,
            pastIconColumn: badge.right > icon.right + 0.5,
          };
        });
    });

    expect(m.length).toBeGreaterThanOrEqual(5); // road, town, city, fossil, renewable
    for (const t of m) {
      expect(t.overlapsText, `${t.id}: badge overlaps the label or cost icons`).toBe(false);
      expect(t.outsideTile, `${t.id}: badge stays inside its tile`).toBe(false);
      expect(t.pastIconColumn, `${t.id}: badge stays within the icon column`).toBe(false);
    }
    await road.screenshot({ path: `test-results/build-road-${viewport.width}.png` });
  });
}
