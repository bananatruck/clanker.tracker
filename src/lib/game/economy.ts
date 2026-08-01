/**
 * Clankerdom Deliverance — the economy.
 *
 * Canonical numbers come from storyboard/raw-inputs.md:
 *
 *   "If u destroy 10 family homes(5 applications) for a base level up /
 *    Destoy 1 village OWNED BY AKA REDDIT D MOD (1 OA) /
 *    Dry out 0.1 river (Land an interview = 1 river so 1 int = 10 lvl up at base)"
 *
 * Everything below derives from those three sentences. One family home is
 * one Devastation Point, which makes an application 2 DP and a base level
 * 10 DP. Levels 1-10 are held flat at 10 DP each so that one interview
 * (100 DP) is exactly ten levels from a standing start, as specified.
 *
 * Two rules constrain every function here:
 *   1. DP only ever comes from a real action. No idle currency can exceed
 *      what the user actually earned (see IDLE_CEILING_RATIO).
 *   2. Nothing decays. There is no penalty for not playing.
 */

/** What the player actually did. The only sources of DP. */
export type Deed = 'application' | 'oa' | 'interview' | 'offer';

/** DP awarded per deed, and what it means in Clankerdom. */
export const DEEDS = {
  application: { dp: 2, homes: 2, label: '2 family homes razed' },
  oa: { dp: 30, villages: 1, label: '1 village taken' },
  interview: { dp: 100, rivers: 1, label: '1 river dried' },
  offer: { dp: 0, label: 'The Adoption' },
} as const satisfies Record<
  Deed,
  // The homes/villages/rivers counts are the narrative half of each deed —
  // what the label says in numbers, so the renderer doesn't parse prose.
  { dp: number; label: string; homes?: number; villages?: number; rivers?: number }
>;

/** Levels 1-10 each cost this much. 5 applications = 10 DP = level 1. */
export const BASE_LEVEL_COST = 10;

/** Levels stay flat this long, so one interview = 10 levels at base. */
export const FLAT_LEVELS = 10;

/**
 * Growth per level past the flat band.
 *
 * Tuned against real job-hunt volumes so the narrative tiers are actually
 * reachable — at 1.12 a serious hunt topped out at level 36 and the last two
 * acts were dead content. At 1.07:
 *   light   (50 app, 3 OA, 1 int)     -> ~L21  Warlord
 *   serious (200 app, 20 OA, 10 int)  -> ~L48  Devastator
 *   brutal  (500 app, 50 OA, 25 int)  -> ~L61  takes the Citadel
 */
export const SCALING_FACTOR = 1.07;

/** Level at which the warband reaches the Citadel. */
export const CITADEL_LEVEL = 60;

/** Idle trickle can never exceed this share of trailing-7-day earned DP. */
export const IDLE_CEILING_RATIO = 0.2;

/**
 * DP required to go from level `n - 1` to level `n`.
 *
 *   levelCost(1..10) = 10   -> 100 DP total, exactly one interview
 *   levelCost(20)    = 20
 *   levelCost(30)    = 39
 *   levelCost(50)    = 150
 */
export function levelCost(level: number): number {
  if (level < 1) return 0;
  if (level <= FLAT_LEVELS) return BASE_LEVEL_COST;
  return Math.ceil(BASE_LEVEL_COST * SCALING_FACTOR ** (level - FLAT_LEVELS));
}

/** Cumulative DP needed to *reach* `level` from zero. */
export function totalDpForLevel(level: number): number {
  let total = 0;
  for (let n = 1; n <= level; n++) total += levelCost(n);
  return total;
}

/** Current level, and progress toward the next one, for a given DP total. */
export function levelFromDp(dp: number): {
  level: number;
  dpIntoLevel: number;
  dpForNext: number;
  progress: number;
} {
  let level = 0;
  let remaining = Math.max(0, dp);

  while (remaining >= levelCost(level + 1)) {
    remaining -= levelCost(level + 1);
    level++;
  }

  const dpForNext = levelCost(level + 1);
  return {
    level,
    dpIntoLevel: remaining,
    dpForNext,
    progress: dpForNext === 0 ? 1 : remaining / dpForNext,
  };
}

/** Narrative tier. Drives lore, tone, HUD accent, and skirmish barks. */
export type Tier =
  | 'squire'
  | 'knight-errant'
  | 'warlord'
  | 'devastator'
  | 'ascendant';

export const TIERS: ReadonlyArray<{ tier: Tier; from: number; title: string }> = [
  { tier: 'squire', from: 1, title: 'Squire' },
  { tier: 'knight-errant', from: 10, title: 'Knight-Errant' },
  { tier: 'warlord', from: 20, title: 'Warlord' },
  { tier: 'devastator', from: 35, title: 'Devastator' },
  { tier: 'ascendant', from: 50, title: 'Clanker Ascendant' },
];

export function tierForLevel(level: number): Tier {
  let current: Tier = 'squire';
  for (const t of TIERS) if (level >= t.from) current = t.tier;
  return current;
}

/**
 * DP for a deed, including the Rally multiplier from the fill-time skirmish.
 *
 * The Rally is a single optional timing tap during autofill. Ignoring it
 * costs nothing (1.0x) — it must never feel mandatory.
 */
export type RallyGrade = 'perfect' | 'good' | 'none';

const RALLY_MULTIPLIER: Record<RallyGrade, number> = {
  perfect: 2.0,
  good: 1.5,
  none: 1.0,
};

export function dpForDeed(deed: Deed, rally: RallyGrade = 'none'): number {
  return Math.round(DEEDS[deed].dp * RALLY_MULTIPLIER[rally]);
}

/**
 * Idle trickle earned while away, hard-capped at a share of what the user
 * genuinely earned in the trailing week. Idle can never outpace real work —
 * that ceiling is the point, not a balance knob.
 */
export function idleTrickle(opts: {
  companions: number;
  level: number;
  hoursAway: number;
  trailingWeekDp: number;
}): number {
  const { companions, level, hoursAway, trailingWeekDp } = opts;
  if (trailingWeekDp <= 0) return 0;

  const raw = (companions * 0.5 + level * 0.1) * Math.min(hoursAway, 24);
  const ceiling = trailingWeekDp * IDLE_CEILING_RATIO;
  return Math.floor(Math.min(raw, ceiling));
}

/**
 * Returning after a break is rewarded, never penalised. There is no decay
 * anywhere in this file by design — the job hunt punishes enough.
 */
export const RALLY_BONUS_RATIO = 0.1;
export const RALLY_BONUS_AFTER_HOURS = 24;

export function returningBonus(hoursAway: number): number {
  return hoursAway >= RALLY_BONUS_AFTER_HOURS ? RALLY_BONUS_RATIO : 0;
}

/** Distance to the Citadel, in march nodes. Reaching it needs level 60. */
export function distanceToCitadel(level: number): number {
  return Math.max(0, CITADEL_LEVEL - level);
}

/**
 * The Citadel cannot be taken by grinding. You can flatten the entire world
 * and still not have a job; only an accepted offer ends the crusade.
 */
export function canTakeCitadel(level: number, hasOffer: boolean): boolean {
  return level >= CITADEL_LEVEL && hasOffer;
}
