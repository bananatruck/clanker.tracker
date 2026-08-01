/**
 * Date-range parsing for resume entries.
 *
 * Resumes write dates a dozen ways and almost never give a day. We parse to
 * month precision and stop — inventing a day the source text doesn't contain
 * would make "sort by recency" quietly wrong.
 */
import type { ResumeDate } from '@/types/profile';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/** Words a resume uses to mean "still there". */
const PRESENT = /\b(present|current|now|ongoing|to\s*date)\b/i;

/** Any dash a resume might separate a range with, including unicode ones. */
const RANGE_SEP = /\s*(?:[-–—~]|\bto\b|\buntil\b)\s*/i;

const MONTH_NAMES = Object.keys(MONTHS).join('|');

/** "March 2021", "Mar. 2021", "Mar 2021". */
const MONTH_YEAR = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{4})\\b`, 'i');
/** "03/2021", "3-2021". */
const NUMERIC_MONTH_YEAR = /\b(0?[1-9]|1[0-2])\s*[/.-]\s*((?:19|20)\d{2})\b/;
/** A bare year, the weakest signal — only used when nothing better matches. */
const BARE_YEAR = /\b((?:19|20)\d{2})\b/;

/** Parse a single date token to month precision. Returns null if it isn't one. */
export function parseResumeDate(raw: string): ResumeDate | null {
  const s = raw.trim();
  if (!s) return null;

  const named = MONTH_YEAR.exec(s);
  if (named) {
    const month = MONTHS[named[1]!.toLowerCase()];
    return { year: Number(named[2]), month: month ?? null };
  }

  const numeric = NUMERIC_MONTH_YEAR.exec(s);
  if (numeric) return { year: Number(numeric[2]), month: Number(numeric[1]) };

  const bare = BARE_YEAR.exec(s);
  if (bare) return { year: Number(bare[1]), month: null };

  return null;
}

export interface DateRange {
  start: ResumeDate | null;
  /** null means the range is open — "Present". */
  end: ResumeDate | null;
  /** Whether the text explicitly said Present, as opposed to being unparsed. */
  present: boolean;
}

/**
 * Pull a date range out of a line of resume text.
 *
 * Returns null when the line contains no dates at all — which is exactly the
 * signal `experience.ts` uses to tell entry headers from body text.
 */
export function parseDateRange(line: string): DateRange | null {
  const present = PRESENT.test(line);

  // Work on the date-bearing tail of the line: "Acme Corp — Jan 2020 - Present"
  // should not let "Corp" interfere with month matching.
  const parts = line.split(RANGE_SEP);

  if (parts.length >= 2) {
    // Scan from the right so the *last* two date-ish parts win — company names
    // containing a dash would otherwise capture the left slot.
    let end: ResumeDate | null = null;
    let endIndex = -1;

    for (let i = parts.length - 1; i >= 0; i--) {
      const d = parseResumeDate(parts[i]!);
      if (d) {
        end = d;
        endIndex = i;
        break;
      }
    }

    let start: ResumeDate | null = null;
    for (let i = endIndex - 1; i >= 0; i--) {
      const d = parseResumeDate(parts[i]!);
      if (d) {
        start = d;
        break;
      }
    }

    if (present && end) {
      // "Jan 2020 - Present": the parsed date is the *start*, and the end is open.
      return { start: start ?? end, end: null, present: true };
    }
    if (start && end) return { start, end, present: false };
    if (end) return { start: end, end: null, present };
  }

  const single = parseResumeDate(line);
  if (single) return { start: single, end: present ? null : single, present };

  return null;
}

/** Render a range the way the review grid shows it. */
export function formatRange(
  start: ResumeDate | null,
  end: ResumeDate | null,
): string {
  const one = (d: ResumeDate | null) => {
    if (!d) return '';
    return d.month === null
      ? String(d.year)
      : `${String(d.month).padStart(2, '0')}/${d.year}`;
  };
  if (!start) return '';
  return `${one(start)} — ${end ? one(end) : 'Present'}`;
}

/** Months between two dates; open-ended ranges measure to `now`. */
export function durationMonths(
  start: ResumeDate | null,
  end: ResumeDate | null,
  now: Date = new Date(),
): number {
  if (!start) return 0;
  const from = start.year * 12 + ((start.month ?? 1) - 1);
  const to = end
    ? end.year * 12 + ((end.month ?? 12) - 1)
    : now.getFullYear() * 12 + now.getMonth();
  return Math.max(0, to - from + 1);
}
