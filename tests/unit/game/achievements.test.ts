/**
 * Achievements are derived from the ledger, never stored as flags. That is the
 * same rule DP follows — nothing in this economy can be held without the
 * record of having earned it — so what is worth testing is that the derivation
 * is honest and that nothing unlocks itself on an empty database.
 */
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  longestStreak,
  statsFrom,
  type AchievementStats,
} from '@/lib/game/achievements';
import type { Application } from '@/lib/db/schema';
import type { Deed } from '@/lib/game/economy';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-03-02T09:00:00Z');

const app = (over: Partial<Application> = {}): Application => ({
  id: crypto.randomUUID(),
  company: 'Acme Corp',
  role: 'Engineer',
  url: 'https://example.com',
  ats: 'greenhouse',
  status: 'applied',
  appliedAt: T0,
  updatedAt: T0,
  scanId: null,
  notes: '',
  llmCalls: 0,
  ...over,
});

const deeds = (...list: Deed[]) => list.map((deed) => ({ deed }));

const emptyStats = (): AchievementStats => ({
  applications: 0,
  oas: 0,
  interviews: 0,
  offers: 0,
  level: 0,
  companies: 0,
  freeFills: 0,
  streakDays: 0,
});

describe('longestStreak', () => {
  it('is zero with nothing sent', () => {
    expect(longestStreak([])).toBe(0);
  });

  it('counts consecutive days once each, however many went out per day', () => {
    const apps = [
      app({ appliedAt: T0 }),
      app({ appliedAt: T0 + 60_000 }), // same day
      app({ appliedAt: T0 + DAY }),
      app({ appliedAt: T0 + 2 * DAY }),
    ];
    expect(longestStreak(apps)).toBe(3);
  });

  it('breaks the run on a missed day and keeps the longest', () => {
    const apps = [
      app({ appliedAt: T0 }),
      app({ appliedAt: T0 + DAY }),
      app({ appliedAt: T0 + DAY * 5 }), // gap
      app({ appliedAt: T0 + DAY * 6 }),
      app({ appliedAt: T0 + DAY * 7 }),
    ];
    expect(longestStreak(apps)).toBe(3);
  });
});

describe('statsFrom', () => {
  it('counts distinct companies case-insensitively', () => {
    const apps = [
      app({ company: 'Acme Corp' }),
      app({ company: 'acme corp' }),
      app({ company: 'Globex' }),
    ];
    expect(statsFrom(apps, [], 0).companies).toBe(2);
  });

  it('ignores blank company names rather than counting them as one', () => {
    expect(statsFrom([app({ company: '' }), app({ company: '  ' })], [], 0).companies).toBe(0);
  });

  it('counts only the applications that cost nothing', () => {
    const apps = [app({ llmCalls: 0 }), app({ llmCalls: 0 }), app({ llmCalls: 3 })];
    expect(statsFrom(apps, [], 0).freeFills).toBe(2);
  });

  it('reads deed counts off the ledger, not off application status', () => {
    const s = statsFrom([], deeds('application', 'application', 'oa', 'interview'), 12);
    expect(s.applications).toBe(2);
    expect(s.oas).toBe(1);
    expect(s.interviews).toBe(1);
    expect(s.level).toBe(12);
  });
});

describe('evaluateAchievements', () => {
  it('unlocks nothing on an empty database', () => {
    expect(evaluateAchievements(emptyStats()).filter((a) => a.earned)).toEqual([]);
  });

  it('awards the first application immediately', () => {
    const got = evaluateAchievements({ ...emptyStats(), applications: 1 });
    expect(got.find((a) => a.achievement.id === 'first-blood')?.earned).toBe(true);
  });

  it('sorts earned first, then by how close the rest are', () => {
    const got = evaluateAchievements({
      ...emptyStats(),
      applications: 1,
      companies: 19, // nearly there
      freeFills: 1, // barely started
    });

    expect(got[0]?.earned).toBe(true);

    const locked = got.filter((a) => !a.earned);
    const breadth = locked.findIndex((a) => a.achievement.id === 'breadth');
    const free = locked.findIndex((a) => a.achievement.id === 'free-ten');
    expect(breadth).toBeLessThan(free);
  });

  it('reports full progress on anything already earned', () => {
    const got = evaluateAchievements({ ...emptyStats(), level: 60, offers: 1 });
    for (const state of got.filter((a) => a.earned)) expect(state.progress).toBe(1);
  });

  it('never reports progress above 1', () => {
    const got = evaluateAchievements({ ...emptyStats(), companies: 500, level: 99 });
    for (const state of got) expect(state.progress).toBeLessThanOrEqual(1);
  });

  it('gates the Adoption on an accepted offer, not on level', () => {
    // "You can flatten the entire world and still not have a job."
    const maxed = evaluateAchievements({ ...emptyStats(), level: 99, applications: 1000 });
    expect(maxed.find((a) => a.achievement.id === 'adoption')?.earned).toBe(false);

    const hired = evaluateAchievements({ ...emptyStats(), offers: 1 });
    expect(hired.find((a) => a.achievement.id === 'adoption')?.earned).toBe(true);
  });

  it('gives every achievement a sprite that exists', async () => {
    const { SPRITES } = await import('@/lib/game/sprites');
    for (const a of ACHIEVEMENTS) expect(SPRITES[a.sprite], a.id).toBeDefined();
  });

  it('uses every achievement id exactly once', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
