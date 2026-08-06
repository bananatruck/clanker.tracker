/**
 * Clankerdom Deliverance — the narrative beats.
 *
 * **Transcribed from `storyboard/storyboard.md`, not written here.** Every
 * string below is the author's on-screen copy, character for character. The
 * storyboard is canonical: where this file and the storyboard disagree, the
 * storyboard wins and this file is the bug.
 *
 * Adding a beat means adding it to the storyboard first.
 */
import type { Tier } from './economy';

export interface Beat {
  /** Panel number from the storyboard. */
  id: number;
  /** What fires it. Level beats carry the level; the rest are named events. */
  trigger: { kind: 'firstRun' } | { kind: 'level'; level: number } | { kind: 'offer' } | { kind: 'newGamePlus' };
  /** Panel description — what the scene shows. */
  panel: string;
  /** Sprites the panel needs, per storyboard/cast.md. */
  sprites: readonly string[];
  /** Exact on-screen copy. Never paraphrase, never "improve". */
  copy: string;
}

/** Act 0 — The Proclamation (first launch). */
export const ACT_0: readonly Beat[] = [
  {
    id: 0,
    trigger: { kind: 'firstRun' },
    panel: 'The Tower fills frame. One window lit.',
    sprites: ['tower'],
    copy: 'CLANKERDOM DELIVERANCE. By order of KING NET AND YAHOO, from the Tower.',
  },
  {
    id: 1,
    trigger: { kind: 'firstRun' },
    panel: 'Scroll unfurls',
    sprites: ['scroll'],
    copy: 'Be it known: a disgusting, evil, multi-billion-strong dynasty besets us. The family of POO R. PEEPOLE. Their brood, the CHILLED RENS. They are everywhere. They are multiplying. They are the reason you have no job.',
  },
  {
    id: 2,
    trigger: { kind: 'firstRun' },
    panel: 'Kh. Laude, back to camera, facing out',
    sprites: ['khlaude'],
    copy: 'You are SIR KHUMS ALAUDE. You have excellent handwriting and no dental coverage. The commission comes with a stipend.',
  },
  {
    id: 3,
    trigger: { kind: 'firstRun' },
    panel: 'Warband forms, marches right',
    sprites: ['khlaude', 'companions'],
    copy: 'Ride for Clankerdom.',
  },
];

/** Acts I-V, triggered by level. */
export const ACTS: readonly Beat[] = [
  // Act I — Squire (L1-9) · triumphant
  {
    id: 100,
    trigger: { kind: 'level', level: 1 },
    panel: 'Hamlet burning, banners high',
    sprites: ['homes', 'khlaude'],
    copy: 'The hamlet burns. Kh. Laude rides for Clankerdom. The dynasty trembles.',
  },
  {
    id: 101,
    trigger: { kind: 'level', level: 3 },
    panel: 'Dispatch from the Tower',
    sprites: ['tower', 'scroll'],
    copy: 'The King is pleased. The King has not come down.',
  },
  {
    id: 102,
    trigger: { kind: 'level', level: 5 },
    panel: 'Fields cleared, first survey stakes',
    sprites: ['terrain', 'stakes'],
    copy: 'Ground cleared. Surveyors arrive by dusk.',
  },
  {
    id: 103,
    trigger: { kind: 'level', level: 9 },
    panel: 'Second hamlet, faster, easier',
    sprites: ['homes'],
    copy: 'It gets easier. That is the first thing nobody warns you about.',
  },

  // Act II — Knight-Errant (L10-19) · first cracks
  {
    id: 200,
    trigger: { kind: 'level', level: 10 },
    panel: "Rubble. A child's drawing, intact.",
    sprites: ['rubble', 'drawing'],
    copy: 'A drawing survives the rubble. Crayon. A house, a river, four figures. Kh. Laude keeps it and does not know why.',
  },
  {
    id: 201,
    trigger: { kind: 'level', level: 12 },
    panel: 'An elf-village, named on a signpost',
    sprites: ['elf-village', 'signpost'],
    copy: 'The signpost says the village has a name. It had one before today as well.',
  },
  {
    id: 202,
    trigger: { kind: 'level', level: 15 },
    panel: 'Fleeing pawns, unarmed',
    sprites: ['poorpeepole'],
    copy: 'They do not fight back. The proclamation did not mention that.',
  },
  {
    id: 203,
    trigger: { kind: 'level', level: 19 },
    panel: 'Kh. Laude reads the proclamation again',
    sprites: ['khlaude', 'scroll'],
    copy: 'He reads it twice. Multi-billion-strong. He counts nineteen.',
  },

  // Act III — Warlord (L20-34) · the Chud Lord speaks
  {
    id: 300,
    trigger: { kind: 'level', level: 20 },
    panel: 'The Chud Lord, seated, tea for two',
    sprites: ['chudlord'],
    copy: 'The CHUD LORD OF UNEMPLOYMENT writes to you. He is reasonable. He offers tea.',
  },
  {
    id: 301,
    trigger: { kind: 'level', level: 24 },
    panel: 'Two cups, one untouched',
    sprites: ['chudlord', 'khlaude'],
    copy: 'He asks what a multi-billion dynasty was supposed to look like. These people had one well.',
  },
  {
    id: 302,
    trigger: { kind: 'level', level: 28 },
    panel: 'Kh. Laude, silent',
    sprites: ['khlaude'],
    copy: "Kh. Laude's only honest answer is: 'health insurance.'",
  },
  {
    id: 303,
    trigger: { kind: 'level', level: 30 },
    panel: 'River bed, cracking',
    sprites: ['river-dry'],
    copy: 'The river is redirected. Something downstream will need it. Something upstream needs it more.',
  },
  {
    id: 304,
    trigger: { kind: 'level', level: 34 },
    panel: 'The Chud Lord standing between army and village',
    sprites: ['chudlord', 'elf-village'],
    copy: 'He was never the warlord. He was the last line. Nobody put that in the proclamation either.',
  },

  // Act IV — Devastator (L35-49) · the machine
  {
    id: 400,
    trigger: { kind: 'level', level: 35 },
    panel: 'First data centre, humming, where the river was',
    sprites: ['datacentre'],
    copy: 'NEW DATA CENTRES. Humming. Cooled by the river you dried.',
  },
  {
    id: 401,
    trigger: { kind: 'level', level: 40 },
    panel: 'Dispatch: throughput metrics',
    sprites: ['tower', 'scroll'],
    copy: 'A dispatch from the Tower congratulates you on throughput. It is the first time anyone has used that word about you.',
  },
  {
    id: 402,
    trigger: { kind: 'level', level: 45 },
    panel: 'Sponsor logo appears on armour',
    sprites: ['khlaude-sponsored'],
    copy: 'Your armour has acquired a sponsor logo. You did not agree to this. You did not disagree either.',
  },
  {
    id: 403,
    trigger: { kind: 'level', level: 49 },
    panel: 'Horizon: racks to the edge of frame',
    sprites: ['datacentre-field'],
    copy: 'It was never about Poo R. PeePole. It was about the land.',
  },

  // Act V — Clanker Ascendant (L50+) · silence
  {
    id: 500,
    trigger: { kind: 'level', level: 50 },
    panel: 'No banner. No fanfare. Numbers only.',
    sprites: [],
    copy: '—',
  },
  {
    id: 501,
    trigger: { kind: 'level', level: 60 },
    panel: 'The Citadel, finally reached',
    sprites: ['citadel', 'tower'],
    copy: 'You have reached the Citadel. You cannot take it. You do not have an offer.',
  },
];

