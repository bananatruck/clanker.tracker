/**
 * The five acts, drawn rather than shipped.
 *
 * The Crusade screen needs a floor, and the floor is the only place the story
 * is ever told: applying at Squire happens in a green meadow, and by Warlord
 * the same screen is the dust of a town already taken. Nothing narrates that.
 * The ground just keeps changing under it.
 *
 * ## Why this is code and not five PNGs
 *
 * The same argument as lib/game/sprites.ts, and one more. Licensing is settled
 * by construction — this is original work, MIT alongside the code, with no
 * provenance to audit. It stays legible, because a diff of a horizon is a diff
 * of a number. And it costs about five kilobytes instead of ten megabytes,
 * which matters for a repo people are meant to be able to clone and run: a
 * fresh checkout renders the whole game with nothing downloaded and nothing
 * configured. Installing real art on top is an upgrade, never a prerequisite.
 *
 * ## How it is drawn
 *
 * At 192×120 and scaled up with smoothing off, so the result is honestly
 * chunky rather than a smooth gradient pretending to be pixel art. Everything
 * is deterministic: the same act draws the same scene every time, because a
 * backdrop that reshuffles on every render is a backdrop nobody can screenshot
 * and nobody stops noticing.
 */
import type { Tier } from './economy';

export const BACKDROP_W = 192;
export const BACKDROP_H = 120;

/** Where the sky stops. Everything above is weather, below is ground. */
export const HORIZON = 62;

/**
 * A small deterministic PRNG.
 *
 * `Math.random` would mean a different world on every re-render, which reads
 * as a glitch rather than as variety. Mulberry32 is thirty characters and has
 * a long enough period for a hundred and twenty rows of scenery.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A silhouette profile: one y per column.
 *
 * Control points every `step` pixels, linearly interpolated between. Sampling
 * noise per column instead would give a jagged fringe that reads as static;
 * hills need to be smooth at the scale of a hill and chunky at the scale of a
 * pixel, which is what interpolating a coarse grid does.
 */
export function ridgeProfile(
  rand: () => number,
  width: number,
  base: number,
  amplitude: number,
  step = 24,
): number[] {
  const points: number[] = [];
  for (let x = 0; x <= width + step; x += step) points.push(base - rand() * amplitude);

  const profile: number[] = [];
  for (let x = 0; x < width; x++) {
    const i = Math.floor(x / step);
    const t = (x % step) / step;
    const a = points[i] ?? base;
    const b = points[i + 1] ?? a;
    profile.push(Math.round(a + (b - a) * t));
  }
  return profile;
}

/* ------------------------------------------------------------------- acts */

export interface Act {
  /** Sky or ceiling, top band first. The last one meets the horizon. */
  sky: readonly string[];
  /** Far silhouette, and the nearer one in front of it. */
  ridgeFar: string;
  ridgeNear: string;
  /** Ground, far band first. */
  ground: readonly string[];
  /** Flecks scattered over the ground — grass, gravel, ash. */
  fleck: string;
  /**
   * What things are built of in this act.
   *
   * Its own three tones rather than a reuse of the ridge colours: a hut drawn
   * in the ridge's brown standing on a ridge of that brown is a hut nobody can
   * see. Scenery has to contrast with what it is standing on, which means it
   * needs its own ramp.
   */
  structure: { wall: string; dark: string; light: string };
  /** What is standing on this ground. */
  motif: 'huts' | 'river' | 'ruins' | 'waste' | 'hall';
  /** The one colour this act is allowed that the others are not. */
  accent: string;
  /** Seed, so each act is a different world and always the same one. */
  seed: number;
}

/**
 * The progression, in five floors.
 *
 * Read the `sky` column downward and the story is in it: blue, then a longer
 * blue, then ochre, then no colour at all, then a room with a lamp in it. The
 * saturation drains out of the middle three acts on purpose — by Devastator
 * you have flattened enough that the world has stopped having weather.
 */
