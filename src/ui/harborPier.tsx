/**
 * Harbor placement and its two wooden jetties.
 *
 * Every harbor is laid out the same way, in the same (pre ISLAND_TRANSFORM) units as the island:
 *  - the badge sits on the TRUE perpendicular bisector of the harbor edge (so it is symmetric about the edge, whatever the
 *    angle of that edge around the island), HARBOR_BADGE_DISTANCE out from the edge midpoint;
 *  - each jetty is a plank deck that starts on the shore in front of its coastal intersection (so the town / city piece that
 *    can stand there overlooks it) and runs straight at the badge centre, ending just inside the badge rim so the
 *    badge, drawn on top, covers the cut end and the jetty meets it cleanly. The two jetties are mirror images.
 */

import 'preact/compat';

export const HARBOR_BADGE_RADIUS = 20;
export const HARBOR_BADGE_DISTANCE = 44;
/** Half the width of a jetty deck. */
export const PIER_HALF_WIDTH = 3.3;
/**
 * The white road lattice that outlines the land hexes reaches 3 units beyond the hexes. The jetties start on that outer edge,
 * so they begin exactly at the visible shore: no gap to the coast, and nothing drawn on top of land.
 */
export const PIER_SHORE_OFFSET = 3;
/** How far short of the coastal intersection (along the edge) the outer corner of a deck stops, so it never reaches land. */
export const PIER_CORNER_MARGIN = 2.2;
/** How far inside the badge rim a jetty ends (the badge covers it). */
export const PIER_RIM_OVERLAP = 1.2;

type Pt = { x: number; y: number };

export interface HarborPierLayout {
  badge: Pt;
  /** Unit vector from the edge midpoint out to the badge (the edge's perpendicular, pointing away from the island). */
  normal: Pt;
  piers: PierGeometry[];
}

export interface PierGeometry {
  /** Deck corners: shoreline-left, shoreline-right, rim-right, rim-left (a rectangle cut square at the rim, flush at the shore). */
  corners: [Pt, Pt, Pt, Pt];
  /** Centre line from the shore line (in front of the coastal intersection) to the cut end at the badge rim. */
  from: Pt;
  to: Pt;
  dir: Pt;
  length: number;
}