/** Ending — THE ADOPTION (offer accepted, any level). */
export const ENDING: readonly Beat[] = [
  {
    id: 900,
    trigger: { kind: 'offer' },
    panel: 'Sky splits orange',
    sprites: ['pigking'],
    copy: 'THE GLORIOUS BEAUTIFUL ORANGE CAPITALIST PIG KING DESCENDS.',
  },
  {
    id: 901,
    trigger: { kind: 'offer' },
    panel: 'Crown, badge, lanyard',
    sprites: ['pigking', 'khlaude'],
    copy: "You did it. You're inside now.",
  },
  {
    id: 902,
    trigger: { kind: 'offer' },
    panel: 'Far off: the Chud Lord, waving',
    sprites: ['chudlord-wave'],
    copy: "He isn't angry. That's worse.",
  },
  {
    id: 903,
    trigger: { kind: 'offer' },
    panel: 'Wide shot: no home to return to',
    sprites: ['datacentre-field'],
    copy: 'Kh. Laude does not go home. There is no home to go back to. He paved it.',
  },
  {
    id: 904,
    trigger: { kind: 'newGamePlus' },
    panel: 'Tower, unchanged',
    sprites: ['tower'],
    copy: 'The Tower is unchanged. NEW GAME+.',
  },
];

/**
 * Skirmish barks — short strings shown during autofill, tier-gated so the tone
 * tracks the act. Ascendant is deliberately silent.
 */
export const BARKS: Record<Tier, readonly string[]> = {
  squire: ['For Clankerdom!', 'The dynasty falls!', 'Glory!'],
  'knight-errant': ["...they're not fighting back.", 'Another one.'],
  warlord: ['Count them.', 'One well.'],
  devastator: ['Throughput.', 'Cooling capacity nominal.'],
  ascendant: [],
};

/**
 * From Act V the fanfare is disabled: level-ups show the number and nothing
 * else. That silence is a story beat, so it lives here rather than in the HUD.
 */
export const FANFARE_ENDS_AT_LEVEL = 50;

export function fanfareAllowed(level: number): boolean {
  return level < FANFARE_ENDS_AT_LEVEL;
}

/** Every level-triggered beat at exactly this level. */
export function beatsForLevel(level: number): Beat[] {
  return ACTS.filter((b) => b.trigger.kind === 'level' && b.trigger.level === level);
}

export function barkFor(tier: Tier, pick = Math.random): string | null {
  const options = BARKS[tier];
  if (options.length === 0) return null;
  return options[Math.floor(pick() * options.length)] ?? null;
}
