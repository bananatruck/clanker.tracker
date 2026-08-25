import { describe, expect, it } from 'vitest';
import type { Application, ApplicationStatus } from '@/lib/db/schema';
import {
  filterApplications,
  isFollowUpDue,
  localDateInputValue,
  parseLocalDateInput,
  type TrackerFilter,
} from '@/lib/tracker/query';

const NOW = Date.UTC(2026, 7, 24, 18);
const DAY = 24 * 60 * 60 * 1000;

function app(
  id: string,
  status: ApplicationStatus,
  patch: Partial<Application> = {},
): Application {
  return {
    id,
    company: 'Acme',
    role: 'Platform Engineer',
    url: `https://jobs.test/${id}`,
    ats: 'greenhouse',
    status,
    trackedAt: NOW - DAY,
    appliedAt: status === 'saved' || status === 'started' ? null : NOW - DAY,
    updatedAt: NOW - DAY,
    scanId: null,
    notes: '',
    llmCalls: 0,
    ...patch,
  };
}

const ids = (rows: readonly Application[]) => rows.map((row) => row.id);

describe('tracker query', () => {
  it('matches all search terms across useful fields', () => {
    const rows = [
      app('one', 'applied', { company: 'Northwind Labs', role: 'Backend Engineer' }),
      app('two', 'interview', { company: 'Northwind', role: 'Designer', contact: 'Mina Chen' }),
    ];

    expect(ids(filterApplications(rows, { query: 'north backend', filter: 'all' }, NOW)))
      .toEqual(['one']);
    expect(ids(filterApplications(rows, { query: 'mina interview', filter: 'all' }, NOW)))
      .toEqual(['two']);
  });

  it('searches location and tags', () => {
    const rows = [app('one', 'saved', { location: 'Toronto, ON', tags: ['Remote', 'Platform'] })];
    expect(ids(filterApplications(rows, { query: 'toronto remote', filter: 'all' }, NOW)))
      .toEqual(['one']);
  });

  it.each<[TrackerFilter, string[]]>([
    ['saved', ['saved']],
    ['active', ['saved', 'started', 'applied', 'offer']],
    ['all', ['saved', 'started', 'applied', 'offer', 'rejected']],
  ])('applies the %s filter', (filter, expected) => {
    const rows = [
      app('saved', 'saved'),
      app('started', 'started'),
      app('applied', 'applied'),
      app('offer', 'offer'),
      app('rejected', 'rejected'),
    ];
    expect(ids(filterApplications(rows, { query: '', filter }, NOW))).toEqual(expected);
  });

  it('surfaces due reminders and stale live applications, but not closed rows', () => {
    const due = app('due', 'interview', { nextActionAt: NOW - DAY });
    const future = app('future', 'applied', { nextActionAt: NOW + DAY });
    const stale = app('stale', 'applied', { updatedAt: NOW - 31 * DAY });
    const closed = app('closed', 'rejected', { nextActionAt: NOW - DAY });
    const rows = [due, future, stale, closed];

    expect(isFollowUpDue(due, NOW)).toBe(true);
    expect(isFollowUpDue(future, NOW)).toBe(false);
    expect(isFollowUpDue(closed, NOW)).toBe(false);
    expect(ids(filterApplications(rows, { query: '', filter: 'attention' }, NOW)))
      .toEqual(['due', 'stale']);
  });
});

describe('follow-up dates', () => {
  it('round-trips a calendar date in local time without shifting a day', () => {
    const timestamp = parseLocalDateInput('2026-08-24');
    expect(timestamp).toBeTypeOf('number');
    expect(localDateInputValue(timestamp)).toBe('2026-08-24');
  });

  it('keeps an empty reminder empty', () => {
    expect(parseLocalDateInput('')).toBeUndefined();
    expect(localDateInputValue(undefined)).toBe('');
  });
});
