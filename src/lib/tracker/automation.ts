import { extractPosting } from '@/lib/ats/posting';
import type { AtsId } from '@/lib/fill/records';
import type { TrackedJobInput } from './lifecycle';
import { identifyPosting } from './funnel';
import { jobDedupeKey } from './identity';

export type AutomaticTrackingStatus = 'saved' | 'started';
export type AutomaticTrackedJobInput = TrackedJobInput & {
  status: AutomaticTrackingStatus;
};

export interface PageTrackingContext {
  ats: AtsId;
  host: string;
  title: string;
  url: string;
}

/** Build a tracker row from authoritative page metadata with an editable fallback. */
export function trackedJobForPage(
  doc: Document,
  context: PageTrackingContext,
  status: AutomaticTrackingStatus,
): AutomaticTrackedJobInput | null {
  const posting = extractPosting(doc);
  if (status === 'saved' && !posting) return null;

  const fallback = identifyPosting(context);
  const company = posting?.company.trim() || fallback.company;
  const role = posting?.title.trim() || fallback.role;
  if (!company && !role) return null;

  return {
    company,
    role,
    url: context.url,
    ats: context.ats,
    status,
    source: status === 'saved' ? 'detected' : 'autofill',
    scanId: null,
    notes: '',
    llmCalls: 0,
    ...(posting?.location ? { location: posting.location } : {}),
  };
}

const STATUS_DEPTH: Record<AutomaticTrackingStatus, number> = {
  saved: 1,
  started: 2,
};

/**
 * Coalesce mutation-heavy page signals without turning a transient worker
 * failure into a permanently missed tracker row.
 */
export class TrackingSignalGate {
  private readonly emitted = new Map<string, number>();
  private readonly pending = new Map<string, number>();

  constructor(private readonly limit = 128) {}

  async emit(
    job: AutomaticTrackedJobInput,
    write: (job: TrackedJobInput) => Promise<unknown>,
  ): Promise<boolean> {
    const key = jobDedupeKey(job);
    const depth = STATUS_DEPTH[job.status];
    const known = Math.max(this.emitted.get(key) ?? 0, this.pending.get(key) ?? 0);
    if (known >= depth) return false;

    this.pending.set(key, depth);
    try {
      await write(job);
      const recorded = Math.max(this.emitted.get(key) ?? 0, depth);
      this.emitted.delete(key);
      this.emitted.set(key, recorded);
      while (this.emitted.size > this.limit) {
        const oldest = this.emitted.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.emitted.delete(oldest);
      }
      return true;
    } finally {
      if (this.pending.get(key) === depth) this.pending.delete(key);
    }
  }
}
