import { expect, test } from '@playwright/test';

/**
 * Geometry of the 9 harbors' jetties, measured on the rendered page (in board viewBox units, so the check does not depend
 * on the window size): both jetties of a harbor have the same length, are mirror images about the harbor axis, that axis is the
 * edge's true perpendicular, the jetties end at the badge rim without poking through it, and they start at the coast without
 * lying on any land hex. Every harbor has the same layout.
 */
test('every harbor has two equal, symmetric jetties that run from the coast to the badge rim', async ({ page }) => {
  await page.goto('/?scenario=showcase&bots=0');
  await page.getByTestId('harbor-0').waitFor();

  const result = await page.evaluate(() => {
    type P = { x: number; y: number };
    const root = document.querySelector('[data-testid="island-board-svg"]') as SVGSVGElement;
    const inv = root.getScreenCTM()!.inverse();
    const toBoard = (el: SVGGraphicsElement, x: number, y: number): P => {
      const m = inv.multiply(el.getScreenCTM()!);
      const q = new DOMPoint(x, y).matrixTransform(m);
      return { x: q.x, y: q.y };
    };
    const polyPoints = (el: SVGPolygonElement): P[] =>
      Array.from(el.points).map((pt) => toBoard(el, pt.x, pt.y));

    // The white lattice outlines every land hex (3 units outside the hex itself): the visible shore.
    const lattice = Array.from(document.querySelectorAll('.white-road-lattice polygon')).map((el) =>
      polyPoints(el as SVGPolygonElement)
    );
    const area = (poly: P[]) => poly.reduce((s, p, i) => s + (p.x * poly[(i + 1) % poly.length]!.y - poly[(i + 1) % poly.length]!.x * p.y), 0);
    /** Signed distance to a convex polygon: negative inside, positive outside. */
    const sdPoly = (poly: P[], pt: P) => {
      const orient = Math.sign(area(poly));
      let worst = -Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        // outward normal for the polygon orientation
        const nx = (orient * ey) / Math.hypot(ex, ey);
        const ny = (-orient * ex) / Math.hypot(ex, ey);
        worst = Math.max(worst, (pt.x - a.x) * nx + (pt.y - a.y) * ny);
      }
      return worst;
    };
    const sdLand = (pt: P) => Math.min(...lattice.map((poly) => sdPoly(poly, pt)));

    const out: {
      id: number;
      lengths: number[];
      shoreToBadge: number;
      perpendicularError: number;
      mirrorError: number;
      rimGap: number[];
      cornerOverRim: number;
      landDepth: number;
      shoreGap: number;
      badgeLandClearance: number;
    }[] = [];

    for (let id = 0; id < 9; id++) {
      const harbor = document.querySelector(`[data-testid="harbor-${id}"]`)!;
      const badgeEl = harbor.querySelector('circle:nth-of-type(2)') as SVGCircleElement;
      const c0 = { x: badgeEl.cx.baseVal.value, y: badgeEl.cy.baseVal.value };
      const C = toBoard(badgeEl, c0.x, c0.y);
      const R = Math.hypot(
        toBoard(badgeEl, c0.x + badgeEl.r.baseVal.value, c0.y).x - C.x,
        toBoard(badgeEl, c0.x + badgeEl.r.baseVal.value, c0.y).y - C.y
      );

      const decks = [0, 1].map((i) => polyPoints(document.querySelector(`[data-testid="pier-deck-${id}-${i}"]`) as SVGPolygonElement));
      // corners: shore, shore, rim, rim
      const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const startMid = decks.map((d) => mid(d[0]!, d[1]!));
      const endMid = decks.map((d) => mid(d[2]!, d[3]!));
      const lengths = decks.map((_, i) => Math.hypot(endMid[i]!.x - startMid[i]!.x, endMid[i]!.y - startMid[i]!.y));

      // The harbor axis runs from the middle of the two shore points to the badge centre
      const M = mid(startMid[0]!, startMid[1]!);
      const edgeLen = Math.hypot(startMid[1]!.x - startMid[0]!.x, startMid[1]!.y - startMid[0]!.y);
      const tx = (startMid[1]!.x - startMid[0]!.x) / edgeLen;
      const ty = (startMid[1]!.y - startMid[0]!.y) / edgeLen;
      const ax = C.x - M.x;
      const ay = C.y - M.y;
      const axisLen = Math.hypot(ax, ay);
      const perpendicularError = Math.abs(ax * tx + ay * ty); // 0 when the axis is the edge's perpendicular

      // Mirror the first jetty across the axis and compare with the second
      const ux = ax / axisLen;
      const uy = ay / axisLen;
      const reflect = (p: P): P => {
        const dx = p.x - M.x;
        const dy = p.y - M.y;
        const along = dx * ux + dy * uy;
        return { x: M.x + 2 * along * ux - dx, y: M.y + 2 * along * uy - dy };
      };
      let mirrorError = 0;
      for (const p of decks[0]!) {
        const r = reflect(p);
        mirrorError = Math.max(mirrorError, Math.min(...decks[1]!.map((q) => Math.hypot(q.x - r.x, q.y - r.y))));
      }

      const rimGap = endMid.map((e) => R - Math.hypot(e.x - C.x, e.y - C.y));
      const cornerOverRim = Math.max(...decks.flatMap((d) => [d[2]!, d[3]!]).map((p) => Math.hypot(p.x - C.x, p.y - C.y) - R));

      // Deck outline and centre line sampled finely: how deep does it go into land (positive = overlap)
      let landDepth = -Infinity;
      for (const [di, d] of decks.entries()) {
        const samples: P[] = [];
        for (let k = 0; k < 4; k++) {
          const a = d[k]!;
          const b = d[(k + 1) % 4]!;
          for (let s = 0; s <= 40; s++) samples.push({ x: a.x + ((b.x - a.x) * s) / 40, y: a.y + ((b.y - a.y) * s) / 40 });
        }
        for (let s = 0; s <= 40; s++) {
          samples.push({
            x: startMid[di]!.x + ((endMid[di]!.x - startMid[di]!.x) * s) / 40,
            y: startMid[di]!.y + ((endMid[di]!.y - startMid[di]!.y) * s) / 40,
          });
        }
        for (const p of samples) landDepth = Math.max(landDepth, -sdLand(p));
      }
      // The deck starts at the coast: its shore corners touch the shore line (no gap to the land)
      const shoreGap = Math.max(...decks.flatMap((d) => [d[0]!, d[1]!]).map((p) => sdLand(p)));

      out.push({
        id,
        lengths,
        shoreToBadge: axisLen,
        perpendicularError,
        mirrorError,
        rimGap,
        cornerOverRim,
        landDepth,
        shoreGap,
        badgeLandClearance: sdLand(C) - R,
      });
    }
    return out;
  });

  expect(result).toHaveLength(9);
  const ref = result[0]!;
  for (const h of result) {
    const label = `harbor ${h.id}`;
    // Equal jetties, mirrored about the axis, and the axis is the edge's true perpendicular
    expect(Math.abs(h.lengths[0]! - h.lengths[1]!), `${label} jetty lengths ${h.lengths}`).toBeLessThan(0.05);
    expect(h.mirrorError, `${label} mirror error`).toBeLessThan(0.05);
    expect(h.perpendicularError, `${label} axis is not the edge perpendicular`).toBeLessThan(0.05);
    // Ends on the badge rim: a little inside it (the badge covers the cut end), never poking through
    for (const gap of h.rimGap) {
      expect(gap, `${label} jetty end vs rim`).toBeGreaterThan(0.5);
      expect(gap, `${label} jetty end vs rim`).toBeLessThan(2.5);
    }
    expect(h.cornerOverRim, `${label} jetty corner pokes through the badge`).toBeLessThan(0.05);
    // On the water, starting right at the coast
    expect(h.landDepth, `${label} jetty lies on land`).toBeLessThan(0.05);
    expect(h.shoreGap, `${label} jetty starts away from the coast`).toBeLessThan(0.5);
    expect(h.badgeLandClearance, `${label} badge touches land`).toBeGreaterThan(5);
    // Every harbor looks the same
    expect(Math.abs(h.lengths[0]! - ref.lengths[0]!), `${label} jetty length differs from harbor 0`).toBeLessThan(0.05);
    expect(Math.abs(h.shoreToBadge - ref.shoreToBadge), `${label} badge distance differs from harbor 0`).toBeLessThan(0.05);
  }
});
