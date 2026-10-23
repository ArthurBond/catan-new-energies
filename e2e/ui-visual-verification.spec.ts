import { expect, test } from '@playwright/test';

test.describe('CATAN: New Energies — Tabletop layout, sea frame & zero-overlap verification', () => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`verifies ocean-blue sea, whales, board size and zero overlaps at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/?seed=42&setup=first&placement=fixed&players=4');

      // Pause bots for deterministic screenshot & layout measurement
      const pauseBtn = page.getByTestId('bot-pause-btn');
      await expect(pauseBtn).toBeVisible();
      await pauseBtn.click();

      const boardSvg = page.getByTestId('island-board-svg');
      await expect(boardSvg).toBeVisible();

      // 1. Sea frame details, table components and controls are present
      await expect(page.getByTestId('ocean-whales')).toBeVisible();
      const whalePod = page.getByTestId('gf-whale-pod');
      await expect(whalePod).toBeVisible();
      await expect(whalePod.locator('.ocean-whale-animated')).toHaveCount(4);
      await expect(page.getByTestId('gf-hud-widget')).toBeVisible();
      await expect(page.getByTestId('live-action-banner')).toBeAttached();
      await expect(page.getByTestId('tabletop-dice-roll-overlay')).toBeVisible();
      await expect(page.getByTestId('toggle-player-mat-btn')).toBeVisible();
      await expect(page.getByTestId('zoom-in-btn')).toBeVisible();
      await page.getByTestId('settings-btn').click();
      await expect(page.getByTestId('tablecloth-color-input')).toBeAttached();
      await page.keyboard.press('Escape');

      // 2. The board is the hero: at least 64% of the viewport height
      const boardBox = (await boardSvg.boundingBox())!;
      expect(boardBox.height).toBeGreaterThan(viewport.height * 0.64);

      // 3. Ocean gradient renders blue (not black) in open water
      const seaPixelCheck = await page.evaluate(async () => {
        const stops = Array.from(document.querySelectorAll('#oceanRadialGrad stop'));
        const stopColors = stops.map((s) => window.getComputedStyle(s).stopColor);

        const svgEl = document.querySelector('[data-testid="island-board-svg"]') as SVGSVGElement;
        const svgStr = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));

        const pixelRgb = await new Promise<[number, number, number]>((resolve, reject) => {
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1000;
            canvas.height = 1000;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, 1000, 1000);
            // Open water west of the island, between the 3:1 harbor and the event islands
            const data = ctx.getImageData(140, 600, 1, 1).data;
            URL.revokeObjectURL(url);
            resolve([data[0]!, data[1]!, data[2]!]);
          };
          img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
          };
          img.src = url;
        });

        return { stopColors, pixelRgb };
      });

      const [r, g, b] = seaPixelCheck.pixelRgb;
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
      expect(b).toBeGreaterThan(100);
      for (const sc of seaPixelCheck.stopColors) {
        expect(sc).not.toBe('rgb(0, 0, 0)');
      }

      // 4. Sea frame furniture never overlaps: GF rows, VP title vs slots, GF widget vs harbors
      const seaOverlapCheck = await page.evaluate(() => {
        const hit = (a: DOMRect, b: DOMRect, m = 0.5) =>
          a.left < b.right - m && a.right > b.left + m && a.top < b.bottom - m && a.bottom > b.top + m;

        const row1: DOMRect[] = [];
        const row2: DOMRect[] = [];
        for (let v = 0; v <= 17; v++) {
          const el = document.querySelector(`[data-testid="gf-space-${v}"] rect`);
          if (el) row1.push(el.getBoundingClientRect());
        }
        for (let v = 18; v <= 28; v++) {
          const el = document.querySelector(`[data-testid="gf-space-${v}"] rect`);
          if (el) row2.push(el.getBoundingClientRect());
        }
        let gfRowOverlaps = 0;
        for (const r1 of row1) for (const r2 of row2) if (hit(r1, r2)) gfRowOverlaps++;

        // The label pill sits on the sea below the band, so it must not touch any counter either
        const vpTitleRect = document.querySelector('[data-testid="vp-title"]')!.getBoundingClientRect();
        const vpTitleOverlapsSlots = Array.from(document.querySelectorAll('[data-testid^="vp-slot-"] circle'))
          .map((el) => el.getBoundingClientRect())
          .some((s) => hit(vpTitleRect, s, 0));

        // Harbor badges (the circles) must stay clear of the GF widget and of each other
        const widget = document.querySelector('[data-testid="gf-hud-widget"]')!.getBoundingClientRect();
        const badges = Array.from(document.querySelectorAll('[data-testid^="harbor-"] circle:nth-of-type(2)')).map(
          (el) => el.getBoundingClientRect()
        );
        const widgetOverlapsHarbor = badges.some((bdg) => hit(widget, bdg));

        return { row1Count: row1.length, row2Count: row2.length, gfRowOverlaps, vpTitleOverlapsSlots, widgetOverlapsHarbor };
      });
      expect(seaOverlapCheck.row1Count).toBe(18);
      expect(seaOverlapCheck.row2Count).toBe(11);
      expect(seaOverlapCheck.gfRowOverlaps).toBe(0);
      expect(seaOverlapCheck.vpTitleOverlapsSlots).toBe(false);
      expect(seaOverlapCheck.widgetOverlapsHarbor).toBe(false);

      // 5. Rails and dock never cover the circular board
      const layoutCheck = await page.evaluate(() => {
        const svgRect = document.querySelector('[data-testid="island-board-svg"]')!.getBoundingClientRect();
        const cx = svgRect.left + svgRect.width / 2;
        const cy = svgRect.top + svgRect.height / 2;
        const radius = (svgRect.width / 1000) * 474;
        const panels = [
          ...Array.from(document.querySelectorAll('[data-testid="left-table-margin"] > *')),
          ...Array.from(document.querySelectorAll('[data-testid="right-table-margin"] > *')),
          ...Array.from(document.querySelectorAll('[data-testid="bottom-player-dock"] > section')),
        ].map((el) => el.getBoundingClientRect());
        const overlapsCircle = panels.some((rect) => {
          const nearestX = Math.max(rect.left, Math.min(cx, rect.right));
          const nearestY = Math.max(rect.top, Math.min(cy, rect.bottom));
          return Math.hypot(nearestX - cx, nearestY - cy) < radius - 2;
        });
        // Nothing should spill past the viewport edges (no page scroll at desktop sizes)
        const doc = document.documentElement;
        return {
          overlapsCircle,
          panelCount: panels.length,
          horizontalScroll: doc.scrollWidth > doc.clientWidth,
          verticalScroll: doc.scrollHeight > doc.clientHeight,
        };
      });
      expect(layoutCheck.panelCount).toBeGreaterThan(8);
      expect(layoutCheck.overlapsCircle).toBe(false);
      expect(layoutCheck.horizontalScroll).toBe(false);
      expect(layoutCheck.verticalScroll).toBe(false);

      // 6. Player board drawer: mat artwork must not overlap itself
      await page.getByTestId('toggle-player-mat-btn').click();
      await expect(page.getByTestId('player-mat')).toBeVisible();
      const matOverlapCheck = await page.evaluate(() => {
        const devCard = document.querySelector('[data-testid="mat-buy-dev-card"] rect')!.getBoundingClientRect();
        const townSlot0 = document
          .querySelector('[data-testid="mat-town-slot-0"] [data-slot-recess]')!
          .getBoundingClientRect();
        const roadFrame = document.querySelector('[data-testid="mat-build-road"] rect')!.getBoundingClientRect();
        const boxHit = (a: DOMRect, b: DOMRect) =>
          a.left + 1 < b.right - 1 && a.right - 1 > b.left + 1 && a.top + 1 < b.bottom - 1 && a.bottom - 1 > b.top + 1;
        // Every piece slot, plant slot and cost tab stays inside the printed area of the board
        const svgBox = document.querySelector('[data-testid="player-mat"] svg')!.getBoundingClientRect();
        const unit = svgBox.width / 860;
        const inner = {
          left: svgBox.left + 16 * unit,
          right: svgBox.left + 844 * unit,
          top: svgBox.top + 16 * unit,
          bottom: svgBox.top + 424 * unit,
        };
        const slots = Array.from(
          document.querySelectorAll(
            '[data-testid^="mat-town-slot-"], [data-testid^="mat-city-slot-"], [data-testid^="mat-fossil-slot-"], [data-testid^="mat-renewable-slot-"]'
          )
        ).map((el) => el.getBoundingClientRect());
        const outside = slots.filter(
          (r) => r.left < inner.left - 1 || r.right > inner.right + 1 || r.top < inner.top - 1 || r.bottom > inner.bottom + 1
        ).length;
        return {
          devOverlapsTown0: boxHit(devCard, townSlot0),
          devOverlapsRoadFrame: boxHit(devCard, roadFrame),
          slotCount: slots.length,
          slotsOutside: outside,
        };
      });
      expect(matOverlapCheck.devOverlapsTown0).toBe(false);
      expect(matOverlapCheck.devOverlapsRoadFrame).toBe(false);
      expect(matOverlapCheck.slotCount).toBe(24);
      expect(matOverlapCheck.slotsOutside).toBe(0);
      if (viewport.width === 1920) {
        await page.getByTestId('player-mat').screenshot({ path: 'docs/ui-after-player-mat.png' });
      }
      await page.getByTestId('toggle-player-mat-btn').click();
      await expect(page.getByTestId('player-mat')).toHaveCount(0);

      // 7. Save verification screenshots for visual review
      await page.screenshot({ path: `docs/ui-after-overview-${viewport.width}x${viewport.height}.png` });

      if (viewport.width === 1920) {
        await boardSvg.screenshot({ path: 'docs/ui-after-sea-closeup.png' });

        // 8. Draw -> roll -> build a power plant from the dock, then zoom in on the pieces
        await page.getByTestId('action-draw-event-btn').click();
        const rollBtn = page.getByTestId('action-roll-dice-btn');
        if (await rollBtn.isVisible()) await rollBtn.click();
        await expect(page.locator('.tt-dice-sum')).toHaveText(/\d+/);

        // A seven asks the human to move the inspector: click any glowing hex
        const hexTarget = page.locator('[data-testid^="hex-target-"]').first();
        if (await hexTarget.count()) {
          await hexTarget.locator('xpath=..').click({ force: true });
        }

        const fossil = page.getByTestId('build-fossil');
        if (await fossil.isEnabled()) {
          await fossil.click();
          const target = page.locator('[data-testid^="plant-target-"]').first();
          await target.click({ force: true });
        }

        for (let z = 0; z < 4; z++) {
          await page.getByTestId('zoom-in-btn').click();
        }
        await page.screenshot({ path: 'docs/ui-after-pieces-closeup.png' });
      }
    });
  }
});
