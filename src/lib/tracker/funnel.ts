/**
 * The funnel — what an application is doing, and what it earned.
 *
 * Two rules from the economy carry straight into the tracker:
 *
 *   1. **DP only ever comes from a real action.** Moving a card to Interview
 *      earns the river because you actually got an interview. Moving it back
 *      and forward again earns nothing more — see `deedsToAward`, which is
 *      keyed on what the application has *already* banked, not on the move.
 *   2. **Nothing decays.** A rejection takes nothing back. The villages stay
 *      razed. You did the work; the outcome was never the part you controlled.
 *
 * Everything here is pure so the ledger rules are testable without an
 * IndexedDB — the repo layer just moves the results in and out.
 */
import type { ApplicationStatus } from '@/lib/db/schema';
import type { Deed } from '@/lib/game/economy';

/**
 * Board columns, left to right. Rejected and ghosted sit at the end because
 * they are where cards go to rest, not stages you are working through.
 */
export const BOARD_COLUMNS: readonly ApplicationStatus[] = [
  'applied',
  'oa',
  'interview',
  'offer',
  'rejected',
  'ghosted',
];

/** How far through the funnel a status is. Terminal states share the floor. */
const FUNNEL_DEPTH: Record<ApplicationStatus, number> = {
  applied: 1,
  oa: 2,
  interview: 3,
  offer: 4,
  rejected: 0,
  ghosted: 0,
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  oa: 'OA',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
};

/** What each status did in Clankerdom. Shown on the card, not just in lore. */
export const STATUS_DEED_LABEL: Record<ApplicationStatus, string> = {
  applied: '2 family homes razed',
  oa: '1 village taken',
  interview: '1 river dried',
  offer: 'The Adoption',
  rejected: 'the King is unmoved',
  ghosted: 'no reply from the Tower',
};

/** Board accent per column, on the shared confidence palette. */
export const STATUS_COLOR: Record<ApplicationStatus, string> = {
  applied: 'text-muted',
  oa: 'text-guessed',
  interview: 'text-certain',
  offer: 'text-accent',
  rejected: 'text-missing',
  ghosted: 'text-faint',
};

/** The deed a status represents, or null where the status earns nothing. */
export function deedForStatus(status: ApplicationStatus): Deed | null {
  switch (status) {
    case 'applied':
      return 'application';
    case 'oa':
      return 'oa';
    case 'interview':
      return 'interview';
    case 'offer':
      return 'offer';
    default:
      // A rejection is not a deed. It costs nothing and earns nothing.
      return null;
  }
}

/** Whether `to` is further down the funnel than `from`. */
export function isAdvance(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return FUNNEL_DEPTH[to] > FUNNEL_DEPTH[from];
}

/**
 * Which deeds a move to `next` should bank, given what this application has
 * already banked.
 *
 * Deliberately *not* "the deed for the new status". Two things fall out of
 * that choice:
 *
 *   - **No farming.** Dragging a card interview → applied → interview pays
 *     once, because the interview is already in `banked`.
 *   - **No skipped credit.** Jumping straight from Applied to Interview —
 *     which happens constantly, most companies have no OA — banks only the
 *     interview. The OA is not implied, because you did not sit one.
 */
export function deedsToAward(
  next: ApplicationStatus,
  banked: readonly Deed[],
): Deed[] {
  const deed = deedForStatus(next);
  if (deed === null) return [];
  return banked.includes(deed) ? [] : [deed];
}

/** Days after which a still-open application is worth chasing or writing off. */
export const GHOST_AFTER_DAYS = 30;

/**
 * Applications that have gone quiet. Surfaced, never auto-applied — the tool
 * does not get to decide you have been rejected. The status stays yours.
 */
export function isStale(
  app: { status: ApplicationStatus; updatedAt: number },
  now = Date.now(),
  days = GHOST_AFTER_DAYS,
): boolean {
  if (app.status !== 'applied' && app.status !== 'oa') return false;
  return now - app.updatedAt >= days * 24 * 60 * 60 * 1000;
}

/**
 * A company/role guess from the page a fill just ran on.
 *
 * Wrong-but-editable beats a blank card: an application that logs itself with
 * a bad title still gets logged, and the tracker is worthless the moment
 * logging is a chore. Every field here is editable in the board.
 */
export function identifyPosting(opts: {
  host: string;
  title: string;
  url: string;
}): { company: string; role: string } {
  const host = opts.host.toLowerCase().replace(/^www\./, '');

  // Most ATSs put the employer in the subdomain: acme.greenhouse.io, and
  // Lever/Ashby use /acme/... instead.
  const sub = host.split('.')[0] ?? '';
  const vendor = /greenhouse|lever|ashby|workable|myworkdayjobs|linkedin/.test(host);
  const pathSlug = opts.url.split('/').filter(Boolean)[2] ?? '';

  const rawCompany =
    vendor && sub && !['boards', 'jobs', 'apply', 'www', 'careers'].includes(sub)
      ? sub
      : vendor
        ? pathSlug
        : sub;

  // Page titles are near-universally "Role - Company" or "Company - Role".
  const title = opts.title.replace(/\s+/g, ' ').trim();
  const role = title.split(/\s+[-–|]\s+/)[0] ?? '';

  return { company: titleCase(rawCompany), role: role.slice(0, 120) };
}

function titleCase(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
