/**
 * Structured application semantics.
 *
 * Visible labels repeat inside employment and education cards. "Company" is
 * not a complete identity; `experience[1].company` is. This module turns DOM
 * context into that path and resolves the path against the candidate profile.
 */
import type { ResumeDate } from '@/types/profile';
import type { FillContext } from './labels';
import type { FieldOption, HarvestedField, SemanticSection } from './types';

export interface SemanticReading {
  section: SemanticSection;
  leaf: string | null;
  explicitIndex: number | null;
}

/**
 * One piece of evidence about a field, and how much it counts.
 *
 * Weight is proximity: the field's own label is 1, and every step up the DOM
 * is worth less. This is the whole point of the type. The previous version of
 * this module took a single flat string — label, name, and seven levels of
 * ancestor attributes joined together — and first-matched over it, so a
 * container six levels up beat the label on the field itself. On Workday that
 * is not hypothetical: the entire second page of the application, education
 * included, sits under a heading reading "My Experience", so every education
 * field read as `experience` and then fell out of the resolver entirely,
 * because the experience branch has no `school` leaf to match.
 */
export interface SignalPart {
  text: string;
  /** 1 for the field's own label, decaying with DOM distance. */
  weight: number;
}

export type SemanticSignal = string | readonly SignalPart[];

const fold = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

type RecordSection = 'experience' | 'education' | 'project';

interface LeafRule {
  leaf: string;
  pattern: RegExp;
  /**
   * Whether matching this phrase names the section by itself.
   *
   * "Major" and "Employer" are decisive: nothing but an education or an
   * employment record has one, so the field is identified even on a flat form
   * that never says the word "education" anywhere. "Location" and "Start date"
   * are not — they appear in every kind of card and in the contact block, so
   * they only mean something once some other signal has settled the section.
   */
  decisive?: boolean;
}

/**
 * Leaf vocabulary per section, most specific first.
 *
 * Order is load-bearing within a section: "School location" matches both
 * `location` and `school`, and it is the school's location, so `location`
 * is listed first and wins the tie.
 */
