/**
 * Question normalisation — the key to tier 2 of the resolver chain.
 *
 * Every ATS asks the same questions with different punctuation, casing,
 * numbering and boilerplate. Collapsing them to one stable key is what lets
 * an answer given once on Greenhouse fill itself on Lever for free.
 *
 * This is the single highest-leverage function in the codebase: tier 2 is
 * what drives the median application to zero LLM calls.
 */

/** Boilerplate that carries no meaning and varies between vendors. */
const NOISE = [
  /\(\s*optional\s*\)/gi,
  /\(\s*required\s*\)/gi,
  /\*\s*$/,
  /^\s*\d+[.)]\s*/, // leading "1." / "2)" numbering
  // Leading interrogative stems: "Are you authorized to work" and
  // "Authorized to work" are the same field on two different ATSs.
  /^\s*(are|do|does|did|have|has|will|would|can|could|is)\s+you(r)?\b/i,
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\bif applicable\b/gi,
  /\bselect one\b/gi,
  /\bchoose one\b/gi,
];

/** Vendor-specific phrasings that mean the same field. */
const SYNONYMS: ReadonlyArray<[RegExp, string]> = [
  [/\b(e-?mail address|email addr)\b/gi, 'email'],
  [/\b(telephone|phone number|mobile|cell)\b/gi, 'phone'],
  [/\b(given name|forename)\b/gi, 'first name'],
  [/\b(surname|family name|last name)\b/gi, 'last name'],
  [/\b(full legal name)\b/gi, 'full name'],
  [/\b(linked ?in profile|linkedin url)\b/gi, 'linkedin'],
  [/\b(git ?hub profile|github url)\b/gi, 'github'],
  [/\b(personal )?(website|portfolio)( url)?\b/gi, 'website'],
  [/\b(currently )?authorized to work\b/gi, 'work authorization'],
  [/\b(require|need) (visa )?sponsorship\b/gi, 'sponsorship'],
  [/\b(desired|expected) (salary|compensation)\b/gi, 'salary expectation'],
  [/\b(years of )?experience with\b/gi, 'experience with'],
  [/\bwhy (do you want to|are you interested in) work(ing)? (at|for|with)\b/gi, 'why this company'],
];

/**
 * Collapse a question to a stable lookup key.
 *
 * Casing, punctuation, whitespace, numbering and boilerplate must all fold
 * into the same key — that invariant is asserted in tests.
 */
export function normalizeQuestion(raw: string): string {
  let s = raw.normalize('NFKD').toLowerCase();

  // Strip diacritics and unify unicode punctuation before anything else.
  s = s.replace(/[̀-ͯ]/g, '');
  s = s.replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/[‐-―]/g, '-');

  for (const re of NOISE) s = s.replace(re, ' ');
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);

  s = s.replace(/[^a-z0-9\s]/g, ' '); // drop remaining punctuation
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * Stable non-cryptographic hash of the normalised question (FNV-1a, 32-bit).
 * Used as the primary key of the `questions` table.
 */
export function questionHash(raw: string): string {
  const s = normalizeQuestion(raw);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
