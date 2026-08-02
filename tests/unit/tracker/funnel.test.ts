import { describe, it, expect } from 'vitest';
import {
  BOARD_COLUMNS,
  GHOST_AFTER_DAYS,
  deedForStatus,
  deedsToAward,
  identifyPosting,
  isAdvance,
  isStale,
} from '@/lib/tracker/funnel';
import type { Deed } from '@/lib/game/economy';

describe('deeds are only ever earned once', () => {
  it('banks the deed the first time a card reaches a stage', () => {
    expect(deedsToAward('interview', [])).toEqual(['interview']);
    expect(deedsToAward('oa', ['application'])).toEqual(['oa']);
  });

  it('pays nothing for re-entering a stage already banked', () => {
    expect(deedsToAward('interview', ['application', 'interview'])).toEqual([]);
  });

  /**
   * The anti-farming case, spelled out: drag a card back to Applied and
   * forward to Interview again and the ledger must not move. DP comes from a
   * real action, and the second drag is not one.
   */
  it('cannot be farmed by dragging a card back and forth', () => {
    const banked: Deed[] = ['application', 'interview'];
    const moves = ['applied', 'interview', 'applied', 'interview'] as const;
    for (const status of moves) expect(deedsToAward(status, banked)).toEqual([]);
  });

  it('does not imply an OA that was never sat', () => {
    // Applied straight to Interview — most companies have no OA at all.
    expect(deedsToAward('interview', ['application'])).toEqual(['interview']);
  });

  it('earns nothing for a rejection, and takes nothing back', () => {
    expect(deedForStatus('rejected')).toBeNull();
    expect(deedForStatus('ghosted')).toBeNull();
    expect(deedsToAward('rejected', ['application'])).toEqual([]);
    expect(deedsToAward('ghosted', [])).toEqual([]);
  });
});

describe('the funnel', () => {
  it('orders the board from sent to outcome', () => {
    expect(BOARD_COLUMNS.slice(0, 4)).toEqual(['applied', 'oa', 'interview', 'offer']);
  });

  it('knows which way is forward', () => {
    expect(isAdvance('applied', 'interview')).toBe(true);
    expect(isAdvance('interview', 'applied')).toBe(false);
    expect(isAdvance('applied', 'applied')).toBe(false);
    // A rejection is not progress, however far the application got first.
    expect(isAdvance('interview', 'rejected')).toBe(false);
  });
});

describe('going quiet', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 7, 2);

  it('flags open applications past the threshold', () => {
    const old = now - (GHOST_AFTER_DAYS + 1) * day;
    expect(isStale({ status: 'applied', updatedAt: old }, now)).toBe(true);
    expect(isStale({ status: 'oa', updatedAt: old }, now)).toBe(true);
  });

  it('leaves recent and finished applications alone', () => {
    expect(isStale({ status: 'applied', updatedAt: now - 3 * day }, now)).toBe(false);
    const old = now - 400 * day;
    // Already decided — silence means nothing here.
    expect(isStale({ status: 'rejected', updatedAt: old }, now)).toBe(false);
    expect(isStale({ status: 'offer', updatedAt: old }, now)).toBe(false);
  });
});

describe('identifying the posting', () => {
  it('reads the employer out of an ATS subdomain', () => {
    expect(
      identifyPosting({
        host: 'acme-robotics.greenhouse.io',
        title: 'Senior Backend Engineer - Acme Robotics',
        url: 'https://acme-robotics.greenhouse.io/jobs/4001',
      }),
    ).toEqual({ company: 'Acme Robotics', role: 'Senior Backend Engineer' });
  });

  it('falls back to the path when the subdomain is a vendor word', () => {
    const got = identifyPosting({
      host: 'jobs.lever.co',
      title: 'Staff Designer – Northwind',
      url: 'https://jobs.lever.co/northwind/abc-123',
    });
    expect(got.company).toBe('Northwind');
    expect(got.role).toBe('Staff Designer');
  });

  it('never throws on a page it cannot read', () => {
    expect(() => identifyPosting({ host: '', title: '', url: '' })).not.toThrow();
    expect(identifyPosting({ host: '', title: '', url: '' }).company).toBe('');
  });

  it('caps an essay of a page title', () => {
    const title = 'x'.repeat(500);
    expect(identifyPosting({ host: 'a.co', title, url: 'https://a.co' }).role.length).toBe(120);
  });
});
