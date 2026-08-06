/**
 * Local-first storage. Everything the user owns lives here, in IndexedDB, on
 * their machine — there is no backend to sync to and no account to make.
 *
 * One rule about secrets: **API keys never enter this database.** They live in
 * chrome.storage.local (see lib/llm/keys.ts) precisely so that the `.clankdb`
 * export can dump every table here without leaking a credential.
 *
 * Tables are declared up front even where the feature lands in a later
 * milestone. A schema version bump is cheap now and disruptive once people
 * have data in it.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { ResumeProfile } from '@/types/profile';
import type { ScanResult } from '@/types/ats';
import type { AtsId, RunRecord } from '@/lib/fill/autosubmit';
import type { Deed } from '@/lib/game/economy';

/**
 * Tier 2 of the resolver: a normalised question hash mapped to the answer the
 * user accepted. This is the table that makes the median application free —
 * see lib/fill/normalize.ts.
 */
export interface QuestionAnswer {
  /** questionHash() of the normalised question — the primary key. */
  hash: string;
  /** The normalised form, kept for debugging and for the settings UI. */
  normalized: string;
  /** The question exactly as the last site phrased it. */
  lastSeenRaw: string;
  answer: string;
  /** Which ATSs have asked this. Evidence that a fold was correct. */
  seenOn: AtsId[];
  timesUsed: number;
  lastUsedAt: number;
}

/** Where an application is in the funnel. Drives the M3 board view. */
export type ApplicationStatus =
  | 'applied'
  | 'oa'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'ghosted';

export interface Application {
  id: string;
  company: string;
  role: string;
  /** The posting itself. Notion's "Reference Link" column. */
  url: string;
  ats: AtsId;
  status: ApplicationStatus;
  appliedAt: number;
  updatedAt: number;
  /** The scan that produced this application, when there was one. */
  scanId: string | null;
  notes: string;
  /** LLM calls this application actually cost. The claim is that it is 0. */
  llmCalls: number;

  /* ------------------------------------------------------------- the intel
   *
   * The four columns a job-hunt spreadsheet actually gets used for, which no
   * autofill run can know: what it pays, what you owe it next, where the
   * company lives, and who the human on the other end is.
   *
   * Optional because every one of them is something you learn *after* sending
   * — a row that logged itself is complete without them, and a schema that
   * demanded them at insert time would make logging a chore, which is the one
   * way a tracker dies.
   */

  /** As written: "£85k–100k", "$150,000", "competitive". Parsed for rollups. */
  salary?: string;
  /** The next thing you owe this application. "Chase recruiter", "OA due Fri". */
  nextAction?: string;
  /** The company, not the posting — the posting is `url`. */
  website?: string;
  /** Whoever you are actually talking to. Name, email, or both. */
  contact?: string;
}

/** The game ledger. DP is only ever derived from rows in here. */
export interface DeedRecord {
  id?: number;
  deed: Deed;
  dp: number;
  applicationId: string | null;
  at: number;
}

/** Non-secret preferences. Anything sensitive belongs in chrome.storage. */
export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * A piece of the user's own writing, kept to match their voice when a cover
 * letter is generated.
 *
 * Stored whole rather than summarised into a "style profile": a model given
 * three real paragraphs of someone's prose matches them far better than one
 * given an adjective list, and the samples stay legible and deletable, which
 * a derived embedding would not be.
 */
export interface WritingSample {
  id: string;
  /** What this is — "cover letter, Acme", "personal essay". User's words. */
  label: string;
  text: string;
  addedAt: number;
}

/**
 * A generated cover letter, kept because it cost a model call.
 *
 * Losing one to a closed side panel means paying for it twice, and the whole
 * cost design exists so the user never pays twice for the same thing.
 */
export interface CoverLetter {
  id: string;
  /** The scan it was grounded in, so the evidence behind it stays traceable. */
  scanId: string;
  company: string;
  role: string;
  text: string;
  /** Whether the user has since edited it by hand. */
  edited: boolean;
  createdAt: number;
}

export class ClankerDB extends Dexie {
  profiles!: EntityTable<ResumeProfile, 'id'>;
  questions!: EntityTable<QuestionAnswer, 'hash'>;
  scans!: EntityTable<ScanResult, 'id'>;
  applications!: EntityTable<Application, 'id'>;
  runs!: EntityTable<RunRecord & { id?: number }, 'id'>;
  deeds!: EntityTable<DeedRecord, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  writingSamples!: EntityTable<WritingSample, 'id'>;
  letters!: EntityTable<CoverLetter, 'id'>;

  constructor(name = 'clanker.tracker') {
    super(name);

    this.version(1).stores({
      profiles: 'id, updatedAt',
      questions: 'hash, normalized, lastUsedAt',
      scans: 'id, company, scannedAt',
      applications: 'id, company, status, appliedAt, scanId',
      runs: '++id, ats, at',
      deeds: '++id, deed, at',
      settings: 'key',
    });

    // v2 (M3): the tracker needs to ask "what has this application already
    // banked?" on every status change, because a deed is awarded once per
    // application, ever — dragging a card back and forward must not pay twice.
    // That question is a lookup by applicationId, so it needs an index.
    this.version(2).stores({
      deeds: '++id, deed, at, applicationId',
    });

    // v3: writing samples, collected during setup and used to ground the cover
    // letter in the user's own voice.
    this.version(3).stores({
      writingSamples: 'id, addedAt',
    });

    // v4: generated letters. Indexed by scanId because the question asked of
    // this table is always "what did we write for this posting?".
    this.version(4).stores({
      letters: 'id, scanId, createdAt',
    });

    // v5: the tracker's four intel columns. No `stores` change is needed —
    // Dexie only indexes what you name, and none of these are ever queried by
    // value; they are read whole with the row. The bump is declared anyway so
    // the version history stays a readable account of what the shape did, and
    // `updatedAt` gets an index because the quiet-application sweep now sorts
    // on it rather than filtering the whole table in memory.
    this.version(5).stores({
      applications: 'id, company, status, appliedAt, updatedAt, scanId',
    });
  }
}

export const db = new ClankerDB();
