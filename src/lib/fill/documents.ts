/** Conservative classification for application document and long-form fields. */
import type { KnownField } from './adapters';
import type { HarvestedField } from './types';

export type ApplicationDocumentKind = 'resume' | 'cover-letter';

const normalize = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const RESUME = /\b(resume|cv|curriculum vitae)\b/;
const COVER_LETTER = /\b(cover letter|motivation letter|letter of motivation|supporting statement)\b/;

/**
 * Read the page's own words first and use a vendor map only as a fallback.
 *
 * A combined "resume or cover letter" input is deliberately ambiguous: the
 * extension cannot know which document the employer expects, so it attaches
 * neither and leaves that choice on the page.
 */
export function documentFieldKind(
  field: HarvestedField,
  adapterHit?: KnownField | null,
): ApplicationDocumentKind | null {
  const signal = normalize([
    field.label,
    field.name,
    field.placeholder,
    field.context,
    field.semanticPath,
  ].filter(Boolean).join(' '));
  const resume = RESUME.test(signal);
  const coverLetter = COVER_LETTER.test(signal);

  if (resume && coverLetter) return null;
  if (coverLetter) return 'cover-letter';
  if (resume) return 'resume';
  if (adapterHit === 'resume') return 'resume';
  return null;
}

/** Whether a file input truthfully accepts the generated UTF-8 `.txt` file. */
export function acceptsTextAttachment(accept: string | null | undefined): boolean {
  const value = accept?.trim().toLowerCase() ?? '';
  if (!value) return true;

  return value.split(',').some((part) => {
    const token = part.trim().split(';', 1)[0] ?? '';
    return token === '.txt' || token === 'text/plain' || token === 'text/*' || token === '*/*';
  });
}
