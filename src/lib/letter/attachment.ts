/** Match a reviewed generated letter to one posting and turn it into a local file. */
import type { CoverLetter } from '@/lib/db/schema';
import type { FileAttachment } from '@/lib/fill/apply';
import { canonicalJobUrl } from '@/lib/tracker/identity';

export interface LetterPostingIdentity {
  url: string;
  company: string;
  role: string;
}

const fold = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Prefer an exact canonical URL and only fall back for letters created before
 * posting URLs were retained.
 *
 * A URL-bound letter is never reused by title alone because companies often
 * advertise several roles with the same title and different requirements.
 */
export function selectCoverLetter(
  candidates: readonly CoverLetter[],
  posting: LetterPostingIdentity,
): CoverLetter | null {
  const newest = [...candidates]
    .filter((letter) => letter.text.trim() !== '')
    .sort((a, b) => b.createdAt - a.createdAt);
  const url = canonicalJobUrl(posting.url);

  if (url) {
    const exact = newest.find(
      (letter) => letter.sourceUrl && canonicalJobUrl(letter.sourceUrl) === url,
    );
    if (exact) return exact;
  }

  const company = fold(posting.company);
  const role = fold(posting.role);
  if (!company || !role) return null;

  return newest.find(
    (letter) =>
      !letter.sourceUrl && fold(letter.company) === company && fold(letter.role) === role,
  ) ?? null;
}

function slug(value: string): string {
  return fold(value).replace(/\s+/g, '-');
}

/** Build the exact UTF-8 bytes offered in review before a page receives them. */
export function coverLetterAttachment(letter: CoverLetter): FileAttachment {
  const identity = [slug(letter.company), slug(letter.role)].filter(Boolean).join('-');
  const stem = (identity || 'application').slice(0, 90).replace(/-+$/g, '');
  const body = `${letter.text.trim()}\n`;
  const encoded = new TextEncoder().encode(body);

  return {
    fileName: `${stem}-cover-letter.txt`,
    mimeType: 'text/plain;charset=utf-8',
    bytes: encoded.slice().buffer,
  };
}
