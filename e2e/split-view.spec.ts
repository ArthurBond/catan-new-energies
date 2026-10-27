import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The game played in a browser window next to the editor: half of a 4K screen at 175% scaling
 * (1097 wide), half of a 1440p and of a 1080p screen, and a third of the screen or an editor pane,
 * where the table stacks into one scrolling page.
 */
const SPLIT_VIEWS = [
  { width: 1097, height: 1090 },
  { width: 1280, height: 1300 },
  { width: 960, height: 1000 },
  { width: 731, height: 1000 },
];

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/**
 * Clicks a target where it is on screen, as a person would. Playwright's own click can scroll the
 * page first (it centres an element it catches mid-animation), which would hide a layout that
 * needs scrolling.
 */
async function press(page: Page, target: Locator) {
  await expect(target).toBeEnabled();
  await expect(target).toBeInViewport({ ratio: 1 });
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const pageScroll = (page: Page) => page.evaluate(() => document.querySelector('.tt-app')!.scrollTop + window.scrollY);

async function boxesOf(page: Page, selector: string): Promise<{ name: string; box: Box }[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: (e as HTMLElement).dataset.testid ?? e.className, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
    })
  );
}

test.describe('CATAN: New Energies — split view', () => {
  for (const viewport of SPLIT_VIEWS) {
    test(`board, hand, build palette and the turn's button fit on one screen at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/?scenario=showcase&bots=0');

      const board = page.getByTestId('island-board-svg');
      await expect(board).toBeVisible();
      const boardBox = (await board.boundingBox())!;
      expect(Math.min(boardBox.width, boardBox.height)).toBeGreaterThan(450);

      for (const id of ['dock-hand', 'dock-build', 'action-end-turn-btn', 'action-open-trade-btn']) {
        await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

      // Build labels are not cut short ("Fossil pl…")
      const cut = await page
        .locator('.tt-build b')
        .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
      expect(cut).toEqual([]);

      // Every player card and the table rail get their full size, and nothing lies on anything else
      const parts = [
        ...(await boxesOf(page, '[data-testid="tabletop-board"], [data-testid="bottom-player-dock"]')),
        ...(await boxesOf(page, '[data-testid^="corner-station-"]')),
        ...(await boxesOf(page, '[data-testid="game-log"], [data-testid="event-bag"], [data-testid="tabletop-dice-roll-overlay"]')),
      ];
      expect(parts.filter((p) => p.name.startsWith('corner-station-'))).toHaveLength(4);
      for (const p of parts) expect(p.box.height, p.name).toBeGreaterThan(60);
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          expect(overlaps(parts[i]!.box, parts[j]!.box), `${parts[i]!.name} overlaps ${parts[j]!.name}`).toBe(false);
        }
      }
    });
  }

  test('a turn with a 7 is played from one screen in a narrow split view', async ({ page }) => {
    await page.setViewportSize({ width: 731, height: 1000 });
    // Seed 42: Orange's first roll is a 7, so the inspector is moved on the board
    await page.goto('/?seed=42&setup=first&placement=fixed&players=4&bots=0');

    await press(page, page.getByTestId('action-draw-event-btn'));
    await press(page, page.getByTestId('action-roll-dice-btn'));
    await expect(page.getByTestId('pending-decision-banner')).toContainText('move the inspector');

    await press(page, page.locator('[data-hex]').filter({ has: page.locator('[data-testid^="hex-target-"]') }).first());
    await expect(page.getByTestId('game-log')).toContainText('moved the Inspector');
    const victim = page.locator('[data-testid^="steal-target-"]').first();
    if (await victim.isVisible()) await victim.click();

    await press(page, page.getByTestId('action-end-turn-btn'));
    await expect(page.getByTestId('active-turn-pill')).toContainText('Purple');
    await expect(page.getByTestId('action-draw-event-btn')).toBeInViewport({ ratio: 1 });
    expect(await pageScroll(page)).toBe(0);
  });

  test('discarding on a 7 is confirmed without scrolling in a short split view', async ({ page }) => {
    await page.setViewportSize({ width: 683, height: 700 });
    await page.goto('/?scenario=discard');

    const confirm = page.getByTestId('confirm-discard-btn');
    await expect(confirm).toBeInViewport({ ratio: 1 });
    for (const card of ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science']) {
      const pick = page.getByTestId(`discard-card-${card}`);
      while ((await pick.isEnabled()) && !(await confirm.isEnabled())) await pick.click();
    }
    // The cards may have been scrolled to; Confirm is still on screen
    await press(page, confirm);
    await expect(confirm).toHaveCount(0);
  });
});
