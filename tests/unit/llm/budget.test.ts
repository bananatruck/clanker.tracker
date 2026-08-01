import { describe, it, expect } from 'vitest';
import {
  budgetStatus,
  canSpend,
  dayKey,
  initialBudget,
  rollover,
  spend,
  WARN_AT,
} from '@/lib/llm/budget';
import { PROVIDERS } from '@/lib/llm/types';

const AT = new Date(2026, 6, 31, 12, 0, 0);
const NEXT_DAY = new Date(2026, 7, 1, 0, 30, 0);

describe('budget accounting', () => {
  it('keys on the local calendar day, not UTC', () => {
    // Late-evening local time must still be today, whatever the UTC offset is.
    expect(dayKey(new Date(2026, 6, 31, 23, 30, 0))).toBe('2026-07-31');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('counts each call once', () => {
    let state = initialBudget(AT);
    state = spend(state, 1, AT);
    state = spend(state, 1, AT);
    expect(state.used).toBe(2);
  });

  it('resets when the day rolls over', () => {
    const spent = spend(initialBudget(AT), 40, AT);
    const rolled = rollover(spent, NEXT_DAY);
    expect(rolled.used).toBe(0);
    expect(rolled.day).toBe('2026-08-01');
  });

  it('rolls over on spend, so a stale state cannot leak into a new day', () => {
    const stale = spend(initialBudget(AT), 249, AT);
    const fresh = spend(stale, 1, NEXT_DAY);
    expect(fresh.used).toBe(1);
    expect(canSpend(fresh, 'gemini', NEXT_DAY)).toBe(true);
  });

  it('warns at 80% of the daily limit', () => {
    const limit = PROVIDERS.gemini.dailyLimit;
    const below = budgetStatus(spend(initialBudget(AT), limit * 0.5, AT), 'gemini', AT);
    const at = budgetStatus(spend(initialBudget(AT), limit * WARN_AT, AT), 'gemini', AT);

    expect(below.warn).toBe(false);
    expect(at.warn).toBe(true);
    expect(at.exhausted).toBe(false);
  });

  it('reports exhaustion at the limit, and stops permitting calls', () => {
    const spent = spend(initialBudget(AT), PROVIDERS.gemini.dailyLimit, AT);
    const status = budgetStatus(spent, 'gemini', AT);

    expect(status.exhausted).toBe(true);
    expect(status.remaining).toBe(0);
    expect(canSpend(spent, 'gemini', AT)).toBe(false);
  });

  it('clamps an overrun so the UI cannot render past 100%', () => {
    const over = spend(initialBudget(AT), PROVIDERS.gemini.dailyLimit + 99, AT);
    const status = budgetStatus(over, 'gemini', AT);
    expect(status.fraction).toBe(1);
    expect(status.remaining).toBe(0);
  });

  it('never exhausts a local model — it is the user’s own machine', () => {
    const heavy = spend(initialBudget(AT), 100_000, AT);
    expect(canSpend(heavy, 'ollama', AT)).toBe(true);
  });

  it('tracks the tightened Gemini free tier as the default ceiling', () => {
    expect(PROVIDERS.gemini.dailyLimit).toBe(250);
  });
});
