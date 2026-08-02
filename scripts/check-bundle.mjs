/**
 * Post-build guard: would Chrome actually load this?
 *
 * `pnpm build` succeeding proves the bundler was happy, which is not the same
 * thing. This checks the two ways we have shipped an unloadable extension:
 *
 *   1. A Unicode non-character anywhere in a script. Chrome's
 *      `base::IsStringUTF8` rejects U+FFFE, U+FFFF and U+FDD0-U+FDEF, and
 *      reports it as "isn't UTF-8 encoded" — which sends you looking at the
 *      encoding, where `file` and `iconv` both say the file is fine. Dexie's
 *      max-key sentinel is one of these, and it reaches the content script
 *      through the repository layer.
 *
 *   2. A manifest entry pointing at a file that was never emitted.
 *
 * Both produce a dialog at "Load unpacked" rather than a build failure, so
 * they belong in CI and not in a human's memory.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT = '.output/chrome-mv3';
const problems = [];

if (!existsSync(OUT)) {
  console.error(`no build at ${OUT} — run \`pnpm build\` first`);
  process.exit(1);
}

/* ------------------------------------------------ 1. encoding */

const isNoncharacter = (cp) => (cp & 0xfffe) === 0xfffe || (cp >= 0xfdd0 && cp <= 0xfdef);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const TEXT = /\.(js|mjs|css|html|json)$/;

for (const file of walk(OUT)) {
  if (!TEXT.test(file)) continue;

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    problems.push(`${relative(OUT, file)}: unreadable as UTF-8`);
    continue;
  }

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (isNoncharacter(cp) || (cp >= 0xd800 && cp <= 0xdfff)) {
      problems.push(
        `${relative(OUT, file)}: contains U+${cp.toString(16).toUpperCase().padStart(4, '0')}, ` +
          `which Chrome rejects as "isn't UTF-8 encoded"`,
      );
      break;
    }
  }
}

/* ------------------------------------------------ 2. manifest */

const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));

const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts ?? []).flatMap((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...Object.values(manifest.icons ?? {}),
].filter(Boolean);

for (const path of referenced) {
  if (!existsSync(join(OUT, path))) problems.push(`manifest references missing file: ${path}`);
}

/* ------------------------------------------------ report */

if (problems.length > 0) {
  console.error(`✗ ${problems.length} problem(s) that would stop Chrome loading this:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.info(`✓ bundle is loadable: ${referenced.length} manifest references resolve, no rejected code points`);
