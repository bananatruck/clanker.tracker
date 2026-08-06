/**
 * Tier 3 — the deterministic label matcher.
 *
 * Reuses `normalizeQuestion` so this table is written against *folded* labels:
 * "Given name", "First Name *", and "2. First name (required)" all arrive here
 * as `first name`. Every entry that would otherwise need a synonym belongs in
 * normalize.ts, not here.
 *
 * Free, and covers roughly the fields every application form has ever asked
 * for. Anything this tier answers is one fewer field for tier 5 to guess at.
 */
import { normalizeQuestion } from './normalize';
import type { Preferences } from './types';
import type { ResumeProfile } from '@/types/profile';

export interface FillContext {
  profile: ResumeProfile;
  preferences: Preferences;
}

/** A folded-label predicate paired with the value it yields. */
interface Rule {
  test: (label: string) => boolean;
  value: (ctx: FillContext) => string;
}

/** Whole-token match, so "name" does not fire on "company name". */
const has = (label: string, ...words: string[]): boolean =>
  words.every((w) => new RegExp(`(^|\\s)${w}(\\s|$)`).test(label));

const includes = (label: string, ...phrases: string[]): boolean =>
  phrases.some((p) => label.includes(p));

/**
 * Ordered, most specific first. "first name" must be tested before the bare
 * "name" rule or every name field on the internet becomes the full name.
 */
const RULES: Rule[] = [
  // --- identity ---
  { test: (l) => has(l, 'first', 'name'), value: (c) => c.profile.contact.firstName.value },
  { test: (l) => has(l, 'last', 'name'), value: (c) => c.profile.contact.lastName.value },
  { test: (l) => has(l, 'preferred', 'name'), value: (c) => c.profile.contact.firstName.value },
  { test: (l) => has(l, 'full', 'name') || l === 'name', value: (c) => c.profile.contact.fullName.value },

  // --- contact ---
  { test: (l) => includes(l, 'email'), value: (c) => c.profile.contact.email.value },
  { test: (l) => includes(l, 'phone'), value: (c) => c.profile.contact.phone.value },
  { test: (l) => includes(l, 'linkedin'), value: (c) => c.profile.contact.linkedin.value },
  { test: (l) => includes(l, 'github'), value: (c) => c.profile.contact.github.value },
  {
    test: (l) => includes(l, 'website', 'portfolio', 'personal site'),
    value: (c) => c.profile.contact.website.value,
  },
  {
    test: (l) => includes(l, 'location', 'city', 'where are you based', 'current residence'),
    value: (c) => c.profile.contact.location.value,
  },

  // --- work eligibility ---
  {
    test: (l) => includes(l, 'work authorization', 'legally authorized', 'eligible to work'),
    value: (c) => c.preferences.workAuthorized,
  },
  {
    test: (l) => includes(l, 'sponsorship', 'visa'),
    value: (c) => c.preferences.requiresSponsorship,
  },
  { test: (l) => includes(l, 'relocate'), value: (c) => c.preferences.willingToRelocate },

  // --- terms ---
  {
    test: (l) => includes(l, 'salary expectation', 'compensation expectation', 'desired salary'),
    value: (c) => c.preferences.salaryExpectation,
  },
  {
    test: (l) => includes(l, 'notice period', 'when can you start', 'start date', 'availability'),
    value: (c) => c.preferences.noticePeriod,
  },

  // --- EEO ---
  { test: (l) => includes(l, 'pronoun'), value: (c) => c.preferences.pronouns },
  { test: (l) => includes(l, 'veteran'), value: (c) => c.preferences.veteranStatus },
  { test: (l) => includes(l, 'disability'), value: (c) => c.preferences.disabilityStatus },
  { test: (l) => includes(l, 'gender', 'sex'), value: (c) => c.preferences.gender },
  {
    test: (l) => includes(l, 'race', 'ethnicity', 'hispanic', 'latino'),
    value: (c) => c.preferences.race,
  },

  // --- most recent role, which many forms ask for separately ---
  {
    test: (l) => includes(l, 'current company', 'current employer', 'most recent employer'),
    value: (c) => c.profile.experience[0]?.company ?? '',
  },
  {
    test: (l) => includes(l, 'current title', 'job title', 'current role', 'most recent title'),
    value: (c) => c.profile.experience[0]?.title ?? '',
  },
];

