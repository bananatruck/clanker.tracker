/**
 * Tier 1 — per-ATS field maps.
 *
 * The cheapest tier and the most brittle, which is the trade: when a vendor
 * ships a redesign the map goes stale, the fields fall through to tiers 2-4,
 * and the fill still works. Nothing here is load-bearing — it is a fast path,
 * not a dependency. That is also why a stale map cannot silently produce a
 * *wrong* answer: a selector either matches an element or it doesn't.
 *
 * Two kinds of adapter live here:
 *
 *   - **Named ATSs** identified by hostname *or* by a marker in the DOM.
 *     Hostname alone is not enough, because the interesting case for a company
 *     careers page is a vendor form rendered inline on the company's own
 *     domain — Greenhouse's embed does exactly this, and matching on host
 *     would file it as generic and throw away a map we already have.
 *   - **The generic adapter**, which has no vendor to name and instead matches
 *     on the attribute conventions essentially every HTML form follows. This
 *     is what makes a proprietary board work at all.
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
  /**
   * DOM marker test, for a vendor form embedded on someone else's domain.
   * Checked only when no hostname matched, so a host match always wins.
   */
  detect?: (doc: Document) => boolean;
  /** CSS selectors, most specific first — the first that matches wins. */
  selectors: Partial<Record<KnownField, string[]>>;
}

/** True when any of these selectors matches something. Never throws. */
function present(doc: Document, ...selectors: string[]): boolean {
  for (const selector of selectors) {
    try {
      if (doc.querySelector(selector)) return true;
    } catch {
      // An invalid selector is a bug in this file, not a reason to fail a fill.
    }
  }
  return false;
}

/**
 * Greenhouse, in all the shapes it ships in.
 *
 * Three field-naming eras coexist in the wild and a company board can be on
 * any of them:
 *
 *   - the classic hosted board, `job_application[first_name]`
 *   - the current board on `job-boards.greenhouse.io`, plain `first_name`
 *   - the embed, which renders either of the above inside `#grnhse_app` —
 *     sometimes in an iframe on `boards.greenhouse.io` (caught by hostname
 *     from inside the frame) and sometimes inline on the company's own domain,
 *     which is what `detect` is for.
 *
 * Listing both naming schemes costs nothing: a selector that matches nothing
 * is skipped.
 */
const GREENHOUSE: AtsAdapter = {
  id: 'greenhouse',
  matches: (host) => host.endsWith('greenhouse.io'),
  detect: (doc) =>
    present(
      doc,
      '#grnhse_app',
      '#grnhse-iframe',
      '[data-mapped="greenhouse"]',
      'input[name^="job_application"]',
      'form[action*="greenhouse.io"]',
    ),
  selectors: {
    firstName: [
      '#first_name',
      'input[name="job_application[first_name]"]',
      'input[name="first_name"]',
    ],
    lastName: [
      '#last_name',
      'input[name="job_application[last_name]"]',
      'input[name="last_name"]',
    ],
    email: ['#email', 'input[name="job_application[email]"]', 'input[name="email"]'],
    phone: ['#phone', 'input[name="job_application[phone]"]', 'input[name="phone"]'],
    location: [
      '#job_application_location',
      'input[name="job_application[location]"]',
      'input[id*="location" i]',
    ],
    resume: ['#resume', 'input[name="job_application[resume]"]', 'input[name="resume"]'],
    linkedin: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'],
    website: ['input[name*="website" i]', 'input[name*="portfolio" i]'],
  },
};

const LEVER: AtsAdapter = {
  id: 'lever',
  matches: (host) => host.endsWith('lever.co'),
  detect: (doc) => present(doc, 'form[action*="lever.co"]', '.application-form[data-qa]'),
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
  detect: (doc) => present(doc, 'input[name^="_systemfield_"]', '#ashby-application-form-container'),
  selectors: {
    fullName: ['input[name="_systemfield_name"]'],
    email: ['input[name="_systemfield_email"]'],
    phone: ['input[name="_systemfield_phone"]'],
    location: ['input[name="_systemfield_location"]'],
    resume: ['input[name="_systemfield_resume"]'],
    linkedin: ['input[name*="linkedin" i]'],
  },
};

