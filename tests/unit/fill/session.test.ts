import { describe, expect, it } from 'vitest';
import { checkpointSession, continuationStep, pageKeyFor } from '@/lib/fill/session';
import type { ApplicationSession } from '@/lib/db/schema';
import type { HarvestedField } from '@/lib/fill/types';

const first: ApplicationSession = {
  id: 'tab-7',
  tabId: 7,
  ats: 'workday',
  url: 'https://acme.wd5.myworkdayjobs.com/apply',
  pageKey: 'identity',
  step: 1,
  completedPaths: [],
  status: 'review',
  updatedAt: 100,
  jobUrl: 'https://acme.wd5.myworkdayjobs.com/job/engineer',
  llmCalls: 1,
};

const field = (id: string, label: string): HarvestedField => ({
  id,
  kind: 'text',
  name: id,
  label,
  required: false,
  options: [],
  placeholder: '',
  autocomplete: '',
  existingValue: '',
});

describe('guarded application sessions', () => {
  it('does not advance when Fill is repeated on the same page', () => {
    const next = checkpointSession(first, 7, {
      ats: 'workday',
      url: first.url,
      pageKey: 'identity',
      completedPaths: ['experience[0].company'],
    }, 200);
    expect(next.step).toBe(1);
    expect(next.completedPaths).toEqual(['experience[0].company']);
  });

  it('advances on a same-URL SPA step and retains completed profile paths', () => {
    const next = checkpointSession(first, 7, {
      ats: 'workday',
      url: first.url,
      pageKey: 'experience',
      completedPaths: ['experience[0].company'],
    }, 200);
    expect(next.step).toBe(2);
    expect(continuationStep(next, 'questions')).toBe(3);
  });

  it('retains the original job anchor and accumulates work across routes', () => {
    const next = checkpointSession(first, 7, {
      ats: 'workday',
      url: 'https://acme.wd5.myworkdayjobs.com/apply/questions',
      pageKey: 'questions',
      completedPaths: [],
      llmCalls: 2,
    }, 200);
    expect(next.jobUrl).toBe(first.jobUrl);
    expect(next.url).toContain('/apply/questions');
    expect(next.llmCalls).toBe(3);
  });

  it('retains the matched scan across later application pages', () => {
    const matched = checkpointSession(first, 7, {
      ats: 'workday',
      url: first.url,
      pageKey: 'identity',
      completedPaths: [],
      scanId: 'scan-42',
    }, 200);
    const later = checkpointSession(matched, 7, {
      ats: 'workday',
      url: `${first.url}/questions`,
      pageKey: 'questions',
      completedPaths: [],
    }, 300);

    expect(later.scanId).toBe('scan-42');
  });

  it('starts over for another ATS and never offers a completed session', () => {
    const next = checkpointSession(first, 7, {
      ats: 'greenhouse',
      url: 'https://boards.greenhouse.io/acme',
      pageKey: 'contact',
      completedPaths: [],
    }, 200);
    expect(next.step).toBe(1);
    expect(continuationStep({ ...next, status: 'complete' }, 'contact')).toBeUndefined();
  });

  it('makes signatures order-independent and sensitive to new questions', () => {
    const name = field('name', 'Name');
    const email = field('email', 'Email');
    expect(pageKeyFor([name, email])).toBe(pageKeyFor([email, name]));
    expect(pageKeyFor([name, email])).not.toBe(pageKeyFor([name]));
  });
});
