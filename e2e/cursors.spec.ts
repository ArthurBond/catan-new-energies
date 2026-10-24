import { expect, test } from '@playwright/test';

/** The pannable board uses crisp hand cursors at 1x-4x (the browser's own grab bitmap is pixelated on 4K). */
const SCALES = [1, 2, 3, 4];

test('board hand cursors are served at 1x to 4x and are the right size', async ({ page, request }) => {
  await page.goto('/?scenario=showcase&bots=0');
  const cursor = (await page.locator('.tt-board-area').evaluate((el) => getComputedStyle(el).cursor)) as string;
  for (const k of SCALES) expect(cursor).toContain(`/cursors/grab-${k}x.png`);
  expect(cursor).toMatch(/grab\s*$/); // native cursor stays as the fallback

  for (const name of ['grab', 'grabbing']) {
    for (const k of SCALES) {
      const res = await request.get(`/cursors/${name}-${k}x.png`);
      expect(res.status(), `${name}-${k}x.png is served`).toBe(200);
      const png = await res.body();
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      // width / height are big-endian 32-bit numbers at bytes 16 and 20; 32 CSS px at each scale
      expect(png.readUInt32BE(16)).toBe(32 * k);
      expect(png.readUInt32BE(20)).toBe(32 * k);
      // RGBA with a transparent background (colour type 6)
      expect(png[25]).toBe(6);
    }
  }
});

test('the closed hand shows while the board is being dragged', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  const board = page.locator('.tt-board-area');
  const box = (await board.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 6 });
  await expect(board).toHaveClass(/is-dragging/);
  expect(await board.evaluate((el) => getComputedStyle(el).cursor)).toContain('/cursors/grabbing-4x.png');
  await page.mouse.up();
  await expect(board).not.toHaveClass(/is-dragging/);
  expect(await board.evaluate((el) => getComputedStyle(el).cursor)).toContain('/cursors/grab-4x.png');
});