export const ACTS: Record<Tier, Act> = {
  squire: {
    sky: ['#5aa3dd', '#78bce8', '#a6d6f0', '#cfe9f5'],
    ridgeFar: '#4a7a52',
    ridgeNear: '#3d6b45',
    ground: ['#5ca046', '#4e8f3b', '#437f33'],
    fleck: '#6bb551',
    structure: { wall: '#c08a52', dark: '#553416', light: '#e0b98a' },
    motif: 'huts',
    accent: '#e6584f',
    seed: 1,
  },

  'knight-errant': {
    sky: ['#3f6cae', '#5d8fc9', '#8fb6dd', '#c3d8e8'],
    ridgeFar: '#3c5f5c',
    ridgeNear: '#31504b',
    ground: ['#4b8442', '#417338', '#38652f'],
    fleck: '#598f4a',
    structure: { wall: '#b58048', dark: '#4a2f14', light: '#d8ad78' },
    motif: 'river',
    accent: '#4a7fc1',
    seed: 7,
  },

  warlord: {
    sky: ['#9a5f33', '#c08048', '#dba765', '#e8c78d'],
    ridgeFar: '#4a3423',
    ridgeNear: '#3a281a',
    ground: ['#a8834f', '#957043', '#7d5c36'],
    fleck: '#6d4f2e',
    structure: { wall: '#6b4a2c', dark: '#33210f', light: '#8f6a44' },
    motif: 'ruins',
    accent: '#e6584f',
    seed: 13,
  },

  devastator: {
    sky: ['#4b4d55', '#63656d', '#7d7f86', '#9a9ba1'],
    ridgeFar: '#2b2c31',
    ridgeNear: '#212226',
    ground: ['#54555d', '#48494f', '#3c3d42'],
    fleck: '#63646b',
    structure: { wall: '#33343a', dark: '#1b1c20', light: '#4d4e55' },
    motif: 'waste',
    accent: '#e6584f',
    seed: 23,
  },

  ascendant: {
    sky: ['#3d2a19', '#523620', '#6a4728', '#835830'],
    ridgeFar: '#8a5f38', 
    ridgeNear: '#6d4a2b',
    ground: ['#a9784a', '#94663e', '#7d5533'],
    fleck: '#bd8d5a',
    structure: { wall: '#a87b4a', dark: '#4a3018', light: '#d6ab74' },
    motif: 'hall',
    accent: '#ffc233',
    seed: 31,
  },
};

/**
 * The safe box for scenery.
 *
 * The backdrop is drawn at one aspect and shown at several — a 404×320 battle
 * panel, a 1100×460 page, a 404×420 title card — and it is scaled with
 * `cover`, so the difference comes off the edges. The squarest frame is the
 * worst case: it shows only the middle 115 source pixels. Anything that has to
 * survive every frame lives inside this box. The sky, the ridges and the
 * ground are full-bleed and do not care.
 */
export const SAFE = { x: 40, y: 24, right: 152, bottom: 96 } as const;

/* --------------------------------------------------------------- motifs */

/**
 * Scenery, as pixel data.
 *
 * Same format as lib/game/sprites.ts — one character per pixel, `.` for
 * transparent — because a hut is a sprite and there is no reason to have two
 * notations for the same thing. The letters are looked up per act, so a ruin
 * in the warlord's dust and a ruin on the devastator's ash are the same shape
 * in different materials.
 */
const HUT: readonly string[] = [
  '...rrr...',
  '..rrrrr..',
  '.rrrrrrr.',
  'rrrrrrrrr',
  '.wwwwwww.',
  '.wwdddww.',
  '.wwdddww.',
  '.wwwwwww.',
];

const RUIN: readonly string[] = [
  'ww....ww.',
  'ww.ww.ww.',
  'ww.ww.ww.',
  'wwdwwdww.',
  'wwwwwwww.',
  'wwddwwdd.',
];

const STUMP: readonly string[] = [
  '.dd.',
  'dwwd',
  'dwwd',
  '.dd.',
];

const PILLAR: readonly string[] = [
  'lwwwwl',
  '.wwww.',
  '.wddw.',
  '.wwww.',
  '.wddw.',
  '.wwww.',
  'lwwwwl',
];

const BANNER: readonly string[] = [
  'd.',
  'aa',
  'aa',
  'aa',
  'a.',
];

/* -------------------------------------------------------------- rendering */

/**
 * The slice of a canvas context this actually uses.
 *
 * Narrowed to two members so the drawing can be exercised in a test with a
 * four-line recorder rather than a headless canvas implementation — the thing
 * worth asserting is which rectangles get filled in what order, and a real
 * `CanvasRenderingContext2D` makes that harder to see, not easier.
 */
