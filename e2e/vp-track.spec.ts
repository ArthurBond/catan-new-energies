import { expect, test } from '@playwright/test';

/** Everything below is measured in the SVG's own coordinates, so it holds at any screen size. */
for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`victory point track stays on the green and the label stays on the sea at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?scenario=showcase&bots=0');
    await expect(page.getByTestId('vp-track')).toBeVisible();

    // The track runs 3..10 (everyone starts with a town and a city), and all four players start on 3
    for (let v = 3; v <= 10; v++) await expect(page.getByTestId(`vp-slot-${v}`)).toBeAttached();
    for (const v of [0, 1, 2, 11]) await expect(page.getByTestId(`vp-slot-${v}`)).toHaveCount(0);
    await expect(page.getByTestId('vp-slot-3').locator('[data-testid^="vp-marker-"]')).toHaveCount(4);

    const m = await page.evaluate(() => {
      const green = document.querySelector('[data-testid="vp-peninsula"]') as unknown as SVGGeometryElement;
      const reef = document.querySelector('[data-testid="vp-reef"]') as unknown as SVGGeometryElement;
      const arc = document.querySelector('[data-testid="vp-title-arc"]') as unknown as SVGGeometryElement;
      const svg = green.ownerSVGElement!;
      const at = (x: number, y: number) => new DOMPoint(x, y);
      const around = (cx: number, cy: number, r: number, n = 48) =>
        Array.from({ length: n }, (_, i) => at(cx + Math.cos((i / n) * 6.2832) * r, cy + Math.sin((i / n) * 6.2832) * r));

      // 1. Every counter, with a margin around its outer ring, lies fully inside the green
      const counters = Array.from(document.querySelectorAll('[data-testid^="vp-slot-"]')).map((g) => {
        const ring = g.querySelector('circle')!;
        const cx = Number(ring.getAttribute('cx'));
        const cy = Number(ring.getAttribute('cy'));
        const r = Number(ring.getAttribute('r')) + Number(ring.getAttribute('stroke-width')) / 2 + 3;
        const outside = around(cx, cy, r).filter((p) => !green.isPointInFill(p)).length;
        return { id: g.getAttribute('data-testid'), outside };
      });

      // 2. Neighbouring counters never touch each other
      const centres = Array.from(document.querySelectorAll('[data-testid^="vp-slot-"] circle:first-child')).map((c) => ({
        x: Number(c.getAttribute('cx')),
        y: Number(c.getAttribute('cy')),
        r: Number(c.getAttribute('r')),
      }));
      let minGap = Infinity;
      for (let i = 1; i < centres.length; i++) {
        const a = centres[i - 1]!;
        const b = centres[i]!;
        minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
      }

      // 3. The label pill (its centre line plus half its thickness and a margin) is clear of the green
      //    and of the foam reef around it
      const half = Number(arc.getAttribute('stroke-width')) / 2 + 3;
      const total = arc.getTotalLength();
      let labelOnGreen = 0;
      let labelOnReef = 0;
      const cxBoard = 500;
      const cyBoard = 500;
      for (let i = -half; i <= total + half; i += 2) {
        const p = arc.getPointAtLength(Math.max(0, Math.min(total, i)));
        const ang = Math.atan2(p.y - cyBoard, p.x - cxBoard);
        for (const k of [-half, 0, half]) {
          const q = at(p.x + Math.cos(ang) * k, p.y + Math.sin(ang) * k);
          if (green.isPointInFill(q)) labelOnGreen++;
          if (reef.isPointInFill(q)) labelOnReef++;
        }
      }

      // 4. The label text fits inside its pill
      const text = document.querySelector('[data-testid="vp-title"] text') as unknown as SVGTextContentElement;

      // 5. The reef and the green stay inside the sea frame (radius 466 from the board centre)
      const rimR = 466.5;
      let beyondRim = 0;
      for (const shape of [green, reef]) {
        const len = shape.getTotalLength();
        for (let i = 0; i < len; i += 3) {
          const p = shape.getPointAtLength(i);
          if (Math.hypot(p.x - cxBoard, p.y - cyBoard) > rimR) beyondRim++;
        }
      }
      return {
        counters,
        minGap,
        labelOnGreen,
        labelOnReef,
        textLength: text.getComputedTextLength(),
        pillLength: total,
        beyondRim,
        hasSvg: !!svg,
      };
    });

    expect(m.counters).toHaveLength(8);
    for (const c of m.counters) expect(c.outside, `${c.id} is fully inside the green`).toBe(0);
    expect(m.minGap).toBeGreaterThan(4);
    expect(m.labelOnGreen).toBe(0);
    expect(m.labelOnReef).toBe(0);
    expect(m.textLength).toBeLessThanOrEqual(m.pillLength - 2);
    expect(m.beyondRim).toBe(0);

    await page.getByTestId('island-board-svg').screenshot({ path: `test-results/vp-track-${viewport.width}.png` });
  });
}
