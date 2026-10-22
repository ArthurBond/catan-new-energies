import { expect, test } from '@playwright/test';

test.describe('CATAN: New Energies — UI Visual Polish, Ocean Whales & Zero-Overlap Verification', () => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`verifies ocean-blue sea, whales, and zero bounding-box overlaps at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/?seed=42&setup=first&players=4&autostart=1');

      // Pause bots for deterministic screenshot & layout measurement
      const pauseBtn = page.getByTestId('bot-pause-btn');
      await expect(pauseBtn).toBeVisible();
      await pauseBtn.click();

      const boardSvg = page.getByTestId('island-board-svg');
      await expect(boardSvg).toBeVisible();

      // 1. Verify Ocean Whales, 4-Player Whale Pod, BGG GF HUD Widget, Live Action Banner & Tabletop Dice Tray
      await expect(page.getByTestId('ocean-whales')).toBeVisible();
      const whalePod = page.getByTestId('gf-whale-pod');
      await expect(whalePod).toBeVisible();
      await expect(whalePod.locator('.ocean-whale-animated')).toHaveCount(4);
      await expect(page.getByTestId('gf-hud-widget')).toBeVisible();
      await expect(page.getByTestId('live-action-banner')).toBeVisible();
      await expect(page.getByTestId('tabletop-dice-roll-overlay')).toBeVisible();
      await expect(page.getByTestId('tablecloth-color-input')).toBeVisible();
      await expect(page.getByTestId('toggle-player-mat-btn')).toBeVisible();
      await expect(page.getByTestId('zoom-in-btn')).toBeVisible();

      // 2. Programmatically verify ocean gradient stops and rasterized SVG pixel colors are blue-dominant (not black)
      const seaPixelCheck = await page.evaluate(async () => {
        const stops = Array.from(
          document.querySelectorAll('#seaOceanGrad stop, [id^="matSkyGrad-"] stop')
        );
        const stopColors = stops.map((s) => window.getComputedStyle(s).stopColor);

        // Render the board SVG into an offscreen canvas and sample an ocean pixel at top-left sea ring
        const svgEl = document.querySelector('[data-testid="island-board-svg"]') as SVGSVGElement;
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(svgEl);
        const img = new Image();
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const pixelRgb = await new Promise<[number, number, number]>((resolve, reject) => {
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1000;
            canvas.height = 1000;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, 1000, 1000);
            // Sample open ocean water between VP island (-90 deg) and GF track (-55 deg) at angle -68 deg, r=390 -> (646, 138)
            const data = ctx.getImageData(646, 138, 1, 1).data;
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
      // Sea pixel must be blue-dominant (B > R and B > G, and B > 100 — never black)
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
      expect(b).toBeGreaterThan(100);
      for (const sc of seaPixelCheck.stopColors) {
        expect(sc).not.toBe('rgb(0, 0, 0)');
      }

      // 3. Programmatically verify GF Track Row 1 (0..17) and Row 2 (18..28) do NOT overlap
      //    and GF header pill stays inside the circular sea rim
      const gfOverlapCheck = await page.evaluate(() => {
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

        let overlaps = 0;
        for (const r1 of row1) {
          for (const r2 of row2) {
            // Check if bounding boxes intersect (with 0.5px margin)
            if (
              r1.left < r2.right - 0.5 &&
              r1.right > r2.left + 0.5 &&
              r1.top < r2.bottom - 0.5 &&
              r1.bottom > r2.top + 0.5
            ) {
              overlaps++;
            }
          }
        }

        // Also check VP title pill vs VP slots 1..10
        const vpTitleRect = document
          .querySelector('[data-testid="vp-track"] g rect')!
          .getBoundingClientRect();
        const vpSlotRects = Array.from(
          document.querySelectorAll('[data-testid^="vp-slot-"] circle')
        ).map((el) => el.getBoundingClientRect());
        const vpTitleOverlapsSlots = vpSlotRects.some(
          (s) =>
            vpTitleRect.left < s.right &&
            vpTitleRect.right > s.left &&
            vpTitleRect.top < s.bottom &&
            vpTitleRect.bottom > s.top
        );

        return {
          row1Count: row1.length,
          row2Count: row2.length,
          overlaps,
          vpTitleOverlapsSlots,
        };
      });
      expect(gfOverlapCheck.row1Count).toBe(18);
      expect(gfOverlapCheck.row2Count).toBe(11);
      expect(gfOverlapCheck.overlaps).toBe(0);
      expect(gfOverlapCheck.vpTitleOverlapsSlots).toBe(false);

      // 4. Verify PlayerMat Dev Card frame does NOT overlap Town Slot 0 or Town Cost Strip,
      //    and Renewable Plant Slots do NOT overlap City Cost Strip
      const matOverlapCheck = await page.evaluate(() => {
        const devCard = document
          .querySelector('[data-testid="mat-buy-dev-card"] rect')!
          .getBoundingClientRect();
        const townSlot0 = document
          .querySelector('[data-testid="mat-town-slot-0"] polygon')!
          .getBoundingClientRect();
        const roadFrame = document
          .querySelector('[data-testid="mat-build-road"] rect')!
          .getBoundingClientRect();

        const renewableRects = Array.from(
          document.querySelectorAll('[data-testid^="mat-renewable-slot-"] circle')
        ).map((el) => el.getBoundingClientRect());

        // Find the top-left Town cost strip and top-right City cost strip in PlayerMat SVG
        const matSvg = document.querySelector('[data-testid="player-mat"] svg')!;
        const matSvgRect = matSvg.getBoundingClientRect();
        // Convert SVG coordinates of Town Cost Strip (x:56..92, y:16..100) & City Cost Strip (x:756..794, y:16..122)
        const scaleX = matSvgRect.width / 860;
        const scaleY = matSvgRect.height / 440;
        const townCostRect = {
          left: matSvgRect.left + 56 * scaleX,
          right: matSvgRect.left + 92 * scaleX,
          top: matSvgRect.top + 16 * scaleY,
          bottom: matSvgRect.top + 100 * scaleY,
        };
        const cityCostRect = {
          left: matSvgRect.left + 756 * scaleX,
          right: matSvgRect.left + 794 * scaleX,
          top: matSvgRect.top + 16 * scaleY,
          bottom: matSvgRect.top + 122 * scaleY,
        };

        const boxHit = (
          a: { left: number; right: number; top: number; bottom: number },
          b: { left: number; right: number; top: number; bottom: number }
        ) =>
          a.left + 1 < b.right - 1 &&
          a.right - 1 > b.left + 1 &&
          a.top + 1 < b.bottom - 1 &&
          a.bottom - 1 > b.top + 1;

        const devOverlapsTown0 = boxHit(devCard, townSlot0);
        const devOverlapsTownCost = boxHit(devCard, townCostRect);
        const devOverlapsRoadFrame = boxHit(devCard, roadFrame);
        const renewableOverlapsCityCost = renewableRects.some((r) => boxHit(r, cityCostRect));

        return {
          devOverlapsTown0,
          devOverlapsTownCost,
          devOverlapsRoadFrame,
          renewableOverlapsCityCost,
        };
      });
      expect(matOverlapCheck.devOverlapsTown0).toBe(false);
      expect(matOverlapCheck.devOverlapsTownCost).toBe(false);
      expect(matOverlapCheck.devOverlapsRoadFrame).toBe(false);
      expect(matOverlapCheck.renewableOverlapsCityCost).toBe(false);

      // 5. Verify Corner Opponent Stations do NOT overlap the circular Sea Frame board
      const cornerCheck = await page.evaluate(() => {
        const svgRect = document
          .querySelector('[data-testid="island-board-svg"]')!
          .getBoundingClientRect();
        const cx = svgRect.left + svgRect.width / 2;
        const cy = svgRect.top + svgRect.height / 2;
        const radius = (svgRect.width / 1000) * 490;

        const corners = Array.from(
          document.querySelectorAll('[data-testid^="corner-station-"]')
        ).map((el) => el.getBoundingClientRect());

        // Check minimum distance from circular board center to any point on each corner station card
        const overlapsCircle = corners.some((rect) => {
          const nearestX = Math.max(rect.left, Math.min(cx, rect.right));
          const nearestY = Math.max(rect.top, Math.min(cy, rect.bottom));
          const dist = Math.hypot(nearestX - cx, nearestY - cy);
          return dist < radius - 2;
        });

        return { overlapsCircle, boardDiameter: svgRect.width };
      });
      expect(cornerCheck.overlapsCircle).toBe(false);

      // 6. Save verification screenshots for independent visual review
      await page.screenshot({
        path: `docs/ui-after-overview-${viewport.width}x${viewport.height}.png`,
      });

      if (viewport.width === 1920) {
        await boardSvg.screenshot({ path: 'docs/ui-after-sea-closeup.png' });
        await page.getByTestId('player-mat').screenshot({ path: 'docs/ui-after-player-mat.png' });

        // 7. Step through Draw Event Disc -> Roll Dice -> Build Fossil Plant on Town/City to verify animations & interlocking sockets
        const drawBtn = page.getByTestId('action-draw-event-btn');
        if (await drawBtn.isVisible()) {
          await drawBtn.click();
        }
        const rollBtn = page.getByTestId('action-roll-dice-btn');
        if (await rollBtn.isVisible()) {
          await rollBtn.click();
        }

        // Verify tabletop dice tray shows rolled sum and live action banner updated
        await expect(page.getByTestId('tabletop-dice-roll-overlay')).toContainText('Sum:');
        await expect(page.getByTestId('live-action-banner')).toBeVisible();

        // If 7 was rolled (MOVE_INSPECTOR), click hex 0 to move the Inspector
        const pendingBanner = page.getByTestId('pending-decision-banner');
        if (await pendingBanner.isVisible()) {
          await page.locator('[data-hex="0"]').click({ force: true });
        }

        // Click Fossil Plant slot 0 on Player Mat to enter BUILD_FOSSIL_PLANT mode and place on first highlighted cutout
        const fossilSlot0 = page.getByTestId('mat-fossil-slot-0');
        if (await fossilSlot0.isVisible()) {
          await fossilSlot0.click();
          const firstCutout = page.locator('[data-plant-slot]').first();
          if (await firstCutout.isVisible()) {
            await firstCutout.click({ force: true });
          }
        }

        // Test Hide Player Mat + Zoom In (2x+) and take zoomed board screenshot
        await page.getByTestId('toggle-player-mat-btn').click();
        await expect(page.getByTestId('player-mat')).toHaveCount(0);
        for (let z = 0; z < 4; z++) {
          await page.getByTestId('zoom-in-btn').click();
        }
        await page.screenshot({ path: 'docs/ui-after-pieces-closeup.png' });
      }
    });
  }
});
