/**
 * The acts.
 *
 * Drawing cannot be asserted — there is no test for whether a meadow looks
 * like a meadow. What *can* be asserted is everything that makes the drawing
 * trustworthy: that it is deterministic, that it covers every pixel it claims
 * to, that every act is defined and none of them shares a palette entry it
 * should not, and that nothing lands outside the box that survives cropping.
 *
 * The last one is the reason this file exists. Scenery drifting outside the
 * safe box does not fail anywhere — it just quietly disappears off the side of
 * the title card, on one screen, at one aspect ratio, and nobody notices until
 * a screenshot goes in a README.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTS,
  BACKDROP_H,
  BACKDROP_W,
  HORIZON,
  SAFE,
  drawBackdrop,
  motifStamps,
  mulberry32,
  ridgeProfile,
} from '@/lib/game/backdrop';
import { TIERS, type Tier } from '@/lib/game/economy';

/** Records what was filled, so the draw can be inspected without a canvas. */
function recorder() {
  const rects: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, color: String(ctx.fillStyle) });
    },
  };
  return { ctx, rects };
}

const ALL: Tier[] = TIERS.map((t) => t.tier);

describe('mulberry32', () => {
  it('gives the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('gives different sequences for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('stays in [0, 1)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const n = rand();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('ridgeProfile', () => {
  it('returns one height per column', () => {
    expect(ridgeProfile(mulberry32(1), 192, 60, 10)).toHaveLength(192);
  });

  it('stays within the amplitude below the base', () => {
    const profile = ridgeProfile(mulberry32(3), 192, 60, 10);
    for (const y of profile) {
      expect(y).toBeLessThanOrEqual(60);
      expect(y).toBeGreaterThanOrEqual(50);
    }
  });

  /**
   * The whole reason for interpolating a coarse grid instead of sampling noise
   * per column: a fringe that jumps several pixels between neighbours reads as
   * static, not as a hill.
   */
  it('is smooth between columns', () => {
    const profile = ridgeProfile(mulberry32(9), 192, 60, 12, 24);
    for (let x = 1; x < profile.length; x++) {
      expect(Math.abs(profile[x]! - profile[x - 1]!)).toBeLessThanOrEqual(2);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(ridgeProfile(mulberry32(5), 64, 60, 10)).toEqual(
      ridgeProfile(mulberry32(5), 64, 60, 10),
    );
  });
});

describe('the act table', () => {
  it('defines every tier', () => {
    expect(Object.keys(ACTS).sort()).toEqual([...ALL].sort());
  });

  it('is all valid hex', () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const tier of ALL) {
      const act = ACTS[tier];
      for (const color of [
        ...act.sky,
        ...act.ground,
        act.ridgeFar,
        act.ridgeNear,
        act.fleck,
        act.accent,
        act.structure.wall,
        act.structure.dark,
        act.structure.light,
      ]) {
        expect(color, `${tier}: ${color}`).toMatch(hex);
      }
    }
  });

  it('gives every act its own seed, so no two are the same world', () => {
    const seeds = ALL.map((t) => ACTS[t].seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  /**
   * Scenery has to contrast with what it is standing on. A hut drawn in the
   * ridge's own colour is a hut nobody can see, which is exactly the bug this
   * table was restructured to fix.
   */
  it('never builds scenery out of the ridge it stands on', () => {
    for (const tier of ALL) {
      const act = ACTS[tier];
      expect(act.structure.wall, tier).not.toBe(act.ridgeFar);
      expect(act.structure.wall, tier).not.toBe(act.ridgeNear);
    }
  });
});

describe('drawBackdrop', () => {
  it('draws every act without throwing', () => {
    for (const tier of ALL) {
      const { ctx, rects } = recorder();
      drawBackdrop(ctx, tier);
      expect(rects.length, tier).toBeGreaterThan(100);
    }
  });

  it('is deterministic', () => {
    const a = recorder();
    const b = recorder();
    drawBackdrop(a.ctx, 'warlord');
    drawBackdrop(b.ctx, 'warlord');
    expect(a.rects).toEqual(b.rects);
  });

  it('covers the full frame, so nothing shows through', () => {
    for (const tier of ALL) {
      const { ctx, rects } = recorder();
      drawBackdrop(ctx, tier);

      // The sky bands and the ground bands between them must span the frame.
      const spans = rects.filter((r) => r.w === BACKDROP_W);
      const top = Math.min(...spans.map((r) => r.y));
      const bottom = Math.max(...spans.map((r) => r.y + r.h));
      expect(top, tier).toBe(0);
      expect(bottom, tier).toBeGreaterThanOrEqual(BACKDROP_H);
    }
  });

  it('keeps the horizon where the scene expects it', () => {
    // Actors are positioned against this constant from the other side.
    expect(HORIZON).toBeGreaterThan(BACKDROP_H / 3);
    expect(HORIZON).toBeLessThan(BACKDROP_H * 0.75);
  });

  /**
   * The safe box.
   *
   * The backdrop is shown at several aspect ratios and scaled with `cover`, so
   * the squarest frame — the title card — sees only the middle slice. Anything
   * narrower than full-bleed has to live inside it or it silently vanishes on
   * one screen and not the others.
   */
  it('keeps scenery inside the crop-safe box', () => {
    for (const tier of ALL) {
      for (const s of motifStamps(ACTS[tier])) {
        const width = Math.max(...s.art.map((row) => row.length)) * s.scale;
        expect(s.x, `${tier} at x=${s.x}`).toBeGreaterThanOrEqual(SAFE.x);
        expect(s.x + width, `${tier} to x=${s.x + width}`).toBeLessThanOrEqual(SAFE.right);
      }
    }
  });

  it('stands its scenery on the ground, not in the sky', () => {
    for (const tier of ALL) {
      for (const s of motifStamps(ACTS[tier])) {
        const base = s.y + s.art.length * s.scale;
        // Feet at or below the horizon, and never below the frame.
        expect(base, `${tier} base`).toBeGreaterThanOrEqual(HORIZON - 4);
        expect(base, `${tier} base`).toBeLessThanOrEqual(BACKDROP_H);
      }
    }
  });

  it('gives every act something standing on it', () => {
    for (const tier of ALL) {
      expect(motifStamps(ACTS[tier]).length, tier).toBeGreaterThan(0);
    }
  });
});
