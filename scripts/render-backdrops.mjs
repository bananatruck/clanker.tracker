/**
 * Render the five acts to PNGs.
 *
 *   node scripts/render-backdrops.mjs
 *
 * The extension draws these to a canvas at runtime; the landing page is a
 * static file with no JavaScript in it, so it needs them as images. Rather
 * than draw the acts a second time in a second place — which is how a site
 * ends up showing a version of a game that no longer exists — this runs the
 * *same* `drawBackdrop` against a shim that writes pixels instead of calling a
 * browser. Node strips the types, so it imports the shipping module directly.
 *
 * Output is build output. Nothing in docs/backdrops/ should ever be edited.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng, hex } from './lib/png.mjs';
import {
  ACTS,
  BACKDROP_H,
  BACKDROP_W,
  drawBackdrop,
} from '../src/lib/game/backdrop.ts';

const OUT = new URL('../docs/backdrops/', import.meta.url);

/** Anything shown at this size wants to be a chunky pixel, not a smooth one. */
const SCALE = 4;

/**
 * The two members of a canvas context that `drawBackdrop` actually uses.
 *
 * Writing straight into an RGBA buffer at `SCALE` blocks per source pixel is
 * the same nearest-neighbour scaling the browser does with
 * `image-rendering: pixelated`, so the PNG and the live canvas are the same
 * picture rather than two renderings of one idea.
 */
function surface(width, height, scale) {
  const px = Buffer.alloc(width * scale * height * scale * 4);
  const ctx = {
    fillStyle: '#000000',
    fillRect(x, y, w, h) {
      const rgb = hex(String(ctx.fillStyle));
      const x0 = Math.round(x * scale);
      const y0 = Math.round(y * scale);
      for (let dy = 0; dy < Math.round(h * scale); dy++) {
        for (let dx = 0; dx < Math.round(w * scale); dx++) {
          const px_ = x0 + dx;
          const py = y0 + dy;
          if (px_ < 0 || py < 0 || px_ >= width * scale || py >= height * scale) continue;
          const i = (py * width * scale + px_) * 4;
          px[i] = rgb[0];
          px[i + 1] = rgb[1];
          px[i + 2] = rgb[2];
          px[i + 3] = 255;
        }
      }
    },
  };
  return { ctx, png: () => encodePng(width * scale, height * scale, px) };
}

mkdirSync(OUT, { recursive: true });

for (const tier of Object.keys(ACTS)) {
  const { ctx, png } = surface(BACKDROP_W, BACKDROP_H, SCALE);
  drawBackdrop(ctx, tier);
  writeFileSync(new URL(`${tier}.png`, OUT), png());
}

console.log(
  `rendered ${Object.keys(ACTS).length} acts to docs/backdrops/ ` +
    `at ${BACKDROP_W * SCALE}x${BACKDROP_H * SCALE}`,
);