const LEAVES: Record<RecordSection, readonly LeafRule[]> = {
  experience: [
    { leaf: 'start.month', pattern: /\b(start|from)\b.*\bmonth\b|\bmonth\b.*\b(start|from)\b/ },
    { leaf: 'start.year', pattern: /\b(start|from)\b.*\byear\b|\byear\b.*\b(start|from)\b/ },
    { leaf: 'end.month', pattern: /\b(end|to|leaving|left)\b.*\bmonth\b|\bmonth\b.*\b(end|to)\b/ },
    { leaf: 'end.year', pattern: /\b(end|to|leaving|left)\b.*\byear\b|\byear\b.*\b(end|to)\b/ },
    { leaf: 'start.date', pattern: /\b(start|from)\s*date\b|\bdate\s*(started|from)\b/ },
    { leaf: 'end.date', pattern: /\b(end|to|leaving)\s*date\b|\bdate\s*(ended|to|left)\b/ },
    { leaf: 'current', pattern: /\b(i\s+)?currently\s+work\b|\bcurrent(ly)?\s+employed\b|\bpresent\s+position\b/, decisive: true },
    { leaf: 'location', pattern: /\b(location|city|town)\b/ },
    { leaf: 'company', pattern: /\b(company|employer|organi[sz]ation|firm|business)\b/, decisive: true },
    { leaf: 'title', pattern: /\b(job|position|role|work)\s*title\b|\b(current|recent)\s+title\b/, decisive: true },
    { leaf: 'description', pattern: /\b(description|responsibilit(y|ies)|duties|achievements|accomplishments)\b/ },
    { leaf: 'title', pattern: /\b(title|position|role)\b/ },
  ],
  education: [
    { leaf: 'start.month', pattern: /\b(start|from)\b.*\bmonth\b|\bmonth\b.*\b(start|from)\b/ },
    { leaf: 'start.year', pattern: /\b(start|from)\b.*\byear\b|\byear\b.*\b(start|from)\b/ },
    { leaf: 'end.month', pattern: /\b(end|to|graduation|completion)\b.*\bmonth\b|\bmonth\b.*\b(end|to|graduat)/ },
    { leaf: 'end.year', pattern: /\b(end|to|graduation|completion)\b.*\byear\b|\byear\b.*\b(end|to|graduat)/ },
    { leaf: 'start.date', pattern: /\b(start|from)\s*date\b/ },
    { leaf: 'end.date', pattern: /\b(end|graduation|completion)\s*date\b|\bdate\s*(of\s*)?graduat/ },
    { leaf: 'gpa', pattern: /\bgpa\b|\bgrade\s*point\b/, decisive: true },
    {
      leaf: 'fieldOfStudy',
      // "Major accomplishment" is a free-text essay question, not a subject.
      pattern:
        /\bfield\s*of\s*study\b|\bmajors?\b(?!\s+(accomplishment|achievement|project|responsibilit|contribution))|\bconcentration\b|\bdiscipline\b|\b(course|program|programme|area)\s*of\s*study\b|\bspeciali[sz]ation\b|\bsubject\b/,
      decisive: true,
    },
    { leaf: 'location', pattern: /\b(location|city|town)\b/ },
    { leaf: 'degree', pattern: /\bdegrees?\b|\bqualification\b|\bdiploma\b/, decisive: true },
    {
      leaf: 'school',
      pattern: /\bschools?\b|\buniversit(y|ies)\b|\bcollege\b|\binstitution\b|\balma\s*mater\b/,
      decisive: true,
    },
  ],
  project: [
    { leaf: 'start.month', pattern: /\b(start|from)\b.*\bmonth\b|\bmonth\b.*\b(start|from)\b/ },
    { leaf: 'start.year', pattern: /\b(start|from)\b.*\byear\b|\byear\b.*\b(start|from)\b/ },
    { leaf: 'end.month', pattern: /\b(end|to)\b.*\bmonth\b|\bmonth\b.*\b(end|to)\b/ },
    { leaf: 'end.year', pattern: /\b(end|to)\b.*\byear\b|\byear\b.*\b(end|to)\b/ },
    { leaf: 'start.date', pattern: /\b(start|from)\s*date\b/ },
    { leaf: 'end.date', pattern: /\b(end|to)\s*date\b/ },
    { leaf: 'technologies', pattern: /\b(technolog(y|ies)|tools|stack|built\s*with)\b/ },
    { leaf: 'url', pattern: /\b(url|link|website|repo|repository)\b/ },
    { leaf: 'description', pattern: /\b(description|summary|details|achievements)\b/ },
    { leaf: 'role', pattern: /\b(role|position)\b/ },
    { leaf: 'name', pattern: /\bproject\s*(name|title)\b|\bname\b|\btitle\b/ },
  ],
};

/** Section words in their own right, independent of any leaf. */
const SECTION_KEYWORDS: Record<RecordSection | 'skills', readonly RegExp[]> = {
  experience: [
    /\b(work|employment|professional|job|career)\s*(experience|history)\b/,
    /\bemployment\b/,
    /\bpositions?\s+held\b/,
    /\bprevious\s+(employer|role|position)\b/,
    /\bexperience\b/,
  ],
  education: [
    /\beducation(al)?\b/,
    /\bacademics?\b/,
    /\bschooling\b/,
    /\bqualifications?\b/,
    /\balma\s*mater\b/,
    /\bgraduat(e|ed|ion)\b/,
  ],
  // Bare "portfolio" is deliberately absent: "Portfolio URL" is a contact
  // field on nearly every board, and claiming it as `project[0].url` puts the
  // user's personal site into a project record and takes it out of the
  // website field where it belongs.
  project: [/\bprojects?\b/, /\bportfolio\s+projects?\b/],
  skills: [/\bskills?\b/, /\btechnologies\b/, /\bcompetenc(y|ies)\b/],
};

/**
 * Text that is asking something else entirely, whatever words it contains.
 *
 * Greenhouse's standard eligibility question is "Are you legally authorized to
 * work in the United States for any employer?" — which contains "employer",
 * matches the decisive `company` leaf, and so resolved to
 * `experience[0].company`. The user would have had their current employer's
 * name typed into a work-authorization dropdown. Consent and EEO fields fail
 * the same way. None of these describe a record, so a part that matches here
 * contributes no evidence at all.
 */
