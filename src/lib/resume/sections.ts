/**
 * Section segmentation.
 *
 * Everything downstream depends on knowing which lines are work history and
 * which are education — matching a job requirement against a university's
 * name produces confident nonsense. Headings are detected structurally
 * (short, standalone, no sentence punctuation) and then mapped to a canonical
 * kind, so an unrecognised heading still ends the previous section instead of
 * silently swallowing the rest of the resume.
 */

export type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'awards'
  | 'other';

/** Ordered: the first pattern that matches wins. */
const HEADINGS: ReadonlyArray<[RegExp, SectionKind]> = [
  [/^(work|professional|employment|relevant)?\s*experience$/, 'experience'],
  [/^(work|employment|career)\s*history$/, 'experience'],
  [/^education(\s*(and|&)\s*training)?$/, 'education'],
  [/^academic\s*(background|history|qualifications)$/, 'education'],
  [/^(technical\s*|core\s*)?skills$/, 'skills'],
  [/^(technologies|technical\s*proficiencies|core\s*competencies)$/, 'skills'],
  [/^(personal\s*|selected\s*|side\s*)?projects$/, 'projects'],
  [/^(summary|profile|objective|about( me)?)$/, 'summary'],
  [/^(professional\s*summary|career\s*objective)$/, 'summary'],
  [/^(certifications?|licenses?|credentials)$/, 'certifications'],
  [/^(awards?|honou?rs?|achievements?|publications?)$/, 'awards'],
];

export interface Section {
  kind: SectionKind;
  /** The heading exactly as the resume wrote it. Empty for the preamble. */
  heading: string;
  lines: string[];
}

/** Normalise a candidate heading for matching: no case, no trailing colon. */
function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/[:•·|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyHeading(line: string): SectionKind | null {
  const s = normalizeHeading(line);
  if (!s) return null;
  for (const [re, kind] of HEADINGS) if (re.test(s)) return kind;
  return null;
}

/**
 * Whether a line stands alone as a heading.
 *
 * A recognised section name always qualifies. Anything else must *look* like a
 * heading — short, no sentence-ending punctuation, and either ALL CAPS or
 * Title Case — or a bullet like "Skills: Python, Go" would be read as a
 * section break mid-list.
 */
export function isHeading(line: string): boolean {
  const s = line.trim();
  if (s.length < 2 || s.length > 60) return false;
  if (/^[•\-*▪◦]/.test(s)) return false; // a bullet is never a heading
  if (/[.;,]$/.test(s)) return false;

  if (classifyHeading(s) !== null) return true;

  const words = s.split(/\s+/);
  if (words.length > 5) return false;

  const letters = s.replace(/[^a-z]/gi, '');
  if (letters.length === 0) return false;

  const isAllCaps = letters === letters.toUpperCase();
  return isAllCaps;
}

/**
 * Split resume text into sections.
 *
 * Text before the first heading becomes the `other` preamble — that is where
 * the contact block lives on essentially every resume.
 */
export function splitSections(text: string): Section[] {
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));

  const sections: Section[] = [];
  let current: Section = { kind: 'other', heading: '', lines: [] };

  for (const line of lines) {
    if (isHeading(line)) {
      if (current.lines.length > 0 || current.heading) sections.push(current);
      current = {
        kind: classifyHeading(line) ?? 'other',
        heading: line.trim(),
        lines: [],
      };
      continue;
    }
    if (line.trim()) current.lines.push(line);
  }

  if (current.lines.length > 0 || current.heading) sections.push(current);
  return sections;
}

/** All lines belonging to sections of a given kind, in document order. */
export function linesOfKind(sections: readonly Section[], kind: SectionKind): string[] {
  return sections.filter((s) => s.kind === kind).flatMap((s) => s.lines);
}

/** The contact block: everything before the first recognised heading. */
export function preamble(sections: readonly Section[]): string[] {
  const first = sections[0];
  return first && first.heading === '' ? first.lines : [];
}
