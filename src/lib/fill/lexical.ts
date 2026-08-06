/**
 * Tier 4 — deterministic fuzzy matching. Free, instant, offline.
 *
 * This replaces an embedding tier that never ran. `loadLocalEmbedder()`
 * returned null by design, so in practice every label tier 3's table missed
 * escalated straight to a paid call — which breaks the rule the resolver is
 * built on: never spend a call on a field a cheaper tier could answer.
 *
 * **What this catches is surface variation, not paraphrase.** Real forms are
 * full of "E-Mail Addres", "Frst Name", "Phone No.", "Mobile #" — typos,
 * punctuation, spacing and abbreviation around a phrase we already know. A
 * character-bigram comparison handles all of those and, importantly, *fails*
 * on text it does not recognise instead of guessing.
 *
 * Genuine semantic paraphrase ("tell us where you're hanging your hat these
 * days") is left to tier 5. Claiming otherwise would mean a scorer loose
 * enough to answer confidently and wrongly, and a wrong answer that looks
 * certain is worse than an empty field — the user is about to submit this.
 */
import { normalizeQuestion } from './normalize';
import type { FillContext } from './labels';

/**
 * Trusted only above this.
 *
 * Chosen from the measured gap rather than picked by feel. Scoring the real
 * cases either side:
 *
 *   dropped letter   "last nme" ~ "last name"      0.769   must match
 *   dropped letter   "frst name" ~ "first name"    0.800   must match
 *   ----------------------------------------------------- 0.74
 *   closest confusion "last name" ~ "first name"   0.667   must not match
 *   "company" ~ "current company"                  0.632   must not match
 *   "preferred pronouns" ~ "pronouns"              0.609   must not match
 *
 * The band between 0.667 and 0.769 is empty, so the threshold sits in it with
 * margin on both sides. Move it and re-measure, do not nudge it.
 *
 * One thing bigrams genuinely cannot do is transpositions — "emial" scores
 * 0.25 against "email", because swapping two letters destroys four bigrams.
 * Those escalate, which is the correct outcome for a tier whose job is to be
 * sure or silent.
 */
export const FUZZY_THRESHOLD = 0.74;

/** Character bigrams of a string, with spaces collapsed out. */
export function bigrams(s: string): string[] {
  const flat = s.replace(/\s+/g, '');
  const out: string[] = [];
  for (let i = 0; i < flat.length - 1; i++) out.push(flat.slice(i, i + 2));
  return out;
}

/**
 * Sørensen-Dice coefficient over character bigrams: 0 for nothing in common,
 * 1 for identical. Multiset-aware, so a repeated bigram cannot be matched
 * twice by a single occurrence.
 */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;

  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const g of left) pool.set(g, (pool.get(g) ?? 0) + 1);

  let hits = 0;
  for (const g of right) {
    const count = pool.get(g) ?? 0;
    if (count > 0) {
      pool.set(g, count - 1);
      hits++;
    }
  }

  return (2 * hits) / (left.length + right.length);
}

/**
 * Best similarity between `phrase` and any same-length run of words in
 * `label`.
 *
 * Whole-string comparison would fail on the common case: the phrase is two
 * words and the label wraps it in six ("what is your frst name, please"). The
 * window is widened by one word either side so a slightly wordier rendering
 * still lines up.
 */
export function fuzzyContains(label: string, phrase: string): number {
  if (!label || !phrase) return 0;

  const words = label.split(' ').filter(Boolean);
  const span = phrase.split(' ').filter(Boolean).length;
  if (words.length === 0) return 0;

  let best = diceSimilarity(label, phrase);

  for (let size = Math.max(1, span - 1); size <= span + 1; size++) {
    for (let start = 0; start + size <= words.length; start++) {
      const window = words.slice(start, start + size).join(' ');
      const score = diceSimilarity(window, phrase);
      if (score > best) best = score;
    }
  }

  return best;
}

/** A value the profile can supply, and the phrasings that name it. */
export interface LexicalCandidate {
  phrases: readonly string[];
  value: (ctx: FillContext) => string;
}

/**
 * Canonical phrasings, written *post-normalisation* — normalizeQuestion has
 * already folded "Given Name" and "given name" together, so these are the
 * forms that survive it. Anything a synonym rule in normalize.ts handles does
 * not need repeating here.
 */
export const LEXICAL_CANDIDATES: readonly LexicalCandidate[] = [
  { phrases: ['first name', 'given name', 'forename'], value: (c) => c.profile.contact.firstName.value },
  { phrases: ['last name', 'surname', 'family name'], value: (c) => c.profile.contact.lastName.value },
  { phrases: ['full name', 'legal name'], value: (c) => c.profile.contact.fullName.value },
  { phrases: ['email', 'email address'], value: (c) => c.profile.contact.email.value },
  { phrases: ['phone', 'phone number', 'mobile number'], value: (c) => c.profile.contact.phone.value },
  { phrases: ['linkedin', 'linkedin profile'], value: (c) => c.profile.contact.linkedin.value },
  { phrases: ['github', 'github profile'], value: (c) => c.profile.contact.github.value },
  { phrases: ['website', 'portfolio', 'personal website'], value: (c) => c.profile.contact.website.value },
  { phrases: ['location', 'city', 'current location'], value: (c) => c.profile.contact.location.value },
  { phrases: ['work authorization', 'authorized to work'], value: (c) => c.preferences.workAuthorized },
  { phrases: ['sponsorship', 'visa sponsorship'], value: (c) => c.preferences.requiresSponsorship },
  { phrases: ['willing to relocate', 'relocate'], value: (c) => c.preferences.willingToRelocate },
  { phrases: ['salary expectation', 'expected salary'], value: (c) => c.preferences.salaryExpectation },
  { phrases: ['notice period', 'start date'], value: (c) => c.preferences.noticePeriod },
  { phrases: ['pronouns'], value: (c) => c.preferences.pronouns },
  { phrases: ['gender'], value: (c) => c.preferences.gender },
  { phrases: ['race', 'ethnicity'], value: (c) => c.preferences.race },
  { phrases: ['veteran status'], value: (c) => c.preferences.veteranStatus },
  { phrases: ['disability status'], value: (c) => c.preferences.disabilityStatus },
  { phrases: ['current company', 'current employer'], value: (c) => c.profile.experience[0]?.company ?? '' },
  { phrases: ['current title', 'job title'], value: (c) => c.profile.experience[0]?.title ?? '' },
];

export interface LexicalMatch {
  value: string;
  score: number;
  phrase: string;
}

/**
 * Best fuzzy match for a label, or null when nothing clears the threshold.
 *
 * Candidates with nothing behind them are skipped before scoring: matching a
 * label to an empty profile field would mark it resolved and stop the chain
 * one tier short of an answer.
 */
export function resolveLexically(
  rawLabel: string,
  ctx: FillContext,
  candidates: readonly LexicalCandidate[] = LEXICAL_CANDIDATES,
  threshold = FUZZY_THRESHOLD,
): LexicalMatch | null {
  const label = normalizeQuestion(rawLabel);
  if (!label) return null;

  let best: LexicalMatch | null = null;

  for (const candidate of candidates) {
    const value = candidate.value(ctx).trim();
    if (!value) continue;

    for (const phrase of candidate.phrases) {
      const score = fuzzyContains(label, phrase);
      if (score >= threshold && (!best || score > best.score)) {
        best = { value, score, phrase };
      }
    }
  }

  return best;
}
