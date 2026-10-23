/**
 * Renders the game's hand cursors (open hand = pan the board, closed hand = panning) as crisp PNGs at
 * 1x, 2x, 3x and 4x into public/cursors/, so the browser can pick the sharpest one for the monitor.
 *
 * Why: Windows has no native "grab" cursor, so browsers draw their own small bitmap, which looks
 * pixelated on 4K / high display-scaling screens. Everything else in the game uses native cursors.
 *
 * Run: npm run cursors:build   (needs Chrome, like the e2e tests)
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'cursors');
const SIZES = [1, 2, 3, 4];
const BASE = 32; // CSS pixels

const INK = '#16202b';
const SKIN = '#ffffff';
const LINE = '#8d99a8';

// Each hand is drawn twice: first as a thick dark outline, then as a white fill with thin finger lines
const shapes = {
  grab: `
    <rect x="9" y="14" width="15.6" height="12.4" rx="5.2"/>
    <rect x="9.2" y="8.6" width="3.7" height="10" rx="1.85"/>
    <rect x="13.1" y="5.4" width="3.7" height="13" rx="1.85"/>
    <rect x="17" y="6.4" width="3.7" height="12" rx="1.85"/>
    <rect x="20.9" y="9.6" width="3.7" height="9.6" rx="1.85"/>
    <rect x="3.6" y="15.2" width="10.4" height="4.2" rx="2.1" transform="rotate(38 8.8 17.3)"/>`,
  grabbing: `
    <rect x="8.6" y="15" width="16.4" height="11.4" rx="5"/>
    <rect x="9" y="11.2" width="3.9" height="8.2" rx="1.95"/>
    <rect x="12.9" y="10.2" width="3.9" height="8.6" rx="1.95"/>
    <rect x="16.8" y="10.6" width="3.9" height="8.4" rx="1.95"/>
    <rect x="20.7" y="12" width="3.9" height="7.6" rx="1.95"/>
    <rect x="4.8" y="17.2" width="10" height="4.2" rx="2.1" transform="rotate(20 9.8 19.3)"/>`,
};

const lines = {
  grab: `<path d="M13 13.4 V19 M16.9 12.4 V19 M20.8 14 V19" stroke="${LINE}" stroke-width="0.8" stroke-linecap="round"/>`,
  grabbing: `<path d="M12.9 17.4 V20.6 M16.8 16.4 V20.4 M20.7 17.4 V20.4" stroke="${LINE}" stroke-width="0.8" stroke-linecap="round"/>`,
};

const svgFor = (name, px) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${BASE} ${BASE}">
  <g fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round">${shapes[name]}</g>
  <g fill="${SKIN}" stroke="none">${shapes[name]}</g>
  ${lines[name]}
</svg>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const name of Object.keys(shapes)) {
  for (const scale of SIZES) {
    const px = BASE * scale;
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(`<body style="margin:0;background:transparent">${svgFor(name, px)}</body>`);
    await page.screenshot({ path: join(OUT, `${name}-${scale}x.png`), omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  }
}
await browser.close();
console.log(`wrote ${Object.keys(shapes).length * SIZES.length} cursors to ${OUT}`);
