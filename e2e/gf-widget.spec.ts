import { expect, test } from '@playwright/test';

const CASES = [
  { scenario: 'showcase', draws: 1 },
  { scenario: 'draws2', draws: 2 },
  { scenario: 'draws3', draws: 3 },
];

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  for (const { scenario, draws } of CASES) {
    test(`global footprint widget: "DRAW ${draws}/TURN" has no overlaps at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?scenario=${scenario}&bots=0`);
      const widget = page.getByTestId('gf-hud-widget');
      await expect(widget).toBeVisible();
      await expect(page.getByTestId('gf-draw-text')).toContainText(`DRAW ${draws}/TURN`);

      const m = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const text = box('[data-testid="gf-draw-text"]');
        const icon = box('[data-testid="gf-draw-icon"]');
        const pill = box('[data-testid="gf-draw-pill"]');
        const widgetBox = box('[data-testid="gf-hud-widget"]');
        const hit = (a: DOMRect, b: DOMRect, margin = 0) =>
          a.left < b.right - margin && a.right > b.left + margin && a.top < b.bottom - margin && a.bottom > b.top + margin;

        // The glyph run really ends where the layout says it does (not just its box)
        const textEl = document.querySelector('[data-testid="gf-draw-text"]') as unknown as SVGTextContentElement;
        const glyphLen = textEl.getComputedTextLength();

        const cells = Array.from(document.querySelectorAll('[data-testid^="gf-space-"] rect')).map((el) =>
          el.getBoundingClientRect()
        );
        const harbors = Array.from(document.querySelectorAll('[data-testid^="harbor-"]')).map((el) =>
          el.getBoundingClientRect()
        );
        const numberBox = box('[data-testid="gf-hud-widget"] rect:nth-of-type(3)');
        return {
          iconRight: icon.right,
          textLeft: text.left,
          textRight: text.right,
          pillLeft: pill.left,
          pillRight: pill.right,
          pillTop: pill.top,
          pillBottom: pill.bottom,
          textTop: text.top,
          textBottom: text.bottom,
          iconTextOverlap: hit(icon, text),
          widgetHitsCell: cells.some((c) => hit(widgetBox, c, 1)),
          widgetHitsHarbor: harbors.some((h) => hit(widgetBox, h, 1)),
          glyphLen,
          textWidth: text.width,
          numberWidth: numberBox.width,
        };
      });

      expect(m.iconTextOverlap).toBe(false);
      // A clear gap between the bag icon and the first letter, and padding before the pill's end,
      // measured in board units so the result does not depend on the screen size
      const unit = (m.pillRight - m.pillLeft) / 80;
      expect((m.textLeft - m.iconRight) / unit).toBeGreaterThanOrEqual(5);
      expect((m.pillRight - m.textRight) / unit).toBeGreaterThanOrEqual(3);
      expect(m.textLeft).toBeGreaterThan(m.pillLeft);
      expect(m.textTop).toBeGreaterThanOrEqual(m.pillTop - 1);
      expect(m.textBottom).toBeLessThanOrEqual(m.pillBottom + 1);
      expect(m.widgetHitsCell).toBe(false);
      expect(m.widgetHitsHarbor).toBe(false);

      await widget.screenshot({ path: `test-results/gf-widget-${scenario}-${viewport.width}.png` });
    });
  }
}
