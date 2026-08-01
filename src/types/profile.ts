/**
 * The parsed resume, and the shape the review grid edits.
 *
 * Every extracted value carries its own confidence and provenance. That is
 * not decoration: the review grid colours cells by it, the resolver trusts
 * `user`- and `regex`-sourced fields without escalating, and a field that
 * parsed as `missing` is the only kind allowed to cost an LLM call.
 */

/** Matches the --color-certain / guessed / missing tokens in ui/tokens.css. */
export type Confidence = 'certain' | 'guessed' | 'missing';

/**
 * How a value was obtained, cheapest first. `user` outranks everything —
 * once a human has corrected a field, nothing may overwrite it.
 */
export type FieldSource = 'regex' | 'heuristic' | 'llm' | 'user';

export interface ProfileField<T = string> {
  value: T;
  confidence: Confidence;
  source: FieldSource;
}

export const field = <T>(
  value: T,
  confidence: Confidence,
  source: FieldSource,
): ProfileField<T> => ({ value, confidence, source });

export const emptyField = (): ProfileField => ({
  value: '',
  confidence: 'missing',
  source: 'heuristic',
});

/** Contact fields, in the order the review grid shows them. */
export const CONTACT_KEYS = [
  'fullName',
  'firstName',
  'lastName',
  'email',
  'phone',
  'location',
  'linkedin',
  'github',
  'website',
] as const;

export type ContactKey = (typeof CONTACT_KEYS)[number];

export type Contact = Record<ContactKey, ProfileField>;

export const CONTACT_LABELS: Record<ContactKey, string> = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
};

/**
 * A month-precision date. Resumes almost never give days, and pretending
 * otherwise invents precision the source text does not have.
 */
export interface ResumeDate {
  year: number;
  /** 1-12, or null when the resume gave only a year. */
  month: number | null;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  title: string;
  location: string;
  start: ResumeDate | null;
  /** null means "Present" — still employed there. */
  end: ResumeDate | null;
  /** The achievement bullets. These are the evidence the ATS scan matches. */
  bullets: string[];
  confidence: Confidence;
}

export interface EducationEntry {
  id: string;
  school: string;
  degree: string;
  end: ResumeDate | null;
  confidence: Confidence;
}

export interface ResumeProfile {
  /** Single-profile for now; the key exists so import/export can carry more. */
  id: string;
  contact: Contact;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  /** Kept so a re-parse with better heuristics never needs the file again. */
  rawText: string;
  source: { fileName: string; kind: 'pdf' | 'docx' | 'txt'; bytes: number };
  parsedAt: number;
  updatedAt: number;
}

export const PRIMARY_PROFILE_ID = 'primary';

export function emptyContact(): Contact {
  return Object.fromEntries(
    CONTACT_KEYS.map((k) => [k, emptyField()]),
  ) as Contact;
}

/** Every bullet in the profile, flattened — the evidence pool for a scan. */
export function allBullets(
  profile: ResumeProfile,
): Array<{ experienceId: string; company: string; title: string; text: string }> {
  return profile.experience.flatMap((e) =>
    e.bullets.map((text) => ({
      experienceId: e.id,
      company: e.company,
      title: e.title,
      text,
    })),
  );
}

/** How much of the profile parsed cleanly. Drives the review grid's header. */
export function profileCompleteness(profile: ResumeProfile): {
  total: number;
  certain: number;
  missing: number;
} {
  const fields = CONTACT_KEYS.map((k) => profile.contact[k]);
  return {
    total: fields.length,
    certain: fields.filter((f) => f.confidence === 'certain').length,
    missing: fields.filter((f) => f.confidence === 'missing').length,
  };
}
