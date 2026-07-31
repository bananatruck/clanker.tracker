import { describe, it, expect } from 'vitest';
import {
  isCleanRun,
  isEligible,
  shouldAutoSubmit,
  recordRun,
  initialAutoSubmitState,
  type RunRecord,
} from '@/lib/fill/autosubmit';

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  ats: 'greenhouse',
  totalFields: 12,
  certainFields: 12,
  correctedFields: 0,
  unfilledRequired: 0,
  at: Date.now(),
  ...over,
});

describe('auto-submit gate', () => {
  it('is off before any run has happened', () => {
    const s = initialAutoSubmitState();
    expect(isEligible(s, 'greenhouse')).toBe(false);
    expect(shouldAutoSubmit(s, run())).toBe(false);
  });

  it('needs both a banked clean run and an explicit toggle', () => {
    let s = recordRun(initialAutoSubmitState(), run());
    expect(isEligible(s, 'greenhouse')).toBe(true);
    // Eligible, but the user has not turned it on.
    expect(shouldAutoSubmit(s, run())).toBe(false);

    s = { ...s, enabledFor: { greenhouse: true } };
    expect(shouldAutoSubmit(s, run())).toBe(true);
  });

  it('treats a run with any correction, guess, or gap as dirty', () => {
    expect(isCleanRun(run({ correctedFields: 1 }))).toBe(false);
    expect(isCleanRun(run({ unfilledRequired: 1 }))).toBe(false);
    expect(isCleanRun(run({ certainFields: 11 }))).toBe(false); // one LLM guess
    expect(isCleanRun(run({ totalFields: 0, certainFields: 0 }))).toBe(false);
  });

  it('never grants eligibility to the generic fallback', () => {
    const s = recordRun(initialAutoSubmitState(), run({ ats: 'generic' }));
    expect(isEligible(s, 'generic')).toBe(false);
    expect(shouldAutoSubmit({ ...s, enabledFor: { generic: true } }, run({ ats: 'generic' })))
      .toBe(false);
  });

  it('is per-site, not global', () => {
    const s = { ...recordRun(initialAutoSubmitState(), run()), enabledFor: { greenhouse: true } };
    expect(shouldAutoSubmit(s, run({ ats: 'lever' }))).toBe(false);
  });

  it('revokes the toggle and the credit when a form drifts', () => {
    let s = recordRun(initialAutoSubmitState(), run());
    s = { ...s, enabledFor: { greenhouse: true } };

    s = recordRun(s, run({ correctedFields: 2 }));
    expect(s.enabledFor.greenhouse).toBe(false);
    expect(s.cleanRuns.greenhouse).toBe(0);
    expect(isEligible(s, 'greenhouse')).toBe(false);
  });

  it('blocks a dirty submission even while enabled', () => {
    const s = { ...recordRun(initialAutoSubmitState(), run()), enabledFor: { greenhouse: true } };
    expect(shouldAutoSubmit(s, run({ unfilledRequired: 1 }))).toBe(false);
  });
});
