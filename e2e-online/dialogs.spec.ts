import { expect, test, type Page } from '@playwright/test';
import { openFriend, openHost, startFixtureServer, type FixtureServer } from './fixture-server';

/**
 * The decision dialogs the opening never reaches, played by two real browsers on the built server:
 * discarding on a 7, the inspector and the steal choice, a domestic trade, buying and playing
 * development cards, and the final standings. Each describe resumes a prepared game (see
 * `make-fixture.ts`), so every flow starts from a known table. Hands of other players reach the
 * browsers only as card counts; these tests would fail if a dialog needed more than that.
 */

const RESOURCES = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const;

const app = (page: Page) => page.getByTestId('tabletop-app');

async function ownHand(page: Page): Promise<Record<(typeof RESOURCES)[number], number>> {
  const hand = {} as Record<(typeof RESOURCES)[number], number>;
  for (const r of RESOURCES) hand[r] = Number(await page.getByTestId(`organiser-count-${r}`).textContent());
  return hand;
}

const total = (hand: Record<string, number>) => Object.values(hand).reduce((a, b) => a + b, 0);

async function clickMany(page: Page, testId: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId(testId).click();
}

/** A hex target is drawn under the hex; the click goes to the hex itself (as the other specs do). */
async function clickHex(page: Page, hexId: number) {
  await page.getByTestId(`hex-target-${hexId}`).locator('xpath=..').click({ force: true });
}

