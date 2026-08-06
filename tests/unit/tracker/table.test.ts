/**
 * The spreadsheet's arithmetic.
 *
 * Two things here are worth testing hard and one is not. The salary parser is
 * worth it because the field is free text off a job posting and every posting
 * writes money differently; the rollups are worth it because a footer that
 * quietly reports the wrong maximum is worse than no footer. The column list
 * is a list.
 */
import { describe, expect, it } from 'vitest';
import type { Application } from '@/lib/db/schema';
import {
  COLUMNS,
  NARROW_COLUMNS,
  filledIntel,
  formatSalary,
  hostOf,
  href,
  intelToAward,
  isComplete,
  parseSalary,
  rollups,
  shortDay,
  tableWidth,
} from '@/lib/tracker/table';

const DAY = 24 * 60 * 60 * 1000;

function app(patch: Partial<Application> = {}): Application {
  return {
    id: crypto.randomUUID(),
    company: 'Hexweave',
    role: 'Backend Engineer',
    url: 'https://hexweave.example/jobs/1',
    ats: 'greenhouse',
    status: 'applied',
    appliedAt: Date.UTC(2026, 5, 1),
    updatedAt: Date.UTC(2026, 5, 1),
    scanId: null,
    notes: '',
    llmCalls: 0,
    ...patch,
  };
}

describe('parseSalary', () => {
  it('reads a plain annual number', () => {
    expect(parseSalary('105000')).toMatchObject({ min: 105_000, max: 105_000 });
  });

  it('applies the k suffix', () => {
    expect(parseSalary('95k')).toMatchObject({ min: 95_000, max: 95_000 });
  });

  it('reads a bare small number as thousands', () => {
    // "85" in a salary box is 85k. Nobody is applying for a job that pays
    // eighty-five pounds a year.
    expect(parseSalary('85')).toMatchObject({ max: 85_000 });
  });

  it('strips thousands separators', () => {
    expect(parseSalary('£105,000')).toMatchObject({ max: 105_000, currency: '£' });
  });

  it.each([
    ['£95k–£115k', 95_000, 115_000],
    ['95k - 115k', 95_000, 115_000],
    ['90-110k', 90_000, 110_000],
    ['$120,000 to $150,000', 120_000, 150_000],
    ['80k—100k', 80_000, 100_000],
  ])('reads the range in %s', (input, min, max) => {
    expect(parseSalary(input)).toMatchObject({ min, max });
  });

  it('keeps the currency as written rather than converting', () => {
    // The footer must never claim an exchange rate it did not apply.
    expect(parseSalary('€70k')?.currency).toBe('€');
    expect(parseSalary('70k')?.currency).toBe('');
  });

  it.each([
    ['£450/day', 450 * 260],
    ['£55 per hour', 55 * 2080],
    ['£9k per month', 9_000 * 12],
  ])('annualises %s', (input, expected) => {
    expect(parseSalary(input)?.max).toBe(expected);
  });

  it('does not treat a period slash as a range separator', () => {
    // "£450/day" must not parse as "£450 to day" and lose the period.
    expect(parseSalary('£450/day')?.min).toBe(450 * 260);
  });

  it('finds the number inside prose', () => {
    expect(parseSalary('£120k + equity')).toMatchObject({ max: 120_000 });
  });

  it.each(['competitive', 'DOE', 'depends on level', '', '   '])(
    'returns null for %s rather than guessing',
    (input) => {
      // An unparseable salary is still a good note to yourself. The tracker
      // accepts what postings actually say.
      expect(parseSalary(input)).toBeNull();
    },
  );

  it('returns null for an absent field', () => {
    expect(parseSalary(undefined)).toBeNull();
  });
});

describe('formatSalary', () => {
  it.each([
    [115_000, '£115k'],
    [117_500, '£117.5k'],
    [1_200_000, '£1.2m'],
    [850, '£850'],
  ])('renders %i as %s', (value, expected) => {
    expect(formatSalary(value, '£')).toBe(expected);
  });
});

describe('rollups', () => {
  it('is empty-safe', () => {
    expect(rollups([])).toEqual({
      count: 0,
      span: null,
      topSalary: null,
      withNextAction: 0,
      complete: 0,
    });
  });

  it('counts the rows', () => {
    expect(rollups([app(), app(), app()]).count).toBe(3);
  });

  it('spans oldest to newest regardless of array order', () => {
    const now = Date.UTC(2026, 6, 1);
    const span = rollups([
      app({ appliedAt: now - 10 * DAY }),
      app({ appliedAt: now - 40 * DAY }),
      app({ appliedAt: now }),
    ]).span;

    expect(span).toMatchObject({ from: now - 40 * DAY, to: now, days: 40 });
  });

  it('takes the top of a range as the maximum', () => {
    // The best thing about a £85k–£110k posting is £110k.
    const top = rollups([app({ salary: '£85k–£110k' }), app({ salary: '£95k' })]).topSalary;
    expect(top).toMatchObject({ value: 110_000, currency: '£' });
  });

  it('names the company holding the maximum', () => {
    const top = rollups([
      app({ company: 'Hexweave', salary: '£95k' }),
      app({ company: 'Ashgrove', salary: '£120k' }),
    ]).topSalary;

    expect(top?.company).toBe('Ashgrove');
  });

  it('ignores rows whose salary does not parse', () => {
    const top = rollups([app({ salary: 'competitive' }), app({ salary: '£78k' })]).topSalary;
    expect(top?.value).toBe(78_000);
  });

  it('reports no maximum when nothing parses', () => {
    expect(rollups([app({ salary: 'DOE' }), app()]).topSalary).toBeNull();
  });

  it('compares annualised figures, not written ones', () => {
    // £450/day is £117k and beats a £95k salary, even though 450 < 95000.
    const top = rollups([app({ salary: '£95k' }), app({ company: 'K', salary: '£450/day' })])
      .topSalary;
    expect(top?.company).toBe('K');
  });

  it('counts next actions, treating whitespace as empty', () => {
    const totals = rollups([
      app({ nextAction: 'Chase recruiter' }),
      app({ nextAction: '   ' }),
      app(),
    ]);
    expect(totals.withNextAction).toBe(1);
  });
});

