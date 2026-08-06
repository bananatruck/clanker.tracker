/**
 * Which art file plays which part.
 *
 * This is a *mapping*, not art. No third-party bytes live in this repo — see
 * docs/ASSETS.md. Drop sheets into `public/Sprites/` and the game uses them;
 * leave it empty and every actor falls back to the original pixel sprites in
 * lib/game/sprites.ts, which ship with the code and always work.
 *
 * Frames are found by scanning the sheet's own transparency (lib/game/sheet),
 * so an entry names a *row* and a span of frames within it rather than a table
 * of pixel rectangles that would rot the moment a file changed.
 */
import type { Tier } from './economy';

export interface ActorArt {
  /** Path under `public/`, exactly as it sits on disk. */
  file: string;
  /**
   * Which animation row. Negative counts from the end — battle-scale poses are
   * conventionally the last row on a rip, where the frames are largest.
   */
  row: number;
  /** Half-open span of frames within that row. Omit for the whole row. */
  frames?: [number, number];
  /** Frames per second. Overworld walks read at 6-8; idle breathing at 3-5. */
  fps: number;
  /** Rendered height in CSS pixels. Width follows the frame's aspect ratio. */
  height: number;
  /** Built-in sprite drawn when the file is not installed. */
  fallback: string;
  /** Sheets are drawn facing the viewer; flip when the part needs the reverse. */
  flip?: boolean;
}

/**
 * The cast.
 *
 * `khlaude` has two entries because the two scenes need different poses: the
 * overworld sees him from the front, and the battle sees him from behind,
 * which is the shot the whole Dragon Quest battle screen is built around.
 */
export const ACTORS: Record<string, ActorArt> = {
  'khlaude-walk': {
    file: 'Sprites/Hero_Roto.png',
    row: 2,
    frames: [0, 4],
    fps: 6,
    height: 64,
    fallback: 'khlaude',
  },
  'khlaude-battle': {
    file: 'Sprites/Hero_Roto.png',
    row: -1,
    fps: 5,
    height: 168,
    fallback: 'khlaude',
  },

  /**
   * The Chud Lord of Unemployment: a skeletal knight with a sword and a shield,
   * because cast.md says he was the last line of defence and not a monster.
   */
  chudlord: {
    file: 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Enemies & Bosses - Deadnaut.png',
    row: 0,
    fps: 5,
    height: 150,
    fallback: 'chudlord',
  },

  /** The Pig King is a crowned bag of money, which required no interpretation. */
  pigking: {
    file: 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Enemies & Bosses - Goodybag.png',
    row: 0,
    fps: 4,
    height: 150,
    fallback: 'pigking',
  },
};

/**
 * The encounter you get, by how hard the posting is.
 *
 * Difficulty is the count of required gaps in the scan — the postings that
 * actually filter you — so the monster in front of you is a picture of the
 * evidence table and not a random draw.
 */
export const ENCOUNTERS: readonly ActorArt[] = [
  {
    file: 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Enemies & Bosses - Healslime.png',
    row: 0,
    fps: 6,
    height: 96,
    fallback: 'pawn',
  },
  {
    file: 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Enemies & Bosses - Grimlin.png',
    row: 0,
    fps: 6,
    height: 118,
    fallback: 'child',
  },
  {
    file: 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Enemies & Bosses - Dark Skeleton.png',
    row: 0,
    fps: 5,
    height: 138,
    fallback: 'chudlord',
  },
  {
    file: 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Enemies & Bosses - Stone Golem.png',
    row: 0,
    fps: 4,
    height: 178,
    fallback: 'tower',
  },
  {
    file: 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Enemies & Bosses - Dread Dragon.png',
    row: 0,
    fps: 5,
    height: 196,
    fallback: 'chudlord',
  },
];

/** How many required gaps it takes to summon each of the above. */
const ENCOUNTER_THRESHOLDS = [0, 1, 3, 5, 8] as const;

export function encounterFor(requiredGaps: number): ActorArt {
  let pick = 0;
  for (let i = 0; i < ENCOUNTER_THRESHOLDS.length; i++) {
    if (requiredGaps >= ENCOUNTER_THRESHOLDS[i]!) pick = i;
  }
  return ENCOUNTERS[pick]!;
}

/**
 * The ground you are standing on, by act.
 *
 * The progression is the story: a green meadow, then the river valley, then
 * the dust of a town already taken, then a plain gone the colour of nothing,
 * then a lit room you have finally been let into. Nothing about the crusade
 * is stated in words here — the floor just keeps changing under it.
 */
export const BACKDROPS: Record<Tier, string> = {
  squire: 'Sprites/T_UI_EventSS_DQ1_17.png',
  'knight-errant': 'Sprites/T_UI_EventSS_DQ1_11.png',
  warlord: 'Sprites/T_UI_EventSS_DQ1_12.png',
  devastator: 'Sprites/T_UI_EventSS_DQ1_04.png',
  ascendant: 'Sprites/T_UI_EventSS_DQ1_06.png',
};

/** Tint over each backdrop, so the command window stays readable on all five. */
export const BACKDROP_SHADE: Record<Tier, string> = {
  squire: 'rgba(5, 10, 36, 0.30)',
  'knight-errant': 'rgba(5, 10, 36, 0.32)',
  warlord: 'rgba(5, 10, 36, 0.42)',
  devastator: 'rgba(5, 10, 36, 0.38)',
  ascendant: 'rgba(5, 10, 36, 0.46)',
};
