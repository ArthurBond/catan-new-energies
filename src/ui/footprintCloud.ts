/**
 * The footprint cloud glyph. The global footprint widget (its -1 / +1 clouds) and the marker on the global
 * footprint track share it, so players read all of them as "footprint".
 * Drawn around the origin: about 20.6 wide and 11 tall, with its middle at FOOTPRINT_CLOUD_CENTRE.
 */
export const FOOTPRINT_CLOUD_PATH_D =
  'M -8 4 C -11 4, -12 1.5, -11 -1 C -11 -3.5, -8 -5, -5.5 -4.5 C -4 -7.5, 1 -8, 3.5 -5 C 6.5 -5.5, 9 -3, 8.5 0 C 10 1.5, 9 4, 6.5 4 Z';

/** The middle of the glyph's bounding box, for centring it on something */
export const FOOTPRINT_CLOUD_CENTRE = { x: -1.1, y: -1.5 } as const;
