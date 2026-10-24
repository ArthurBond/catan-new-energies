import { describe, expect, it } from 'vitest';
import { HEX_RADIUS, ROAD_LENGTH } from '../theme';
import { CITY_REACH, TOWN_REACH } from '../WoodenPiecesSvg';

describe('pieces meet roads cleanly', () => {
  // A road is centred on its path, which is HEX_RADIUS long, so its end is this far from the node
  const roadInner = (HEX_RADIUS - ROAD_LENGTH) / 2;

  it('a city reaches the road end but does not cover it, in every direction', () => {
    expect(CITY_REACH).toBeLessThanOrEqual(roadInner + 0.1);
    expect(roadInner - CITY_REACH).toBeLessThan(1.5); // and the road is not left floating either
  });

  it('a town (smaller) always leaves a little room', () => {
    expect(TOWN_REACH).toBeLessThan(CITY_REACH);
    expect(TOWN_REACH).toBeLessThan(roadInner);
  });

  it('roads are still long enough to read as roads', () => {
    expect(ROAD_LENGTH).toBeGreaterThanOrEqual(HEX_RADIUS * 0.4);
  });
});
