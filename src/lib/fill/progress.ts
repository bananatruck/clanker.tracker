/**
 * What the fill is doing, while it is doing it.
 *
 * A fill run happens in the content script, in the page's origin, and used to
 * report exactly once — at the end, as a pair of numbers. From the side panel
 * it was a button that did nothing for a second and then said "filled 22".
 * That is the wrong shape for the thing it is: the interesting part is *which*
 * fields it answered, where each answer came from, and which ones it is
 * handing back to you, and all of that is known field by field as it goes.
 *
 * So the run broadcasts. `chrome.runtime.sendMessage` with no tab id reaches
 * every extension page that is listening, which is the side panel, and reaches
 * nobody if it is closed — a broadcast nothing receives is not an error, and
 * the fill must never stall waiting on a UI that may not be open.
 */
import type { ResolverTier } from './types';

/**
 * Where a field ended up.
 *
 * `needs-you` is the one that matters and is deliberately not called "failed":
 * a salary expectation the resolver refuses to invent is the tool working
 * correctly, and the checklist should not scold anyone about it.
 */
export type FieldState = 'pending' | 'filled' | 'needs-you';

export interface FieldProgress {
  id: string;
  /** The question as the site phrased it. */
  label: string;
  required: boolean;
  state: FieldState;
  /** What went in. Empty for anything still pending or handed back. */
  value: string;
  /** Which tier answered, when one did. The cost story, per row. */
  tier: ResolverTier | null;
}

export type FillPhase =
  | 'reading'
  | 'answering'
  | 'reviewing'
  | 'writing'
  | 'done'
  | 'cancelled'
  | 'failed';

export interface FillProgress {
  phase: FillPhase;
  /** Which board, once it is known. */
  ats: string;
  fields: FieldProgress[];
  llmCalls: number;
  /** Set only on `failed`, and only with something a person can act on. */
  error?: string;
}

export const PROGRESS_MESSAGE = 'clanker:progress';

interface ProgressEnvelope {
  type: typeof PROGRESS_MESSAGE;
  progress: FillProgress;
}

export const filledCount = (fields: readonly FieldProgress[]): number =>
  fields.filter((f) => f.state === 'filled').length;

export const needsYouCount = (fields: readonly FieldProgress[]): number =>
  fields.filter((f) => f.state === 'needs-you').length;

/** Whether every field the run touched came back answered. The good ending. */
export const cleanSweep = (fields: readonly FieldProgress[]): boolean =>
  fields.length > 0 && fields.every((f) => f.state === 'filled');

/**
 * Tell whoever is listening. Never throws and never waits.
 *
 * The "Receiving end does not exist" rejection when the panel is closed is the
 * normal case, not a fault, so it is swallowed here rather than handled at
 * every call site inside the run.
 */
export function reportProgress(progress: FillProgress): void {
  try {
    void Promise.resolve(
      chrome.runtime.sendMessage({ type: PROGRESS_MESSAGE, progress } satisfies ProgressEnvelope),
    ).catch(() => {});
  } catch {
    // No chrome, or an invalidated context mid-run. Neither is worth a throw
    // from a progress report.
  }
}

/** Listen from an extension page. Returns the unsubscribe. */
export function onProgress(handler: (progress: FillProgress) => void): () => void {
  const listener = (message: unknown) => {
    const envelope = message as Partial<ProgressEnvelope> | null;
    if (envelope?.type === PROGRESS_MESSAGE && envelope.progress) handler(envelope.progress);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
