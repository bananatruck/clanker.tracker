/**
 * Achievements.
 *
 * Every one is *derived* from the deeds ledger and the application table, and
 * none is stored as a flag. That follows the same rule as DP: nothing in this
 * economy can be held without the record of having earned it, so there is no
 * state to get out of sync and nothing to migrate when the list changes.
 *
 * They also have to stay honest about what the job hunt is. There is no
 * achievement for a rejection streak, none for applying at 3am, and none that
 * congratulates volume for its own sake past the point where volume helps.
 * The tone tracks the acts: triumphant early, quieter as it goes.
 */
import type { Application } from '@/lib/db/schema';
import type { Deed } from './economy';

export interface Achievement {
  id: string;
  title: string;
  /** Shown once earned. Flavour, in the voice of the crusade. */
  description: string;
  /** How to get it, shown while locked. Never a riddle. */
  requirement: string;
  /** Sprite shown on the card. */
  sprite: string;
  /** Earned, given the ledger. */
  earned: (stats: AchievementStats) => boolean;
  /** Progress toward it, 0-1, for the ones worth showing a bar for. */
  progress?: (stats: AchievementStats) => number;
}

export interface AchievementStats {
  applications: number;
  oas: number;
  interviews: number;
  offers: number;
  level: number;
  /** Distinct companies applied to. Breadth, as opposed to volume. */
  companies: number;
  /** Applications that cost zero model calls. */
  freeFills: number;
  /** Longest run of days with at least one application. */
  streakDays: number;
}

/** Build the stat block the achievement predicates read. */
export function statsFrom(
  apps: readonly Application[],
  deeds: ReadonlyArray<{ deed: Deed }>,
  level: number,
): AchievementStats {
  const count = (d: Deed) => deeds.filter((x) => x.deed === d).length;

  return {
    applications: count('application'),
    oas: count('oa'),
    interviews: count('interview'),
    offers: count('offer'),
    level,
    companies: new Set(apps.map((a) => a.company.trim().toLowerCase()).filter(Boolean)).size,
    freeFills: apps.filter((a) => a.llmCalls === 0).length,
    streakDays: longestStreak(apps),
  };
}

/** Longest run of consecutive days with at least one application sent. */
export function longestStreak(apps: readonly Application[]): number {
  const days = [...new Set(apps.map((a) => new Date(a.appliedAt).toISOString().slice(0, 10)))]
    .sort();
  if (days.length === 0) return 0;

  const DAY = 24 * 60 * 60 * 1000;
  let best = 1;
  let run = 1;

  for (let i = 1; i < days.length; i++) {
    const gap = Date.parse(days[i]!) - Date.parse(days[i - 1]!);
    run = gap === DAY ? run + 1 : 1;
    if (run > best) best = run;
  }

  return best;
}

const ratio = (have: number, need: number) => Math.min(1, have / need);

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-blood',
    title: 'The hamlet burns',
    description: 'Two family homes razed. The dynasty trembles.',
    requirement: 'Send your first application',
    sprite: 'house',
    earned: (s) => s.applications >= 1,
  },
  {
    id: 'squire',
    title: 'Squire',
    description: 'Five applications. A level. The King is pleased.',
    requirement: 'Reach level 1',
    sprite: 'khlaude',
    earned: (s) => s.level >= 1,
    progress: (s) => ratio(s.applications, 5),
  },
  {
    id: 'free-ten',
    title: 'Cost of nothing',
    description: 'Ten applications filled without a single model call.',
    requirement: 'Fill 10 applications for free',
    sprite: 'datacentre',
    earned: (s) => s.freeFills >= 10,
    progress: (s) => ratio(s.freeFills, 10),
  },
  {
    id: 'first-reply',
    title: 'Someone answered',
    description: 'A village taken. Somebody on the other end read it.',
    requirement: 'Reach an online assessment',
    sprite: 'rubble',
    earned: (s) => s.oas >= 1,
  },
  {
    id: 'river',
    title: 'One river dried',
    description: 'An interview. Ten levels in a single afternoon.',
    requirement: 'Land an interview',
    sprite: 'chudlord',
    earned: (s) => s.interviews >= 1,
  },
  {
    id: 'breadth',
    title: 'Twenty banners',
    description: 'Twenty different companies. Nobody can say you did not try.',
    requirement: 'Apply to 20 distinct companies',
    sprite: 'tower',
    earned: (s) => s.companies >= 20,
    progress: (s) => ratio(s.companies, 20),
  },
  {
    id: 'streak',
    title: 'It gets easier',
    description: 'Seven days running. That is the first thing nobody warns you about.',
    requirement: 'Apply on 7 consecutive days',
    sprite: 'khlaude',
    earned: (s) => s.streakDays >= 7,
    progress: (s) => ratio(s.streakDays, 7),
  },
  {
    id: 'count-them',
    title: 'He counts nineteen',
    description: 'Multi-billion-strong, the proclamation said.',
    requirement: 'Reach level 19',
    sprite: 'pawn',
    earned: (s) => s.level >= 19,
    progress: (s) => ratio(s.level, 19),
  },
  {
    id: 'warlord',
    title: 'Warlord',
    description: 'The Chud Lord writes to you. He is reasonable. He offers tea.',
    requirement: 'Reach level 20',
    sprite: 'chudlord',
    earned: (s) => s.level >= 20,
    progress: (s) => ratio(s.level, 20),
  },
  {
    id: 'throughput',
    title: 'Throughput',
    description: 'The first time anyone has used that word about you.',
    requirement: 'Reach level 40',
    sprite: 'datacentre',
    earned: (s) => s.level >= 40,
    progress: (s) => ratio(s.level, 40),
  },
  {
    id: 'citadel',
    title: 'The Citadel',
    description: 'You have reached it. You cannot take it. You do not have an offer.',
    requirement: 'Reach level 60',
    sprite: 'citadel',
    earned: (s) => s.level >= 60,
    progress: (s) => ratio(s.level, 60),
  },
  {
    id: 'adoption',
    title: 'The Adoption',
    description: "You did it. You're inside now.",
    requirement: 'Accept an offer',
    sprite: 'pigking',
    earned: (s) => s.offers >= 1,
  },
];

export interface AchievementState {
  achievement: Achievement;
  earned: boolean;
  progress: number;
}

/** Every achievement with its current state, earned ones first. */
export function evaluateAchievements(stats: AchievementStats): AchievementState[] {
  return ACHIEVEMENTS.map((achievement) => {
    const earned = achievement.earned(stats);
    return {
      achievement,
      earned,
      progress: earned ? 1 : (achievement.progress?.(stats) ?? 0),
    };
  }).sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    // Among locked ones, closest first — that is the one worth chasing.
    return b.progress - a.progress;
  });
}
