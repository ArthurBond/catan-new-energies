import { expect, test } from '@playwright/test';

const COLOURS: Record<string, string> = {
  Orange: '#f0b418',
  Purple: '#6b3578',
  Pink: '#d84b8a',
  Blue: '#3676c8',
};
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

for (const players of [3, 4]) {
  test(`activity feed dots match the player who acted (${players} players, after the turn-order roll)`, async ({ page }) => {
    await page.goto(`/?mode=hotseat&players=${players}&seed=7`);
    // Everyone rolls for turn order (this rotates the seats), then the first placements are made
    const roll = page.getByTestId('setup-roll-dialog-btn');
    for (let i = 0; i < 20 && (await roll.isVisible()); i++) await roll.click();

    const items = page.locator('[data-testid="game-log"] .tt-feed-item');
    await expect(items.first()).toBeVisible();
    const rows = await items.evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent ?? '',
        dot: getComputedStyle(el.querySelector('i')!).backgroundColor,
      }))
    );
    expect(rows.length).toBeGreaterThanOrEqual(players);

    let checked = 0;
    for (const row of rows) {
      // The player named first in the line is who it is about; their dot must be their own colour
      const named = Object.keys(COLOURS)
        .filter((n) => row.text.includes(n))
        .sort((a, b) => row.text.indexOf(a) - row.text.indexOf(b))[0];
      if (!named) continue;
      expect(row.dot, `"${row.text}" should be ${named}`).toBe(rgb(COLOURS[named]!));
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(players);
    // the user's cases: the last seat (Pink in 3p, Blue in 4p) must not borrow Orange's colour
    const last = players === 3 ? 'Pink' : 'Blue';
    const lastRow = rows.find((r) => r.text.startsWith(last));
    expect(lastRow?.dot).toBe(rgb(COLOURS[last]!));
    expect(lastRow?.dot).not.toBe(rgb(COLOURS.Orange!));
  });
}
