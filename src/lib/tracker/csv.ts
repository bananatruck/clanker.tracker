/**
 * CSV export.
 *
 * The whole point of a local-first tracker is that leaving is cheap. If your
 * application history is only readable inside this extension, it is hostage,
 * not stored — so export is a first-class feature and not a settings-page
 * afterthought. This produces plain RFC 4180 that Sheets, Excel, and Numbers
 * all open without a dialog.
 */
import type { Application } from '@/lib/db/schema';
import { STATUS_LABEL } from './funnel';

/**
 * Quote a field per RFC 4180.
 *
 * The leading-`=`/`+`/`-`/`@` guard is not paranoia: a company field of
 * `=cmd|...` is a live formula the moment a spreadsheet opens the file, and
 * the company name comes off a page we do not control. Prefixing a `'` keeps
 * it text without altering what the user reads.
 */
export function csvField(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvField).join(',');
}

export const APPLICATION_COLUMNS = [
  'Company',
  'Role',
  'Status',
  'Applied',
  'Updated',
  'ATS',
  'URL',
  'LLM calls',
  'Notes',
] as const;

/** ISO date, no clock — a tracker row is a day, not a moment. */
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function applicationsToCsv(apps: readonly Application[]): string {
  const rows = [
    csvRow(APPLICATION_COLUMNS),
    ...apps.map((a) =>
      csvRow([
        a.company,
        a.role,
        STATUS_LABEL[a.status],
        day(a.appliedAt),
        day(a.updatedAt),
        a.ats,
        a.url,
        a.llmCalls,
        a.notes,
      ]),
    ),
  ];
  // CRLF is what RFC 4180 specifies and what keeps Excel from guessing.
  return rows.join('\r\n') + '\r\n';
}

/** `clanker-applications-2026-08-02.csv` */
export function csvFilename(now = Date.now()): string {
  return `clanker-applications-${day(now)}.csv`;
}

/**
 * Hand the file to the browser. Kept here so the view stays declarative and
 * the download path is exercised in one place.
 */
export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
