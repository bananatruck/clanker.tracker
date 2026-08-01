/**
 * Repositories. Thin, deliberately — anything with real logic belongs in a
 * pure module that can be unit-tested without an IndexedDB, and these
 * functions exist only to move it in and out of storage.
 */
import { db, type Application, type DeedRecord, type QuestionAnswer } from './schema';
import { PRIMARY_PROFILE_ID, type ContactKey, type ResumeProfile } from '@/types/profile';
import type { ScanResult } from '@/types/ats';
import { questionHash, normalizeQuestion } from '@/lib/fill/normalize';
import { dpForDeed, type Deed, type RallyGrade } from '@/lib/game/economy';
import type { AtsId, RunRecord } from '@/lib/fill/autosubmit';

/* ---------------------------------------------------------------- profile */

export function getProfile(id = PRIMARY_PROFILE_ID): Promise<ResumeProfile | undefined> {
  return db.profiles.get(id);
}

export async function saveProfile(profile: ResumeProfile): Promise<void> {
  await db.profiles.put({ ...profile, updatedAt: Date.now() });
}

/**
 * Apply one correction from the review grid.
 *
 * The edit is recorded as `user`/`certain` — a human has now looked at it, so
 * no later re-parse or LLM pass is allowed to downgrade or overwrite it.
 */
export async function correctContactField(
  key: ContactKey,
  value: string,
  id = PRIMARY_PROFILE_ID,
): Promise<void> {
  const profile = await db.profiles.get(id);
  if (!profile) return;

  profile.contact[key] = { value, confidence: 'certain', source: 'user' };
  await saveProfile(profile);
}

/* -------------------------------------------------------- tier 2: answers */

/** Look up a previously accepted answer. Free, and the whole cost argument. */
export async function recallAnswer(rawQuestion: string): Promise<QuestionAnswer | undefined> {
  return db.questions.get(questionHash(rawQuestion));
}

/**
 * Write an accepted answer back to Q&A memory.
 *
 * Called for every field the user accepts *or* corrects in the review overlay,
 * which is why the hit rate climbs from ~35% to ~90% by application #30.
 */
export async function rememberAnswer(
  rawQuestion: string,
  answer: string,
  ats: AtsId,
): Promise<void> {
  const hash = questionHash(rawQuestion);
  const existing = await db.questions.get(hash);

  await db.questions.put({
    hash,
    normalized: normalizeQuestion(rawQuestion),
    lastSeenRaw: rawQuestion,
    answer,
    seenOn: [...new Set([...(existing?.seenOn ?? []), ats])],
    timesUsed: (existing?.timesUsed ?? 0) + 1,
    lastUsedAt: Date.now(),
  });
}

/* ------------------------------------------------------------------ scans */

export async function saveScan(scan: ScanResult): Promise<void> {
  await db.scans.put(scan);
}

export function getScan(id: string): Promise<ScanResult | undefined> {
  return db.scans.get(id);
}

export function recentScans(limit = 20): Promise<ScanResult[]> {
  return db.scans.orderBy('scannedAt').reverse().limit(limit).toArray();
}

/* ----------------------------------------------------------- applications */

export async function saveApplication(app: Application): Promise<void> {
  await db.applications.put({ ...app, updatedAt: Date.now() });
}

export function recentApplications(limit = 50): Promise<Application[]> {
  return db.applications.orderBy('appliedAt').reverse().limit(limit).toArray();
}

/* ------------------------------------------------------------------- runs */

export async function recordFillRun(run: RunRecord): Promise<void> {
  await db.runs.add(run);
}

/* ------------------------------------------------------------- game ledger */

/**
 * Record a deed and the DP it earned.
 *
 * DP is never stored as a running total — it is always the sum of this table.
 * That is what makes "no idle currency can exceed what you actually earned"
 * checkable rather than merely intended.
 */
export async function recordDeed(
  deed: Deed,
  opts: { rally?: RallyGrade; applicationId?: string | null } = {},
): Promise<number> {
  const dp = dpForDeed(deed, opts.rally ?? 'none');
  await db.deeds.add({
    deed,
    dp,
    applicationId: opts.applicationId ?? null,
    at: Date.now(),
  } satisfies DeedRecord);
  return dp;
}

export async function totalDp(): Promise<number> {
  let sum = 0;
  await db.deeds.each((d) => {
    sum += d.dp;
  });
  return sum;
}

/** DP earned in the trailing week — the ceiling input for the idle trickle. */
export async function trailingWeekDp(now = Date.now()): Promise<number> {
  const since = now - 7 * 24 * 60 * 60 * 1000;
  let sum = 0;
  await db.deeds.where('at').above(since).each((d) => {
    sum += d.dp;
  });
  return sum;
}

/* --------------------------------------------------------------- settings */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
