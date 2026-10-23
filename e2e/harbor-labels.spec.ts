import { expect, test } from '@playwright/test';

/** Ink height of each glyph in a harbor ratio label, measured from a real screenshot of it. */
for (const scale of [4, 8]) {
  test(`the 1 in 3:1 and 2:1 is the same height as the other digit (pixel ratio ${scale})`, async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    await page.goto('/?scenario=showcase&bots=0');
    await page.evaluate(() => document.fonts.ready);
    for (const label of ['2:1', '3:1']) {
      const text = page.locator('[data-testid^="harbor-"] text', { hasText: new RegExp(`^${label}$`) }).first();
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
          return (bottom - top + 1) / (window.devicePixelRatio || 1);
        });
      }, shot.toString('base64'));
      expect(heights).toHaveLength(3); // digit, colon, 1
      const [digit, , one] = heights as [number, number, number];
      // within a quarter of a CSS pixel or 6%, whichever is larger
      expect(Math.abs(one - digit), `${label}: digit ${digit}, one ${one}`).toBeLessThanOrEqual(Math.max(0.25, digit * 0.06));
    }
    await context.close();
  });
}
