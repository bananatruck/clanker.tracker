/**
 * Auto-submit — opt-in, per-site, and earned rather than granted.
 *
 * The default is always fill-and-review. A site only becomes eligible for
 * auto-submit after at least one verified clean run on it: every field
 * resolved, nothing low-confidence, and the user corrected nothing in the
 * review overlay. That is the "only after extensive testing i.e. at least
 * 1 run" requirement, made mechanical rather than advisory.
 *
 * Eligibility is per-ATS, never global, and any dirty run revokes it.
 */

export type AtsId =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'workday'
  | 'linkedin'
  | 'generic';

/** Outcome of one completed fill, recorded whether or not it was submitted. */
export interface RunRecord {
  ats: AtsId;
  totalFields: number;
  /** Fields resolved by tiers 1-4 (deterministic, free). */
  certainFields: number;
  /** Fields the user edited in the review overlay. */
  correctedFields: number;
  /** Required fields left empty after the fill. */
  unfilledRequired: number;
  at: number;
}

export interface AutoSubmitState {
  /** User has flipped the toggle on for this ATS. */
  enabledFor: Partial<Record<AtsId, boolean>>;
  /** Clean runs recorded per ATS. */
  cleanRuns: Partial<Record<AtsId, number>>;
}

/** Minimum clean runs before the toggle can be switched on at all. */
export const REQUIRED_CLEAN_RUNS = 1;

/** Seconds the cancellable countdown runs before a submit actually fires. */
export const COUNTDOWN_SECONDS = 5;

/**
 * A run is clean only if nothing was guessed, corrected, or left empty.
 * The generic fallback can never be clean — it has no verified selector map,
 * so it never earns auto-submit.
 */
export function isCleanRun(run: RunRecord): boolean {
  if (run.ats === 'generic') return false;
  if (run.totalFields === 0) return false;
  return (
    run.correctedFields === 0 &&
    run.unfilledRequired === 0 &&
    run.certainFields === run.totalFields
  );
}

/** Whether the user is allowed to turn the toggle on for this ATS yet. */
export function isEligible(state: AutoSubmitState, ats: AtsId): boolean {
  if (ats === 'generic') return false;
  return (state.cleanRuns[ats] ?? 0) >= REQUIRED_CLEAN_RUNS;
}

/** Whether this specific submission may fire without stopping for review. */
export function shouldAutoSubmit(
  state: AutoSubmitState,
  run: RunRecord,
): boolean {
  return (
    isEligible(state, run.ats) &&
    state.enabledFor[run.ats] === true &&
    isCleanRun(run)
  );
}

/**
 * Fold a completed run into eligibility.
 *
 * A clean run banks credit. A dirty run on an enabled site revokes both the
 * toggle and the credit — if the form changed enough to need a correction,
 * it has earned its review back.
 */
export function recordRun(
  state: AutoSubmitState,
  run: RunRecord,
): AutoSubmitState {
  if (isCleanRun(run)) {
    return {
      ...state,
      cleanRuns: {
        ...state.cleanRuns,
        [run.ats]: (state.cleanRuns[run.ats] ?? 0) + 1,
      },
    };
  }

  return {
    enabledFor: { ...state.enabledFor, [run.ats]: false },
    cleanRuns: { ...state.cleanRuns, [run.ats]: 0 },
  };
}

export const initialAutoSubmitState = (): AutoSubmitState => ({
  enabledFor: {},
  cleanRuns: {},
});
