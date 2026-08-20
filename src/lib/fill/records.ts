/** Shared identifiers and measured outcomes for reviewed autofill runs. */
export type AtsId =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'workday'
  | 'linkedin'
  | 'smartrecruiters'
  | 'icims'
  | 'jobvite'
  | 'generic';

export interface RunRecord {
  ats: AtsId;
  totalFields: number;
  /** Fields resolved by deterministic tiers 1–4. */
  certainFields: number;
  /** Fields the user changed in the review overlay. */
  correctedFields: number;
  /** Required fields still empty after verified page writes. */
  unfilledRequired: number;
  at: number;
}
