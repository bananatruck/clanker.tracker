import { describe, it, expect } from 'vitest';
import { costStats, funnelStats, velocity } from '@/lib/tracker/stats';
import type { Application, ApplicationStatus } from '@/lib/db/schema';

const day = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 2, 12);

let n = 0;
const app = (status: ApplicationStatus, over: Partial<Application> = {}): Application => ({
  id: `a${n++}`,
  company: 'Acme',
  role: 'Engineer',
  url: '',
  ats: 'greenhouse',
  status,
  appliedAt: NOW - day,
  updatedAt: NOW - day,
  scanId: null,
  notes: '',
  llmCalls: 0,
  ...over,
});

describe('funnel stats', () => {
  it('counts an empty history without dividing by zero', () => {
    const s = funnelStats([], NOW);
    expect(s.total).toBe(0);
    expect(s.responseRate).toBe(0);
  });

  /**
   * A rejection that arrived after an onsite is still a reply. Counting only
   * current status would score a hunt that got four interviews and four
   * rejections as having had no response at all.
   */
  it('counts a rejection as a response and a ghost as silence', () => {
    const s = funnelStats([app('applied'), app('rejected'), app('ghosted'), app('oa')], NOW);
    expect(s.responses).toBe(2);
    expect(s.responseRate).toBeCloseTo(0.5);
  });

  it('rolls offers into the interview count', () => {
    const s = funnelStats([app('interview'), app('offer')], NOW);
    expect(s.interviews).toBe(2);
    expect(s.offers).toBe(1);
  });

  it('flags open applications that have gone quiet', () => {
    const s = funnelStats(
      [
        app('applied', { updatedAt: NOW - 45 * day }),
        app('applied', { updatedAt: NOW - 2 * day }),
        app('rejected', { updatedAt: NOW - 90 * day }),
      ],
      NOW,
    );
    expect(s.stale).toBe(1);
  });
});

describe('the cost claim', () => {
  it('holds the README to account: median calls on a free run is 0', () => {
    const apps = Array.from({ length: 9 }, () => app('applied', { llmCalls: 0 }));
    const s = costStats(apps);
    expect(s.medianLlmCalls).toBe(0);
    expect(s.freeShare).toBe(1);
  });

  /**
   * Median, not mean — one Workday monster must not be able to make a hundred
   * free Greenhouse fills read as expensive.
   */
  it('is not dragged by a single expensive outlier', () => {
    const apps = [
      ...Array.from({ length: 20 }, () => app('applied', { llmCalls: 0 })),
      app('applied', { llmCalls: 40 }),
    ];
    const s = costStats(apps);
    expect(s.medianLlmCalls).toBe(0);
    expect(s.totalLlmCalls).toBe(40);
  });

  it('reports the truth when calls are actually being spent', () => {
    const s = costStats([app('applied', { llmCalls: 3 }), app('applied', { llmCalls: 5 })]);
    expect(s.medianLlmCalls).toBe(4);
    expect(s.freeShare).toBe(0);
  });

  it('handles an empty history', () => {
    expect(costStats([]).medianLlmCalls).toBe(0);
  });
});

describe('velocity', () => {
  it('returns one bucket per day in the window, oldest first', () => {
    const v = velocity([], 14, NOW);
    expect(v).toHaveLength(14);
    expect(v[13]?.day).toBe('2026-08-02');
  });

  it('buckets applications by the day they were sent', () => {
    const v = velocity([app('applied'), app('applied'), app('applied')], 14, NOW);
    expect(v.find((b) => b.day === '2026-08-01')?.count).toBe(3);
  });

  it('ignores applications older than the window', () => {
    const v = velocity([app('applied', { appliedAt: NOW - 200 * day })], 14, NOW);
    expect(v.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });
});
