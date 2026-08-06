/**
 * Sprites, authored as pixel data rather than shipped as image files.
 *
 * Two reasons this is data and not a spritesheet:
 *
 *   1. **Licensing is settled by construction.** These are original work,
 *      MIT alongside the code, with no third-party provenance to audit and
 *      nothing to justify to store review. The CC0 packs named in
 *      docs/ASSETS.md can replace any of these later — the manifest below is
 *      the seam for exactly that — but nothing is blocked waiting for art.
 *   2. **It stays legible.** A 16x16 sprite is 16 lines of text in a diff.
 *      Recolouring a faction or fixing a stray pixel is an edit, not a
 *      round-trip through an image editor and a binary blob in git.
 *
 * Format: one character per pixel, indexed into PALETTE. `.` is transparent.
 * Every sprite is 16x16 so the renderer never has to ask.
 */

export const SPRITE_SIZE = 16;

/**
 * The shared palette.
 *
 * Deliberately small and deliberately shared: units drawn from one palette
 * read as one world, which is most of what makes a 16-bit game look coherent
 * rather than assembled.
 */
export const PALETTE: Record<string, string | null> = {
  '.': null, // transparent
  o: '#0b1020', // outline — everything is outlined, nothing floats
  w: '#ffffff',
  s: '#f0c088', // skin
  S: '#c08050', // skin, shaded
  m: '#b8c4e0', // armour, lit
  M: '#6b78b8', // armour, shadowed
  b: '#1d2d86', // cloth blue
  B: '#0e1a5c', // cloth blue, dark
  y: '#ffcf3f', // gold — plumes, crowns, the things that matter
  Y: '#c9a022',
  r: '#a02c2c', // banner red
  g: '#3f8f3f', // grass
  n: '#8a5a2b', // wood
  N: '#5a3a1b',
  k: '#4a5068', // stone, shadowed
  K: '#8a92ac', // stone, lit
  e: '#ff8c1a', // the Pig King, who is orange
  E: '#c05f00',
  d: '#2a2f3a', // data centre chassis
  D: '#454b5c',
  c: '#6ede6e', // status LED, nominal
};

export interface SpriteDef {
  id: string;
  /** What this is, for the manifest and for anyone replacing it. */
  label: string;
  rows: readonly string[];
}

/**
 * Sir Khums Alaude. A knight of no particular distinction.
 *
 * Gold plume, blue surcoat, and from tier Devastator a sponsor logo appears on
 * the chest — storyboard panel 402. That variant is `khlaude-sponsored`.
 */
const KHLAUDE: readonly string[] = [
  '.......oo.......',
  '......oyyo......',
  '.....ooyyoo.....',
  '....ommmmmmo....',
  '....omsssssmo...',
  '....omsooosmo...',
  '.....osssso.....',
  '....obbmmbbo....',
  '...obbbmmbbbo...',
  '..oybbbmmbbbyo..',
  '...obbbmmbbbo...',
  '....obbbbbbo....',
  '.....oBB.BBo....',
  '.....oBo.oBo....',
  '....ooo...ooo...',
  '................',
];

const KHLAUDE_SPONSORED: readonly string[] = [
  '.......oo.......',
  '......oyyo......',
  '.....ooyyoo.....',
  '....ommmmmmo....',
  '....omsssssmo...',
  '....omsooosmo...',
  '.....osssso.....',
  '....obbmmbbo....',
  '...obbbmmbbbo...',
  '..oybbrrrbbbyo..',
  '...obbrwrbbbo...',
  '....obrrrbbo....',
  '.....oBB.BBo....',
  '.....oBo.oBo....',
  '....ooo...ooo...',
  '................',
];

/**
 * Poo R. PeePole. Unarmed, and the storyboard is clear that they do not fight
 * back — so there is no attack frame for this sprite and there should not be.
 */
const PAWN: readonly string[] = [
  '................',
  '......oooo......',
  '.....onnnno.....',
  '....ossssso.....',
  '....osososo.....',
  '.....ossso......',
  '......oo........',
  '....oNNNNNo.....',
  '...oNNNNNNNo....',
  '...oNNNNNNNo....',
  '....oNNNNNo.....',
  '.....oN.No......',
  '.....oN.No......',
  '....oo...oo.....',
  '................',
  '................',
];

