import { describe, expect, it } from 'vitest';
import { createTrackedJob, mergeTrackedJob } from '@/lib/tracker/lifecycle';

describe('tracked job lifecycle', () => {
  it('starts detected postings as saved rather than pretending they were sent', () => {
    const app = createTrackedJob({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42', ats: 'generic',
    }, 100);
    expect(app).toMatchObject({ status: 'saved', trackedAt: 100, appliedAt: null });
  });

  it('merges a repeated visit and advances one record from saved to applied', () => {
    const saved = createTrackedJob({
      id: 'one', company: 'Acme', role: 'Engineer',
      url: 'https://jobs.test/42?utm_source=mail', ats: 'greenhouse', status: 'saved',
    }, 100);
    const applied = mergeTrackedJob(saved, {
      company: '', role: '', url: 'https://jobs.test/42', ats: 'greenhouse',
      status: 'applied', source: 'autofill', llmCalls: 1,
    }, 200);
    expect(applied).toMatchObject({
      id: 'one', company: 'Acme', role: 'Engineer', status: 'applied', appliedAt: 200,
      llmCalls: 1,
    });
    expect(applied.dedupeKey).toBe(saved.dedupeKey);
  });

  it('does not regress a terminal row when the posting is detected again', () => {
    const rejected = createTrackedJob({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42',
      ats: 'generic', status: 'rejected', notes: 'No',
    }, 100);
    const revisited = mergeTrackedJob(rejected, {
      company: '', role: '', url: 'https://jobs.test/42', ats: 'generic', status: 'saved',
    }, 200);
    expect(revisited.status).toBe('rejected');
    expect(revisited.notes).toBe('No');
  });

  it('does not invent a submission for a posting withdrawn before applying', () => {
    const withdrawn = createTrackedJob({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42',
      ats: 'generic', status: 'withdrawn',
    }, 100);
    expect(withdrawn.appliedAt).toBeNull();
  });
});
