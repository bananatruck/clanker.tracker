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

  it('preserves hash routes when the fragment identifies the job', () => {
    const first = jobDedupeKey({
      url: 'https://careers.example.com/#/jobs/42', company: '', role: '',
    });
    const second = jobDedupeKey({
      url: 'https://careers.example.com/#/jobs/43', company: '', role: '',
    });
    expect(first).not.toBe(second);
    expect(canonicalJobUrl('https://careers.example.com/#/jobs/42'))
      .toBe('https://careers.example.com/#/jobs/42');
  });

  it('drops Workday search context once the path already identifies the posting', () => {
    expect(canonicalJobUrl(
      'https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/Engineer_REQ-42?q=engineer',
    )).toBe('https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/Engineer_REQ-42');
  });
});
