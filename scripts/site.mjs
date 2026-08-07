/**
 * Assemble the landing page into `.output/site`.
 *
 *   pnpm site         # build it
 *   pnpm site --serve # build it and open a local server on :8732
 *
 * The page itself is one HTML file and one stylesheet with no build step, so
 * "assemble" means copy `site/`, copy generated images out of `docs/`, and put
 * installed `public/Sprites/` files in front of their generated fallbacks when
 * they exist. This is the same asset policy as the extension itself.
 *
 * The deploy workflow runs this and publishes the result. Nothing in CI knows
 * anything this script does not, which is the point: if the page is broken in
 * production it is broken here too, and you can see it in ten seconds.
 */
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.output/site');
const PORT = 8732;

/** Where the page's images come from, and what it calls them. */
const ASSETS = [
  ['docs/demo', 'assets/demo'],
  ['docs/backdrops', 'assets/backdrops'],
  ['docs/sprites', 'assets/sprites'],
];

const missing = ASSETS.map(([from]) => from).filter((from) => !existsSync(join(ROOT, from)));
if (missing.length > 0) {
  throw new Error(
    `Nothing to publish — ${missing.join(', ')} not generated.\n` +
      'Run: pnpm build && pnpm shots && pnpm backdrops && pnpm sprites',
  );
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

cpSync(join(ROOT, 'site'), OUT, { recursive: true });
for (const [from, to] of ASSETS) {
  cpSync(join(ROOT, from), join(OUT, to), { recursive: true });
}

/**
 * Landing-page art follows the runtime seam as well. A public/ file wins in
 * this working copy; a clean clone and the public CI build use the checked-in
 * procedural equivalent. No HTML path changes between those configurations.
 */
const uiArt = [
  ['GoldCirclet.png', 'khlaude.png', 'crest.png'],
  ['GalScroll.png', 'khlaude.png', 'parse.png'],
  ['Astraeas_Abacus.png', 'tower.png', 'scan.png'],
  ['Magic_Key.png', 'pawn.png', 'fill.png'],
  ['BottleLetters.png', 'house.png', 'write.png'],
  ['AdventurersMap1.png', 'rubble.png', 'track.png'],
  ['GoldCirclet.png', 'datacentre.png', 'crusade.png'],
];

const uiOut = join(OUT, 'assets/ui');
mkdirSync(uiOut, { recursive: true });
for (const [installed, fallback, name] of uiArt) {
  const publicFile = join(ROOT, 'public/Sprites/items', installed);
  const fallbackFile = join(ROOT, 'docs/sprites/icons', fallback);
  cpSync(existsSync(publicFile) ? publicFile : fallbackFile, join(uiOut, name));
}

const publicBackdrops = {
  squire: 'backdrop-meadow.png',
  'knight-errant': 'backdrop-river.png',
  warlord: 'backdrop-dust.png',
  devastator: 'backdrop-waste.png',
  ascendant: 'backdrop-hall.png',
};
for (const [tier, file] of Object.entries(publicBackdrops)) {
  const publicFile = join(ROOT, 'public/Sprites', file);
  if (existsSync(publicFile)) cpSync(publicFile, join(OUT, 'assets/backdrops', `${tier}.png`));
}

/**
 * GitHub Pages runs everything through Jekyll unless told not to, and Jekyll
 * silently drops files and directories beginning with an underscore. Nothing
 * here starts with one today; the marker means nothing ever has to remember.
 */
writeFileSync(join(OUT, '.nojekyll'), '');

const bytes = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (sum, e) =>
      sum + (e.isDirectory() ? bytes(join(dir, e.name)) : statSync(join(dir, e.name)).size),
    0,
  );

console.log(`built .output/site  ${(bytes(OUT) / 1024 / 1024).toFixed(2)} MB`);

/* ------------------------------------------------------------------ serve */

if (process.argv.includes('--serve')) {
  const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };

  createServer((req, res) => {
    let path = join(OUT, decodeURIComponent(req.url.split('?')[0]));
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!path.startsWith(OUT) || !existsSync(path)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  }).listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
