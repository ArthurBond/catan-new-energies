import { expect, test } from '@playwright/test';

test('with autoplay off the bots take one step per click, named on the button', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=3&seed=42');
  // Instant bots: the wait for "nothing happens by itself" below is then a real check, and the
  // bots finish their turns quickly once autoplay is back on (Relaxed paces them 1.4 s a step)
  await page.getByTestId('settings-btn').click();
  await page.getByRole('button', { name: 'Instant' }).click();
  await page.keyboard.press('Escape');
  const toggle = page.getByTestId('autoplay-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // The switch sits in the header between the turn tracker and the footprint meter
  const [stepper, sw, gf] = await Promise.all(
    ['phase-stepper', 'autoplay-toggle', 'global-metrics-pill'].map((id) => page.getByTestId(id).boundingBox())
  );
  expect(sw!.x).toBeGreaterThanOrEqual(stepper!.x + stepper!.width);
  expect(sw!.x + sw!.width).toBeLessThanOrEqual(gf!.x);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: test.info().outputPath('autoplay-off.png') });

  const next = page.getByTestId('action-bot-next-btn');
  await page.getByTestId('action-end-turn-btn').click();
  await expect(next).toContainText('Purple: draw disc');
  // Nothing happens by itself while autoplay is off
  await page.waitForTimeout(1500);
  await expect(next).toContainText('Purple: draw disc');

  await next.click();
  await expect(next).toContainText('Purple: roll dice');
  await next.click();

  // Purple's own moves, one click each, ending with the end of the turn
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    // A bot's 7 makes Orange (12 cards) discard first
    if (await page.getByTestId('confirm-discard-btn').isVisible()) {
      for (const card of ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science']) {
        const pick = page.getByTestId(`discard-card-${card}`);
        while ((await pick.isEnabled()) && !(await page.getByTestId('confirm-discard-btn').isEnabled())) await pick.click();
      }
      await page.getByTestId('confirm-discard-btn').click();
    }
    const label = (await next.innerText()).split('\n')[0]!;
    seen.push(label);
    if (label.startsWith('Pink')) break;
    await next.click();
  }
  expect(seen).toContain('Purple: end turn');
  expect(seen.at(-1)).toBe('Pink: draw disc');
  expect(seen.every((l) => /^(Purple|Pink): (draw disc|roll dice|next move|end turn)$/.test(l))).toBe(true);

  // Switching autoplay back on lets the bots carry on by themselves
  await toggle.click();
  await expect(page.getByTestId('action-draw-event-btn')).toBeVisible({ timeout: 30000 });
});
