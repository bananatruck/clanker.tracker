/**
 * The tracker as a spreadsheet.
 *
 * Everyone running a serious job hunt already keeps one of these — the Notion
 * template, or a Google Sheet, or a legal pad — and the reason is not that a
 * kanban board is bad. It is that a board answers "what stage is this in" and
 * a table answers everything else: what does it pay, what do I owe it, who am
 * I actually talking to, and how long has this been going on. Those are the
 * questions you have at 11pm on a Sunday when you are deciding what to chase.
 *
 * So the board stays and a table joins it, with the columns of the tracker
 * people already use, and the footer rollups underneath — COUNT, RANGE, MAX —
 * which are the three that carry information. Everything here is pure: the
 * parsing, the rollups and the completeness rule are all functions of a row
 * array, so the arithmetic behind "highest salary you have been offered" is
 * something a test asserts rather than something you eyeball in a footer.
 */
import type { Application } from '@/lib/db/schema';
import type { Deed } from '@/lib/game/economy';

/* --------------------------------------------------------------- columns */

export type ColumnKey =
  | 'company'
  | 'role'
  | 'status'
  | 'appliedAt'
  | 'salary'
  | 'nextAction'
  | 'website'
  | 'contact'
  | 'url';

/** What the footer does with a column. `none` leaves the cell blank. */
export type Rollup = 'count' | 'range' | 'max' | 'filled' | 'none';

export interface Column {
  key: ColumnKey;
  label: string;
  /** Column width in the wide table, in pixels. */
  width: number;
  /**
   * Width in the side panel.
   *
   * Not a scale factor of `width`: the columns do not compress evenly. A date
   * reads fine at 64 pixels and a next-action note does not, so the panel gives
   * back most of what it takes from the short columns to the long ones.
   */
  narrow: number;
  /** Whether the cell can be typed into. Status and date have their own editors. */
  editable: boolean;
  rollup: Rollup;
  /** Dropped from the narrow (side-panel) table, which cannot hold nine columns. */
  wideOnly?: boolean;
}

/**
 * The columns, in the order the source tracker puts them.
 *
 * Order is not cosmetic here. Company and Position are first because they are
 * how you find the row; Status and Applied are next because they are what you
 * scan down; the four you have to research yourself come after, because a row
 * with all of them blank should still read as a complete row and not as a form
 * you failed to fill in.
 */
export const COLUMNS: readonly Column[] = [
  { key: 'company', label: 'Company', width: 168, narrow: 116, editable: true, rollup: 'count' },
  { key: 'role', label: 'Position', width: 208, narrow: 122, editable: true, rollup: 'none' },
  // Wide enough for "Interview" plus the quiet badge, which is the longest
  // thing this cell ever has to hold.
  { key: 'status', label: 'Status', width: 116, narrow: 96, editable: false, rollup: 'none' },
  { key: 'appliedAt', label: 'Applied', width: 108, narrow: 64, editable: false, rollup: 'range' },
  { key: 'salary', label: 'Salary', width: 132, narrow: 96, editable: true, rollup: 'max' },
  { key: 'nextAction', label: 'Next action', width: 178, narrow: 150, editable: true, rollup: 'filled' },
  { key: 'website', label: 'Website', width: 148, narrow: 0, editable: true, rollup: 'none', wideOnly: true },
  { key: 'contact', label: 'Contact', width: 158, narrow: 0, editable: true, rollup: 'none', wideOnly: true },
  { key: 'url', label: 'Reference', width: 104, narrow: 0, editable: false, rollup: 'none', wideOnly: true },
];

export const NARROW_COLUMNS = COLUMNS.filter((c) => !c.wideOnly);

/** Total width of a column set, for the horizontal scroll container. */
export const tableWidth = (columns: readonly Column[], wide = true): number =>
  columns.reduce((sum, c) => sum + (wide ? c.width : c.narrow), 0);

/* ---------------------------------------------------------------- salary */

export interface Salary {
  /** Annualised, in whatever currency was written. */
  min: number;
  max: number;
  /** The symbol as typed, so the footer does not claim a conversion it did not do. */
  currency: string;
}

const CURRENCY = /[£$€₹¥]/;

/**
 * Multipliers onto an annual figure.
 *
 * Hourly assumes 2080 hours — 40 a week, 52 weeks — which is the convention
 * every compensation site uses and is wrong for contractors by exactly the
 * amount of holiday they do not take. It is stated here rather than buried so
 * that anyone whose number looks off can see why.
 */
const PERIODS: ReadonlyArray<[RegExp, number]> = [
  [/\b(per|an?|\/)\s*(hour|hr)\b|\bhourly\b|\/\s*hr\b/i, 2080],
  [/\b(per|an?|\/)\s*day\b|\bdaily\b|\bday rate\b/i, 260],
  [/\b(per|an?|\/)\s*(month|mo)\b|\bmonthly\b|\/\s*mo\b/i, 12],
  [/\b(per|an?|\/)\s*(week|wk)\b|\bweekly\b/i, 52],
];

/**
 * One number out of a salary string, with `k`/`m` suffixes applied.
 *
 * `promote` carries the one piece of context that changes what a bare number
 * means. In an annual figure, a number under 1000 is thousands shorthand —
 * "85" is 85k, because nobody applies for a job paying eighty-five pounds a
 * year. In a day or hourly rate it is the literal figure, and promoting it
 * would turn a £450 day rate into £117m a year. The cutoff is a guess; which
 * side of it to guess on is not.
 */
