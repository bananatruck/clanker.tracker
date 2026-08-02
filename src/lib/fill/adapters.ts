/**
 * Tier 1 — per-ATS selector maps.
 *
 * The cheapest tier and the most brittle, which is the trade: when a vendor
 * ships a redesign the map goes stale, the fields fall through to tiers 2-4,
 * and the fill still works. Nothing here is load-bearing — it is a fast path,
 * not a dependency. That is also why a stale map cannot silently produce a
 * *wrong* answer: a selector either matches an element or it doesn't.
 */
import type { AtsId } from './autosubmit';

/** Profile-backed fields an adapter can name directly. */
export type KnownField =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'website'
  | 'resume';

export interface AtsAdapter {
  id: AtsId;
  /** Hostname test. Kept off the URL path so job-board routes don't matter. */
  matches: (host: string) => boolean;
  /** CSS selectors, most specific first — the first that matches wins. */
  selectors: Partial<Record<KnownField, string[]>>;
}

const GREENHOUSE: AtsAdapter = {
  id: 'greenhouse',
  matches: (host) => host.endsWith('greenhouse.io') || host.includes('boards.greenhouse'),
  selectors: {
    firstName: ['#first_name', 'input[name="job_application[first_name]"]'],
    lastName: ['#last_name', 'input[name="job_application[last_name]"]'],
    email: ['#email', 'input[name="job_application[email]"]'],
    phone: ['#phone', 'input[name="job_application[phone]"]'],
    resume: ['#resume', 'input[name="job_application[resume]"]'],
    linkedin: ['input[name*="linkedin" i]'],
    website: ['input[name*="website" i]'],
  },
};

const LEVER: AtsAdapter = {
  id: 'lever',
  matches: (host) => host.endsWith('lever.co'),
  selectors: {
    fullName: ['input[name="name"]'],
    email: ['input[name="email"]'],
    phone: ['input[name="phone"]'],
    location: ['input[name="location"]'],
    resume: ['input[name="resume"]'],
    linkedin: ['input[name="urls[LinkedIn]"]'],
    github: ['input[name="urls[GitHub]"]'],
    website: ['input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]'],
  },
};

const ASHBY: AtsAdapter = {
  id: 'ashby',
  matches: (host) => host.endsWith('ashbyhq.com'),
  selectors: {
    fullName: ['input[name="_systemfield_name"]'],
    email: ['input[name="_systemfield_email"]'],
    phone: ['input[name="_systemfield_phone"]'],
    resume: ['input[name="_systemfield_resume"]'],
    linkedin: ['input[name*="linkedin" i]'],
  },
};

const WORKABLE: AtsAdapter = {
  id: 'workable',
  matches: (host) => host.endsWith('workable.com'),
  selectors: {
    firstName: ['input[name="firstname"]', '#firstname'],
    lastName: ['input[name="lastname"]', '#lastname'],
    email: ['input[name="email"]', '#email'],
    phone: ['input[name="phone"]', '#phone'],
    resume: ['input[name="resume"]', 'input[type="file"]'],
  },
};

const WORKDAY: AtsAdapter = {
  id: 'workday',
  matches: (host) => host.endsWith('myworkdayjobs.com'),
  selectors: {
    firstName: ['input[data-automation-id="legalNameSection_firstName"]'],
    lastName: ['input[data-automation-id="legalNameSection_lastName"]'],
    email: ['input[data-automation-id="email"]'],
    phone: ['input[data-automation-id="phone-number"]'],
  },
};

const LINKEDIN: AtsAdapter = {
  id: 'linkedin',
  matches: (host) => host.endsWith('linkedin.com'),
  selectors: {
    email: ['input[id*="email" i]'],
    phone: ['input[id*="phoneNumber" i]'],
  },
};

export const ADAPTERS: readonly AtsAdapter[] = [
  GREENHOUSE,
  LEVER,
  ASHBY,
  WORKABLE,
  WORKDAY,
  LINKEDIN,
];

/**
 * The generic fallback. It has no selector map by design, which is also why
 * `isCleanRun` refuses it auto-submit: there is no verified mapping to be
 * confident about, only tiers 2-5 guessing from labels.
 */
export const GENERIC: AtsAdapter = {
  id: 'generic',
  matches: () => true,
  selectors: {},
};

export function detectAts(host: string): AtsAdapter {
  return ADAPTERS.find((a) => a.matches(host.toLowerCase())) ?? GENERIC;
}

/** Which known field, if any, this element is according to the adapter. */
export function knownFieldFor(
  adapter: AtsAdapter,
  el: Element,
  doc: Document,
): KnownField | null {
  for (const [field, selectors] of Object.entries(adapter.selectors)) {
    for (const selector of selectors ?? []) {
      // Query rather than `el.matches` so an invalid selector cannot throw for
      // every element on the page — a bad map degrades, it doesn't break.
      let matched: Element | null = null;
      try {
        matched = doc.querySelector(selector);
      } catch {
        continue;
      }
      if (matched === el) return field as KnownField;
    }
  }
  return null;
}
