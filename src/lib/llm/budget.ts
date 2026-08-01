/**
 * Daily call budget.
 *
 * The promise in the README is that this tool costs approximately nothing.
 * That promise survives contact with a rate limit only if running out of
 * quota **degrades** rather than fails: at the ceiling the resolver stops at
 * tier 4 and fills what it deterministically can, leaving the rest for review.
 * A half-filled form the user finishes by hand is a far better outcome than
 * an error dialog at application 40 of the day.
 *
 * Pure functions over a plain state object — the storage layer is elsewhere so
 * that all of this is testable without a browser.
 */
import { PROVIDERS, type ProviderId } from './types';

/** Fraction of the daily limit at which the UI starts warning. */
export const WARN_AT = 0.8;

export interface BudgetState {
  /** Local calendar day, `YYYY-MM-DD`. Quota resets when this changes. */
  day: string;
  used: number;
}

/**
 * Local calendar day, not UTC. A quota that resets mid-afternoon because the
 * user is in UTC+10 would be a baffling bug to hit.
 */
export function dayKey(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const initialBudget = (at: Date = new Date()): BudgetState => ({
  day: dayKey(at),
  used: 0,
});

/** Roll the counter over if the day changed since it was last written. */
export function rollover(state: BudgetState, at: Date = new Date()): BudgetState {
  const today = dayKey(at);
  return state.day === today ? state : { day: today, used: 0 };
}

export interface BudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  /** 0-1. Clamped, so an over-count can't render a >100% bar. */
  fraction: number;
  warn: boolean;
  exhausted: boolean;
}

export function budgetStatus(
  state: BudgetState,
  provider: ProviderId,
  at: Date = new Date(),
): BudgetStatus {
  const { used } = rollover(state, at);
  const limit = PROVIDERS[provider].dailyLimit;
  const remaining = Math.max(0, limit - used);
  const fraction = limit === 0 ? 1 : Math.min(1, used / limit);

  return {
    used,
    limit,
    remaining,
    fraction,
    warn: fraction >= WARN_AT,
    exhausted: remaining === 0,
  };
}

/**
 * Whether a call may be made at all.
 *
 * Callers must treat `false` as "resolve deterministically and hand the rest
 * to review", never as an error path.
 */
export function canSpend(
  state: BudgetState,
  provider: ProviderId,
  at: Date = new Date(),
): boolean {
  return !budgetStatus(state, provider, at).exhausted;
}

/** Record one call. Rolls the day over first so a stale state can't leak. */
export function spend(
  state: BudgetState,
  calls = 1,
  at: Date = new Date(),
): BudgetState {
  const rolled = rollover(state, at);
  return { day: rolled.day, used: rolled.used + calls };
}