describe('completeness', () => {
  const full = { salary: '£95k', nextAction: 'Chase', website: 'x.example', contact: 'Ada' };

  it('counts the filled researched columns', () => {
    expect(filledIntel(app())).toBe(0);
    expect(filledIntel(app({ salary: '£95k', contact: 'Ada' }))).toBe(2);
    expect(filledIntel(app(full))).toBe(4);
  });

  it('requires all four, not most of them', () => {
    // A threshold you can hit by typing one character pays for typing one
    // character.
    expect(isComplete(app({ ...full, contact: '' }))).toBe(false);
    expect(isComplete(app(full))).toBe(true);
  });

  it('does not count whitespace as research', () => {
    expect(isComplete(app({ ...full, website: '  ' }))).toBe(false);
  });

  it('ignores fields that are not researched columns', () => {
    // Notes and the posting URL arrive on their own; they are not the work.
    expect(isComplete(app({ notes: 'lots', url: 'https://x.example' }))).toBe(false);
  });
});

describe('intelToAward', () => {
  const full = { salary: '£95k', nextAction: 'Chase', website: 'x.example', contact: 'Ada' };

  it('awards nothing while the row is unfinished', () => {
    expect(intelToAward(app({ salary: '£95k' }), [])).toEqual([]);
  });

  it('awards the deed when the last column lands', () => {
    expect(intelToAward(app(full), [])).toEqual(['intel']);
  });

  it('pays once, however many times the row is completed', () => {
    // Fill the last column, clear it, fill it again: one payment.
    expect(intelToAward(app(full), ['intel'])).toEqual([]);
  });

  it('does not confuse the intel deed with a funnel deed', () => {
    // An application that reached an interview has banked plenty and still
    // owes nothing against its research.
    expect(intelToAward(app(full), ['application', 'oa', 'interview'])).toEqual(['intel']);
  });

  it('takes nothing back when a column is cleared', () => {
    // Returns an empty award, never a negative one — there is no path in this
    // economy that removes a banked deed.
    expect(intelToAward(app({ ...full, contact: '' }), ['intel'])).toEqual([]);
  });
});

describe('columns', () => {
  it('drops exactly the wide-only columns in the narrow set', () => {
    expect(COLUMNS).toHaveLength(9);
    expect(NARROW_COLUMNS).toHaveLength(6);
    expect(NARROW_COLUMNS.every((c) => !c.wideOnly)).toBe(true);
  });

  it('keeps every editable researched column reachable in the narrow table', () => {
    // Salary and next action are the two people actually maintain; losing
    // either to the side panel's width would make the panel's table a toy.
    const keys = NARROW_COLUMNS.map((c) => c.key);
    expect(keys).toContain('salary');
    expect(keys).toContain('nextAction');
  });

  it('measures the table at the sum of its columns', () => {
    expect(tableWidth(COLUMNS)).toBe(COLUMNS.reduce((n, c) => n + c.width, 0));
    expect(tableWidth([])).toBe(0);
  });

  it('measures the narrow table on the narrow widths', () => {
    expect(tableWidth(NARROW_COLUMNS, false)).toBe(
      NARROW_COLUMNS.reduce((n, c) => n + c.narrow, 0),
    );
  });

  /**
   * The panel is 420 pixels. A table that needs four screens of sideways
   * scrolling to read one row is not a table, and the ceiling here is what
   * stops a column being widened later without anyone noticing the panel view
   * quietly became unusable.
   */
  it('keeps the narrow table inside about a screen and a half of the panel', () => {
    expect(tableWidth(NARROW_COLUMNS, false)).toBeLessThanOrEqual(660);
  });

  it('fits the wide table in the dashboard it was sized for', () => {
    // 1400px max width less 32px of padding.
    expect(tableWidth(COLUMNS)).toBeLessThanOrEqual(1368);
  });
});

describe('display helpers', () => {
  it('strips the scheme and www from a website', () => {
    expect(hostOf('https://www.acme.com/careers')).toBe('acme.com');
    expect(hostOf('acme.com')).toBe('acme.com');
  });

  it('leaves something unparseable alone rather than blanking it', () => {
    expect(hostOf('not a url at all')).toBe('not a url at all');
    expect(hostOf('')).toBe('');
  });

  it('gives a bare hostname a scheme to navigate to', () => {
    expect(href('acme.com')).toBe('https://acme.com');
    expect(href('http://acme.com')).toBe('http://acme.com');
    expect(href('')).toBe('');
  });

  it('renders a date in UTC so the row does not shift by timezone', () => {
    expect(shortDay(Date.UTC(2026, 2, 12))).toBe('12 Mar');
  });
});
