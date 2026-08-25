/**
 * Repositories. Thin, deliberately — anything with real logic belongs in a
 * pure module that can be unit-tested without an IndexedDB, and these
 * functions exist only to move it in and out of storage.
 */
import {
  db,
  type Application,
  type ApplicationEvent,
  type ApplicationSession,
  type ApplicationStatus,
  type CoverLetter,
  type DeedRecord,
  type QuestionAnswer,
  type StoredDocument,
  type WritingSample,
} from './schema';
import {
  PRIMARY_PROFILE_ID,
  normalizeProfile,
  type ContactKey,
  type EducationEntry,
  type ExperienceEntry,
  type ProjectEntry,
  type ResumeProfile,
} from '@/types/profile';
import type { ScanResult } from '@/types/ats';
import { normalizeQuestion } from '@/lib/fill/normalize';
import { deedsToAward, hasBeenSubmitted } from '@/lib/tracker/funnel';
import { intelToAward } from '@/lib/tracker/table';
import { dpForDeed, type Deed, type RallyGrade } from '@/lib/game/economy';
import type { AtsId, RunRecord } from '@/lib/fill/records';
import { resumeDocumentFromFile } from '@/lib/resume/document';
import { answerKey, type AnswerContext } from '@/lib/fill/memory';
import { checkpointSession } from '@/lib/fill/session';
import {
  createTrackedJob,
  mergeTrackedJob,
  type TrackedJobInput,
} from '@/lib/tracker/lifecycle';
import { canonicalJobUrl, jobDedupeKey } from '@/lib/tracker/identity';

/* ---------------------------------------------------------------- profile */

export async function getProfile(id = PRIMARY_PROFILE_ID): Promise<ResumeProfile | undefined> {
  const profile = await db.profiles.get(id);
  return profile ? normalizeProfile(profile) : undefined;
}

export async function saveProfile(profile: ResumeProfile): Promise<void> {
  await db.profiles.put({ ...normalizeProfile(profile), updatedAt: Date.now() });
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
  const profile = await getProfile(id);
  if (!profile) return;

  profile.contact[key] = { value, confidence: 'certain', source: 'user' };
  await saveProfile(profile);
}

/**
 * Edit one experience entry.
 *
 * Like a contact correction, a hand-edited entry is promoted to `certain`: a
 * human has now read it, so no later re-parse gets to call it a guess again.
 */
export async function correctExperience(
  entryId: string,
  patch: Partial<Omit<ExperienceEntry, 'id'>>,
  id = PRIMARY_PROFILE_ID,
): Promise<void> {
  const profile = await getProfile(id);
  if (!profile) return;

  profile.experience = profile.experience.map((e) =>
    e.id === entryId ? { ...e, ...patch, confidence: 'certain', source: 'user' } : e,
  );
  await saveProfile(profile);
}

export async function correctEducation(
  entryId: string,
  patch: Partial<Omit<EducationEntry, 'id'>>,
  id = PRIMARY_PROFILE_ID,
): Promise<void> {
  const profile = await getProfile(id);
  if (!profile) return;

  profile.education = profile.education.map((e) =>
    e.id === entryId ? { ...e, ...patch, confidence: 'certain', source: 'user' } : e,
  );
  await saveProfile(profile);
}

export async function correctProject(
  entryId: string,
  patch: Partial<Omit<ProjectEntry, 'id'>>,
  id = PRIMARY_PROFILE_ID,
): Promise<void> {
  const profile = await getProfile(id);
  if (!profile) return;

  profile.projects = profile.projects.map((project) =>
    project.id === entryId
      ? { ...project, ...patch, confidence: 'certain', source: 'user' }
      : project,
  );
  await saveProfile(profile);
}

/** Drop an entry the parser invented, or one the user no longer wants sent. */
export async function removeEntry(
  kind: 'experience' | 'education' | 'project',
  entryId: string,
  id = PRIMARY_PROFILE_ID,
): Promise<void> {
  const profile = await getProfile(id);
  if (!profile) return;

  if (kind === 'experience') {
    profile.experience = profile.experience.filter((e) => e.id !== entryId);
  } else if (kind === 'education') {
    profile.education = profile.education.filter((e) => e.id !== entryId);
  } else {
    profile.projects = profile.projects.filter((project) => project.id !== entryId);
  }
  await saveProfile(profile);
}