type Ctx = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
};

function stamp(
  ctx: Ctx,
  art: readonly string[],
  colors: Record<string, string>,
  x: number,
  y: number,
  scale = 1,
): void {
  art.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const color = colors[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x + dx * scale, y + dy * scale, scale, scale);
    });
  });
}

/**
 * Paint one act.
 *
 * Back to front, the way a painter would: sky, far ridge, near ridge, ground
 * bands, scatter, then whatever is standing on it. Depth comes from that order
 * and from nothing else — there is no z-buffer and no alpha, just later things
 * covering earlier ones.
 */
export function drawBackdrop(ctx: Ctx, tier: Tier): void {
  const act = ACTS[tier];
  const rand = mulberry32(act.seed);

  /* sky, in bands that get lighter toward the horizon */
  const band = Math.ceil(HORIZON / act.sky.length);
  act.sky.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * band, BACKDROP_W, band);
  });

  // Dither the band seams. Two rows of the colour above, scattered, is enough
  // to stop four flat rectangles reading as four flat rectangles.
  for (let i = 1; i < act.sky.length; i++) {
    ctx.fillStyle = act.sky[i - 1]!;
    for (let x = 0; x < BACKDROP_W; x += 2) {
      if (rand() > 0.45) ctx.fillRect(x, i * band, 2, 1);
      if (rand() > 0.75) ctx.fillRect(x, i * band + 1, 2, 1);
    }
  }

  if (tier === 'ascendant') {
    // The one act with a roof over it: a lit window, high on the far wall,
    // which is the only source of light in the room you have been let into.
    ctx.fillStyle = act.accent;
    ctx.fillRect(BACKDROP_W / 2 - 14, 12, 28, 26);
    ctx.fillStyle = '#fff2c4';
    ctx.fillRect(BACKDROP_W / 2 - 10, 16, 20, 18);
  } else {
    /* clouds, only where there is still weather */
    if (tier === 'squire' || tier === 'knight-errant') {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) {
        const cx = Math.floor(rand() * BACKDROP_W);
        const cy = 6 + Math.floor(rand() * 22);
        const cw = 12 + Math.floor(rand() * 18);
        ctx.fillRect(cx, cy, cw, 3);
        ctx.fillRect(cx + 3, cy - 2, cw - 8, 2);
      }
    }

    /* two ridges, the far one higher and flatter */
    const far = ridgeProfile(rand, BACKDROP_W, HORIZON - 8, 12, 32);
    ctx.fillStyle = act.ridgeFar;
    far.forEach((y, x) => ctx.fillRect(x, y, 1, HORIZON - y));

    const near = ridgeProfile(rand, BACKDROP_W, HORIZON - 2, 7, 20);
    ctx.fillStyle = act.ridgeNear;
    near.forEach((y, x) => ctx.fillRect(x, y, 1, HORIZON - y));
  }

  /* ground, in three bands that get darker toward the viewer */
  const depth = BACKDROP_H - HORIZON;
  act.ground.forEach((color, i) => {
    ctx.fillStyle = color;
    // Bands are not equal: the nearest one is the biggest, which is what
    // perspective does and what stops the floor looking like a bar chart.
    const top = HORIZON + Math.round((depth * (i * i)) / (act.ground.length * act.ground.length));
    ctx.fillRect(0, top, BACKDROP_W, BACKDROP_H - top);
  });

  /* flecks, denser toward the viewer */
  ctx.fillStyle = act.fleck;
  for (let i = 0; i < 260; i++) {
    const y = HORIZON + Math.floor(rand() ** 0.6 * depth);
    ctx.fillRect(Math.floor(rand() * BACKDROP_W), y, 1 + Math.floor(rand() * 2), 1);
  }

  drawMotif(ctx, act, rand);
}

/**
 * Where the scenery stands.
 *
 * Separated from the drawing so the placements are a value a test can read,
 * rather than a side effect it has to infer from a list of filled rectangles.
 * That distinction earns its keep: whether a hut is inside the crop-safe box
 * is a fact about this table, and checking it by sniffing draw calls means
 * also sifting out three hundred texture flecks that are meant to run off the
 * edge.
 */