test.describe('a roll of 7, a steal, a trade and development cards', () => {
  let server: FixtureServer;
  test.beforeAll(async () => {
    server = await startFixtureServer('seven');
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test('every dialog opens for the right laptop and completes on the server', async ({ browser }) => {
    const host = await openHost(browser, server.baseURL);
    const friend = await openFriend(browser, server.baseURL);
    const A = host.page; // Hana, orange
    const B = friend.page; // Finn, purple

    await test.step('both laptops sit on their own seat in the prepared game', async () => {
      await expect(app(A)).toHaveAttribute('data-my-seat', 'orange');
      await expect(app(B)).toHaveAttribute('data-my-seat', 'purple');
      await expect(app(A)).toHaveAttribute('data-phase', 'ProductionPhase');
      expect(total(await ownHand(A))).toBe(9);
      expect(total(await ownHand(B))).toBe(8);
      // Everyone else's hand is only a number
      await expect(A.getByTestId('corner-cards-purple')).toHaveText('8');
      await expect(B.getByTestId('corner-cards-orange')).toHaveText('9');
    });

    await test.step('the host discards on the 7; the friend only waits', async () => {
      const modal = A.getByTestId('pending-decision-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('discards 4 cards');
      await expect(B.getByTestId('pending-decision-modal')).toHaveCount(0);
      await expect(B.getByTestId('confirm-discard-btn')).toHaveCount(0);

      await clickMany(A, 'discard-card-lumber', 2);
      await clickMany(A, 'discard-card-brick', 2);
      await A.getByTestId('confirm-discard-btn').click();
      await expect(A.getByTestId('action-error-toast')).toHaveCount(0);
      await expect(A.getByTestId('pending-decision-modal')).toHaveCount(0);
      expect(await ownHand(A)).toMatchObject({ lumber: 0, brick: 0, natural_fiber: 2, food: 2, steel: 1 });
      await expect(B.getByTestId('corner-cards-orange')).toHaveText('5');
    });

    await test.step('then the friend discards, and sees only their own cards in the dialog', async () => {
      const modal = B.getByTestId('pending-decision-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Finn discards 4 cards');
      await expect(A.getByTestId('pending-decision-modal')).toHaveCount(0);
      for (const card of ['lumber', 'brick', 'natural_fiber', 'science']) {
        await B.getByTestId(`discard-card-${card}`).click();
      }
      await B.getByTestId('confirm-discard-btn').click();
      await expect(B.getByTestId('action-error-toast')).toHaveCount(0);
      await expect(B.getByTestId('pending-decision-modal')).toHaveCount(0);
      expect(await ownHand(B)).toMatchObject({ lumber: 0, brick: 1, natural_fiber: 0, food: 1, steel: 2, science: 0 });
      await expect(A.getByTestId('corner-cards-purple')).toHaveText('4');
    });

    await test.step('the host moves the inspector and picks whom to take a card from', async () => {
      await expect(A.getByTestId('pending-decision-banner')).toContainText('move the inspector');
      await expect(B.getByTestId('pending-decision-banner')).toHaveCount(0);
      // Hex 14 touches the buildings of purple, pink and blue
      await clickHex(A, 14);
      const modal = A.getByTestId('pending-decision-modal');
      await expect(modal).toBeVisible();
      for (const pid of ['purple', 'pink', 'blue']) await expect(A.getByTestId(`steal-target-${pid}`)).toBeVisible();
      await expect(B.getByTestId('pending-decision-modal')).toHaveCount(0);

      await A.getByTestId('steal-target-pink').click();
      await expect(A.getByTestId('action-error-toast')).toHaveCount(0);
      await expect(A.getByTestId('pending-decision-modal')).toHaveCount(0);
      // One card moved from pink to the host, and both laptops agree on the counts
      expect(total(await ownHand(A))).toBe(6);
      await expect(A.getByTestId('corner-cards-pink')).toHaveText('4');
      await expect(B.getByTestId('corner-cards-pink')).toHaveText('4');
      await expect(B.getByTestId('corner-cards-orange')).toHaveText('6');
      await expect(app(A)).toHaveAttribute('data-phase', 'ActionPhase');
      await expect(app(B)).toHaveAttribute('data-phase', 'ActionPhase');
    });

    await test.step('the host offers a trade; the friend answers in the dialog and accepts', async () => {
      const before = { host: await ownHand(A), friend: await ownHand(B) };
      await A.getByTestId('action-open-trade-btn').click();
      await expect(A.getByTestId('trade-modal')).toBeVisible();
      await A.getByTestId('trade-tab-domestic').click();
      await A.getByTestId('domestic-target-purple').click();
      await A.getByTestId('domestic-give-natural_fiber').click();
      await A.getByTestId('domestic-want-steel').click();
      await A.getByTestId('send-domestic-offer-btn').click();

      const answer = B.getByTestId('pending-decision-modal');
      await expect(answer).toBeVisible();
      await expect(answer).toContainText('Hana offers Finn a trade');
      await expect(A.getByTestId('pending-decision-modal')).toHaveCount(0);
      await B.getByTestId('accept-trade-btn').click();
      await expect(B.getByTestId('pending-decision-modal')).toHaveCount(0);
      await expect(B.getByTestId('action-error-toast')).toHaveCount(0);

      await expect.poll(async () => (await ownHand(A)).steel).toBe(before.host.steel + 1);
      const host2 = await ownHand(A);
      const friend2 = await ownHand(B);
      expect(host2.natural_fiber).toBe(before.host.natural_fiber - 1);
      expect(friend2.steel).toBe(before.friend.steel - 1);
      expect(friend2.natural_fiber).toBe(before.friend.natural_fiber + 1);
    });

    await test.step('the host buys a development card; the friend sees only that a card exists', async () => {
      const before = await A.locator('[data-testid^="dev-card-dev_"]').count();
      expect(before).toBe(1);
      await A.getByTestId('build-devCard').click();
      await expect(A.getByTestId('action-error-toast')).toHaveCount(0);
      await expect(A.locator('[data-testid^="dev-card-dev_"]')).toHaveCount(2);
      // The friend never learns which card it is
      await expect(B.locator('[data-testid^="dev-card-dev_"]')).toHaveCount(0);
    });

    await test.step('the host plays Road Construction on the board; the friend watches the roads appear', async () => {
      const roads = (p: Page) =>
        p.locator('[data-testid="island-layer"] [data-testid^="road-"]:not([data-testid^="road-preview"])');
      const roadsBefore = await roads(A).count();
      expect(await roads(B).count()).toBe(roadsBefore);

      await A.getByTestId('dev-card-dev_roadConstruction_01').click();
      const prompt = A.getByTestId('dev-card-board-prompt');
      await expect(prompt).toContainText('first free road');
      for (const label of ['first', 'second']) {
        const target = A.locator('[data-testid^="edge-target-"]').first();
        const edgeId = (await target.getAttribute('data-testid'))!.replace('edge-target-', '');
        await A.locator(`[data-edge="${edgeId}"]`).click();
        if (label === 'first') await expect(prompt).toContainText('second free road');
      }
      await expect(prompt).toHaveCount(0);
      await expect(A.getByTestId('action-error-toast')).toHaveCount(0);
      await expect(roads(A)).toHaveCount(roadsBefore + 2);
      await expect(roads(B)).toHaveCount(roadsBefore + 2);
      await expect(A.getByTestId('dev-card-dev_roadConstruction_01')).toHaveCount(0);
      await expect(B.getByTestId('live-action-banner')).toContainText('Road Construction');
    });

    await host.context.close();
    await friend.context.close();
  });
});

test.describe('a Clean Up card played by the friend', () => {
  let server: FixtureServer;
  test.beforeAll(async () => {
    server = await startFixtureServer('friend-clean-up');
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test('the victim chooser lists hands by size and the server takes the friend’s choice', async ({ browser }) => {
    const host = await openHost(browser, server.baseURL);
    const friend = await openFriend(browser, server.baseURL);
    const A = host.page; // Hana, orange
    const B = friend.page; // Finn, purple, plays first

    await expect(app(B)).toHaveAttribute('data-my-seat', 'purple');
    await expect(app(B)).toHaveAttribute('data-acting-player', 'purple');
    await expect(app(A)).toHaveAttribute('data-acting-player', 'purple');
    // The host cannot touch the friend's card
    await expect(A.locator('[data-testid^="dev-card-dev_"]')).toHaveCount(0);
    await expect(A.getByTestId('action-draw-event-btn')).toHaveCount(0);

    await B.getByTestId('dev-card-dev_cleanup_01').click();
    await B.getByTestId('cleanup-option-inspector').click();
    await expect(B.getByTestId('dev-card-board-prompt')).toContainText('move the inspector');
    // Hex 14 touches the buildings of purple (the friend), pink and blue
    await clickHex(B, 14);

    const chooser = B.getByTestId('steal-chooser');
    await expect(chooser).toBeVisible();
    await expect(B.getByTestId('steal-from-purple')).toHaveCount(0);
    await expect(B.getByTestId('steal-from-pink')).toContainText('5 cards');
    await expect(B.getByTestId('steal-from-blue')).toContainText('4 cards');
    await expect(A.getByTestId('steal-chooser')).toHaveCount(0);

    await B.getByTestId('steal-from-blue').click();
    await expect(B.getByTestId('action-error-toast')).toHaveCount(0);
    await expect(chooser).toHaveCount(0);
    await expect(B.getByTestId('dev-card-dev_cleanup_01')).toHaveCount(0);
    // The friend now holds a second card, blue one fewer, and the host sees the same numbers
    expect(total(await ownHand(B))).toBe(2);
    await expect(A.getByTestId('corner-cards-blue')).toHaveText('3');
    await expect(A.getByTestId('corner-cards-purple')).toHaveText('2');
    await expect(A.getByTestId('live-action-banner')).toContainText('played Clean Up');

    await host.context.close();
    await friend.context.close();
  });
});

test.describe('the end of a game', () => {
  let server: FixtureServer;
  test.beforeAll(async () => {
    server = await startFixtureServer('game-over');
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test('both laptops show the same standings, with the cards nobody had seen', async ({ browser }) => {
    const host = await openHost(browser, server.baseURL);
    const friend = await openFriend(browser, server.baseURL);
    const A = host.page; // Hana, orange
    const B = friend.page; // Finn, purple holds two secret Victory Point cards

    await expect(app(A)).toHaveAttribute('data-phase', 'EventPhase');
    await expect(B.getByTestId('victory-modal')).toHaveCount(0);
    // While the game runs, a laptop knows the other seats' dev cards only as a count
    const wireStates: string[] = [];
    B.on('websocket', (ws) => ws.on('framereceived', (f) => wireStates.push(String(f.payload))));
    await B.reload();
    await expect(app(B)).toHaveAttribute('data-my-seat', 'purple');
    expect(wireStates.join('\n')).not.toContain('dev_victoryPoint_03');

    // The bag is empty, so the next draw ends the game
    await A.getByTestId('action-draw-event-btn').click();
    for (const page of [A, B]) {
      await expect(page.getByTestId('victory-modal')).toBeVisible();
      await expect(app(page)).toHaveAttribute('data-phase', 'GameEnd');
    }

    const rows = async (page: Page) => page.getByTestId('victory-modal').locator('[role="row"]').allTextContents();
    const hostRows = await rows(A);
    expect(await rows(B)).toEqual(hostRows);
    expect(hostRows).toHaveLength(4);
    // Orange has the best renewable balance and wins; Finn's two hidden VP cards count: 6 + 2 = 8
    expect(hostRows[0]).toContain('Hana');
    await expect(A.getByTestId('victory-modal')).toContainText('Hana wins');
    expect(hostRows.find((r) => r.includes('Finn'))).toContain('8 VP');
    expect(hostRows.find((r) => r.includes('Pink'))).toContain('6 VP');

    // Once the game is over every card is out in the open, so the standings can be added up
    expect(wireStates.join(' ')).toContain('dev_victoryPoint_03');

    // Only the host can start the next game
    await expect(A.getByTestId('victory-new-game-btn')).toBeVisible();
    await expect(B.getByTestId('victory-new-game-btn')).toHaveCount(0);

    // ...and it takes everyone back to the lobby with the seats kept
    A.once('dialog', (dialog) => void dialog.accept());
    await A.getByTestId('victory-new-game-btn').click();
    await expect(A.getByTestId('online-page')).toBeVisible();
    await expect(B.getByTestId('online-page')).toBeVisible();
    await expect(A.getByTestId('victory-modal')).toHaveCount(0);
    await expect(B.getByTestId('victory-modal')).toHaveCount(0);
    await expect(B.getByTestId('online-waiting')).toBeVisible();
    await expect(A.getByTestId('online-seat-purple')).toContainText('Finn');
    await expect(A.getByTestId('online-seat-purple-status')).toHaveText('Connected');

    await host.context.close();
    await friend.context.close();
  });
});

test.describe('the bank, a Research Grant and a win by revealing Victory Point cards', () => {
  let server: FixtureServer;
  test.beforeAll(async () => {
    server = await startFixtureServer('vp-reveal');
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test('the host trades with the bank, plays the grant and wins on 10 points', async ({ browser }) => {
    const host = await openHost(browser, server.baseURL);
    const friend = await openFriend(browser, server.baseURL);
    const A = host.page; // Hana, orange
    const B = friend.page; // Finn, purple

    await expect(app(A)).toHaveAttribute('data-phase', 'ActionPhase');
    await expect(B.getByTestId('reveal-vp-cards-btn')).toHaveCount(0);
    await expect(A.getByTestId('reveal-vp-cards-btn')).toBeVisible();

    await test.step('4 lumber go to the bank for a brick', async () => {
      await A.getByTestId('action-open-trade-btn').click();
      await expect(A.getByTestId('trade-modal')).toBeVisible();
      await A.getByTestId('supply-give-lumber').click();
      await A.getByTestId('supply-receive-brick').click();
      await A.getByTestId('execute-supply-trade-btn').click();
      await expect(A.getByTestId('action-error-toast')).toHaveCount(0);
      await expect.poll(async () => (await ownHand(A)).brick).toBe(1);
      expect(await ownHand(A)).toMatchObject({ lumber: 0, brick: 1, steel: 1 });
      await expect(B.getByTestId('corner-cards-orange')).toHaveText('2');
      if (await A.getByTestId('trade-modal').isVisible()) await A.getByTestId('close-trade-modal').click();
    });

    await test.step('the Research Grant takes two cards from the supply', async () => {
      await A.getByTestId('dev-card-dev_researchGrant_01').click();
      await expect(A.getByTestId('dev-card-modal')).toBeVisible();
      await A.getByTestId('grant1-food').click();
      await A.getByTestId('grant2-steel').click();
      await A.getByTestId('confirm-play-research-grant').click();
      await expect(A.getByTestId('action-error-toast')).toHaveCount(0);
      await expect(A.getByTestId('dev-card-dev_researchGrant_01')).toHaveCount(0);
      expect(await ownHand(A)).toMatchObject({ brick: 1, food: 1, steel: 2 });
      await expect(B.getByTestId('corner-cards-orange')).toHaveText('4');
      await expect(B.getByTestId('live-action-banner')).toContainText('Research Grant');
    });

    await test.step('revealing both Victory Point cards wins on 10 points', async () => {
      await A.getByTestId('reveal-vp-cards-btn').click();
      for (const page of [A, B]) {
        await expect(page.getByTestId('victory-modal')).toBeVisible();
        await expect(page.getByTestId('victory-modal')).toContainText('Hana wins');
        await expect(page.getByTestId('victory-modal')).toContainText('10 victory points');
      }
      const rows = async (page: Page) => page.getByTestId('victory-modal').locator('[role="row"]').allTextContents();
      const hostRows = await rows(A);
      expect(await rows(B)).toEqual(hostRows);
      expect(hostRows[0]).toContain('10VP');
      // Finn's own card is still hidden in play, but the finished game counts it: 6 + 1
      expect(hostRows.find((r) => r.includes('Finn'))).toContain('7VP');
      expect(hostRows.find((r) => r.includes('Pink'))).toContain('5VP');
    });

    await host.context.close();
    await friend.context.close();
  });
});
