import { expect, test, type Page } from '@playwright/test';

/**
 * Discarding on a 7 happens in a panel docked at the bottom, with no backdrop: the island stays in
 * view, the hexes the player builds on are highlighted, and each card shows the rolls that give it.
 * The dev scenario puts Orange (12 cards) in a 6-card discard.
 */
const DISCARD = '/?scenario=discard&bots=0';
const CARDS = ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as const;
type Card = (typeof CARDS)[number];

/** Rolls per card the way a player reads them off the board (labels and positions), not from game state. */
async function rollsFromBoard(page: Page, playerId: string): Promise<{ hexes: number[]; rolls: Record<Card, string[]> }> {
  return page.evaluate((pid) => {
    const xy = (el: Element): [number, number] => {
      const m = /translate\(\s*(-?[\d.]+)[ ,]+\s*(-?[\d.]+)\s*\)/.exec(el.getAttribute('transform') ?? '');
      return [Number(m![1]), Number(m![2])];
    };
    const resourceOf: Record<string, string> = {
      forest: 'lumber',
      hills: 'brick',
      pasture: 'natural_fiber',
      fields: 'food',
      mountains: 'steel',
    };
    const hexes = [...document.querySelectorAll('[data-hex]')].map((g) => {
      const label = g.getAttribute('aria-label')!;
      const m = /^Hex (\d+): (\w+)(?: number (\d+))?/.exec(label)!;
      const [x, y] = xy(g);
      return {
        id: Number(m[1]),
        resource: resourceOf[m[2]!] ?? null,
        number: m[3] ? Number(m[3]) : null,
        x,
        y,
        blocked: /blocked by a hazard/.test(label) ? 'hazard' : /Inspector/.test(label) ? 'inspector' : 'none',
      };
    });

    const tally: Record<string, Map<string, number>> = {};
    for (const k of ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science']) tally[k] = new Map();
    const add = (card: string, number: number, blocked: string) => {
      const key = `${number}|${blocked}`;
      tally[card]!.set(key, (tally[card]!.get(key) ?? 0) + 1);
    };
    const yours = new Set<number>();

    for (const g of document.querySelectorAll('[data-node]')) {
      const label = g.getAttribute('aria-label')!;
      const owned = new RegExp(`: (town|city) owned by ${pid}`).exec(label);
      if (!owned) continue;
      const [nx, ny] = xy(g);
      // A corner touches the hexes whose centres are as near as the nearest one is
      const dist = hexes.map((h) => ({ h, d: Math.hypot(h.x - nx, h.y - ny) })).sort((a, b) => a.d - b.d);
      for (const { h, d } of dist) {
        if (d > dist[0]!.d * 1.2) break;
        if (h.number === null || h.resource === null) continue;
        yours.add(h.id);
        const blocked = h.blocked !== 'none' ? h.blocked : /blocked by Hazard/.test(label) ? 'building' : 'none';
        add(h.resource, h.number, blocked);
        if (owned[1] === 'city') add('science', h.number, blocked);
      }
    }
    const rolls = {} as Record<string, string[]>;
    for (const [card, map] of Object.entries(tally)) {
      rolls[card] = [...map].map(([key, count]) => `${key}|${count}`).sort();
    }
    return { hexes: [...yours].sort((a, b) => a - b), rolls };
  }, playerId) as Promise<{ hexes: number[]; rolls: Record<Card, string[]> }>;
}

/** The numbers shown under each card in the panel, in the same `number|blocked|count` form. */
async function rollsFromPanel(page: Page): Promise<Record<Card, string[]>> {
  return page.evaluate(() => {
    const out = {} as Record<string, string[]>;
    for (const k of ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science']) {
      const slot = document.querySelector(`[data-testid="discard-rolls-${k}"]`)!;
      out[k] = [...slot.querySelectorAll('li')]
        .map((li) => {
          const times = /×(\d+)/.exec(li.querySelector('small')?.textContent ?? '');
          const blocked = li.getAttribute('data-blocked');
          return `${li.getAttribute('data-number')}|${blocked}|${times ? times[1] : 1}`;
        })
        .sort();
    }
    return out;
  }) as Promise<Record<Card, string[]>>;
}

async function highlightedHexes(page: Page): Promise<number[]> {
  const ids = await page.locator('[data-testid^="hex-yours-"]').evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute('data-testid')!.replace('hex-yours-', '')))
  );
  return ids.sort((a, b) => a - b);
}

