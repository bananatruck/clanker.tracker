import { describe, it, expect } from 'vitest';
import { APPLICATION_COLUMNS, applicationsToCsv, csvField, csvFilename } from '@/lib/tracker/csv';
import type { Application } from '@/lib/db/schema';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1',
  company: 'Acme',
  role: 'Engineer',
  url: 'https://acme.example/jobs/1',
  ats: 'greenhouse',
  status: 'applied',
  appliedAt: Date.UTC(2026, 6, 14),
  updatedAt: Date.UTC(2026, 6, 20),
  scanId: null,
  notes: '',
  llmCalls: 0,
  ...over,
});

describe('csv escaping', () => {
  it('leaves plain values alone', () => {
    expect(csvField('Acme')).toBe('Acme');
    expect(csvField(0)).toBe('0');
    expect(csvField(null)).toBe('');
  });

  it('quotes commas, quotes, and newlines per RFC 4180', () => {
    expect(csvField('Acme, Inc.')).toBe('"Acme, Inc."');
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  /**
   * The company name comes off a page we do not control, and a spreadsheet
   * evaluates a leading `=` on open. Neutralising it is not optional.
   */
  it('defuses spreadsheet formula injection', () => {
    expect(csvField('=cmd|/c calc')).toBe("'=cmd|/c calc");
    expect(csvField('+1-555-0100')).toBe("'+1-555-0100");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    // Still text afterwards, so it round-trips as something a human reads.
    expect(csvField('=A1+A2').slice(1)).toBe('=A1+A2');
  });
});

describe('the export', () => {
  it('writes a header and one CRLF row per application', () => {
    const csv = applicationsToCsv([app(), app({ id: 'a2', company: 'Northwind' })]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(APPLICATION_COLUMNS.join(','));
    expect(lines[1]).toContain('Acme');
    expect(lines[2]).toContain('Northwind');
  });

  it('renders dates as plain days, not timestamps', () => {
    expect(applicationsToCsv([app()])).toContain('2026-07-14');
  });

  it('exports an empty history as a header alone, not an error', () => {
    expect(applicationsToCsv([]).trimEnd()).toBe(APPLICATION_COLUMNS.join(','));
  });

  it('survives a company name that is a CSV attack', () => {
    const csv = applicationsToCsv([app({ company: 'Evil, "Corp"\n=1+1' })]);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(2);
  });

  it('names the file by the day it was exported', () => {
    expect(csvFilename(Date.UTC(2026, 7, 2))).toBe('clanker-applications-2026-08-02.csv');
  });
});
