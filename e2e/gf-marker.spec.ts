import { expect, test, type Page } from '@playwright/test';

/** Low value on the outer row, a high one on the inner row, and the starting values of both table sizes. */
const CASES = [
  { name: '4 players, start', url: '/?seed=42&setup=first&players=4&placement=fixed&bots=0', value: 12 },
  { name: '3 players, start', url: '/?seed=42&setup=first&players=3&placement=fixed&bots=0', value: 9 },
  { name: 'low footprint', url: '/?scenario=draws2&bots=0', value: 3 },
  { name: 'high footprint', url: '/?scenario=draws3&bots=0', value: 26 },
];

/** Measures the marker in screen pixels and in its cell's own units (cell is 13.6 wide, current one is larger). */
async function measureMarker(page: Page, value: number) {
  return page.evaluate((val) => {
    const cellGroup = document.querySelector(`[data-testid="gf-space-${val}"]`)!;
    const marker = cellGroup.querySelector('[data-testid="gf-marker"]') as SVGGElement | null;
    const cloud = marker?.querySelector('[data-testid="gf-marker-cloud"]') as SVGPathElement | null;
    const cellRect = cellGroup.querySelector('rect') as SVGRectElement;
    const glow = cellGroup.querySelector('[data-testid="gf-current-glow"]') as SVGRectElement | null;
    const widgetCloud = document.querySelector('[data-testid="gf-hud-widget"] path') as SVGPathElement;

    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const inside = (inner: DOMRect, outer: DOMRect, tol = 0.5) =>
      inner.left >= outer.left - tol &&
      inner.right <= outer.right + tol &&
      inner.top >= outer.top - tol &&
      inner.bottom <= outer.bottom + tol;

    // 1. Everything the marker draws (shadow, block, rim, cloud), sampled along its outlines and expressed in the
    //    cell's own (rotated) frame: how far from the cell's centre, and so how much room is left inside the ring
    const toCell = cellRect.getScreenCTM()!.inverse();
    let reach = 0;
    let sumX = 0;
    let sumY = 0;
    let n = 0;
    for (const el of Array.from(marker?.querySelectorAll('rect, path') ?? []) as unknown as SVGGeometryElement[]) {
      const m = toCell.multiply(el.getScreenCTM()!);
      const len = el.getTotalLength();
      for (let i = 0; i < 64; i++) {
        const p = el.getPointAtLength((i / 64) * len);
        const q = new DOMPoint(p.x, p.y).matrixTransform(m);
        reach = Math.max(reach, Math.abs(q.x), Math.abs(q.y));
        sumX += q.x;
        sumY += q.y;
        n++;
      }
    }
    const half = Number(cellRect.getAttribute('width')) / 2;
    const ring = Number(cellRect.getAttribute('stroke-width'));
    const ctm = cellRect.getScreenCTM()!;
    const pxPerUnit = Math.hypot(ctm.a, ctm.b);

    // 2. Other cells' numbers
    const otherTextEls = Array.from(document.querySelectorAll('[data-testid^="gf-space-"]'))
      .filter((g) => g !== cellGroup)
      .flatMap((g) => Array.from(g.querySelectorAll('text')));
    const otherTexts = otherTextEls.map((t) => t.getBoundingClientRect());
    const otherCells = Array.from(document.querySelectorAll('[data-testid^="gf-space-"]'))
      .filter((g) => g !== cellGroup)
      .map((g) => g.querySelector('rect')!);

    // 3. The glow (the outermost thing on the cell) against the neighbours' numbers and cells. Everything is tilted,
    //    so compare outlines in the current cell's own frame instead of screen boxes
    const glowReach = glow ? Number(glow.getAttribute('width')) / 2 + Number(glow.getAttribute('stroke-width')) / 2 : 0;
    const outlineInCell = (el: SVGGraphicsElement) => {
      const b = el.getBBox();
      const m = toCell.multiply(el.getScreenCTM()!);
      const corners = [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x + b.width, b.y + b.height],
        [b.x, b.y + b.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
      return corners.flatMap((c, i) => {
        const d = corners[(i + 1) % 4]!;
        return Array.from({ length: 16 }, (_, k) => ({ x: c.x + ((d.x - c.x) * k) / 16, y: c.y + ((d.y - c.y) * k) / 16 }));
      });
    };
    const reachesGlow = (el: SVGGraphicsElement) =>
      outlineInCell(el).some((p) => Math.abs(p.x) < glowReach && Math.abs(p.y) < glowReach);

    const markerBox = marker?.getBoundingClientRect();
    const cloudBox = cloud?.getBoundingClientRect();
    const cellBox = cellRect.getBoundingClientRect();
    const glowBox = glow?.getBoundingClientRect();

    const yellow = 'rgb(245, 209, 29)';
    const fillRgb = cloud ? (getComputedStyle(cloud).fill.match(/\d+/g) ?? []).map(Number) : [];
    return {
      markerCount: cellGroup.querySelectorAll('[data-testid="gf-marker"]').length,
      markersInTrack: document.querySelectorAll('[data-testid="gf-track"] [data-testid="gf-marker"]').length,
      cloudCount: marker?.querySelectorAll('[data-testid="gf-marker-cloud"]').length ?? 0,
      sameGlyph: !!cloud && cloud.getAttribute('d') === widgetCloud.getAttribute('d'),
      markerInsideCell: !!markerBox && inside(markerBox, cellBox),
      cloudInsideMarker: !!markerBox && !!cloudBox && inside(cloudBox, markerBox, 0.01),
      markerInsideGlow: !!markerBox && !!glowBox && inside(markerBox, glowBox),
      // Gap between the farthest bit of the marker and the inner edge of the yellow ring, in cell units
      clearance: half - ring / 2 - reach,
      // How far the marker's middle is from the cell's middle, in cell units
      offCentre: Math.hypot(sumX / n, sumY / n),
      cloudWidthUnits: cloudBox ? cloudBox.width / pxPerUnit : 0,
      cloudWidthPx: cloudBox?.width ?? 0,
      // Pale and bold: the cloud is near white
      cloudFill: fillRgb,
      markerHitsOtherText: !!markerBox && otherTexts.some((t) => hit(markerBox, t)),
      glowHitsOtherText: otherTextEls.some(reachesGlow),
      glowHitsOtherCell: otherCells.some(reachesGlow),
      otherTextCount: otherTexts.length,
      // One ring only: the cell's own stroke, never one on the marker
      ringsOnCell: Array.from(cellGroup.querySelectorAll('rect, path')).filter(
        (el) => getComputedStyle(el).stroke === yellow
      ).length,
      yellowOnMarker: Array.from(marker?.querySelectorAll('*') ?? []).filter(
        (el) => getComputedStyle(el).stroke === yellow
      ).length,
    };
  }, value);
}

function expectCleanMarker(m: Awaited<ReturnType<typeof measureMarker>>) {
  expect(m.markerCount).toBe(1);
  expect(m.markersInTrack).toBe(1);
  expect(m.cloudCount).toBe(1);
  expect(m.sameGlyph, 'the marker cloud is the widget cloud').toBe(true);

  // Inside its cell (and its ring), centred, with a clear gap to the ring, nothing poking out
  expect(m.markerInsideCell).toBe(true);
  expect(m.markerInsideGlow).toBe(true);
  expect(m.clearance).toBeGreaterThanOrEqual(0.5);
  expect(m.offCentre).toBeLessThan(1);

  // A bold, pale cloud on the top face
  expect(m.cloudInsideMarker).toBe(true);
  expect(m.cloudWidthUnits).toBeGreaterThanOrEqual(8);
  for (const channel of m.cloudFill) expect(channel).toBeGreaterThanOrEqual(235);
  expect(m.cloudFill).toHaveLength(3);

  // Never over a neighbour's number or cell, and a single yellow ring
  expect(m.otherTextCount).toBeGreaterThan(20);
  expect(m.markerHitsOtherText).toBe(false);
  expect(m.glowHitsOtherText).toBe(false);
  expect(m.glowHitsOtherCell).toBe(false);
  expect(m.ringsOnCell).toBe(1);
  expect(m.yellowOnMarker).toBe(0);
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  for (const { name, url, value } of CASES) {
    test(`global footprint marker (${name}) stays inside its cell with a cloud on it at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(url);
      await expect(page.getByTestId('gf-marker')).toBeAttached();
      await expect(page.getByTestId(`gf-space-${value}`).getByTestId('gf-marker')).toBeAttached();
      await expect(page.getByTestId('gf-marker-cloud')).toBeAttached();

      expectCleanMarker(await measureMarker(page, value));

      await page.getByTestId(`gf-space-${value}`).screenshot({ path: `test-results/gf-marker-${name.replace(/ /g, '-')}-${viewport.width}.png` });
    });
  }

  test(`global footprint marker is still clean and the cloud is large at maximum zoom at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(CASES[0]!.url);
    await expect(page.getByTestId('gf-marker')).toBeAttached();
    const before = await measureMarker(page, CASES[0]!.value);

    for (let i = 0; i < 12; i++) await page.getByTestId('zoom-in-btn').click();
    await expect(page.getByTestId('zoom-level-readout')).toHaveText('500%');
    await page.waitForTimeout(400); // the board eases to its new scale

    const after = await measureMarker(page, CASES[0]!.value);
    expectCleanMarker(after);
    // Same geometry in the cell's own units, five times bigger on screen
    expect(after.clearance).toBeCloseTo(before.clearance, 1);
    expect(after.cloudWidthPx / before.cloudWidthPx).toBeGreaterThan(4.5);
    expect(after.cloudWidthPx).toBeGreaterThan(20);
  });
}