const WORKABLE: AtsAdapter = {
  id: 'workable',
  matches: (host) => host.endsWith('workable.com'),
  detect: (doc) => present(doc, '[data-ui="application-form"]', 'form[action*="workable.com"]'),
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
  detect: (doc) => present(doc, '[data-automation-id="jobPostingHeader"]', '[data-automation-id="legalNameSection_firstName"]'),
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

/** SmartRecruiters, widely white-labelled onto company careers domains. */
const SMARTRECRUITERS: AtsAdapter = {
  id: 'smartrecruiters',
  matches: (host) => host.endsWith('smartrecruiters.com'),
  detect: (doc) => present(doc, '[data-test="application-form"]', 'form[action*="smartrecruiters"]'),
  selectors: {
    firstName: ['input[name="firstName"]', '#firstName'],
    lastName: ['input[name="lastName"]', '#lastName'],
    email: ['input[name="email"]', '#email'],
    phone: ['input[name="phoneNumber"]', '#phoneNumber'],
    location: ['input[name="location"]'],
    resume: ['input[type="file"]'],
    linkedin: ['input[name*="linkedin" i]'],
  },
};

/** iCIMS, usually on a careers-{company}.icims.com subdomain or in an iframe. */
const ICIMS: AtsAdapter = {
  id: 'icims',
  matches: (host) => host.endsWith('icims.com'),
  detect: (doc) => present(doc, '#icims_content_iframe', '[id^="icims_"]'),
  selectors: {
    firstName: ['input[id*="firstname" i]', 'input[name*="firstname" i]'],
    lastName: ['input[id*="lastname" i]', 'input[name*="lastname" i]'],
    email: ['input[id*="email" i]', 'input[type="email"]'],
    phone: ['input[id*="phone" i]', 'input[type="tel"]'],
    resume: ['input[type="file"]'],
  },
};

const JOBVITE: AtsAdapter = {
  id: 'jobvite',
  matches: (host) => host.endsWith('jobvite.com'),
  detect: (doc) => present(doc, '.jv-form', 'form[action*="jobvite"]'),
  selectors: {
    firstName: ['input[name="firstName"]', '#jv-first-name'],
    lastName: ['input[name="lastName"]', '#jv-last-name'],
    email: ['input[name="email"]', '#jv-email'],
    phone: ['input[name="phone"]', '#jv-phone'],
    resume: ['input[type="file"]'],
  },
};

export const ADAPTERS: readonly AtsAdapter[] = [
  GREENHOUSE,
  LEVER,
  ASHBY,
  WORKABLE,
  WORKDAY,
  LINKEDIN,
  SMARTRECRUITERS,
  ICIMS,
  JOBVITE,
];

/**
 * The generic adapter — every proprietary careers page ever built.
 *
 * There is no vendor to name here, so it matches on the attribute conventions
 * that HTML forms follow whatever built them. `type="email"` is an email box
 * on every site in the world; a field whose name contains both "first" and
 * "name" is a first-name field. These are not guesses about a vendor's
 * markup, they are the markup's own semantics.
 *
 * Paired attribute selectors matter: `[name*="first"]` alone would fire on
 * `first_time_applicant`, so both halves are required on the same element.
 *
 * This adapter still never earns auto-submit — see `isCleanRun`. Convention is
 * strong evidence, not a verified mapping, and a human confirms every value.
 */
export const GENERIC: AtsAdapter = {
  id: 'generic',
  matches: () => true,
  selectors: {
    firstName: [
      'input[autocomplete="given-name"]',
      'input[name*="first" i][name*="name" i]',
      'input[id*="first" i][id*="name" i]',
      'input[name="fname" i]',
    ],
    lastName: [
      'input[autocomplete="family-name"]',
      'input[name*="last" i][name*="name" i]',
      'input[id*="last" i][id*="name" i]',
      'input[name*="surname" i]',
      'input[name="lname" i]',
    ],
    fullName: [
      'input[autocomplete="name"]',
      'input[name="name" i]',
      'input[name*="full" i][name*="name" i]',
      'input[id*="full" i][id*="name" i]',
    ],
    email: ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]'],
    phone: [
      'input[type="tel"]',
      'input[name*="phone" i]',
      'input[name*="mobile" i]',
      'input[id*="phone" i]',
    ],
    location: [
      'input[autocomplete="address-level2"]',
      'input[name*="city" i]',
      'input[name*="location" i]',
      'input[id*="location" i]',
    ],
    linkedin: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'],
    github: ['input[name*="github" i]', 'input[id*="github" i]'],
    website: [
      'input[name*="portfolio" i]',
      'input[name*="website" i]',
      'input[id*="portfolio" i]',
    ],
    resume: ['input[type="file"][name*="resume" i]', 'input[type="file"][name*="cv" i]'],
  },
};

/**
 * Which ATS this page is.
 *
 * Hostname first, because it is unambiguous. The DOM probe only runs when no
 * host matched, which is exactly the embedded-vendor-form case: a Greenhouse
 * form rendered inline on `careers.acme.com` is still a Greenhouse form and
 * should get the Greenhouse map rather than falling to generic.
 */
export function detectAts(host: string, doc?: Document): AtsAdapter {
  const byHost = ADAPTERS.find((a) => a.matches(host.toLowerCase()));
  if (byHost) return byHost;

  if (doc) {
    const byDom = ADAPTERS.find((a) => a.detect?.(doc));
    if (byDom) return byDom;
  }

  return GENERIC;
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
      //
      // Identity against the *first* match is also deliberate for the generic
      // patterns: it means one "email"-ish field is claimed, not every field
      // on the page whose name happens to contain the word.
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