const NOT_A_RECORD: readonly RegExp[] = [
  /\b(legally\s+)?authori[sz]ed\s+to\s+work\b/,
  /\bwork\s+authori[sz]ation\b/,
  /\beligible\s+to\s+work\b/,
  /\bsponsorship\b|\bvisa\b/,
  /\bconsent\b|\bagree\s+to\b|\bprivacy\s+(policy|notice)\b|\bterms\b|\bopt[\s-]?in\b/,
  /\bgender\b|\brace\b|\bethnicit|\bveteran\b|\bdisabilit|\bpronoun/,
  /\bhow\s+did\s+you\s+(hear|find)\b/,
];

/**
 * Whether a part reads like a label rather than a sentence.
 *
 * Section words name sections, and section names are short: "Education",
 * "Work Experience", "education--container". A paragraph that merely contains
 * the word "experience" is a screening question, not a heading, so it is not
 * allowed to place a field in a section. Decisive leaves are exempt — "Which
 * university did you last attend?" is a long question that genuinely is the
 * school field.
 */
const isLabelLike = (text: string): boolean => text.split(' ').length <= 8;

/**
 * How much a decisive leaf and a plain section word are each worth.
 *
 * A decisive leaf outscores a section word so that "School", read off the
 * field's own label, beats a "My Experience" banner several levels up. Both
 * are still scaled by proximity, so a section word on the card the field
 * actually sits in beats one on the page wrapper.
 */
const DECISIVE = 1;
const KEYWORD = 0.55;

/** Class tokens worth carrying into the signal. Everything else is noise. */
export const SECTION_HINT_RE =
  /(education|academic|school|univ|college|experience|employment|project|skill|degree|major|discipline|qualification)/i;

const asParts = (signal: SemanticSignal): readonly SignalPart[] =>
  typeof signal === 'string' ? [{ text: signal, weight: 1 }] : signal;

/**
 * Read a record index off an identifier.
 *
 * Covers `education[1]`, `workExperience-2`, and the `school--0` / `degree--0`
 * form Greenhouse renders, where the section name appears nowhere in the id.
 * Bounded to two digits so a Greenhouse question id like
 * `question_37494965002` cannot be mistaken for a card number.
 */
function readIndex(signal: string): number | null {
  const match = signal.match(
    /\[(\d{1,2})]|(?:experience|education|project)[_.\-]?(\d{1,2})(?!\d)|(?:--|__)(\d{1,2})(?!\d)/i,
  );
  if (!match) return null;
  const digits = match[1] ?? match[2] ?? match[3];
  return digits === undefined ? null : Number(digits);
}

/**
 * Identify what a field is, from evidence weighted by how close it sits.
 *
 * Two passes, because the section decides which leaf table applies but the
 * leaves are often the only evidence of the section. First every leaf and
 * section word is scored; a decisive leaf votes for its own section. Then the
 * winning section's leaf table is consulted for the answer, so a field can
 * never end up with, say, `experience` and a leaf only education defines.
 */
export function semanticReading(signal: SemanticSignal): SemanticReading {
  const given = asParts(signal).filter((p) => p.text);
  const parts = given.map((p) => ({ text: fold(p.text), weight: p.weight }));

  // Read the index off the raw text: folding turns `school--0` into
  // "school 0" and loses the delimiter the pattern relies on.
  const explicitIndex = readIndex(given.map((p) => p.text).join(' '));

  const score: Record<string, number> = {};
  const bump = (section: string, value: number) => {
    if (value > (score[section] ?? 0)) score[section] = value;
  };

  for (const part of parts) {
    if (NOT_A_RECORD.some((re) => re.test(part.text))) continue;

    if (isLabelLike(part.text)) {
      for (const [section, patterns] of Object.entries(SECTION_KEYWORDS)) {
        if (patterns.some((re) => re.test(part.text))) bump(section, part.weight * KEYWORD);
      }
    }

    for (const [section, rules] of Object.entries(LEAVES)) {
      for (const rule of rules) {
        if (rule.decisive && rule.pattern.test(part.text)) {
          bump(section, part.weight * DECISIVE);
          break;
        }
      }
    }
  }

  let section: SemanticSection = 'unknown';
  let best = 0;
  for (const [candidate, value] of Object.entries(score)) {
    if (value > best) {
      best = value;
      section = candidate as SemanticSection;
    }
  }

  if (section === 'unknown') return { section, leaf: null, explicitIndex };
  if (section === 'skills') return { section, leaf: 'skills', explicitIndex };

  // Best leaf *within the winning section*, nearest evidence first. A rule
  // earlier in the table wins an equal-weight tie, which is how "School
  // location" resolves to `location` rather than `school`.
  let leaf: string | null = null;
  let leafWeight = 0;
  for (const part of parts) {
    if (part.weight <= leafWeight) continue;
    if (NOT_A_RECORD.some((re) => re.test(part.text))) continue;
    for (const rule of LEAVES[section as RecordSection]) {
      if (rule.pattern.test(part.text)) {
        leaf = rule.leaf;
        leafWeight = part.weight;
        break;
      }
    }
  }

  return { section, leaf, explicitIndex };
}

