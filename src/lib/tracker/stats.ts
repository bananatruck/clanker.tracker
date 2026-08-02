/**
 * What the pile of applications actually says.
 *
 * Two audiences, one function. The job hunter wants the funnel: how many went
 * out, how many came back, how long the silence runs. The project wants the
 * cost claim held honest: if the median application is not costing zero LLM
 * calls, the README is lying and this is where it shows up first.
 *
 * Nothing here is a score. A "78% match" or an "application health rating"
 * would be a number you cannot act on, and inventing one is how a tracker
 * starts moralising at someone having a bad month.
 */
import type { Application, ApplicationStatus } from '@/lib/db/schema';
import { isStale } from './funnel';

export interface FunnelStats {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  /** Reached OA or further — the only "did anyone reply" measure that matters. */
  responses: number;
  /** responses / total, 0 when nothing has been sent. */
  responseRate: number;
  interviews: number;
  offers: number;
  /** Open applications that have gone quiet past the ghost threshold. */
  stale: number;
}

const EMPTY_BY_STATUS = (): Record<ApplicationStatus, number> => ({
  applied: 0,
  oa: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  ghosted: 0,
});

export function funnelStats(
  apps: readonly Application[],
  now = Date.now(),
): FunnelStats {
  const byStatus = EMPTY_BY_STATUS();
  for (const a of apps) byStatus[a.status]++;

  // An application that reached an OA got a response even if it later died,
  // so counting current status alone would undercount every rejection that
  // came after a real conversation. Rejections are counted as responses;
  // ghosts, by definition, are not.
  const responses = apps.filter(
    (a) => a.status !== 'applied' && a.status !== 'ghosted',
  ).length;

  return {
    total: apps.length,
    byStatus,
    responses,
    responseRate: apps.length === 0 ? 0 : responses / apps.length,
    interviews: byStatus.interview + byStatus.offer,
    offers: byStatus.offer,
    stale: apps.filter((a) => isStale(a, now)).length,
  };
}

export interface CostStats {
  /** The number the README stakes its claim on. */
  medianLlmCalls: number;
  /** Share of applications that cost nothing at all. */
  freeShare: number;
  totalLlmCalls: number;
}

/**
 * The cost claim, measured rather than asserted.
 *
 * Median, not mean: a single 12-call Workday monster should not be able to
 * make a hundred free Greenhouse fills look expensive. The claim is about the
 * typical application, so the statistic has to be about the typical one too.
 */
export function costStats(apps: readonly Application[]): CostStats {
  if (apps.length === 0) return { medianLlmCalls: 0, freeShare: 1, totalLlmCalls: 0 };

  const calls = apps.map((a) => a.llmCalls).sort((x, y) => x - y);
  const mid = Math.floor(calls.length / 2);
  const median =
    calls.length % 2 === 0
      ? ((calls[mid - 1] ?? 0) + (calls[mid] ?? 0)) / 2
      : (calls[mid] ?? 0);

  return {
    medianLlmCalls: median,
    freeShare: calls.filter((c) => c === 0).length / calls.length,
    totalLlmCalls: calls.reduce((sum, c) => sum + c, 0),
  };
}

/** Applications sent per day over the trailing window, most recent day last. */
export function velocity(
  apps: readonly Application[],
  days = 14,
  now = Date.now(),
): Array<{ day: string; count: number }> {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = new Date(now - (days - 1) * dayMs).setHours(0, 0, 0, 0);

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    buckets.set(new Date(start + i * dayMs).toISOString().slice(0, 10), 0);
  }

  for (const a of apps) {
    if (a.appliedAt < start) continue;
    const key = new Date(a.appliedAt).toISOString().slice(0, 10);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }

  return [...buckets].map(([day, count]) => ({ day, count }));
}
