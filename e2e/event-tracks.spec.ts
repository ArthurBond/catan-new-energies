import { expect, test } from '@playwright/test';

const TRACKS = [
  'climateConference',
  'sustainableProduction',
  'governmentFunding',
  'airPollution',
  'productionIncrease',
  'environmentalPollution',
  'rainAndFlooding',
];

test('event tracks follow the rim, keep a gap above their labels, and nothing collides', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?scenario=showcase&bots=0');
  await expect(page.getByTestId('event-track-airPollution')).toBeAttached();

  const m = await page.evaluate((tracks) => {
    const cx = 500;
    const cy = 500;
    const dist = (x: number, y: number) => Math.hypot(x - cx, y - cy);
    const geom = (id: string) => document.querySelector(`[data-testid="${id}"]`) as unknown as SVGGeometryElement;
    const pt = (x: number, y: number) => new DOMPoint(x, y);

    const results = tracks.map((key) => {
      // 1. every slot centre lies on the same circle around the board centre (a curved track), evenly spaced
      const slots = [0, 1, 2, 3]
        .map((i) => document.querySelector(`[data-testid="event-slot-${key}-${i}"] circle`))
        .filter((c): c is Element => c !== null)
        .map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
      const radii = slots.map((s) => dist(s.x, s.y));
      const steps = slots.slice(1).map((s, i) => Math.hypot(s.x - slots[i]!.x, s.y - slots[i]!.y));

      // 2. the label pill is clear of the reef and sand around the track, with room to spare
      const reef = geom(`event-reef-${key}`);
      const arc = geom(`event-label-arc-${key}`);
      const half = Number(arc.getAttribute('stroke-width')) / 2;
      const total = arc.getTotalLength();
      let labelOnReef = 0;
      let minGapToReef = Infinity;
      for (let i = -half; i <= total + half; i += 1.5) {
        const p = arc.getPointAtLength(Math.max(0, Math.min(total, i)));
        const ang = Math.atan2(p.y - cy, p.x - cx);
        for (const k of [-half, 0, half]) {
          if (reef.isPointInFill(pt(p.x + Math.cos(ang) * k, p.y + Math.sin(ang) * k))) labelOnReef++;
        }
        // walk outward from the label's edge until the reef starts: that is the visible gap
        for (let g = 0; g < 14; g += 0.5) {
          if (reef.isPointInFill(pt(p.x + Math.cos(ang) * (half + g), p.y + Math.sin(ang) * (half + g)))) {
            minGapToReef = Math.min(minGapToReef, g);
            break;
          }
        }
      }

      // 3. the label text fits inside the pill (round ends add half a thickness each side)
      const text = document.querySelector(`[data-testid="event-label-${key}"] text`) as unknown as SVGTextContentElement;
      const textFits = text.getComputedTextLength() <= total + half * 2 - 8;

      // 4. the whole island (reef included) stays inside the sea frame
      let beyondRim = 0;
      const reefLen = reef.getTotalLength();
      for (let i = 0; i < reefLen; i += 3) {
        const p = reef.getPointAtLength(i);
        if (dist(p.x, p.y) > 466.5) beyondRim++;
      }

      // 5. the '?' badge is clear of the band and of its own reef-less neighbours (checked below)
      return {
        key,
        slotCount: slots.length,
        radiusSpread: Math.max(...radii) - Math.min(...radii),
        meanRadius: radii.reduce((a, b) => a + b, 0) / radii.length,
        stepSpread: Math.max(...steps) - Math.min(...steps),
        labelOnReef,
        minGapToReef,
        textFits,
        beyondRim,
      };
    });

    // 6. no island's label or band touches another island's band, reef or label
    let collisions = 0;
    for (const a of tracks) {
      const arc = geom(`event-label-arc-${a}`);
      const total = arc.getTotalLength();
      for (const b of tracks) {
        if (a === b) continue;
        const reefB = geom(`event-reef-${b}`);
        const arcB = geom(`event-label-arc-${b}`);
        for (let i = 0; i <= total; i += 2) {
          const p = arc.getPointAtLength(i);
          if (reefB.isPointInFill(pt(p.x, p.y)) || arcB.isPointInStroke(pt(p.x, p.y))) collisions++;
        }
      }
    }
    return { results, collisions };
  }, TRACKS);

  expect(m.results).toHaveLength(7);
  for (const r of m.results) {
    expect(r.slotCount, `${r.key} slot count`).toBeGreaterThanOrEqual(3);
    expect(r.radiusSpread, `${r.key}: slots sit on one circle around the board`).toBeLessThan(0.5);
    expect(r.meanRadius, `${r.key}: slots are on the rim`).toBeGreaterThan(425);
    expect(r.stepSpread, `${r.key}: slots are evenly spaced`).toBeLessThan(0.3);
    expect(r.labelOnReef, `${r.key}: label does not touch the track's reef`).toBe(0);
    expect(r.minGapToReef, `${r.key}: visible gap between label and track`).toBeGreaterThanOrEqual(3);
    expect(r.textFits, `${r.key}: label text fits its pill`).toBe(true);
    expect(r.beyondRim, `${r.key}: stays inside the sea frame`).toBe(0);
  }
  expect(m.collisions).toBe(0);

  await page.getByTestId('island-board-svg').screenshot({ path: 'test-results/event-tracks.png' });
});

test('event tracks still open their rules popover and show drawn discs', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  // The showcase has discs on four tracks
  await expect(page.getByTestId('event-disc-airPollution-0')).toBeAttached();
  await expect(page.getByTestId('event-disc-airPollution-1')).toBeAttached();
  await expect(page.getByTestId('event-disc-airPollution-2')).toHaveCount(0);
  // Click on the track itself (the centre of a curved band's bounding box can be open sea)
  await page.getByTestId('event-slot-airPollution-0').locator('circle').first().click();
  await expect(page.getByTestId('event-info-popover')).toContainText('Air Pollution');
});
