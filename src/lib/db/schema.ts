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

export class ClankerDB extends Dexie {
  profiles!: EntityTable<ResumeProfile, 'id'>;
  questions!: EntityTable<QuestionAnswer, 'hash'>;
  scans!: EntityTable<ScanResult, 'id'>;
  applications!: EntityTable<Application, 'id'>;
  runs!: EntityTable<RunRecord & { id?: number }, 'id'>;
  deeds!: EntityTable<DeedRecord, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

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
  }
}

export const db = new ClankerDB();