export interface Stamp {
  art: readonly string[];
  x: number;
  y: number;
  scale: number;
}

export function motifStamps(act: Act): Stamp[] {
  const at = (art: readonly string[], x: number, y: number, scale = 1): Stamp => ({
    art,
    x,
    y,
    scale,
  });

  switch (act.motif) {
    case 'huts':
      // A village, still standing. Bases on the horizon line so it sits on the
      // ground rather than hovering over the ridge behind it.
      return [
        at(HUT, 44, HORIZON - 1 - HUT.length),
        at(HUT, 66, HORIZON + 3 - HUT.length),
        at(HUT, 112, HORIZON + 1 - HUT.length),
        at(HUT, 134, HORIZON - 2 - HUT.length),
      ];

    case 'river':
      return [
        at(HUT, 44, HORIZON - 3 - HUT.length),
        at(HUT, 132, HORIZON - 1 - HUT.length),
      ];

    case 'ruins':
      // What is left of the village from act one.
      return [
        at(RUIN, 44, HORIZON + 1 - RUIN.length),
        at(RUIN, 126, HORIZON - 2 - RUIN.length),
        at(STUMP, 62, HORIZON + 8),
        at(STUMP, 118, HORIZON + 12),
      ];

    case 'waste':
      // Nothing standing. Stumps, rubble, and one ember that has not gone out.
      return [
        at(STUMP, 48, HORIZON + 2),
        at(STUMP, 74, HORIZON + 14),
        at(STUMP, 116, HORIZON + 6),
        at(STUMP, 140, HORIZON + 20),
      ];

    case 'hall':
      // Indoors at last. The only act with straight lines in it.
      return [
        ...[42, 64, 106, 128].map((x) => at(PILLAR, x, HORIZON - PILLAR.length * 3, 3)),
        at(BANNER, BACKDROP_W / 2 - 3, 44, 3),
      ];
  }
}

function drawMotif(ctx: Ctx, act: Act, rand: () => number): void {
  const colors: Record<string, string> = {
    w: act.structure.wall,
    r: act.accent,
    d: act.structure.dark,
    a: act.accent,
    l: act.structure.light,
  };

  // The parts that are not stamps: a river that has to run the full width, the
  // smoke off two wrecks, and the scatter of an act with nothing left on it.
  if (act.motif === 'river') {
    const bank = ridgeProfile(rand, BACKDROP_W, HORIZON + 16, 5, 40);
    bank.forEach((y, x) => {
      const width = 7 + Math.round((x / BACKDROP_W) * 6);
      ctx.fillStyle = act.accent;
      ctx.fillRect(x, y, 1, width);
      // A highlight on the near lip, so it reads as water and not as a road.
      ctx.fillStyle = '#a8d0ee';
      if ((x + Math.floor(y)) % 7 === 0) ctx.fillRect(x, y + width - 1, 1, 1);
    });
  }

  if (act.motif === 'ruins') {
    // Smoke, still going up off both wrecks. Thinning as it climbs, because a
    // column of even width reads as a pole.
    ctx.fillStyle = act.structure.dark;
    for (const sx of [49, 131]) {
      for (let y = HORIZON - RUIN.length; y > 26; y -= 2) {
        const drift = Math.round(Math.sin(y / 7) * 4);
        ctx.fillRect(sx + drift, y, y > 40 ? 2 : 1, 2);
      }
    }
  }

  if (act.motif === 'waste') {
    ctx.fillStyle = act.ridgeNear;
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(
        Math.floor(rand() * BACKDROP_W),
        HORIZON + Math.floor(rand() * (BACKDROP_H - HORIZON)),
        2,
        1,
      );
    }
    // The one ember that has not gone out.
    ctx.fillStyle = act.accent;
    ctx.fillRect(96, 78, 2, 2);
  }

  if (act.motif === 'hall') {
    ctx.fillStyle = act.ridgeNear;
    for (let y = HORIZON + 6; y < BACKDROP_H; y += 8) {
      ctx.fillRect(0, y, BACKDROP_W, 1);
    }
  }

  for (const s of motifStamps(act)) stamp(ctx, s.art, colors, s.x, s.y, s.scale);
}
