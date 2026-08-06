/**
 * The ATS scan: what a posting asks for, and what in your resume answers it.
 *
 * The output is deliberately a *table*, not a score. A percentage tells you
 * nothing actionable; "they want Kubernetes and nothing in your resume says
 * Kubernetes" tells you what to write next.
 */

/** How badly the posting wants it. Extracted from the stem, not guessed. */
export type Necessity = 'required' | 'preferred';

/** Rough bucket, used only for grouping the table into readable sections. */
export type RequirementKind =
  | 'skill'
  | 'experience'
  | 'education'
  | 'responsibility'
  | 'other';

export interface Requirement {
  id: string;
  /** The requirement as the posting phrased it, trimmed but not reworded. */
  text: string;
  necessity: Necessity;
  kind: RequirementKind;
  /** Years demanded, when the posting states a number ("5+ years of Go"). */
  years: number | null;
  /** Content tokens used for matching — stopwords and boilerplate removed. */
  keywords: string[];
}

/** Whether the profile answers a requirement, and with what. */
export type Coverage = 'covered' | 'partial' | 'gap';

export interface Evidence {
  experienceId: string;
  company: string;
  title: string;
  text: string;
  /** 0-1 lexical overlap against the requirement's keywords. */
  score: number;
  /** Which of the requirement's keywords this bullet actually contains. */
  matched: string[];
}

export interface EvidenceRow {
  requirement: Requirement;
  coverage: Coverage;
  /** Best evidence first; empty when coverage is `gap`. */
  evidence: Evidence[];
  /** Requirement keywords found nowhere in the profile. The gap, literally. */
  missing: string[];
}

export interface ScanResult {
  id: string;
  jobTitle: string;
  company: string;
  /** The JD text as scanned, kept so a re-scan needs no re-paste. */
  jdText: string;
  rows: EvidenceRow[];
  scannedAt: number;
}

/**
 * Headline counts for the scan. Required gaps are the number that matters —
 * a preferred gap is a nice-to-have, a required gap is why you got filtered.
 */
export function scanSummary(rows: readonly EvidenceRow[]): {
  total: number;
  covered: number;
  partial: number;
  gaps: number;
  requiredGaps: number;
} {
  return {
    total: rows.length,
    covered: rows.filter((r) => r.coverage === 'covered').length,
    partial: rows.filter((r) => r.coverage === 'partial').length,
    gaps: rows.filter((r) => r.coverage === 'gap').length,
    requiredGaps: rows.filter(
      (r) => r.coverage === 'gap' && r.requirement.necessity === 'required',
    ).length,
  };
}

/** Maps coverage onto the shared confidence colours. */
export const COVERAGE_COLOR: Record<Coverage, string> = {
  covered: 'text-ok',
  partial: 'text-warn',
  gap: 'text-bad',
};
