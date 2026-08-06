/**
 * The slicer is the one part of the art pipeline that has to be right without
 * anybody looking at it: it runs against files that are not in this repo, on
 * machines that have different files than mine, and a wrong answer is a
 * character drawn with its neighbour's arm attached.
 *
 * So it is tested against alpha buffers built by hand, where the correct
 * frames are known rather than eyeballed.
 */
import { describe, expect, it } from 'vitest';
import { alphaOf, frameAt, sliceSheet, type Rect } from '@/lib/game/sheet';

/**
 * Build an alpha buffer from ASCII: `#` is ink, `.` is transparent. Reading a
 * fixture as a picture is the whole reason the sprites are authored this way
 * too — a test whose input you can see is a test you can trust.
 */
function alpha(rows: readonly string[]): { data: Uint8ClampedArray; w: number; h: number } {
  const w = rows[0]!.length;
  const h = rows.length;
  const data = new Uint8ClampedArray(w * h);
  rows.forEach((row, y) => [...row].forEach((c, x) => (data[y * w + x] = c === '#' ? 255 : 0)));
  return { data, w, h };
}

const slice = (rows: readonly string[]) => {
  const { data, w, h } = alpha(rows);
  return sliceSheet(data, w, h);
};

describe('sliceSheet', () => {
  it('finds one frame in a sheet holding one thing', () => {
    // Six wide so the run clears the dust threshold.
    const rows = slice([
      '..........',
      '..######..',
      '..######..',
      '..######..',
      '..######..',
      '..........',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual<Rect[]>([{ x: 2, y: 1, w: 6, h: 4 }]);
  });

  it('splits a row into frames on the gutters between them', () => {
    const rows = slice([
      '...................',
      '..#####...######...',
      '..#####...######...',
      '..#####...######...',
      '..#####...######...',
      '...................',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual<Rect[]>([
      { x: 2, y: 1, w: 5, h: 4 },
      { x: 10, y: 1, w: 6, h: 4 },
    ]);
  });

  it('groups frames into rows, top to bottom', () => {
    const rows = slice([
      '..........',
      '..######..',
      '..######..',
      '..######..',
      '..######..',
      '..........',
      '..........',
      '..#####...',
      '..#####...',
      '..#####...',
      '..#####...',
      '..........',
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]!.y).toBe(1);
    expect(rows[1]![0]!.y).toBe(7);
  });

  it('measures each frame to its own bounds, not the row\'s', () => {
    // A tall pose beside a short one. Every frame in a row shares the row's
    // height, which is correct — that is the space the animation occupies —
    // but the widths must not be averaged into a grid.
    const rows = slice([
      '.....................',
      '..####.....########..',
      '..####.....########..',
      '..####.....########..',
      '..####.....########..',
      '.....................',
    ]);
    const widths = rows[0]!.map((f) => f.w);
    expect(widths).toEqual([4, 8]);
  });

  it('ignores dust rather than calling it a frame', () => {
    // A stray pixel of fringe is common on a rip and must not become a frame
    // the animation then cycles through as a blank.
    const rows = slice([
      '....................',
      '..########....#.....',
      '..########..........',
      '..########..........',
      '..########..........',
      '....................',
    ]);
    expect(rows[0]).toHaveLength(1);
  });

  it('returns nothing for an empty sheet', () => {
    expect(slice(['......', '......', '......'])).toEqual([]);
  });

  it('treats a fully opaque image as a single frame', () => {
    // Which is what a backdrop is, and why the loader can use one code path
    // for both kinds of file.
    const rows = slice(['########', '########', '########', '########']);
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toEqual({ x: 0, y: 0, w: 8, h: 4 });
  });
});

describe('frameAt', () => {
  const rows: Rect[][] = [
    [{ x: 0, y: 0, w: 4, h: 4 }, { x: 8, y: 0, w: 4, h: 4 }],
    [{ x: 0, y: 8, w: 6, h: 6 }],
    [{ x: 0, y: 16, w: 9, h: 9 }],
  ];

  it('indexes rows and frames directly', () => {
    expect(frameAt(rows, 1, 0)!.y).toBe(8);
    expect(frameAt(rows, 0, 1)!.x).toBe(8);
  });

  it('counts a negative row from the end', () => {
    // The atlas uses this for battle-scale poses, which sheets put last.
    expect(frameAt(rows, -1, 0)!.y).toBe(16);
  });

  it('clamps rather than throwing when a substituted sheet is smaller', () => {
    // The whole point of the loader is that the user's files are not mine.
    // A wrong-looking frame is a far better failure than a crash in a render
    // loop the user cannot see the stack of.
    expect(frameAt(rows, 99, 99)).toEqual({ x: 0, y: 16, w: 9, h: 9 });
    expect(frameAt(rows, -99, 0)!.y).toBe(0);
  });

  it('returns null when there is nothing to index', () => {
    expect(frameAt([], 0, 0)).toBeNull();
    expect(frameAt([[]], 0, 0)).toBeNull();
  });
});

describe('alphaOf', () => {
  it('reports the failure rather than returning a blank buffer', () => {
    // happy-dom has no 2d context. A silently empty alpha channel would slice
    // to zero frames and look exactly like "no art installed", which would
    // hide a real breakage behind a designed-for fallback.
    const canvas = document.createElement('canvas');
    expect(() => alphaOf(canvas, 4, 4)).toThrow(/2d context/);
  });
});
