/**
 * Loading the optional art, and never depending on it.
 *
 * Everything here is allowed to fail. `public/Sprites/` is gitignored, so a
 * fresh clone has none of it, and every caller must still render something.
 * The contract is therefore: ask for a sheet, get a sheet or `null`, and
 * `null` is an ordinary answer rather than an error worth surfacing.
 */
import { sliceSheet, alphaOf, frameAt, type Rect } from './sheet';
import type { ActorArt } from './atlas';

export interface LoadedSheet {
  image: HTMLImageElement;
  /** Frames grouped into animation rows, found from the sheet's own alpha. */
  rows: Rect[][];
}

/**
 * Resolve a path under `public/` to something the current context can fetch.
 *
 * In the extension that is an extension URL. Over the demo server there is no
 * `chrome` at all and the file sits at the same relative path, which is what
 * lets `pnpm shots` photograph the game with the real art in it.
 */
export function assetUrl(file: string): string {
  const runtime = (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } })
    .chrome?.runtime;
  return runtime?.getURL ? runtime.getURL(file) : file;
}

const cache = new Map<string, Promise<LoadedSheet | null>>();

function decode(file: string): Promise<LoadedSheet | null> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      try {
        const alpha = alphaOf(image, image.naturalWidth, image.naturalHeight);
        const rows = sliceSheet(alpha, image.naturalWidth, image.naturalHeight);
        // A sheet with no transparency is a backdrop, not a sprite sheet — it
        // slices to one frame covering the whole image, which is correct.
        resolve(rows.length > 0 ? { image, rows } : null);
      } catch {
        resolve(null);
      }
    };

    // Missing file, wrong format, or a decode the browser gave up on. All the
    // same thing from here: there is no art, so use the pixel sprites.
    image.onerror = () => resolve(null);

    image.src = assetUrl(file);
  });
}

export function loadSheet(file: string): Promise<LoadedSheet | null> {
  let pending = cache.get(file);
  if (!pending) {
    pending = decode(file);
    cache.set(file, pending);
  }
  return pending;
}

/** The frames one actor animates through, in order. Empty when there is no art. */
export function framesFor(sheet: LoadedSheet, art: ActorArt): Rect[] {
  const row = art.row < 0 ? Math.max(0, sheet.rows.length + art.row) : art.row;
  const all = sheet.rows[Math.min(row, sheet.rows.length - 1)] ?? [];

  if (!art.frames) return all;

  const [from, to] = art.frames;
  const picked = all.slice(from, to);
  // A substituted sheet may have a shorter row than the atlas expects. One
  // frame is a still actor, which is a great deal better than none.
  return picked.length > 0 ? picked : [frameAt(sheet.rows, row, 0)].filter((r) => r !== null);
}

/**
 * Whether any art is installed at all.
 *
 * Used to decide between the illustrated battle scene and the pixel-sprite
 * one, so the choice is made once for the whole screen rather than per actor —
 * a scene that mixes the two looks like a bug, not a fallback.
 */
export async function hasArt(files: readonly string[]): Promise<boolean> {
  const sheets = await Promise.all(files.map((f) => loadSheet(f)));
  return sheets.every((s) => s !== null);
}
