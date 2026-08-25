import type {
  Application,
  ApplicationSource,
  ApplicationStatus,
} from '@/lib/db/schema';
import type { AtsId } from '@/lib/fill/records';
import { hasBeenSubmitted, isAdvance } from './funnel';
import { canonicalJobUrl, jobDedupeKey } from './identity';

export interface TrackedJobInput {
  id?: string;
  company: string;
  role: string;
  url: string;
  ats: AtsId;
  status?: ApplicationStatus;
  trackedAt?: number;
  appliedAt?: number | null;
  source?: ApplicationSource;
  scanId?: string | null;
  notes?: string;
  llmCalls?: number;
  salary?: string;
  nextAction?: string;
  nextActionAt?: number;
  website?: string;
  contact?: string;
}

export function createTrackedJob(init: TrackedJobInput, now = Date.now()): Application {
  const status = init.status ?? 'saved';
  const url = canonicalJobUrl(init.url);
  return {
    id: init.id ?? crypto.randomUUID(),
    company: init.company.trim(),
    role: init.role.trim(),
    url,
    ats: init.ats,
    status,
    trackedAt: init.trackedAt ?? now,
    appliedAt: init.appliedAt ?? (hasBeenSubmitted(status) ? now : null),
    updatedAt: now,
    lastActivityAt: now,
    source: init.source ?? 'detected',
    dedupeKey: jobDedupeKey({ ...init, url }),
    scanId: init.scanId ?? null,
    notes: init.notes?.trim() ?? '',
    llmCalls: Math.max(0, init.llmCalls ?? 0),
    ...(init.salary === undefined ? {} : { salary: init.salary }),
    ...(init.nextAction === undefined ? {} : { nextAction: init.nextAction }),
    ...(init.nextActionAt === undefined ? {} : { nextActionAt: init.nextActionAt }),
    ...(init.website === undefined ? {} : { website: init.website }),
    ...(init.contact === undefined ? {} : { contact: init.contact }),
  };
}

/** Merge an automated revisit without erasing user edits or regressing status. */
export function mergeTrackedJob(
  existing: Application,
  init: TrackedJobInput,
  now = Date.now(),
): Application {
  const requested = init.status ?? existing.status;
  const status = isAdvance(existing.status, requested) ? requested : existing.status;
  const url = canonicalJobUrl(init.url) || existing.url;
  const appliedAt = existing.appliedAt ?? init.appliedAt ??
    (hasBeenSubmitted(status) ? now : null);
  const prefer = (next: string | undefined, current: string) => next?.trim() || current;

  return {
    ...existing,
    company: prefer(init.company, existing.company),
    role: prefer(init.role, existing.role),
    url,
    ats: init.ats,
    status,
    trackedAt: existing.trackedAt ?? init.trackedAt ?? existing.updatedAt,
    appliedAt,
    updatedAt: now,
    lastActivityAt: now,
    source:
      existing.source === 'detected' && init.source
        ? init.source
        : existing.source ?? init.source ?? 'detected',
    dedupeKey: jobDedupeKey({ company: prefer(init.company, existing.company), role: prefer(init.role, existing.role), url }),
    scanId: existing.scanId ?? init.scanId ?? null,
    notes: prefer(init.notes, existing.notes),
    llmCalls: Math.max(0, existing.llmCalls + (init.llmCalls ?? 0)),
    ...(init.salary === undefined ? {} : { salary: init.salary }),
    ...(init.nextAction === undefined ? {} : { nextAction: init.nextAction }),
    ...(init.nextActionAt === undefined ? {} : { nextActionAt: init.nextActionAt }),
    ...(init.website === undefined ? {} : { website: init.website }),
    ...(init.contact === undefined ? {} : { contact: init.contact }),
  };
}
