import { expect, test } from '@playwright/test';

/** Ink height of each glyph in a harbor ratio label, measured from a real screenshot of it. */
const SCREENS = [
  { scale: 1, width: 3840, height: 2160 }, // a 4K screen at 100%
  { scale: 1, width: 2560, height: 1440 },
  { scale: 2, width: 1920, height: 1080 },
  { scale: 4, width: 1366, height: 768 },
  { scale: 8, width: 1366, height: 768 },
];
for (const { scale, width, height } of SCREENS) {
  test(`the 1 in 3:1 and 2:1 is the same height as the other digit (${width}x${height} at pixel ratio ${scale})`, async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: scale, viewport: { width, height } });
    const page = await context.newPage();
    await page.goto('/?scenario=showcase&bots=0');
    await page.evaluate(() => document.fonts.ready);
    for (const label of ['2:1', '3:1']) {
      const text = page.locator(`[data-ratio-label="${label}"]`).first();
      const box = (await text.boundingBox())!;
      const shot = await page.screenshot({ clip: { x: box.x - 2, y: box.y - 1, width: box.width + 4, height: box.height + 2 } });
      const heights = await page.evaluate(async (b64) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        const dark = (x: number, y: number) => {
          const i = (y * width + x) * 4;
          return data[i]! < 70 && data[i + 1]! < 90 && data[i + 2]! < 120;
        };
        const runs: [number, number][] = [];
        let start = -1;
        for (let x = 0; x <= width; x++) {
          let on = false;
          for (let y = 0; y < height && x < width && !on; y++) on = dark(x, y);
          if (on && start < 0) start = x;
          if (!on && start >= 0) {
            runs.push([start, x - 1]);
            start = -1;
          }
        }
        return runs.map(([a, z]) => {
          let top = height;
          let bottom = 0;
          for (let y = 0; y < height; y++) for (let x = a; x <= z; x++) if (dark(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
          return bottom - top + 1;
        });
      }, shot.toString('base64'));
      expect(heights).toHaveLength(3); // digit, colon, 1
      const [digit, , one] = heights as [number, number, number];
      // anti-aliasing can move an edge by one device pixel; the geometry test below is exact
      expect(Math.abs(one - digit), `${label}: digit ${digit}px, one ${one}px`).toBeLessThanOrEqual(1);
    }
    await context.close();
  });
}

test('the digit and the 1 are drawn to exactly the same height, on screen', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  const labels = await page.locator('[data-ratio-label]').evaluateAll((els) =>
    els.map((el) => {
            const glyph = (name: string) => el.querySelector<SVGPathElement>(`[data-ratio-glyph="${name}"]`)!;
      const screenHeight = (p: SVGPathElement) => p.getBoundingClientRect().height;
      // getBBox is the ink extent of the outline (control points excluded), in glyph units
      const own = (p: SVGPathElement) => p.getBBox();
      const [digit, one] = [own(glyph('digit')), own(glyph('one'))];
      return {
        label: el.getAttribute('data-ratio-label'),
        digit: digit.height,
        one: one.height,
        digitTop: digit.y,
        oneTop: one.y,
        digitOnScreen: screenHeight(glyph('digit')),
        oneOnScreen: screenHeight(glyph('one')),
      };
    })
  );
  expect(labels.length).toBeGreaterThanOrEqual(9);
  for (const l of labels) {
    expect(l.one, l.label!).toBeCloseTo(l.digit, 6);
    expect(l.oneTop, l.label!).toBeCloseTo(l.digitTop, 6); // and they start on the same line
    expect(l.digit, l.label!).toBeCloseTo(10, 1);
    expect(l.oneOnScreen, l.label!).toBeCloseTo(l.digitOnScreen, 6);
  }
});
