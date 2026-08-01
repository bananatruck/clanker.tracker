/**
 * Turning section lines into structured entries.
 *
 * The load-bearing observation: in essentially every resume layout, a **date
 * range marks the start of an entry**. Company, title, and location move
 * around between templates; the date does not. So we anchor on dates and
 * treat everything until the next date as belonging to that job.
 *
 * The bullets this produces are the evidence pool the ATS scan matches
 * against, which is why bullet text is preserved verbatim — only the bullet
 * glyph is stripped. Rewording a bullet here would mean the evidence table
 * quotes something the user never wrote.
 */
import type { EducationEntry, ExperienceEntry } from '@/types/profile';
import { parseDateRange } from './dates';

/** Glyphs templates use to mark a bullet. */
const BULLET = /^[\s]*[•·▪◦‣∙*+•-]\s+/;

/** Separators between company, title and location on one line. */
const FIELD_SEP = /\s*[|·•—–]\s*|\s{3,}|\s+[-–]\s+/;

/** Words that mean the token is a job title rather than an employer. */
const TITLE_WORDS =
  /\b(engineer|developer|manager|director|designer|analyst|scientist|consultant|intern|lead|architect|specialist|coordinator|associate|president|officer|founder|head\s+of|writer|editor|researcher)\b/i;

/** Suffixes that mean the token is an employer. */
const COMPANY_WORDS = /\b(inc|llc|ltd|gmbh|corp|corporation|company|co|technologies|labs|group|studio|systems|solutions|university|college)\b\.?/i;

const isBullet = (line: string) => BULLET.test(line);
const stripBullet = (line: string) => line.replace(BULLET, '').trim();

/** Remove the date range from a header line, leaving company/title/location. */
function stripDates(line: string): string {
  return line
    .replace(
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*\d{4}\b/gi,
      ' ',
    )
    .replace(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(present|current|now|ongoing)\b/gi, ' ')
    .replace(/\s*[-–—~]\s*(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Assign the non-date tokens of a header to company / title / location.
 *
 * Uses vocabulary rather than position, because "Acme Corp — Senior Engineer"
 * and "Senior Engineer, Acme Corp" are both extremely common.
 */
function assignHeaderTokens(tokens: readonly string[]): {
  company: string;
  title: string;
  location: string;
} {
  let company = '';
  let title = '';
  let location = '';

  const rest: string[] = [];

  for (const raw of tokens) {
    const tok = raw.replace(/^[,;\s]+|[,;\s]+$/g, '');
    if (!tok) continue;

    if (!location && /^[A-Z][\w.'-]*(?:\s+[\w.'-]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+)$/.test(tok)) {
      location = tok;
    } else if (!title && TITLE_WORDS.test(tok)) {
      title = tok;
    } else if (!company && COMPANY_WORDS.test(tok)) {
      company = tok;
    } else {
      rest.push(tok);
    }
  }

  // Whatever is left fills the empty slots, company first — an unrecognised
  // proper noun on an experience header is far more often an employer.
  for (const tok of rest) {
    if (!company) company = tok;
    else if (!title) title = tok;
  }

  return { company, title, location };
}

/**
 * Parse the experience section into entries.
 *
 * Confidence is `certain` only when a job has a company, a start date, and at
 * least one bullet — anything less is flagged for review rather than shipped
 * into an application silently.
 */
export function parseExperience(lines: readonly string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;
  /** Lines seen since the last header that might hold the title. */
  let pendingHeader: string[] = [];

  const finish = () => {
    if (!current) return;
    current.confidence =
      current.company && current.start && current.bullets.length > 0
        ? 'certain'
        : 'guessed';
    entries.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const bullet = isBullet(line);
    const range = bullet ? null : parseDateRange(line);

    if (range && range.start) {
      finish();

      const tokens = stripDates(line).split(FIELD_SEP).filter(Boolean);
      // A date-only header ("2021 – 2023") means the company sits on the line
      // above it, which we have been holding on to.
      const source = tokens.length > 0 ? tokens : pendingHeader.flatMap((l) => l.split(FIELD_SEP));
      const { company, title, location } = assignHeaderTokens(source);

      current = {
        id: `exp-${entries.length}`,
        company,
        title,
        location,
        start: range.start,
        end: range.end,
        bullets: [],
        confidence: 'guessed',
      };
      pendingHeader = [];
      continue;
    }

    if (!current) {
      // Still above the first dated entry — remember it as a possible header.
      pendingHeader.push(line);
      if (pendingHeader.length > 2) pendingHeader.shift();
      continue;
    }

    if (bullet) {
      current.bullets.push(stripBullet(line));
      continue;
    }

    // An unmarked line: a short one is a stray title/company, a long one is
    // prose that belongs to the job — most likely an unbulleted description.
    if (line.length < 60 && (!current.title || !current.company)) {
      const { company, title, location } = assignHeaderTokens(line.split(FIELD_SEP));
      if (!current.company && company) current.company = company;
      if (!current.title && title) current.title = title;
      if (!current.location && location) current.location = location;
    } else {
      current.bullets.push(line);
    }
  }

  finish();
  return entries;
}

const DEGREE =
  /\b(b\.?\s?s\.?|b\.?\s?a\.?|m\.?\s?s\.?|m\.?\s?a\.?|mba|ph\.?\s?d\.?|bachelor'?s?|master'?s?|doctorate|associate'?s?|diploma|certificate)\b[^,|·•—–]*/i;

/** Parse the education section. Same date anchoring, simpler shape. */
export function parseEducation(lines: readonly string[]): EducationEntry[] {
  const entries: EducationEntry[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isBullet(line)) continue;

    const range = parseDateRange(line);
    const degreeMatch = DEGREE.exec(line);
    if (!range && !degreeMatch) continue;

    const tokens = stripDates(line)
      .split(FIELD_SEP)
      .map((t) => t.trim())
      .filter(Boolean);

    const degree = degreeMatch?.[0]?.trim() ?? '';
    const school = tokens.find((t) => t !== degree && !DEGREE.test(t)) ?? tokens[0] ?? '';

    entries.push({
      id: `edu-${entries.length}`,
      school,
      degree,
      end: range?.end ?? range?.start ?? null,
      confidence: school && degree ? 'certain' : 'guessed',
    });
  }

  return entries;
}

/** Labels templates put in front of a skills list. */
const SKILL_LABEL =
  /^\s*(programming\s+)?(languages?|frameworks?|tools?|technologies|databases?|libraries|platforms?|cloud|devops|methodologies|other|skills?)\s*[:—–-]\s*/i;

/**
 * Parse the skills section into a flat, deduplicated list.
 *
 * Flat is deliberate: the ATS scan matches requirement keywords against skill
 * strings, and a category tree would only add a layer to walk through.
 */
export function parseSkills(lines: readonly string[]): string[] {
  const out = new Set<string>();

  for (const raw of lines) {
    const line = stripBullet(raw).replace(SKILL_LABEL, '');
    for (const token of line.split(/[,;|·•/]|\s{3,}/)) {
      const skill = token.trim().replace(/\.$/, '');
      // A "skill" longer than a few words is a sentence that wandered in.
      if (skill.length >= 2 && skill.length <= 40 && skill.split(/\s+/).length <= 4) {
        out.add(skill);
      }
    }
  }

  return [...out];
}