/**
 * Replace the skills list.
 *
 * Skills are mined loosely on purpose — a capitalised word in a bullet is
 * weak evidence — so pruning them by hand is expected rather than exceptional,
 * and the ATS scan gets sharper every time it happens.
 */
export async function setSkills(skills: string[], id = PRIMARY_PROFILE_ID): Promise<void> {
  const profile = await getProfile(id);
  if (!profile) return;

  // Case-insensitive dedupe, first spelling wins.
  const seen = new Set<string>();
  profile.skills = skills
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()) !== undefined);

  await saveProfile(profile);
}

/** Throw the profile away. The only way to start over from a different resume. */
export async function deleteProfile(id = PRIMARY_PROFILE_ID): Promise<void> {
  await db.transaction('rw', db.profiles, db.documents, async () => {
    await db.profiles.delete(id);
    await db.documents.delete('primary-resume');
  });
}

/* ------------------------------------------------------------- documents */

/** Retain the original bytes locally; parsing text alone cannot reattach it. */
export async function saveResumeDocument(file: File): Promise<void> {
  await db.documents.put(await resumeDocumentFromFile(file));
}

export function getResumeDocument(): Promise<StoredDocument | undefined> {
  return db.documents.get('primary-resume');
}

export async function clearResumeDocument(): Promise<void> {
  await db.documents.delete('primary-resume');
}

/* -------------------------------------------------------- tier 2: answers */

/** Look up a previously accepted answer. Free, and the whole cost argument. */
export async function recallAnswer(
  rawQuestion: string,
  context: AnswerContext = {},
): Promise<QuestionAnswer | undefined> {
  return db.questions.get(answerKey(rawQuestion, context));
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
  context: AnswerContext = {},
): Promise<void> {
  const hash = answerKey(rawQuestion, context);
  const existing = await db.questions.get(hash);

  await db.questions.put({
    hash,
    normalized: normalizeQuestion(rawQuestion),
    lastSeenRaw: rawQuestion,
    answer,
    seenOn: [...new Set([...(existing?.seenOn ?? []), ats])],
    timesUsed: (existing?.timesUsed ?? 0) + 1,
    lastUsedAt: Date.now(),
    semanticPath: context.semanticPath,
    optionSignature: context.optionSignature,
  });
}

/** All user-approved answers, newest use first, for review in Settings. */
export function rememberedAnswers(): Promise<QuestionAnswer[]> {
  return db.questions.orderBy('lastUsedAt').reverse().toArray();
}

/** Correct an answer without changing the question/context key that recalls it. */
export async function updateRememberedAnswer(hash: string, answer: string): Promise<void> {
  const value = answer.trim();
  if (!value) return;
  await db.questions.update(hash, { answer: value, lastUsedAt: Date.now() });
}

export async function forgetRememberedAnswer(hash: string): Promise<void> {
  await db.questions.delete(hash);
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
  const now = Date.now();
  const url = canonicalJobUrl(app.url);
  await db.applications.put({
    ...app,
    url,
    trackedAt: app.trackedAt ?? app.appliedAt ?? now,
    lastActivityAt: now,
    source: app.source ?? 'legacy',
    dedupeKey: jobDedupeKey({ ...app, url }),
    updatedAt: now,
  });
}

