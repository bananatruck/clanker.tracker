/**
 * Job description → discrete requirements.
 *
 * The point of the evidence table is that it lists *every single thing the
 * posting asks for*. That only works if extraction is exhaustive, so this is
 * deliberately generous: a line that might be a requirement becomes one, and
 * the user can ignore a row they disagree with. Missing a required skill
 * because the extractor was fussy is the failure mode that matters.
 */
import type { Necessity, Requirement, RequirementKind } from '@/types/ats';
import { extractYears, keywords } from './keywords';

const BULLET = /^[\s]*[•·▪◦‣∙*+—–-]\s+/;

/** Section headings and what they imply about necessity. */
const SECTION_NECESSITY: ReadonlyArray<[RegExp, Necessity]> = [
  [/\b(nice[\s-]to[\s-]have|preferred|bonus|plus(es)?|desirable|good[\s-]to[\s-]have)\b/i, 'preferred'],
  [/\b(requirements?|qualifications?|must[\s-]have|what you'?ll need|who you are|basic qualifications)\b/i, 'required'],
  [/\b(responsibilities|what you'?ll do|the role|day[\s-]to[\s-]day)\b/i, 'required'],
];

/** Phrases inside a line that override whatever section it sits in. */
const PREFERRED_STEM =
  /\b(nice to have|preferred|a plus|bonus|desirable|ideally|would be great|familiarity with)\b/i;
const REQUIRED_STEM = /\b(must have|required|requires|essential|minimum|at least|you have|proficien)/i;

/** A heading is short, standalone, and often ends in a colon. */
function isSectionHeading(line: string): boolean {
  const s = line.trim();
  if (!s || s.length > 70) return false;
  if (BULLET.test(s)) return false;
  return /:$/.test(s) || s.split(/\s+/).length <= 6;
}

function classifyKind(text: string): RequirementKind {
  if (/\b(degree|bachelor|master|phd|b\.?s\.?|m\.?s\.?|diploma|graduate)\b/i.test(text)) {
    return 'education';
  }
  if (/\d+\s*\+?\s*years?\b/i.test(text)) return 'experience';
  if (/^(you will|you'll|lead|own|build|design|drive|manage|collaborate|partner|work with)\b/i.test(text.trim())) {
    return 'responsibility';
  }
  if (/\b(proficien|experience with|knowledge of|familiar|expertise|skilled|fluent)\b/i.test(text)) {
    return 'skill';
  }
  return 'other';
}

/**
 * Is this line asking for something?
 *
 * Bullets almost always are. Unbulleted prose only counts when it carries an
 * explicit requirement stem, or the boilerplate ("We are a fast-growing…")
 * floods the table with noise.
 */
function isRequirementLine(line: string, bulleted: boolean): boolean {
  // Measure the ask itself, not the glyph in front of it.
  const s = line.replace(BULLET, '').trim();
  if (s.length > 400) return false;

  // A bullet is already the signal. Length must not gate here: a skills list
  // of "• Go / • Rust / • SQL" is an entirely ordinary way to state
  // requirements, and an 8-character floor would drop every one of them.
  if (bulleted) return s.length >= 2;

  if (s.length < 8) return false;
  return REQUIRED_STEM.test(s) || PREFERRED_STEM.test(s) || /\byears?\b.*\bexperience\b/i.test(s);
}

/** Strip the bullet glyph and any trailing separator, leaving the ask itself. */
function cleanRequirement(line: string): string {
  return line
    .replace(BULLET, '')
    .replace(/\s*[;,]\s*$/, '')
    .trim();
}

/**
 * Extract requirements from a job description.
 *
 * Necessity comes from the enclosing section heading unless the line itself
 * says otherwise — "Kubernetes (nice to have)" under a **Requirements**
 * heading is preferred, not required, and mis-labelling it would send the user
 * off to learn Kubernetes for no reason.
 */
export function extractRequirements(jdText: string): Requirement[] {
  const lines = jdText.split('\n');
  const out: Requirement[] = [];
  const seen = new Set<string>();

  let sectionNecessity: Necessity = 'required';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const bulleted = BULLET.test(raw);

    if (!bulleted && isSectionHeading(line)) {
      for (const [re, necessity] of SECTION_NECESSITY) {
        if (re.test(line)) {
          sectionNecessity = necessity;
          break;
        }
      }
      // A heading is context, never a requirement in its own right.
      continue;
    }

    if (!isRequirementLine(line, bulleted)) continue;

    const text = cleanRequirement(line);
    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const necessity: Necessity = PREFERRED_STEM.test(text)
      ? 'preferred'
      : REQUIRED_STEM.test(text)
        ? 'required'
        : sectionNecessity;

    out.push({
      id: `req-${out.length}`,
      text,
      necessity,
      kind: classifyKind(text),
      years: extractYears(text),
      keywords: keywords(text),
    });
  }

  return out;
}

/** Best-effort company and role, for labelling the saved scan. */
export function guessPosting(jdText: string): { company: string; jobTitle: string } {
  const lines = jdText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine = lines.find((l) =>
    /\b(engineer|developer|manager|designer|analyst|scientist|director|lead|architect|intern|specialist)\b/i.test(
      l,
    ),
  );

  const atLine = lines.find((l) => /\bat\s+[A-Z][\w&.\- ]+/.test(l));
  const company = atLine ? (/\bat\s+([A-Z][\w&.\- ]+)/.exec(atLine)?.[1]?.trim() ?? '') : '';

  return { company, jobTitle: titleLine?.slice(0, 120) ?? '' };
}
