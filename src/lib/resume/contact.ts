/**
 * Contact extraction — tier 3 of the resolver, done once at parse time.
 *
 * Everything here is regex or nothing. These nine fields are on every
 * application form ever built, and an LLM call to find an email address in a
 * document that literally contains an email address would be indefensible
 * given the cost architecture.
 *
 * Confidence is honest: an anchored match (`mailto:`-grade certainty) is
 * `certain`; a positional guess (the name is usually the first line) is
 * `guessed`, which colours the review grid amber and asks the user to confirm.
 */
import { emptyContact, field, type Contact } from '@/types/profile';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/** +1 (555) 123-4567, 555.123.4567, +44 20 7946 0958. */
const PHONE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\d-])/;

const LINKEDIN = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+\/?/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/?/i;
const URL = /(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/[\w./%-]*)?/;

/** "Berlin, Germany", "Austin, TX", "San Francisco, CA". */
const LOCATION = /\b([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)*),\s*([A-Z]{2}|[A-Z][a-zA-Z]+)\b/;

/** Words that disqualify a line from being a person's name. */
const NOT_A_NAME =
  /\b(resume|curriculum|vitae|cv|engineer|developer|manager|designer|analyst|scientist|intern|student|phone|email|address)\b/i;

function normalizeUrl(raw: string): string {
  const s = raw.replace(/\/$/, '');
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/**
 * Does this line look like a human name?
 *
 * Two to four capitalised words, no digits, no punctuation that belongs to
 * contact details. Deliberately conservative — a false positive here puts a
 * job title in the "Full name" box of every application the user sends.
 */
export function looksLikeName(line: string): boolean {
  const s = line.trim();
  if (!s || s.length > 60) return false;
  if (/[@\d]/.test(s)) return false;
  if (NOT_A_NAME.test(s)) return false;
  if (/[|/(),:;]/.test(s)) return false;

  const words = s.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;

  return words.every((w) => /^[A-Z][a-zA-Z.'-]*$/.test(w));
}

/**
 * Extract contact details.
 *
 * `preambleLines` is the block above the first section heading; `fullText` is
 * the whole resume, used as a fallback for people who put their links in a
 * footer instead.
 */
export function extractContact(preambleLines: readonly string[], fullText: string): Contact {
  const contact = emptyContact();
  const head = preambleLines.join('\n');

  // Search the header first, then the whole document. A link in the header is
  // unambiguously the candidate's; one found on page two might be a reference.
  const find = (re: RegExp): { value: string; inHead: boolean } | null => {
    const h = re.exec(head);
    if (h) return { value: h[0], inHead: true };
    const f = re.exec(fullText);
    return f ? { value: f[0], inHead: false } : null;
  };

  const email = find(EMAIL);
  if (email) contact.email = field(email.value, 'certain', 'regex');

  const phone = find(PHONE);
  if (phone) {
    contact.phone = field(phone.value.trim(), phone.inHead ? 'certain' : 'guessed', 'regex');
  }

  const linkedin = find(LINKEDIN);
  if (linkedin) contact.linkedin = field(normalizeUrl(linkedin.value), 'certain', 'regex');

  const github = find(GITHUB);
  if (github) contact.github = field(normalizeUrl(github.value), 'certain', 'regex');

  const location = LOCATION.exec(head);
  if (location) contact.location = field(location[0], 'guessed', 'heuristic');

  // A personal site is whatever URL is left once the known networks are out.
  const siteLine = head
    .split(/[\s|·•]+/)
    .find(
      (tok) =>
        URL.test(tok) &&
        !LINKEDIN.test(tok) &&
        !GITHUB.test(tok) &&
        !EMAIL.test(tok) &&
        /\.[a-z]{2,}/i.test(tok),
    );
  if (siteLine) contact.website = field(normalizeUrl(siteLine), 'guessed', 'heuristic');

  // The name is positional: resumes lead with it. First line that matches is
  // `certain`; a later one is a guess.
  const nameIndex = preambleLines.findIndex(looksLikeName);
  if (nameIndex >= 0) {
    const name = preambleLines[nameIndex]!.trim();
    const words = name.split(/\s+/);

    contact.fullName = field(name, nameIndex === 0 ? 'certain' : 'guessed', 'heuristic');
    contact.firstName = field(words[0]!, nameIndex === 0 ? 'certain' : 'guessed', 'heuristic');
    contact.lastName = field(
      words[words.length - 1]!,
      nameIndex === 0 ? 'certain' : 'guessed',
      'heuristic',
    );
  }

  return contact;
}