/** The Chilled Rens. The same figure, smaller — drawn short, not scaled down. */
const CHILD: readonly string[] = [
  '................',
  '................',
  '................',
  '......oooo......',
  '.....onnnno.....',
  '....ossssso.....',
  '....osososo.....',
  '.....ossso......',
  '....oNNNNNo.....',
  '...oNNNNNNo.....',
  '....oNNNNNo.....',
  '.....oN.No......',
  '....oo...oo.....',
  '................',
  '................',
  '................',
];

/**
 * The Chud Lord of Unemployment. Cast as the arch-villain; was the last line
 * of defence. Drawn dark and armoured, but standing square and unarmed —
 * cast.md is explicit that the wave, not an attack, is his important frame.
 */
const CHUDLORD: readonly string[] = [
  '.....oooooo.....',
  '....oMMMMMMo....',
  '...oMMMMMMMMo...',
  '...oMoMMMMoMo...',
  '...oMMMMMMMMo...',
  '....oMooooMo....',
  '.....oMMMMo.....',
  '...oMMMMMMMMo...',
  '..oMMMMMMMMMMo..',
  '..oMMoMMMMoMMo..',
  '..oMMMMMMMMMMo..',
  '...oMMMMMMMMo...',
  '....oMMo.oMMo...',
  '....oMo...oMo...',
  '...ooo.....ooo..',
  '................',
];

/** The same figure, waving. The single most important frame in the game. */
const CHUDLORD_WAVE: readonly string[] = [
  '.....oooooo..o..',
  '....oMMMMMMoMo..',
  '...oMMMMMMMMMo..',
  '...oMoMMMMoMMo..',
  '...oMMMMMMMMo...',
  '....oMooooMo....',
  '.....oMMMMo.....',
  '...oMMMMMMMo....',
  '..oMMMMMMMMMo...',
  '..oMMoMMMMoMo...',
  '..oMMMMMMMMMo...',
  '...oMMMMMMMo....',
  '....oMMo.oMMo...',
  '....oMo...oMo...',
  '...ooo.....ooo..',
  '................',
];

/** The Glorious Beautiful Orange Capitalist Pig King. Fat. Orange. Crowned. */
const PIGKING: readonly string[] = [
  '...o.o.o.o.o....',
  '...oyyyyyyyo....',
  '...oyoyoyoyo....',
  '..oeeeeeeeeeo...',
  '..oeoeeeeoeeo...',
  '..oeeeEEEeeeo...',
  '..oeeoEEEoeeo...',
  '...oeeeeeeeo....',
  '.oeeeeeeeeeeeo..',
  'oeeeeeeeeeeeeeo.',
  'oeeeeeeeeeeeeeo.',
  'oeeeeeeeeeeeeeo.',
  '.oEeeeeeeeeeEo..',
  '..oEEo...oEEo...',
  '...ooo...ooo....',
  '................',
];

/**
 * The Tower. King Net And Yahoo's seat, always on the horizon and never
 * closer. One window lit, because he never comes down.
 */
const TOWER: readonly string[] = [
  '...oKoKoKoKo....',
  '...oKKKKKKKo....',
  '...oKkkkkkKo....',
  '...oKkyyykKo....',
  '...oKkyyykKo....',
  '...oKkkkkkKo....',
  '...oKKKKKKKo....',
  '...oKkKkKkKo....',
  '...oKKKKKKKo....',
  '..oKKKKKKKKKo...',
  '..oKkKkKkKkKo...',
  '..oKKKKKKKKKo...',
  '.oKKKKKKKKKKKo..',
  '.oKkKkKkKkKkKo..',
  '.oKKKKKKKKKKKo..',
  'ooooooooooooooo.',
];

/** A family home. Razed from tier 1 onward — two per application. */
const HOUSE: readonly string[] = [
  '................',
  '................',
  '.......o........',
  '......oro.......',
  '.....orrro......',
  '....orrrrro.....',
  '...orrrrrrro....',
  '..orrrrrrrrro...',
  '..onnnnnnnnno...',
  '..onnoyyonnno...',
  '..onnoyyonnno...',
  '..onnnnnnnnno...',
  '..onnnnnnnnno...',
  '..ooooooooooo...',
  '..ggggggggggg...',
  '................',
];

