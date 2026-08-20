import { describe, expect, it } from 'vitest';
import { answerKey } from '@/lib/fill/memory';
import { questionHash } from '@/lib/fill/normalize';

describe('answer memory keys', () => {
  it('keeps old unscoped questions readable', () => {
    expect(answerKey('Are you authorized to work?')).toBe(
      questionHash('Are you authorized to work?'),
    );
  });

  it('separates repeated labels by record and option set', () => {
    const first = answerKey('Company', { semanticPath: 'experience[0].company' });
    const second = answerKey('Company', { semanticPath: 'experience[1].company' });
    const choices = answerKey('Company', {
      semanticPath: 'experience[0].company',
      optionSignature: 'yes:Yes|no:No',
    });

    expect(new Set([first, second, choices]).size).toBe(3);
  });
});
