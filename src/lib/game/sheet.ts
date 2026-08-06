/**
 * Cutting a sprite sheet into frames, at runtime, from the sheet itself.
 *
 * Rips do not come with metadata. The usual answer is to measure every frame
 * by hand and paste a table of rectangles into the source, which then silently
 * describes the wrong image the moment anyone swaps a file — and swapping
 * files is the entire point of docs/ASSETS.md.
 *
 * So the frames are found rather than declared. Sheets from this era are laid
 * out on transparency with a gutter between every frame, which means a row of
 * fully-transparent pixels is a row boundary and a column of them is a frame
 * boundary. Two projections and no configuration.
 *
 * This runs once per sheet and the result is cached, so the cost is a single
 * pass over an image the browser has already decoded.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Alpha at or below this counts as empty. Rips often have 1-2 of fringe. */
const EMPTY_ALPHA = 8;

/** Runs shorter than this are dust — a stray pixel, not a frame. */
const MIN_SIZE = 4;

/** Contiguous runs of `true` in a boolean array, as [start, end) pairs. */
function runs(flags: readonly boolean[], min = MIN_SIZE): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start: number | null = null;

  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i]!;
    if (on && start === null) start = i;
    else if (!on && start !== null) {
      if (i - start >= min) out.push([start, i]);
      start = null;
    }
  }
  return out;
}

/**
 * Every frame in the sheet, grouped into rows, top to bottom then left to
 * right — which is the order sheets are authored in, so row 0 is the first
 * animation and its frame 0 is that animation's first pose.
 */
export function sliceSheet(alpha: Uint8ClampedArray, width: number, height: number): Rect[][] {
  const opaque = (x: number, y: number) => alpha[y * width + x]! > EMPTY_ALPHA;

  const rowHasInk: boolean[] = [];
  for (let y = 0; y < height; y++) {
    let ink = false;
    for (let x = 0; x < width && !ink; x++) ink = opaque(x, y);
    rowHasInk.push(ink);
  }

  return runs(rowHasInk).map(([y0, y1]) => {
    const colHasInk: boolean[] = [];
    for (let x = 0; x < width; x++) {
      let ink = false;
      for (let y = y0; y < y1 && !ink; y++) ink = opaque(x, y);
      colHasInk.push(ink);
    }
    return runs(colHasInk).map(([x0, x1]) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
  });
}

/**
 * Pull the alpha channel out of an already-decoded image.
 *
 * Separated from `sliceSheet` so the slicing itself is pure and can be tested
 * against a hand-built buffer without a canvas anywhere near it.
 */
export function alphaOf(source: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');

  ctx.drawImage(source, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);

  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  return alpha;
}

/**
 * Index into a sliced sheet, tolerantly.
 *
 * A negative row counts from the end — the large battle-scale poses are
 * conventionally last on these sheets — and both indices clamp, because a
 * sheet the user substituted may simply have fewer rows than the one the
 * atlas was written against. A wrong-looking frame is a much better failure
 * than a crash inside a render loop.
 */
export function frameAt(rows: readonly Rect[][], row: number, frame: number): Rect | null {
  if (rows.length === 0) return null;

  const r = rows[row < 0 ? Math.max(0, rows.length + row) : Math.min(row, rows.length - 1)]!;
  if (r.length === 0) return null;

  return r[Math.min(Math.max(0, frame), r.length - 1)]!;
}
