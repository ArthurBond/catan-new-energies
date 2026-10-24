import { expect, test, type Page } from '@playwright/test';

/** Clicks the board element that owns the first glowing node or edge target. */
async function clickFirstTarget(page: Page): Promise<'node' | 'edge' | null> {
  const node = page.locator('[data-testid^="node-target-"]').first();
  if (await node.count()) {
    const id = (await node.getAttribute('data-testid'))!.replace('node-target-', '');
    await page.locator(`[data-node="${id}"]`).click();
    return 'node';
  }
  const edge = page.locator('[data-testid^="edge-target-"]').first();
  if (await edge.count()) {
    const id = (await edge.getAttribute('data-testid'))!.replace('edge-target-', '');
    await page.locator(`[data-edge="${id}"]`).click();
    return 'edge';
  }
  return null;
}

test.describe('CATAN: New Energies — starting placement', () => {
  test('every player rolls, then places a town and a city with roads in snake order', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/?mode=hotseat&seed=7');

    // Roll-off for turn order (ties reroll)
    const rollBtn = page.getByTestId('setup-roll-dialog-btn');
    for (let i = 0; i < 20 && (await rollBtn.isVisible()); i++) {
      await rollBtn.click();
    }
    await expect(page.getByTestId('setup-roll-overlay')).toHaveCount(0);

    // The coach explains the first placement and previews a hovered corner
    const coach = page.getByTestId('setup-coach');
    await expect(coach).toContainText('place your starting town');
    const firstNode = page.locator('[data-testid^="node-target-"]').first();
    const nodeId = (await firstNode.getAttribute('data-testid'))!.replace('node-target-', '');
    await page.locator(`[data-node="${nodeId}"]`).hover();
    await expect(page.getByTestId('setup-preview')).toContainText('of production');
    await expect(page.getByTestId(`node-preview-${nodeId}`)).toBeAttached();

    // 4 towns + 4 roads, then 4 cities + 4 roads
    let cityRoundSeen = false;
    for (let step = 0; step < 16; step++) {
      if (!cityRoundSeen && (await coach.textContent())?.includes('starting city')) cityRoundSeen = true;
      expect(await clickFirstTarget(page)).not.toBeNull();
    }
    expect(cityRoundSeen).toBe(true);

    // Setup is over: the first turn begins with the event draw
    await expect(coach).toHaveCount(0);
    await expect(page.getByTestId('action-draw-event-btn')).toBeVisible();
    await expect(page.locator('[data-testid="island-layer"] [data-piece="town"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="island-layer"] [data-piece="city"]')).toHaveCount(4);
    for (const pid of ['orange', 'purple', 'pink', 'blue']) {
      await expect(page.getByTestId(`corner-vp-${pid}`)).toContainText('3');
    }
  });

  test('bots place their own starting pieces around a human player', async ({ page }) => {
    await page.goto('/?seed=11');
    await page.getByTestId('settings-btn').click();
    await page.getByRole('button', { name: 'Instant' }).click();
    await page.keyboard.press('Escape');

    // Human (Orange) rolls; bots roll and place on their own
    const rollBtn = page.getByTestId('setup-roll-dialog-btn');
    for (let i = 0; i < 20; i++) {
      if (await rollBtn.isVisible()) await rollBtn.click();
      if ((await page.getByTestId('setup-roll-overlay').count()) === 0) break;
      await page.waitForTimeout(100);
    }

    // Whenever it is the human's placement, click a glowing target
    for (let i = 0; i < 80; i++) {
      if (await page.getByTestId('action-draw-event-btn').isVisible()) break;
      if (await page.getByTestId('action-end-turn-btn').isVisible()) break;
      await clickFirstTarget(page);
      await page.waitForTimeout(120);
    }

    // Every seat placed a town and a city (bots may already be building on their first turn)
    await expect(page.getByTestId('setup-coach')).toHaveCount(0, { timeout: 15000 });
    const cities = await page.locator('[data-testid="island-layer"] [data-piece="city"]').count();
    expect(cities).toBeGreaterThanOrEqual(4);
    for (const pid of ['orange', 'purple', 'pink', 'blue']) {
      const vp = Number(await page.getByTestId(`corner-vp-${pid}`).locator('strong').textContent());
      expect(vp).toBeGreaterThanOrEqual(3);
    }
  });
});
