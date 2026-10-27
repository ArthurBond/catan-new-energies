import { expect, test, type Page } from '@playwright/test';

/**
 * After moving the inspector onto a hex with more than one possible victim, the steal dialog can be
 * cancelled (button or Escape) to put the inspector back and pick another hex. Dialogs cover the
 * whole page, top bar included.
 * The dev scenario has a 7 rolled and Orange to move the inspector; hex 14 touches Purple, Blue and Pink.
 */
const MOVE_INSPECTOR = '/?scenario=moveinspector&bots=0';
const HEX_WITH_THREE_VICTIMS = 14;

async function moveInspectorTo(page: Page, hexId: number) {
  await page.locator(`[data-hex="${hexId}"]`).click();
  await expect(page.getByTestId('steal-target-purple')).toBeVisible();
}

/** What is on top at the middle of each top bar button */
async function coveredByDialog(page: Page, dialogTestId: string): Promise<boolean[]> {
  return page.evaluate((id) => {
    const dialog = document.querySelector(`[data-testid="${id}"]`)!;
    return [...document.querySelectorAll('.tt-topbar button')].map((b) => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && dialog.contains(top);
    });
  }, dialogTestId);
}

test.describe('CATAN: New Energies — cancelling a steal', () => {
  test('the Cancel button puts the inspector back and lets Orange pick another hex', async ({ page }) => {
    await page.goto(MOVE_INSPECTOR);
    await expect(page.getByTestId('pending-decision-banner')).toContainText('move the inspector');
    await moveInspectorTo(page, HEX_WITH_THREE_VICTIMS);
    await expect(page.getByTestId('game-log')).toContainText('moved the Inspector');

    await page.getByTestId('cancel-steal-target-btn').click();

    await expect(page.getByTestId('steal-target-purple')).toHaveCount(0);
    await expect(page.getByTestId('game-log')).not.toContainText('moved the Inspector');
    await expect(page.getByTestId('pending-decision-banner')).toContainText('move the inspector');
    await expect(page.getByTestId(`hex-target-${HEX_WITH_THREE_VICTIMS}`)).toBeVisible();

    // And the second try works
    await moveInspectorTo(page, 13);
    await page.getByTestId('steal-target-pink').click();
    await expect(page.getByTestId('game-log')).toContainText('stole 1');
  });

  test('Escape does the same', async ({ page }) => {
    await page.goto(MOVE_INSPECTOR);
    await moveInspectorTo(page, HEX_WITH_THREE_VICTIMS);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('steal-target-purple')).toHaveCount(0);
    await expect(page.getByTestId('pending-decision-banner')).toContainText('move the inspector');
  });

  test('the dialog covers the top bar', async ({ page }) => {
    await page.goto(MOVE_INSPECTOR);
    await moveInspectorTo(page, HEX_WITH_THREE_VICTIMS);
    const covered = await coveredByDialog(page, 'pending-decision-modal');
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.every(Boolean)).toBe(true);
  });

  test('the privacy curtain covers the top bar', async ({ page }) => {
    // A saved hotseat game with the curtain on, built by the app's own code in the browser
    await page.goto('/?lobby=1');
    await page.evaluate(async () => {
      const setupModule = '/src/engine/setup.ts';
      const scenarioModule = '/src/ui/devScenarios.ts';
      const { createInitialGameState } = await import(setupModule);
      const { applyDevScenario } = await import(scenarioModule);
      const state = applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'showcase');
      const seat = (playerId: string, name: string) => ({
        playerId,
        name,
        controller: 'human',
        botStrategy: 'Balanced',
        botDifficulty: 'normal',
      });
      const config = {
        playerCount: 4,
        setupMode: 'first',
        placement: 'fixed',
        seed: 42,
        botSpeed: 'normal',
        privacyCurtain: true,
        roomCode: '',
        seats: {
          orange: seat('orange', 'Orange'),
          purple: seat('purple', 'Purple'),
          pink: seat('pink', 'Pink'),
          blue: seat('blue', 'Blue'),
        },
      };
      localStorage.setItem('catan_new_energies_saved_game_v2', JSON.stringify({ version: 2, savedAt: Date.now(), state, config }));
    });
    await page.goto('/');
    await page.getByTestId('action-end-turn-btn').click();

    await expect(page.getByTestId('privacy-curtain-modal')).toBeVisible();
    const covered = await coveredByDialog(page, 'privacy-curtain-modal');
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.every(Boolean)).toBe(true);
  });
});
