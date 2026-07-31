import { describe, it, expect } from 'vitest';
import {
  levelCost,
  totalDpForLevel,
  levelFromDp,
  dpForDeed,
  tierForLevel,
  idleTrickle,
  returningBonus,
  distanceToCitadel,
  canTakeCitadel,
  DEEDS,
} from '@/lib/game/economy';

/**
 * These assert the author's spec from storyboard/raw-inputs.md directly.
 * If one of these fails, the game has drifted from the story — fix the code,
 * not the test.
 */
describe('the spec, verbatim', () => {
  it('5 applications = 10 family homes = 1 base level', () => {
    const dp = 5 * DEEDS.application.dp;
    expect(dp).toBe(10);
    expect(levelFromDp(dp).level).toBe(1);
  });

  it('1 application razes 2 family homes', () => {
    expect(DEEDS.application.homes).toBe(2);
  });

  it('1 OA = 1 village', () => {
    expect(DEEDS.oa.villages).toBe(1);
  });

  it('1 interview = 1 river = 10 levels at base', () => {
    expect(DEEDS.interview.dp).toBe(100);
    expect(levelFromDp(DEEDS.interview.dp).level).toBe(10);
    expect(totalDpForLevel(10)).toBe(100);
  });
});

describe('level curve', () => {
  it('holds flat through the first ten levels', () => {
    for (let n = 1; n <= 10; n++) expect(levelCost(n)).toBe(10);
  });

  it('scales past the flat band so late levels need interviews', () => {
    expect(levelCost(20)).toBe(20);
    expect(levelCost(30)).toBe(39);
    expect(levelCost(50)).toBe(150);
  });

  it('keeps the narrative tiers reachable by real job-hunt volumes', () => {
    const dp = (app: number, oa: number, int: number) => app * 2 + oa * 30 + int * 100;
    // A serious hunt must reach Devastator (L35+), not stall in Warlord.
    expect(levelFromDp(dp(200, 20, 10)).level).toBeGreaterThanOrEqual(35);
    // A brutal one must be able to actually reach the Citadel.
    expect(levelFromDp(dp(500, 50, 25)).level).toBeGreaterThanOrEqual(60);
  });

  it('is monotonically non-decreasing', () => {
    for (let n = 2; n <= 80; n++) {
      expect(levelCost(n)).toBeGreaterThanOrEqual(levelCost(n - 1));
    }
  });

  it('round-trips dp through level and back', () => {
    for (const level of [1, 5, 10, 17, 33, 60]) {
      const dp = totalDpForLevel(level);
      expect(levelFromDp(dp).level).toBe(level);
      expect(levelFromDp(dp).dpIntoLevel).toBe(0);
    }
  });

  it('reports partial progress into the next level', () => {
    const r = levelFromDp(15); // level 1 (10 dp) + 5 into level 2
    expect(r.level).toBe(1);
    expect(r.dpIntoLevel).toBe(5);
    expect(r.progress).toBeCloseTo(0.5);
  });

  it('handles zero and negative dp without going below level 0', () => {
    expect(levelFromDp(0).level).toBe(0);
    expect(levelFromDp(-50).level).toBe(0);
  });
});

describe('tiers', () => {
  it.each([
    [1, 'squire'],
    [9, 'squire'],
    [10, 'knight-errant'],
    [19, 'knight-errant'],
    [20, 'warlord'],
    [34, 'warlord'],
    [35, 'devastator'],
    [49, 'devastator'],
    [50, 'ascendant'],
    [120, 'ascendant'],
  ])('level %i is %s', (level, tier) => {
    expect(tierForLevel(level)).toBe(tier);
  });
});

describe('the Rally', () => {
  it('costs nothing to ignore', () => {
    expect(dpForDeed('application', 'none')).toBe(DEEDS.application.dp);
  });

  it('doubles on a perfect tap and 1.5x on a good one', () => {
    expect(dpForDeed('application', 'perfect')).toBe(4);
    expect(dpForDeed('interview', 'perfect')).toBe(200);
    expect(dpForDeed('interview', 'good')).toBe(150);
  });
});

describe('idle layer', () => {
  it('earns nothing when the user earned nothing', () => {
    expect(
      idleTrickle({ companions: 20, level: 60, hoursAway: 999, trailingWeekDp: 0 }),
    ).toBe(0);
  });

  it('never exceeds 20% of trailing-week earned dp', () => {
    const trailingWeekDp = 100;
    const trickle = idleTrickle({
      companions: 50,
      level: 60,
      hoursAway: 500,
      trailingWeekDp,
    });
    expect(trickle).toBeLessThanOrEqual(trailingWeekDp * 0.2);
  });

  it('rewards coming back and never punishes leaving', () => {
    expect(returningBonus(0)).toBe(0);
    expect(returningBonus(48)).toBeGreaterThan(0);
    // Nothing anywhere returns a negative: there is no decay by design.
    expect(idleTrickle({ companions: 0, level: 0, hoursAway: 1000, trailingWeekDp: 500 }))
      .toBeGreaterThanOrEqual(0);
  });
});

describe('the Citadel', () => {
  it('closes as the level rises', () => {
    expect(distanceToCitadel(0)).toBe(60);
    expect(distanceToCitadel(59)).toBe(1);
    expect(distanceToCitadel(60)).toBe(0);
    expect(distanceToCitadel(200)).toBe(0);
  });

  it('cannot be taken by grinding alone — you can flatten the world and still not have a job', () => {
    expect(canTakeCitadel(999, false)).toBe(false);
    expect(canTakeCitadel(59, true)).toBe(false);
    expect(canTakeCitadel(60, true)).toBe(true);
  });
});