export function recentApplications(limit = 50): Promise<Application[]> {
  return db.applications.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export function allApplications(): Promise<Application[]> {
  return db.applications.orderBy('updatedAt').reverse().toArray();
}

export function getApplication(id: string): Promise<Application | undefined> {
  return db.applications.get(id);
}

export function applicationEvents(applicationId: string): Promise<ApplicationEvent[]> {
  return db.applicationEvents.where('applicationId').equals(applicationId).sortBy('at');
}

/** Deeds this application has already banked. The anti-farming key. */
export async function bankedDeeds(applicationId: string): Promise<Deed[]> {
  const rows = await db.deeds.where('applicationId').equals(applicationId).toArray();
  return rows.map((r) => r.deed);
}

/** Upsert one posting by canonical identity and retain its lifecycle event. */
export async function trackApplication(
  init: TrackedJobInput,
  opts: { rally?: RallyGrade } = {},
): Promise<Application> {
  const now = Date.now();
  const dedupeKey = jobDedupeKey(init);
  const existing = dedupeKey === 'text:\u001f'
    ? undefined
    : await db.applications.where('dedupeKey').equals(dedupeKey).first();
  const app = existing
    ? mergeTrackedJob(existing, init, now)
    : createTrackedJob(init, now);
  const changedStatus = existing?.status !== app.status;

  await db.transaction('rw', db.applications, db.applicationEvents, async () => {
    await db.applications.put(app);
    if (!existing) {
      await db.applicationEvents.add({
        applicationId: app.id,
        kind: 'created',
        at: app.trackedAt ?? now,
        toStatus: app.status,
        detail: app.source,
      });
    } else if (changedStatus) {
      await db.applicationEvents.add({
        applicationId: app.id,
        kind: app.status === 'applied' ? 'submitted' : 'status',
        at: now,
        fromStatus: existing.status,
        toStatus: app.status,
      });
    }
  });

  for (const deed of deedsToAward(app.status, await bankedDeeds(app.id))) {
    await recordDeed(deed, { rally: opts.rally, applicationId: app.id });
  }

  return app;
}

/** A confirmed or manually entered submission starts at Applied by default. */
export function logApplication(
  init: TrackedJobInput,
  opts: { rally?: RallyGrade } = {},
): Promise<Application> {
  return trackApplication({
    ...init,
    status: init.status ?? 'applied',
    appliedAt: init.appliedAt ?? Date.now(),
    source: init.source ?? 'manual',
  }, opts);
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

  const now = Date.now();
  await db.transaction('rw', db.applications, db.applicationEvents, async () => {
    await db.applications.update(id, {
      status,
      appliedAt: app.appliedAt ?? (hasBeenSubmitted(status) ? now : null),
      updatedAt: now,
      lastActivityAt: now,
    });
    await db.applicationEvents.add({
      applicationId: id,
      kind: status === 'applied' ? 'submitted' : 'status',
      at: now,
      fromStatus: app.status,
      toStatus: status,
    });
  });

  let earned = 0;
  for (const deed of deedsToAward(status, await bankedDeeds(id))) {
    earned += await recordDeed(deed, { rally: opts.rally, applicationId: id });
  }
  return earned;
}

/**
 * Edit a row in the tracker table, and bank the intel deed if that completed it.
 *
 * The return value is the DP the edit earned, so the table can show it the way
 * the board shows a status move. Zero is the overwhelmingly common case and is
 * not a failure — most edits fill in one of four columns.
 *
 * The award rule is the same one the funnel uses and for the same reason: the
 * deed is keyed on what this application has already banked, so filling the
 * last column, clearing it, and filling it again pays once. Clearing a column
 * never claws the DP back — you did the research, and deleting a note about it
 * later is not a reason to take a level away.
 */
export async function updateApplication(
  id: string,
  patch: Partial<
    Pick<
      Application,
      'company' | 'role' | 'url' | 'notes' | 'salary' | 'nextAction' | 'nextActionAt' | 'website' | 'contact'
    >
  >,
): Promise<number> {
  const before = await db.applications.get(id);
  if (!before) return 0;

  const now = Date.now();
  const next = {
    ...patch,
    ...(patch.url === undefined ? {} : { url: canonicalJobUrl(patch.url) }),
  };
  const merged = { ...before, ...next };
  await db.transaction('rw', db.applications, db.applicationEvents, async () => {
    await db.applications.update(id, {
      ...next,
      dedupeKey: jobDedupeKey(merged),
      updatedAt: now,
      lastActivityAt: now,
    });
    await db.applicationEvents.add({
      applicationId: id,
      kind: patch.nextActionAt === undefined ? 'updated' : 'follow-up',
      at: now,
      detail: Object.keys(patch).join(', '),
    });
  });

  let earned = 0;
  for (const deed of intelToAward(merged, await bankedDeeds(id))) {
    earned += await recordDeed(deed, { applicationId: id });
  }
  return earned;
}

/**
 * Forget an application. Its deeds stay in the ledger deliberately: you did
 * the work, and deleting a row from your own tracker is not a reason to take
 * a level back.
 */
export async function deleteApplication(id: string): Promise<void> {
  await db.transaction('rw', db.applications, db.applicationEvents, async () => {
    await db.applications.delete(id);
    await db.applicationEvents.where('applicationId').equals(id).delete();
  });
}

/* ------------------------------------------------------------------- runs */

export async function recordFillRun(run: RunRecord): Promise<void> {
  await db.runs.add(run);
}

/* ------------------------------------------------------ application flow */

const SESSION_MAX_AGE = 12 * 60 * 60 * 1000;
const sessionId = (tabId: number) => `tab-${tabId}`;

export async function getApplicationSession(
  tabId: number,
  ats: AtsId,
): Promise<ApplicationSession | undefined> {
  const id = sessionId(tabId);
  const session = await db.applicationSessions.get(id);
  if (!session || session.status === 'complete') return undefined;
  if (session.ats !== ats || Date.now() - session.updatedAt > SESSION_MAX_AGE) {
    await db.applicationSessions.delete(id);
    return undefined;
  }
  return session;
}

export async function touchApplicationSession(
  tabId: number,
  init: Pick<ApplicationSession, 'ats' | 'url' | 'pageKey' | 'completedPaths'>,
): Promise<ApplicationSession> {
  const existing = await getApplicationSession(tabId, init.ats);
  const session = checkpointSession(existing, tabId, init);
  await db.applicationSessions.put(session);
  return session;
}

export async function completeApplicationSession(tabId: number): Promise<void> {
  const id = sessionId(tabId);
  const existing = await db.applicationSessions.get(id);
  if (existing) {
    await db.applicationSessions.put({ ...existing, status: 'complete', updatedAt: Date.now() });
  }
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

/* -------------------------------------------------------- writing samples */

export function writingSamples(): Promise<WritingSample[]> {
  return db.writingSamples.orderBy('addedAt').reverse().toArray();
}

export async function addWritingSample(label: string, text: string): Promise<WritingSample> {
  const sample: WritingSample = {
    id: crypto.randomUUID(),
    label: label.trim() || 'Untitled',
    text: text.trim(),
    addedAt: Date.now(),
  };
  await db.writingSamples.put(sample);
  return sample;
}

export async function deleteWritingSample(id: string): Promise<void> {
  await db.writingSamples.delete(id);
}

/* ---------------------------------------------------------------- letters */

export function lettersForScan(scanId: string): Promise<CoverLetter[]> {
  return db.letters.where('scanId').equals(scanId).reverse().sortBy('createdAt');
}

export function recentLetters(limit = 20): Promise<CoverLetter[]> {
  return db.letters.orderBy('createdAt').reverse().limit(limit).toArray();
}

export async function saveLetter(
  init: Omit<CoverLetter, 'id' | 'createdAt' | 'edited'> & Partial<Pick<CoverLetter, 'id' | 'edited'>>,
): Promise<CoverLetter> {
  const letter: CoverLetter = {
    id: init.id ?? crypto.randomUUID(),
    scanId: init.scanId,
    company: init.company,
    role: init.role,
    text: init.text,
    edited: init.edited ?? false,
    createdAt: Date.now(),
  };
  await db.letters.put(letter);
  return letter;
}

/** Hand-edits mark the letter so a regenerate can warn before discarding them. */
export async function updateLetterText(id: string, text: string): Promise<void> {
  await db.letters.update(id, { text, edited: true });
}

export async function deleteLetter(id: string): Promise<void> {
  await db.letters.delete(id);
}

/* --------------------------------------------------------------- settings */

/** Whether first-run setup has been completed. Gates the welcome tab. */
export const SETUP_DONE_KEY = 'setup.completed';
/** The page to restore after a refresh or an accidentally closed setup tab. */
export const SETUP_STEP_KEY = 'setup.step';
/** The furthest page reached, so completed setup pages remain revisitable. */
export const SETUP_FURTHEST_KEY = 'setup.furthest';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
