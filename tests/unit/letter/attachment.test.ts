import { describe, expect, it } from 'vitest';
import {
  coverLetterAttachment,
  selectCoverLetter,
} from '@/lib/letter/attachment';
import type { CoverLetter } from '@/lib/db/schema';

function letter(overrides: Partial<CoverLetter> = {}): CoverLetter {
  return {
    id: 'letter-1',
    scanId: 'scan-1',
    company: 'Acme Systems',
    role: 'Platform Engineer',
    sourceUrl: 'https://jobs.example.test/roles/42',
    text: 'I build dependable systems.\n\nThank you for your consideration.',
    edited: true,
    createdAt: 1,
    ...overrides,
  };
}

describe('cover-letter selection', () => {
  it('matches the canonical posting URL before considering text identity', () => {
    const exact = letter();
    const other = letter({
      id: 'letter-2',
      sourceUrl: 'https://jobs.example.test/roles/99',
      createdAt: 2,
    });

    expect(selectCoverLetter([other, exact], {
      url: 'https://jobs.example.test/roles/42?utm_source=email#apply',
      company: 'Acme Systems',
      role: 'Platform Engineer',
    })?.id).toBe('letter-1');
  });

  it('does not reuse a letter tied to another URL just because its title matches', () => {
    expect(selectCoverLetter([letter()], {
      url: 'https://jobs.example.test/roles/99',
      company: 'Acme Systems',
      role: 'Platform Engineer',
    })).toBeNull();
  });

  it('supports older URL-less letters only when company and role both match', () => {
    const legacy = letter({ sourceUrl: undefined });

    expect(selectCoverLetter([legacy], {
      url: 'https://jobs.example.test/roles/42',
      company: ' acme systems ',
      role: 'PLATFORM ENGINEER',
    })?.id).toBe('letter-1');
    expect(selectCoverLetter([legacy], {
      url: 'https://jobs.example.test/roles/42',
      company: 'Acme Systems',
      role: 'Data Engineer',
    })).toBeNull();
  });
});

describe('cover-letter file', () => {
  it('creates a UTF-8 text attachment with a safe descriptive name', () => {
    const attachment = coverLetterAttachment(letter({
      company: 'Acme / Systems',
      role: 'Platform Engineer (Remote)',
      text: 'Hello, café.',
    }));

    expect(attachment.fileName).toBe('acme-systems-platform-engineer-remote-cover-letter.txt');
    expect(attachment.mimeType).toBe('text/plain;charset=utf-8');
    expect(new TextDecoder().decode(attachment.bytes)).toBe('Hello, café.\n');
  });
});