/**
 * Fields that ask about somebody who is not the applicant.
 *
 * "Referrer's email address" and "Your manager's first name" both look exactly
 * like fields we hold an answer for, and every deterministic tier will happily
 * claim them — the label contains "email", or "first" and "name", and nothing
 * else in the matcher disagrees. Filling them puts the applicant's own details
 * where a third party's belong, which is worse than leaving them empty: it is
 * confidently wrong, it looks resolved in the review, and on a long form it is
 * exactly the kind of row someone scrolls past.
 *
 * Whole-word matching matters here. "Preferred name" contains "referred" as a
 * substring and is very much the applicant's own field.
 */
const THIRD_PARTY = [
  'referrer',
  'referred',
  'reference',
  'referee',
  'manager',
  'supervisor',
  'recruiter',
  'emergency',
  'next of kin',
  'guardian',
  'spouse',
  'colleague',
  'employer contact',
  'contact person',
];

const THIRD_PARTY_RE = new RegExp(
  `(^|\\s)(${THIRD_PARTY.map((w) => w.replace(/ /g, '\\s+')).join('|')})(\\s|$)`,
  'i',
);

/**
 * Whether this field is asking about someone other than the applicant.
 *
 * Consulted before every deterministic tier. Answer memory is exempt: if the
 * user has answered this exact question before, that answer is theirs and is
 * right whoever it was about.
 */
export function isAboutSomeoneElse(rawLabel: string): boolean {
  return THIRD_PARTY_RE.test(normalizeQuestion(rawLabel));
}

/**
 * Answer a label deterministically, or return null so the chain escalates.
 *
 * Returns null rather than an empty string when the rule matched but the
 * profile has nothing for it — an empty answer is not an answer, and letting
 * it through would mark the field resolved and skip tier 4 and 5.
 */
export function matchLabel(rawLabel: string, ctx: FillContext): string | null {
  const label = normalizeQuestion(rawLabel);
  if (!label) return null;

  for (const rule of RULES) {
    if (!rule.test(label)) continue;
    const value = rule.value(ctx).trim();
    return value === '' ? null : value;
  }

  return null;
}

/**
 * Pick the option that best expresses `value` for a select or radio group.
 *
 * Forms spell the same answer a dozen ways — "Yes", "yes", "I am authorized",
 * "Authorized to work in the US". Matching exact-then-prefix-then-substring
 * keeps a "No" answer from being satisfied by an option reading "Not now".
 */
export function matchOption(
  value: string,
  options: ReadonlyArray<{ value: string; label: string }>,
): string | null {
  if (!value || options.length === 0) return null;

  const want = value.trim().toLowerCase();
  const norm = (s: string) => s.trim().toLowerCase();

  const exact = options.find((o) => norm(o.value) === want || norm(o.label) === want);
  if (exact) return exact.value;

  // Both looser passes are word-boundary aware. Plain `startsWith` would let
  // "No" be satisfied by "Not right now", and plain `includes` would let "yes"
  // match "eyesight" — each one silently answering the opposite of the truth.
  const escaped = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const asPrefix = new RegExp(`^${escaped}([^a-z0-9]|$)`, 'i');
  const asWord = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');

  const startsWith = options.find((o) => asPrefix.test(norm(o.label)) || asPrefix.test(norm(o.value)));
  if (startsWith) return startsWith.value;

  // Substring, but only when the answer is a real word rather than "y"/"n" —
  // a bare letter matches almost anything and produces confident nonsense.
  if (want.length >= 3) {
    const contains = options.find((o) => asWord.test(norm(o.label)) || asWord.test(norm(o.value)));
    if (contains) return contains.value;
  }

  return null;
}
