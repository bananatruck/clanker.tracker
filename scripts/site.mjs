/**
 * Assemble the landing page into `.output/site`.
 *
 *   pnpm site         # build it
 *   pnpm site --serve # build it and open a local server on :8732
 *
 * The page itself is one HTML file and one stylesheet with no build step, so
 * "assemble" means exactly one thing: copy `site/` and then copy the images it
 * points at out of `docs/`. Those images are already generated from the real
 * app — the screenshots by `pnpm shots`, the acts by `pnpm backdrops`, the
 * sprites by `pnpm sprites` — so the site cannot show a version of the product
 * that does not exist.
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
