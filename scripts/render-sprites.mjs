/**
 * Render the sprite data to PNGs for the README.
 *
 * Reads `src/lib/game/sprites.ts` directly — Node strips the types — so the
 * images can never drift from what the extension actually draws. Editing a
 * sprite and re-running this is the whole workflow; the PNGs are build output
 * and nothing should ever be touched by hand.
 *
 *   node scripts/render-sprites.mjs
 *
 * PNG is encoded here rather than pulled from a dependency. It is eighty lines
 * for a format we need one corner of, and it keeps a devDependency out of a
 * repo whose whole pitch is that it does not phone anywhere.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng, hex } from './lib/png.mjs';
import { PALETTE, SPRITES, SPRITE_SIZE } from '../src/lib/game/sprites.ts';

const OUT = new URL('../docs/sprites/', import.meta.url);

/* -------------------------------------------------------------- rendering */

const FIELD = hex('#050a24');
const FRAME = hex('#ffffff');

/** A pixel canvas with nearest-neighbour scaling, which is the only kind allowed. */
function canvas(width, height, fill) {
  const px = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    px[i * 4] = fill[0];
    px[i * 4 + 1] = fill[1];
    px[i * 4 + 2] = fill[2];
    px[i * 4 + 3] = 255;
  }
  return {
    width,
    height,
    px,
    set(x, y, rgb, alpha = 255) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = (y * width + x) * 4;
      px[i] = rgb[0];
      px[i + 1] = rgb[1];
      px[i + 2] = rgb[2];
      px[i + 3] = alpha;
    },
    /** Draw a sprite at logical (ox, oy), each pixel a scale x scale block. */
    sprite(id, ox, oy, scale) {
      const def = SPRITES[id];
      if (!def) throw new Error(`no sprite "${id}"`);
      for (let y = 0; y < SPRITE_SIZE; y++) {
        for (let x = 0; x < SPRITE_SIZE; x++) {
          const colour = PALETTE[def.rows[y][x]];
          if (!colour) continue;
          const rgb = hex(colour);
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              this.set((ox + x) * scale + dx, (oy + y) * scale + dy, rgb);
            }
          }
        }
      }
    },
    frame(scale) {
      for (let x = 0; x < width; x++) {
        for (let t = 0; t < scale; t++) {
          this.set(x, t, FRAME);
          this.set(x, height - 1 - t, FRAME);
        }
      }
      for (let y = 0; y < height; y++) {
        for (let t = 0; t < scale; t++) {
          this.set(t, y, FRAME);
          this.set(width - 1 - t, y, FRAME);
        }
      }
    },
    png() {
      return encodePng(width, height, px);
    },
  };
}

/** One sprite, framed like a command window. */
function portrait(id, scale = 4, pad = 2) {
  const size = (SPRITE_SIZE + pad * 2) * scale;
  const c = canvas(size, size, FIELD);
  c.sprite(id, pad, pad, scale);
  c.frame(Math.max(1, Math.round(scale / 3)));
  return c.png();
}

/**
 * One sprite on transparency, unframed.
 *
 * The framed portraits are for the README, where they sit on a dark page and
 * the frame is what separates them from it. The landing page puts them in
 * parchment inventory slots, where a navy square with a white border around it
 * reads as a bug rather than as an item.
 */
function icon(id, scale = 2) {
  const size = SPRITE_SIZE * scale;
  const c = canvas(size, size, [0, 0, 0]);
  // Reset to fully transparent: `canvas` fills opaque by design, which is
  // right for every other caller.
  c.px.fill(0);
  c.sprite(id, 0, 0, scale);
  return c.png();
}

/** A row of sprites in one framed strip. */
function strip(ids, scale = 4, pad = 1) {
  const width = (SPRITE_SIZE * ids.length + pad * 2) * scale;
  const height = (SPRITE_SIZE + pad * 2) * scale;
  const c = canvas(width, height, FIELD);
  ids.forEach((id, i) => c.sprite(id, pad + i * SPRITE_SIZE, pad, scale));
  c.frame(Math.max(1, Math.round(scale / 3)));
  return c.png();
}

/* ------------------------------------------------------------------- main */

mkdirSync(OUT, { recursive: true });
mkdirSync(new URL('icons/', OUT), { recursive: true });

for (const id of Object.keys(SPRITES)) {
  writeFileSync(new URL(`${id}.png`, OUT), portrait(id));
  writeFileSync(new URL(`icons/${id}.png`, OUT), icon(id));
}

// The march, as the Crusade tab draws it: ground already taken, the warband,
// then what is still standing, with the Tower that never gets closer.
writeFileSync(
  new URL('march.png', OUT),
  strip(['datacentre', 'rubble', 'rubble', 'khlaude-sponsored', 'house', 'house', 'tower']),
);

// The cast, in the order the story introduces them.
writeFileSync(
  new URL('cast.png', OUT),
  strip(['khlaude', 'pawn', 'child', 'chudlord', 'pigking', 'citadel']),
);

console.log(`rendered ${Object.keys(SPRITES).length + 2} images to docs/sprites/`);
