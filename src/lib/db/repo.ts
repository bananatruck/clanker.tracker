/**
 * Repositories. Thin, deliberately — anything with real logic belongs in a
 * pure module that can be unit-tested without an IndexedDB, and these
 * functions exist only to move it in and out of storage.
 */
import {
  db,
  type Application,
  type ApplicationStatus,
  type DeedRecord,
  type QuestionAnswer,
} from './schema';
import { PRIMARY_PROFILE_ID, type ContactKey, type ResumeProfile } from '@/types/profile';
import type { ScanResult } from '@/types/ats';
import { questionHash, normalizeQuestion } from '@/lib/fill/normalize';
import { deedsToAward } from '@/lib/tracker/funnel';
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

export function allApplications(): Promise<Application[]> {
  return db.applications.orderBy('appliedAt').reverse().toArray();
}

export function getApplication(id: string): Promise<Application | undefined> {
  return db.applications.get(id);
}

/** Deeds this application has already banked. The anti-farming key. */
export async function bankedDeeds(applicationId: string): Promise<Deed[]> {
  const rows = await db.deeds.where('applicationId').equals(applicationId).toArray();
  return rows.map((r) => r.deed);
}

/**
 * Log a new application and bank the deed for it.
 *
 * Called automatically after a submitted fill, and manually from the board for
 * everything filled in by hand — plenty of applications are an email, and a
 * tracker that only counts the ones this tool touched would be lying about
 * the size of the crusade.
 */
export async function logApplication(
  init: Omit<Application, 'id' | 'status' | 'appliedAt' | 'updatedAt'> &
    Partial<Pick<Application, 'id' | 'status' | 'appliedAt'>>,
  opts: { rally?: RallyGrade } = {},
): Promise<Application> {
  const now = Date.now();
  const app: Application = {
    id: init.id ?? crypto.randomUUID(),
    company: init.company,
    role: init.role,
    url: init.url,
    ats: init.ats,
    status: init.status ?? 'applied',
    appliedAt: init.appliedAt ?? now,
    updatedAt: now,
    scanId: init.scanId,
    notes: init.notes,
    llmCalls: init.llmCalls,
  };

  await db.applications.put(app);

  for (const deed of deedsToAward(app.status, [])) {
    await recordDeed(deed, { rally: opts.rally, applicationId: app.id });
  }

  return app;
}

/**
 * Move an application through the funnel, banking any deed it has not earned
 * yet.
 *
 * The deed is awarded once per application per kind, ever. Dragging a card
 * back to Applied and forward to Interview again pays nothing the second time
 * — and going backwards never claws DP back, because nothing in this economy
 * decays. See lib/tracker/funnel.ts.
 */
export async function setApplicationStatus(
  id: string,
  status: ApplicationStatus,
  opts: { rally?: RallyGrade } = {},
): Promise<number> {
  const app = await db.applications.get(id);
  if (!app || app.status === status) return 0;

  await db.applications.update(id, { status, updatedAt: Date.now() });

  let earned = 0;
  for (const deed of deedsToAward(status, await bankedDeeds(id))) {
    earned += await recordDeed(deed, { rally: opts.rally, applicationId: id });
  }
  return earned;
}

export async function updateApplication(
  id: string,
  patch: Partial<Pick<Application, 'company' | 'role' | 'url' | 'notes'>>,
): Promise<void> {
  await db.applications.update(id, { ...patch, updatedAt: Date.now() });
}

/**
 * Forget an application. Its deeds stay in the ledger deliberately: you did
 * the work, and deleting a row from your own tracker is not a reason to take
 * a level back.
 */
export async function deleteApplication(id: string): Promise<void> {
  await db.applications.delete(id);
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
