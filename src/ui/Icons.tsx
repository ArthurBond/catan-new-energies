/**
 * CATAN: New Energies — small interface icons (24px grid, stroke style)
 */

import 'preact/compat';

type IconName =
  | 'undo'
  | 'pause'
  | 'play'
  | 'sliders'
  | 'newGame'
  | 'board'
  | 'trade'
  | 'close'
  | 'hidden'
  | 'cards'
  | 'leaf'
  | 'factory'
  | 'cloud';

const PATHS: Record<IconName, string> = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15l12-7.5z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  newGame: 'M12 3 4 7.5v9L12 21l8-4.5v-9zM12 9v6M9 12h6',
  board: 'M3 7h18v10H3zM7 7V4h10v3M7 17v3M17 17v3',
  trade: 'M4 8h13l-3.5-3.5M20 16H7l3.5 3.5',
  close: 'M6 6l12 12M18 6 6 18',
  hidden: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-3 4.2M6.6 6.6A12.4 12.4 0 0 0 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  cards: 'M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 8h6',
  leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7',
  factory: 'M3 20V10l5 3V10l5 3V6h3l1 6h4v8zM7 17h2M12 17h2',
  cloud: 'M7 18a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1.5A4.5 4.5 0 0 1 17 18z',
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  title,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  title?: string;
}) {
  const filled = name === 'play';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Brand mark: a sea-blue hex tile with an energy bolt. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-16 -16 32 32" aria-hidden="true">
      <polygon
        points="0,-15 13,-7.5 13,7.5 0,15 -13,7.5 -13,-7.5"
        fill="#1f78c1"
        stroke="#fffdf7"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <polygon points="0,-11.5 10,-5.75 10,5.75 0,11.5 -10,5.75 -10,-5.75" fill="#2f9a53" opacity={0.35} />
      <polygon
        points="-1.5,-9 5,-9 1,-1.5 5.5,-1.5 -4,10 -1,1.5 -5,1.5"
        fill="#ffc83a"
        stroke="#3d2c00"
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}
