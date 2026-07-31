import { describe, it, expect } from 'vitest';
import { normalizeQuestion, questionHash } from '@/lib/fill/normalize';

const same = (a: string, b: string) => expect(questionHash(a)).toBe(questionHash(b));

describe('question normalisation', () => {
  it('folds casing, punctuation and whitespace to one key', () => {
    same('First Name', 'first   name');
    same('First Name *', 'first name');
    same('First name:', 'FIRST NAME');
  });

  it('strips vendor boilerplate and numbering', () => {
    same('2. Email Address (required)', 'email');
    same('Please enter your phone number', 'enter your phone');
    same('LinkedIn Profile (optional)', 'linkedin');
  });

  it('unifies smart quotes and dashes', () => {
    same('What’s your notice period?', "What's your notice period");
    same('Full–time availability', 'Full-time availability');
  });

  it('maps vendor synonyms onto one concept', () => {
    same('Surname', 'Last Name');
    same('Telephone', 'Mobile');
    same('Are you currently authorized to work', 'work authorization');
    same('Desired Salary', 'Expected Compensation');
  });

  it('keeps genuinely different questions distinct', () => {
    expect(questionHash('First Name')).not.toBe(questionHash('Last Name'));
    expect(questionHash('Why this company')).not.toBe(questionHash('linkedin'));
  });

  it('produces a stable 8-char hex hash', () => {
    expect(questionHash('First Name')).toMatch(/^[0-9a-f]{8}$/);
    expect(questionHash('First Name')).toBe(questionHash('First Name'));
  });

  it('handles empty and pathological input without throwing', () => {
    expect(normalizeQuestion('')).toBe('');
    expect(normalizeQuestion('   ***   ')).toBe('');
    expect(questionHash('')).toMatch(/^[0-9a-f]{8}$/);
  });
});