/** A home already taken. What the march leaves behind it. */
const RUBBLE: readonly string[] = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '......o.........',
  '.....oNo...o....',
  '...o.oNo..oNo...',
  '..oNooNNooNNo...',
  '..oNNNNNNNNNo...',
  '..onnnnnnnnno...',
  '..ooooooooooo...',
  '..ggggggggggg...',
  '................',
  '................',
];

/**
 * A New Data Centre. Replaces cleared ground from tier Devastator, cooled by
 * the river you dried. The LEDs are nominal. They are always nominal.
 */
const DATACENTRE: readonly string[] = [
  '................',
  '..ooooooooooo...',
  '..oDDDDDDDDDo...',
  '..odddddddddo...',
  '..odcdodcdodo...',
  '..odddddddddo...',
  '..odcdodcdodo...',
  '..odddddddddo...',
  '..odcdodcdodo...',
  '..odddddddddo...',
  '..odcdodcdodo...',
  '..odddddddddo...',
  '..oDDDDDDDDDo...',
  '..ooooooooooo...',
  '..kkkkkkkkkkk...',
  '................',
];

/** The Citadel. Reachable at level 60, and not takeable without an offer. */
const CITADEL: readonly string[] = [
  '.oKoKo...oKoKo..',
  '.oKKKo...oKKKo..',
  '.oKkKo...oKkKo..',
  '.oKKKooooKKKKo..',
  '.oKKKKKKKKKKKo..',
  '.oKkkKKKKKkkKo..',
  '.oKKKKKKKKKKKo..',
  'oKKKKKyyyKKKKKo.',
  'oKKKKKyyyKKKKKo.',
  'oKkKKKyyyKKKkKo.',
  'oKKKKKKKKKKKKKo.',
  'oKkKKKKKKKKKkKo.',
  'oKKKKKKKKKKKKKo.',
  'oKKKKKKKKKKKKKo.',
  'ooooooooooooooo.',
  '................',
];

export const SPRITES: Record<string, SpriteDef> = {
  khlaude: { id: 'khlaude', label: 'Sir Khums Alaude', rows: KHLAUDE },
  'khlaude-sponsored': {
    id: 'khlaude-sponsored',
    label: 'Kh. Laude, sponsored',
    rows: KHLAUDE_SPONSORED,
  },
  pawn: { id: 'pawn', label: 'Poo R. PeePole', rows: PAWN },
  child: { id: 'child', label: 'A Chilled Ren', rows: CHILD },
  chudlord: { id: 'chudlord', label: 'The Chud Lord of Unemployment', rows: CHUDLORD },
  'chudlord-wave': { id: 'chudlord-wave', label: 'The Chud Lord, waving', rows: CHUDLORD_WAVE },
  pigking: {
    id: 'pigking',
    label: 'The Glorious Beautiful Orange Capitalist Pig King',
    rows: PIGKING,
  },
  tower: { id: 'tower', label: 'The Tower', rows: TOWER },
  house: { id: 'house', label: 'A family home', rows: HOUSE },
  rubble: { id: 'rubble', label: 'Rubble', rows: RUBBLE },
  datacentre: { id: 'datacentre', label: 'A New Data Centre', rows: DATACENTRE },
  citadel: { id: 'citadel', label: 'The Citadel', rows: CITADEL },
};

/** Every pixel of a sprite as a colour, row-major, null where transparent. */
export function spritePixels(id: string): Array<string | null> {
  const def = SPRITES[id];
  if (!def) return [];

  const out: Array<string | null> = [];
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const row = def.rows[y] ?? '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      out.push(PALETTE[row[x] ?? '.'] ?? null);
    }
  }
  return out;
}

/**
 * Render a sprite as text. Used by the tests to assert the data is well-formed
 * without a canvas, and genuinely useful for eyeballing an edit in a terminal.
 */
export function spriteToAscii(id: string, on = '#', off = ' '): string {
  const def = SPRITES[id];
  if (!def) return '';
  return def.rows.map((row) => [...row].map((c) => (c === '.' ? off : on)).join('')).join('\n');
}
