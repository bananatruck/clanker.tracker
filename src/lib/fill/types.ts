/**
 * The vocabulary of a fill run.
 *
 * `HarvestedField` is deliberately serialisable — no element references — so
 * the side panel can show what was found on the page without holding a handle
 * to the page's DOM. Live elements stay in the content script, keyed by id.
 */
import type { Confidence } from '@/types/profile';

export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file';

export interface FieldOption {
  value: string;
  label: string;
}

export interface HarvestedField {
  /** Stable within one harvest; the key back to the live element. */
  id: string;
  kind: FieldKind;
  /** The `name` attribute, which ATS adapters key off. */
  name: string;
  /** The label a human reads. This is what tiers 2-5 actually match on. */
  label: string;
  required: boolean;
  /** Present for select and radio groups; empty otherwise. */
  options: FieldOption[];
  placeholder: string;
  autocomplete: string;
  /** Value already on the page — a prefilled field is left alone. */
  existingValue: string;
}

/**
 * Which tier answered. The number is the cost story: 1-4 are free, 5 is the
 * only one that spends anything, and the whole design exists to keep the
 * median application from ever reaching it.
 */
export type ResolverTier = 1 | 2 | 3 | 4 | 5;

export const TIER_LABEL: Record<ResolverTier, string> = {
  1: 'site adapter',
  2: 'answer memory',
  3: 'label match',
  4: 'fuzzy match',
  5: 'model',
};

export interface Resolution {
  fieldId: string;
  value: string;
  tier: ResolverTier;
  /**
   * Tiers 1-4 are deterministic and count as `certain`; tier 5 is a model
   * guess and is always `guessed`, which is what keeps it out of a clean run
   * and therefore out of auto-submit eligibility.
   */
  confidence: Confidence;
}

export const resolutionConfidence = (tier: ResolverTier): Confidence =>
  tier === 5 ? 'guessed' : 'certain';

/** A field the chain could not answer at all. */
export interface UnresolvedField {
  fieldId: string;
  reason: 'no-match' | 'budget-exhausted' | 'no-profile';
}

export interface FillPlan {
  resolutions: Resolution[];
  unresolved: UnresolvedField[];
  /** LLM calls actually spent. The claim is that this is 0 for a repeat. */
  llmCalls: number;
}

/** Answers the user gives once and reuses on every application. */
export interface Preferences {
  workAuthorized: string;
  requiresSponsorship: string;
  willingToRelocate: string;
  noticePeriod: string;
  salaryExpectation: string;
  /** EEO. "Decline to self-identify" is a first-class answer, not an absence. */
  gender: string;
  race: string;
  veteranStatus: string;
  disabilityStatus: string;
  pronouns: string;
}

export const emptyPreferences = (): Preferences => ({
  workAuthorized: '',
  requiresSponsorship: '',
  willingToRelocate: '',
  noticePeriod: '',
  salaryExpectation: '',
  gender: '',
  race: '',
  veteranStatus: '',
  disabilityStatus: '',
  pronouns: '',
});