function amount(raw: string, promote: boolean): number | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  const match = /^(\d+(?:\.\d+)?)([km])?$/i.exec(cleaned);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const suffix = match[2]?.toLowerCase();
  if (suffix === 'k') return value * 1_000;
  if (suffix === 'm') return value * 1_000_000;

  return promote && value < 1_000 ? value * 1_000 : value;
}

/**
 * Read a salary the way it was actually typed.
 *
 * The field is free text on purpose. Forcing a number would mean rejecting
 * "competitive", "DOE", "£85k + equity" and "depends on level", which is what
 * most postings genuinely say, and a tracker that will not accept the truth
 * gets abandoned. So this parses what it can and returns null for the rest —
 * an unparseable salary is still a perfectly good note to yourself.
 */
export function parseSalary(input: string | undefined): Salary | null {
  if (!input) return null;

  const text = input.trim();
  if (text === '') return null;

  // The period has to be read before the numbers are, because it decides what
  // a bare number means — see `amount`.
  const period = PERIODS.find(([re]) => re.test(text))?.[1] ?? 1;

  // Ranges are written with a hyphen, an en dash, an em dash, "to", or a
  // slash. Splitting first means "85k-100k" and "85-100k" both work, and the
  // second is the common shorthand where only the last number carries the k.
  const parts = text.split(/\s*(?:[-–—]|\bto\b|\/(?!\s*(?:hr|hour|mo|month|wk|week|yr|year|day)))\s*/i);
  const numbers = parts
    .map((part) => /(\d[\d,\s]*(?:\.\d+)?\s*[km]?)/i.exec(part)?.[1] ?? null)
    .map((raw) => (raw === null ? null : amount(raw, period === 1)))
    .filter((n): n is number => n !== null && n > 0);

  if (numbers.length === 0) return null;

  const scaled = numbers.map((n) => n * period);

  return {
    min: Math.min(...scaled),
    max: Math.max(...scaled),
    currency: CURRENCY.exec(text)?.[0] ?? '',
  };
}

/** `£120k`, `£1.2m`, `£850` — short enough for a table cell. */
export function formatSalary(value: number, currency = ''): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${currency}${m % 1 === 0 ? m : m.toFixed(1)}m`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${currency}${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `${currency}${Math.round(value)}`;
}

/* --------------------------------------------------------------- rollups */

export interface Rollups {
  /** Rows in the table. */
  count: number;
  /** Oldest and newest application dates, and the span between them. */
  span: { from: number; to: number; days: number } | null;
  /** The highest salary anyone has put in writing, and whose it is. */
  topSalary: { value: number; currency: string; company: string } | null;
  /** Rows with a next action written down. */
  withNextAction: number;
  /** Rows where all four intel columns are filled. */
  complete: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function rollups(apps: readonly Application[]): Rollups {
  if (apps.length === 0) {
    return { count: 0, span: null, topSalary: null, withNextAction: 0, complete: 0 };
  }

  const dates = apps.map((a) => a.appliedAt);
  const from = Math.min(...dates);
  const to = Math.max(...dates);

  // MAX over salary uses the top of each range, because the question the
  // footer answers is "what is the best thing on this board", and the best
  // thing about a £85k–£110k posting is £110k.
  let topSalary: Rollups['topSalary'] = null;
  for (const app of apps) {
    const parsed = parseSalary(app.salary);
    if (parsed === null) continue;
    if (topSalary === null || parsed.max > topSalary.value) {
      topSalary = { value: parsed.max, currency: parsed.currency, company: app.company };
    }
  }

  return {
    count: apps.length,
    span: { from, to, days: Math.round((to - from) / DAY) },
    topSalary,
    withNextAction: apps.filter((a) => (a.nextAction ?? '').trim() !== '').length,
    complete: apps.filter(isComplete).length,
  };
}

/* ---------------------------------------------------------- completeness */

/** The columns only a human can fill. Doing so is what earns the deed. */
export const INTEL_FIELDS = ['salary', 'nextAction', 'website', 'contact'] as const;
export type IntelField = (typeof INTEL_FIELDS)[number];

export const filledIntel = (app: Application): number =>
  INTEL_FIELDS.filter((f) => (app[f] ?? '').trim() !== '').length;

/**
 * Whether a row has been fully researched.
 *
 * All four, not three of four, and not "any". The deed pays for a piece of
 * work that is actually finished, and a threshold you can hit by typing one
 * character into one box is a threshold that pays for typing one character
 * into one box.
 */
export const isComplete = (app: Application): boolean =>
  filledIntel(app) === INTEL_FIELDS.length;

/**
 * Whether an edit should bank the intel deed.
 *
 * Written the same way as the funnel's `deedsToAward` and for the same reason:
 * keyed on what this application has *already* banked rather than on what just
 * changed. Filling the last column, clearing it, and filling it again pays
 * once. Clearing a column never claws the DP back — you did the research, and
 * tidying a note about it later is not a reason to take a level away.
 */
export function intelToAward(app: Application, banked: readonly Deed[]): Deed[] {
  if (!isComplete(app)) return [];
  return banked.includes('intel') ? [] : ['intel'];
}

/* --------------------------------------------------------------- display */

/** ISO day. The tracker deals in days; the clock is noise in a table. */
export const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `12 Mar` — the compact form for a narrow column. */
export function shortDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}

/** `acme.com` — a website column full of `https://` prefixes reads as noise. */
export function hostOf(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') return '';
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).host.replace(
      /^www\./,
      '',
    );
  } catch {
    return trimmed;
  }
}

/** What a bare-hostname website field should actually navigate to. */
export function href(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
