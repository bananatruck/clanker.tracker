/**
 * What art is installed, and what the game is drawing instead.
 *
 *   pnpm art
 *
 * The game runs with `public/Sprites/` completely empty — every actor falls
 * back to a sprite in lib/game/sprites.ts and every backdrop is painted by
 * lib/game/backdrop.ts. That is the supported configuration, not a broken one,
 * which is exactly why this exists: when nothing errors either way, the only
 * way to know whether a sheet you dropped in is actually being *used* is to
 * ask. A filename with a space in the wrong place fails silently and forever.
 *
 * It reads the real manifest rather than a copy of it. `atlas.ts` has one
 * import and it is type-only, so Node's type stripping runs it as-is — a
 * second list of filenames in this file would be a second list to forget to
 * update.
 *
 * Never fails the build. Missing art is a preference, not an error.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTORS, BACKDROPS, ENCOUNTERS } from '../src/lib/game/atlas.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');

const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;

/** Every part the game can draw, with the file it would rather use. */
const parts = [
  ...Object.entries(ACTORS).map(([name, art]) => ({
    group: 'cast',
    name,
    file: art.file,
    instead: `sprite “${art.fallback}”`,
  })),
  ...ENCOUNTERS.map((art, i) => ({
    group: 'encounters',
    name: `tier ${i + 1}`,
    file: art.file,
    instead: `sprite “${art.fallback}”`,
  })),
  ...Object.entries(BACKDROPS).map(([tier, file]) => ({
    group: 'backdrops',
    name: tier,
    file,
    instead: 'the drawn act',
  })),
];

let installed = 0;
let group = '';

console.log(`\n${BOLD('clanker.tracker — art')}\n`);

for (const part of parts) {
  if (part.group !== group) {
    group = part.group;
    console.log(DIM(`  ${group}`));
  }

  const here = existsSync(join(PUBLIC, part.file));
  if (here) installed++;

  console.log(
    here
      ? `    ${GREEN('●')} ${part.name.padEnd(16)} ${DIM(part.file)}`
      : `    ${DIM('○')} ${part.name.padEnd(16)} ${DIM(part.instead)}`,
  );
}

const drawn = parts.length - installed;
console.log(
  `\n  ${installed}/${parts.length} from files, ${drawn} drawn in code.\n` +
    (installed === 0
      ? DIM('  Nothing installed, and nothing is wrong. This is what a fresh clone looks like.\n')
      : drawn === 0
        ? DIM('  Every part is coming from a file.\n')
        : DIM('  Filenames must match exactly, spaces included. See docs/ASSETS.md.\n')),
);
