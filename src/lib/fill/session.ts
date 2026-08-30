/** Pure transitions for a reviewed, user-advanced application flow. */
import type { ApplicationSession } from '@/lib/db/schema';
import type { HarvestedField } from './types';

export type SessionPage = Pick<
  ApplicationSession,
  'ats' | 'url' | 'pageKey' | 'completedPaths'
> & Pick<ApplicationSession, 'jobUrl' | 'scanId' | 'llmCalls'>;

/** Stable across field ordering, but different when an SPA reveals a new step. */
export function pageKeyFor(fields: readonly HarvestedField[]): string {
  const text = fields
    .map((field) => [
      field.semanticPath ?? '',
      field.name,
      field.label,
      field.kind,
      field.required ? 'required' : '',
      field.options.map((option) => `${option.value}:${option.label}`).join(','),
    ].join(':'))
    .sort()
    .join('|');

  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The step the UI should offer for the fields currently on screen. */
export function continuationStep(
  existing: ApplicationSession | null | undefined,
  pageKey: string,
): number | undefined {
  if (!existing || existing.status === 'complete') return undefined;
  return existing.step + (existing.pageKey === pageKey ? 0 : 1);
}

/** Save one reviewed page; repeating the same page is idempotent. */
export function checkpointSession(
  existing: ApplicationSession | null | undefined,
  tabId: number,
  page: SessionPage,
  now = Date.now(),
): ApplicationSession {
  const sameHunt = existing?.ats === page.ats && existing.status !== 'complete';
  const previous = sameHunt ? existing : undefined;
  return {
    id: `tab-${tabId}`,
    tabId,
    ats: page.ats,
    jobUrl: previous?.jobUrl ?? page.jobUrl ?? page.url,
    scanId: previous?.scanId ?? page.scanId,
    url: page.url,
    pageKey: page.pageKey,
    step: previous ? previous.step + (previous.pageKey === page.pageKey ? 0 : 1) : 1,
    completedPaths: [
      ...new Set([...(previous?.completedPaths ?? []), ...page.completedPaths]),
    ],
    llmCalls: (previous?.llmCalls ?? 0) + (page.llmCalls ?? 0),
    status: 'review',
    updatedAt: now,
  };
}
