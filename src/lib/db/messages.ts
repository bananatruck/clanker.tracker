/**
 * The database lives in the background worker. This is how everyone else asks
 * it questions.
 *
 * Not an abstraction for its own sake — a correctness fix. A content script
 * runs in the *page's* origin, so `indexedDB` inside one is the job board's
 * database, not ours. Calling the repository directly from a content script
 * therefore looked like it worked and silently did the wrong thing:
 *
 *   - `getProfile()` always returned undefined, so every fill reported "no
 *     resume yet" no matter how many you had added;
 *   - answer memory — tier 2, the entire reason the median application is
 *     free — accumulated in greenhouse.io's storage and was never read back;
 *   - applications logged on submit went into the job board's database and
 *     never appeared in the tracker.
 *
 * chrome.storage is shared across contexts, which is why the API key worked
 * and made the split even harder to spot. IndexedDB is not.
 *
 * Keeping Dexie out of the content bundle is a happy side effect: it drops
 * ~90kB from every page we inject into.
 */
import type { AtsId, RunRecord } from '@/lib/fill/autosubmit';
import type { Application } from './schema';

export type DbRequest =
  | { type: 'db:getProfile' }
  | { type: 'db:bark' }
  | { type: 'db:getSetting'; key: string; fallback: unknown }
  | { type: 'db:recallAnswer'; question: string }
  | { type: 'db:rememberAnswer'; question: string; answer: string; ats: AtsId }
  | { type: 'db:recordFillRun'; run: RunRecord }
  | {
      type: 'db:logApplication';
      init: Omit<Application, 'id' | 'status' | 'appliedAt' | 'updatedAt'>;
    };

export type DbResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Anything the worker owns is reached through here. */
export async function askBackground<T>(request: DbRequest): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(request)) as DbResponse<T> | undefined;

  if (!reply) {
    // No listener, or the worker died mid-call. Worth naming precisely: this
    // used to manifest as an empty profile rather than an error.
    throw new Error('background worker did not respond');
  }
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}