test.describe('CATAN: New Energies — discard panel', () => {
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ] as const) {
    test(`the island stays clear and visible at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(DISCARD);
      const panel = page.getByTestId('pending-decision-modal');
      await expect(panel).toBeVisible();
      await expect(panel).toContainText('Seven! Orange discards 6 cards');

      // The panel sits below the board, not over it
      const stage = (await page.getByTestId('tabletop-board').boundingBox())!;
      const box = (await panel.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);

      // The centre of every hex Orange builds on is the board itself: no overlay, no panel over it
      const hexes = await highlightedHexes(page);
      expect(hexes.length).toBeGreaterThan(0);
      for (const id of hexes) {
        const hit = await page.evaluate((hexId) => {
          const disc = document.querySelector(`[data-testid="number-disc-${hexId}"] circle:nth-of-type(2)`)!;
          const r = disc.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          const stack = document.elementsFromPoint(cx, cy);
          return {
            inBoard: !!top?.closest('[data-testid="island-board-svg"]'),
            hex: top?.closest('[data-hex]')?.getAttribute('data-hex') ?? null,
            inPanel: !!top?.closest('[data-testid="pending-decision-modal"]'),
            fixedAbove: stack.some((el) => getComputedStyle(el).position === 'fixed'),
            visible: cx > 0 && cy > 0 && cx < innerWidth && cy < innerHeight,
          };
        }, id);
        expect(hit.visible, `hex ${id} is on screen`).toBe(true);
        expect(hit.inBoard, `hex ${id} is not covered`).toBe(true);
        expect(hit.hex).toBe(String(id));
        expect(hit.inPanel).toBe(false);
        expect(hit.fixedAbove, `nothing fixed over hex ${id}`).toBe(false);
      }

      // Nothing dims the page behind the panel
      const backdrops = await page.evaluate(() =>
        [...document.querySelectorAll('body *')].filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.position === 'fixed' && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
        }).length
      );
      expect(backdrops).toBe(0);

      await page.screenshot({ path: test.info().outputPath(`discard-${width}x${height}.png`) });
    });
  }

  test('the hexes Orange produces from are highlighted and the numbers under each card match the board', async ({ page }) => {
    await page.goto(DISCARD);
    await expect(page.getByTestId('pending-decision-modal')).toBeVisible();

    const board = await rollsFromBoard(page, 'orange');
    expect(board.hexes.length).toBeGreaterThanOrEqual(4);
    expect(await highlightedHexes(page)).toEqual(board.hexes);
    // Hexes Orange does not touch step back
    const dimmed = await page.locator('[data-testid^="hex-dimmed-"]').count();
    expect(dimmed).toBe(19 - board.hexes.length);

    expect(await rollsFromPanel(page)).toEqual(board.rolls);

    // The blocked hex (hazard on the 8) is shown greyed, under brick and science
    const blocked = page.getByTestId('discard-rolls-brick').locator('li[data-blocked="hazard"]');
    await expect(blocked).toHaveText('8');
    await expect(blocked).toHaveAttribute('title', /blocked by a hazard/);
    await expect(page.getByTestId('discard-rolls-science').locator('li[data-blocked="hazard"]')).toHaveText('8');
    // Orange touches no pasture, so fiber never comes
    await expect(page.getByTestId('discard-rolls-natural_fiber')).toContainText('none');
    // Every number on the panel is a real disc on a highlighted hex
    for (const card of CARDS) {
      for (const entry of board.rolls[card]) {
        expect(Number(entry.split('|')[0])).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('the board can still be panned and zoomed, and clicking it does nothing', async ({ page }) => {
    await page.goto(DISCARD);
    await expect(page.getByTestId('pending-decision-modal')).toBeVisible();
    const held = async () => Promise.all(CARDS.map((k) => page.getByTestId(`discard-held-${k}`).textContent()));
    const before = await held();

    // Click a hex, a building and a path: no move, no error, still waiting for the discard
    const centre = async (selector: string) => {
      const b = (await page.locator(selector).first().boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    for (const selector of [
      '[data-testid="number-disc-11"]',
      '[data-node][aria-label*="owned by orange"] circle',
      '[data-edge][aria-label], [data-edge]',
    ]) {
      const p = await centre(selector);
      await page.mouse.click(p.x, p.y);
    }
    await expect(page.getByTestId('action-error-toast')).toHaveCount(0);
    await expect(page.locator('.tt-toast')).toHaveCount(0);
    await expect(page.locator('[data-testid^="hex-target-"], [data-testid^="node-target-"], [data-testid^="edge-target-"]')).toHaveCount(0);
    await expect(page.getByTestId('pending-decision-modal')).toBeVisible();
    expect(await held()).toEqual(before);
    await expect(page.getByTestId('confirm-discard-btn')).toBeDisabled();

    // Zoom in, then drag the board
    await expect(page.getByTestId('zoom-level-readout')).toHaveText('100%');
    await page.getByTestId('zoom-in-btn').click();
    await expect(page.getByTestId('zoom-level-readout')).not.toHaveText('100%');
    const stage = page.getByTestId('tabletop-board');
    const transformBefore = await stage.evaluate((el) => (el as HTMLElement).style.transform);
    const start = await centre('[data-testid="island-board-svg"]');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 30, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => stage.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(transformBefore);
    await expect(page.getByTestId('action-error-toast')).toHaveCount(0);
    expect(await held()).toEqual(before);
  });

  test('discarding works end to end and the board goes back to normal', async ({ page }) => {
    await page.goto(DISCARD);
    const panel = page.getByTestId('pending-decision-modal');
    const confirm = page.getByTestId('confirm-discard-btn');
    await expect(panel).toBeVisible();
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveText('Choose 6 more');

    // 12 cards in hand, 6 to go: steel and science are picked in a scrambled order, one change of mind
    for (const card of ['steel', 'science', 'steel', 'lumber', 'science']) {
      await page.getByTestId(`discard-card-${card}`).click();
    }
    await page.getByRole('button', { name: 'Keep one Lumber' }).click();
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveText('Choose 2 more');
    await expect(page.getByTestId('discard-held-steel')).toHaveText('1');
    await page.getByTestId('discard-card-food').click();
    await page.getByTestId('discard-card-food').click();
    await expect(confirm).toBeEnabled();
    await expect(confirm).toHaveText('Discard 6 cards');
    // The hand is full: nothing more can be added
    await expect(page.getByTestId('discard-card-brick')).toBeDisabled();
    await confirm.click();

    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('action-error-toast')).toHaveCount(0);
    await expect(page.locator('[data-testid^="hex-yours-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="hex-dimmed-"]')).toHaveCount(0);
    // The dock is back with the smaller hand, and the inspector comes next
    await expect(page.getByTestId('dock-hand')).toBeVisible();
    await expect(page.getByTestId('organiser-count-steel')).toHaveText('1');
    await expect(page.getByTestId('organiser-count-science')).toHaveText('1');
    await expect(page.getByTestId('organiser-count-food')).toHaveText('0');
    await expect(page.getByTestId('organiser-count-lumber')).toHaveText('2');
    await expect(page.getByTestId('pending-decision-banner')).toContainText('move the inspector');
  });

  test('hotseat: the curtain hides the cards, then the next player discards with their own hexes lit', async ({ page }) => {
    // A saved hotseat game (all human, privacy curtain on): Orange discards 6, then Purple discards 4.
    // Built by the app's own code in the browser (the dev server serves the sources), then resumed on a plain URL.
    await page.goto('/?lobby=1');
    await page.evaluate(async () => {
      // Paths held in variables so the type checker leaves them alone (they only exist for the dev server)
      const setupModule = '/src/engine/setup.ts';
      const scenarioModule = '/src/ui/devScenarios.ts';
      const { createInitialGameState } = await import(setupModule);
      const { applyDevScenario } = await import(scenarioModule);
      const state = applyDevScenario(createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 }), 'discard');
      state.players.purple!.resources = { lumber: 2, brick: 2, natural_fiber: 1, food: 2, steel: 1 };
      state.players.purple!.science = 1;
      state.pendingDecisions.push({ id: 'dev-discard-purple', type: 'DISCARD_ON_SEVEN', playerId: 'purple', cardsToDiscard: 4 });
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

    const panel = page.getByTestId('pending-decision-modal');
    await expect(panel).toContainText('Seven! Orange discards 6 cards');
    expect(await highlightedHexes(page)).toEqual((await rollsFromBoard(page, 'orange')).hexes);
    for (const card of ['lumber', 'lumber', 'brick', 'natural_fiber', 'food', 'steel']) {
      await page.getByTestId(`discard-card-${card}`).click();
    }
    await page.getByTestId('confirm-discard-btn').click();

    // Device goes to Purple: the curtain is up and the panel behind it shows no cards
    await expect(page.getByTestId('privacy-curtain-modal')).toBeVisible();
    await expect(panel).toContainText('Seven! Purple discards 4 cards');
    await expect(page.getByTestId('discard-hidden')).toBeVisible();
    await expect(page.locator('[data-testid^="discard-card-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="discard-held-"]')).toHaveCount(0);
    await expect(page.getByTestId('confirm-discard-btn')).toBeDisabled();

    await page.getByTestId('privacy-curtain-ready-btn').click();
    await expect(page.getByTestId('privacy-curtain-modal')).toHaveCount(0);
    await expect(page.getByTestId('discard-hidden')).toHaveCount(0);
    // Purple's own hexes are lit now, and the numbers are Purple's
    const purple = await rollsFromBoard(page, 'purple');
    expect(purple.hexes.length).toBeGreaterThan(0);
    expect(await highlightedHexes(page)).toEqual(purple.hexes);
    expect(await rollsFromPanel(page)).toEqual(purple.rolls);
    await expect(page.getByTestId('discard-held-lumber')).toHaveText('2');
    for (const card of ['lumber', 'brick', 'food', 'science']) {
      await page.getByTestId(`discard-card-${card}`).click();
    }
    await page.getByTestId('confirm-discard-btn').click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('action-error-toast')).toHaveCount(0);
    await expect(page.getByTestId('pending-decision-banner')).toContainText('move the inspector');
  });
});
