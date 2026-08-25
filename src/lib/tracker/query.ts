import type { Application, ApplicationStatus } from '@/lib/db/schema';
import { STATUS_LABEL, isStale } from './funnel';

export type TrackerFilter = 'all' | 'active' | 'attention' | ApplicationStatus;

export interface TrackerQuery {
  query: string;
  filter: TrackerFilter;
}

const CLOSED = new Set<ApplicationStatus>(['rejected', 'withdrawn', 'ghosted']);

export const isClosed = (status: ApplicationStatus): boolean => CLOSED.has(status);

const endOfLocalDay = (now: number): number => {
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

export function localDateInputValue(timestamp: number | undefined): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Store date-only reminders at local noon so timezone changes do not cross midnight. */
export function parseLocalDateInput(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) return undefined;
  return date.getTime();
}

/** A scheduled reminder due today or a live application that has gone stale. */
export function isReminderDue(app: Application, now = Date.now()): boolean {
  return app.nextActionAt !== undefined && app.nextActionAt <= endOfLocalDay(now);
}

export function isFollowUpDue(app: Application, now = Date.now()): boolean {
  if (isClosed(app.status)) return false;
  return isReminderDue(app, now) || isStale(app, now);
}

const fold = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function matchesText(app: Application, rawQuery: string): boolean {
  const terms = fold(rawQuery).split(' ').filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = fold([
    app.company,
    app.role,
    STATUS_LABEL[app.status],
    app.ats,
    app.notes,
    app.salary ?? '',
    app.nextAction ?? '',
    app.website ?? '',
    app.contact ?? '',
    app.url,
  ].join(' '));
  return terms.every((term) => haystack.includes(term));
}

function matchesFilter(app: Application, filter: TrackerFilter, now: number): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return !isClosed(app.status);
  if (filter === 'attention') return isFollowUpDue(app, now);
  return app.status === filter;
}

export function filterApplications(
  apps: readonly Application[],
  query: TrackerQuery,
  now = Date.now(),
): Application[] {
  return apps.filter(
    (app) => matchesFilter(app, query.filter, now) && matchesText(app, query.query),
  );
}
