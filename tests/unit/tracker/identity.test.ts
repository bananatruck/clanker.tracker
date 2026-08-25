import { describe, expect, it } from 'vitest';
import { canonicalJobUrl, jobDedupeKey } from '@/lib/tracker/identity';

describe('job identity', () => {
  it('removes fragments and tracking parameters without losing the job id', () => {
    expect(canonicalJobUrl(
      'https://Jobs.Example.com/roles/42/?utm_source=mail&currentJobId=42#apply',
    )).toBe('https://jobs.example.com/roles/42?currentJobId=42');
  });

  it('deduplicates repeated tracked links for the same posting', () => {
    const plain = jobDedupeKey({
      url: 'https://jobs.example.com/roles/42', company: 'Acme', role: 'Engineer',
    });
    const tracked = jobDedupeKey({
      url: 'https://jobs.example.com/roles/42/?utm_campaign=spring#top',
      company: 'Anything',
      role: 'Anything',
    });
    expect(tracked).toBe(plain);
  });

  it('falls back to normalized company and role when there is no URL', () => {
    expect(jobDedupeKey({ url: '', company: 'ACME, Inc.', role: 'Staff Engineer' })).toBe(
      jobDedupeKey({ url: '', company: 'acme inc', role: 'staff-engineer' }),
    );
  });
});