export function harborPierLayout(p1: Pt, p2: Pt, center: Pt): HarborPierLayout {
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const ex = p2.x - p1.x;
  const ey = p2.y - p1.y;
  const el = Math.hypot(ex, ey) || 1;
  // True perpendicular of the edge, flipped to point away from the board centre.
  let nx = -ey / el;
  let ny = ex / el;
  if (nx * (mid.x - center.x) + ny * (mid.y - center.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const badge = { x: mid.x + nx * HARBOR_BADGE_DISTANCE, y: mid.y + ny * HARBOR_BADGE_DISTANCE };

  const tx = ex / el;
  const ty = ey / el;
  const endR = HARBOR_BADGE_RADIUS - PIER_RIM_OVERLAP;

  const piers = ([-1, 1] as const).map((side): PierGeometry => {
    // Work in the edge frame: t along the edge from its midpoint, n out from the edge. The deck's shore end sits on the line
    // n = PIER_SHORE_OFFSET, with its outer corner PIER_CORNER_MARGIN short of the coastal intersection (past that, the next
    // coastal edge turns the shore back in and the line would run over land). Its direction depends on where it starts, and the
    // corner offset on its direction, so settle that by iterating (it converges in a couple of steps).
    const shoreStart = (a: number): Pt => ({
      x: mid.x + side * a * tx + nx * PIER_SHORE_OFFSET,
      y: mid.y + side * a * ty + ny * PIER_SHORE_OFFSET,
    });
    let along = el / 2 - PIER_CORNER_MARGIN - PIER_HALF_WIDTH;
    let dir = { x: 0, y: 0 };
    for (let i = 0; i < 8; i++) {
      const start = shoreStart(along);
      const dl = Math.hypot(badge.x - start.x, badge.y - start.y) || 1;
      dir = { x: (badge.x - start.x) / dl, y: (badge.y - start.y) / dl };
      const ndir = nx * dir.x + ny * dir.y;
      along = el / 2 - PIER_CORNER_MARGIN - PIER_HALF_WIDTH / ndir;
    }
    const from = shoreStart(along);
    const q = { x: -dir.y, y: dir.x };
    const ndir = nx * dir.x + ny * dir.y;
    const nq = nx * q.x + ny * q.y;
    const to = { x: badge.x - dir.x * endR, y: badge.y - dir.y * endR };
    // Slide each long side along the deck until it meets the shore line, so the start is cut flush with the coast.
    const corner = (k: 1 | -1): Pt => {
      const lambda = (-k * PIER_HALF_WIDTH * nq) / ndir;
      return { x: from.x + k * PIER_HALF_WIDTH * q.x + lambda * dir.x, y: from.y + k * PIER_HALF_WIDTH * q.y + lambda * dir.y };
    };
    const rimCorner = (k: 1 | -1): Pt => ({ x: to.x + k * PIER_HALF_WIDTH * q.x, y: to.y + k * PIER_HALF_WIDTH * q.y });
    return {
      corners: [corner(1), corner(-1), rimCorner(-1), rimCorner(1)],
      from,
      to,
      dir,
      length: Math.hypot(to.x - from.x, to.y - from.y),
    };
  });

  return { badge, normal: { x: nx, y: ny }, piers };
}

const f = (n: number) => n.toFixed(2);
const poly = (pts: Pt[]) => pts.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');

const PLANK_SPACING = 4.4;
const POST_FRACTIONS = [0.34, 0.8];

/** One plank jetty: soft water shadow, foam, deck with plank seams and rails, and two mooring posts. */
export function HarborPier({ harborId, index, pier }: { harborId: number; index: number; pier: PierGeometry }) {
  const { corners, from, dir } = pier;
  const q = { x: -dir.y, y: dir.x };
  const [a, , , d] = corners;
  const seams: number[] = [];
  for (let s = PLANK_SPACING; s < pier.length - 2; s += PLANK_SPACING) seams.push(s);
  const at = (t: number, side: number): Pt => ({
    x: from.x + dir.x * t + q.x * side * PIER_HALF_WIDTH,
    y: from.y + dir.y * t + q.y * side * PIER_HALF_WIDTH,
  });

  return (
    <g data-testid={`pier-${harborId}-${index}`} pointerEvents="none">
      {/* Soft water shadow and a ripple of foam along the deck */}
      <polygon points={poly(corners)} transform="translate(1.4 2.4)" fill="rgba(8, 56, 104, 0.3)" stroke="rgba(8, 56, 104, 0.3)" strokeWidth={2.4} strokeLinejoin="round" />
      <polygon points={poly(corners)} fill="none" stroke="rgba(236, 250, 255, 0.55)" strokeWidth={3.6} strokeLinejoin="round" />

      {/* Plank deck */}
      <polygon data-testid={`pier-deck-${harborId}-${index}`} points={poly(corners)} fill="#d8c398" stroke="#6f5a3a" strokeWidth={0.9} strokeLinejoin="round" />
      {seams.map((s) => {
        const l = at(s, -1);
        const r = at(s, 1);
        return <line key={s} x1={f(l.x)} y1={f(l.y)} x2={f(r.x)} y2={f(r.y)} stroke="#9a8157" strokeWidth={0.7} />;
      })}
      {/* Lit top edge of the deck */}
      <line x1={f(a.x)} y1={f(a.y)} x2={f(d.x)} y2={f(d.y)} stroke="rgba(255, 246, 220, 0.7)" strokeWidth={0.8} />

      {/* Mooring posts on both rails */}
      {POST_FRACTIONS.flatMap((t) =>
        [-1, 1].map((side) => {
          const p = at(t * pier.length, side * 1.12);
          return (
            <g key={`${t}-${side}`}>
              <ellipse cx={f(p.x + 0.5)} cy={f(p.y + 1)} rx={2.1} ry={1.7} fill="rgba(8, 56, 104, 0.35)" />
              <ellipse cx={f(p.x)} cy={f(p.y)} rx={1.7} ry={1.7} fill="#5a4630" stroke="#2f2416" strokeWidth={0.5} />
              <ellipse cx={f(p.x - 0.35)} cy={f(p.y - 0.4)} rx={0.6} ry={0.5} fill="#b79a69" />
            </g>
          );
        })
      )}
    </g>
  );
}