export function semanticPath(section: SemanticSection, index: number, leaf: string): string {
  return section === 'skills' ? 'skills' : `${section}[${index}].${leaf}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function optionForMonth(month: number, options: readonly FieldOption[]): string | null {
  const candidates = new Set([
    String(month),
    String(month).padStart(2, '0'),
    MONTHS[month - 1]!.toLowerCase(),
    MONTHS[month - 1]!.slice(0, 3).toLowerCase(),
  ]);
  const found = options.find((option) =>
    candidates.has(option.value.trim().toLowerCase()) ||
    candidates.has(option.label.trim().toLowerCase()),
  );
  return found?.value ?? null;
}

function datePart(
  date: ResumeDate | null,
  leaf: string,
  options: readonly FieldOption[],
  kind: HarvestedField['kind'],
): string {
  if (!date) return '';
  if (leaf.endsWith('.year')) return String(date.year);
  if (leaf.endsWith('.month')) {
    if (!date.month) return '';
    return optionForMonth(date.month, options) ?? MONTHS[date.month - 1]!;
  }
  const month = date.month ? String(date.month).padStart(2, '0') : '01';
  // Native date controls reject YYYY-MM entirely. Resumes normally give only
  // month precision, so the first day is used as an explicit transport
  // default and remains visible in review before it reaches the page.
  return kind === 'date' ? `${date.year}-${month}-01` : `${date.year}-${month}`;
}

/** Resolve a canonical semantic path without guessing from the label again. */
export function semanticValue(field: HarvestedField, ctx: FillContext): string | null {
  const path = field.semanticPath;
  if (!path) return null;
  if (path === 'skills') return ctx.profile.skills.join(', ');

  const match = path.match(/^(experience|education|project)\[(\d+)]\.(.+)$/);
  if (!match) return null;
  const section = match[1]!;
  const rawIndex = match[2]!;
  const leaf = match[3]!;
  const index = Number(rawIndex);

  if (section === 'experience') {
    const entry = ctx.profile.experience[index];
    if (!entry) return null;
    if (leaf === 'company') return entry.company;
    if (leaf === 'title') return entry.title;
    if (leaf === 'location') return entry.location;
    if (leaf === 'current') return entry.end === null ? 'Yes' : 'No';
    if (leaf === 'description') return entry.bullets.join('\n');
    if (leaf.startsWith('start.')) return datePart(entry.start, leaf, field.options, field.kind);
    if (leaf.startsWith('end.')) return datePart(entry.end, leaf, field.options, field.kind);
  }

  if (section === 'education') {
    const entry = ctx.profile.education[index];
    if (!entry) return null;
    if (leaf === 'school') return entry.school;
    if (leaf === 'degree') return entry.degree;
    if (leaf === 'fieldOfStudy') return entry.fieldOfStudy;
    if (leaf === 'location') return entry.location;
    if (leaf === 'gpa') return entry.gpa;
    if (leaf.startsWith('start.')) return datePart(entry.start, leaf, field.options, field.kind);
    if (leaf.startsWith('end.')) return datePart(entry.end, leaf, field.options, field.kind);
  }

  if (section === 'project') {
    const entry = ctx.profile.projects[index];
    if (!entry) return null;
    if (leaf === 'name') return entry.name;
    if (leaf === 'role') return entry.role;
    if (leaf === 'url') return entry.url;
    if (leaf === 'description') return entry.bullets.join('\n');
    if (leaf === 'technologies') return entry.technologies.join(', ');
    if (leaf.startsWith('start.')) return datePart(entry.start, leaf, field.options, field.kind);
    if (leaf.startsWith('end.')) return datePart(entry.end, leaf, field.options, field.kind);
  }

  return null;
}

export function optionSignature(options: readonly FieldOption[]): string {
  return options.map((option) => `${option.value}:${option.label}`).join('|').slice(0, 500);
}
