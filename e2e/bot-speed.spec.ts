import { expect, test, type Page } from '@playwright/test';

/**
 * Bot pacing as a player sees it: the time between two consecutive bot moves in the activity feed.
 * Every table here is all bots, so no human prompt (such as a discard after a 7) can stall it.
 * The page time-stamps the feed changes itself, so the test runner's latency cannot blur the gaps.
 */
async function measureBotGaps(
  page: Page,
  url: string,
  speed: 'Relaxed' | 'Fast',
  moves: number
): Promise<number[]> {
  await page.goto(url);
  await page.getByTestId('settings-btn').click();
  const choice = page.getByRole('button', { name: speed, exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const w = window as unknown as { __feedStamps: number[] };
    w.__feedStamps = [];
    const head = document.querySelector('[data-testid="game-log"] .tt-dock-head')!;
    let seen = head.textContent;
    new MutationObserver(() => {
      if (head.textContent === seen) return;
      seen = head.textContent;
      w.__feedStamps.push(performance.now());
    }).observe(head, { subtree: true, childList: true, characterData: true });
  });

  const stamps = () => page.evaluate(() => (window as unknown as { __feedStamps: number[] }).__feedStamps);
  await expect.poll(async () => (await stamps()).length, { timeout: 30_000, intervals: [100] }).toBeGreaterThan(moves);
  const times = (await stamps()).slice(0, moves + 1);
  return times.slice(1).map((t, i) => t - times[i]!);
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const PLAY = '/?scenario=showcase&bots=all&seed=42'; // mid-game: every bot step is a turn action
const SETUP = '/?bots=all&seed=7'; // fresh game: turn-order roll and starting placements

for (const c of [
  { speed: 'Relaxed', phase: 'turn', url: PLAY, delayMs: 1400, moves: 5 },
  { speed: 'Fast', phase: 'turn', url: PLAY, delayMs: 600, moves: 5 },
  { speed: 'Relaxed', phase: 'setup', url: SETUP, delayMs: 2000, moves: 3 },
  { speed: 'Fast', phase: 'setup', url: SETUP, delayMs: 950, moves: 3 },
] as const) {
  test(`${c.speed} bots wait about ${c.delayMs} ms between moves (${c.phase})`, async ({ page }) => {
    test.setTimeout(60_000);
    const gaps = await measureBotGaps(page, c.url, c.speed, c.moves);
    const seen = `gaps in ms: ${gaps.map(Math.round).join(' ')}`;

    // Never quicker than the setting (a timer cannot fire early), allowing for clock rounding...
    for (const gap of gaps) expect(gap, seen).toBeGreaterThanOrEqual(c.delayMs * 0.95);
    // ...and typically no more than the delay plus the time the bot and the page need
    expect(median(gaps), seen).toBeLessThanOrEqual(c.delayMs * 1.5);
  });
}
