/**
 * Requirement → evidence matching.
 *
 * For every requirement the posting states, find the bullets in the profile
 * that answer it. The output names the gap in the user's own words — "nothing
 * in your resume mentions Kubernetes" — which is the one thing a match
 * percentage can never tell them.
 *
 * Lexical, deterministic, free. Tier 4 (MiniLM embeddings) lands in M2 to
 * catch paraphrase; tier 5 never runs here at all, because a scan the user
 * runs on every posting they consider must not cost a call every time.
 */
import type {
  Coverage,
  Evidence,
  EvidenceRow,
  Requirement,
  ScanResult,
} from '@/types/ats';
import { allBullets, type ResumeProfile } from '@/types/profile';
import { durationMonths } from '@/lib/resume/dates';
import { extractRequirements, guessPosting } from './requirements';
import { keywords, tokenize } from './keywords';

/** Share of a requirement's keywords one bullet must hit to count as covering it. */
export const COVERED_THRESHOLD = 0.6;

/** Evidence weaker than this is noise and is not shown. */
export const SHOW_THRESHOLD = 0.2;

/** How many supporting bullets to keep per requirement. */
const MAX_EVIDENCE = 3;

/** Which of a requirement's keywords appear in a piece of text, and how many. */
function overlap(reqKeywords: readonly string[], text: string): string[] {
  if (reqKeywords.length === 0) return [];
  const tokens = new Set(tokenize(text));
  return reqKeywords.filter((k) => tokens.has(k));
}

/** Total months of professional experience on the profile. */
export function totalExperienceMonths(profile: ResumeProfile, now = new Date()): number {
  return profile.experience.reduce(
    (sum, e) => sum + durationMonths(e.start, e.end, now),
    0,
  );
}

/**
 * Build the table.
 *
 * Skills are searched alongside bullets: a listed skill is weaker evidence
 * than a bullet describing its use, but "you never mention it" would be
 * factually wrong when it is sitting in the skills section.
 */
export function buildEvidenceTable(
  requirements: readonly Requirement[],
  profile: ResumeProfile,
  now = new Date(),
): EvidenceRow[] {
  const bullets = allBullets(profile);
  const skillsText = profile.skills.join(', ');
  const skillTokens = new Set(tokenize(skillsText));
  const titleTokens = new Set(tokenize(profile.experience.map((e) => e.title).join(' ')));

  const years = totalExperienceMonths(profile, now) / 12;

  return requirements.map((requirement) => {
    const evidence: Evidence[] = [];

    for (const bullet of bullets) {
      const matched = overlap(requirement.keywords, bullet.text);
      if (matched.length === 0) continue;

      const score = matched.length / requirement.keywords.length;
      if (score < SHOW_THRESHOLD) continue;

      evidence.push({ ...bullet, score, matched });
    }

    evidence.sort((a, b) => b.score - a.score);
    const top = evidence.slice(0, MAX_EVIDENCE);

    // A keyword counts as present if it appears anywhere in the profile —
    // bullets, the skills list, or a job title.
    const found = new Set<string>();
    for (const e of evidence) for (const k of e.matched) found.add(k);
    for (const k of requirement.keywords) {
      if (skillTokens.has(k) || titleTokens.has(k)) found.add(k);
    }

    const missing = requirement.keywords.filter((k) => !found.has(k));
    const best = top[0]?.score ?? 0;
    const foundRatio =
      requirement.keywords.length === 0 ? 0 : found.size / requirement.keywords.length;

    let coverage: Coverage;
    if (requirement.keywords.length === 0) {
      // Nothing concrete to match on ("Strong communication skills"). Neither
      // covered nor a gap — flag it so the user judges it themselves.
      coverage = 'partial';
    } else if (best >= COVERED_THRESHOLD || missing.length === 0) {
      coverage = 'covered';
    } else if (found.size > 0) {
      coverage = 'partial';
    } else {
      coverage = 'gap';
    }

    // A stated year count the profile can't back up downgrades the row: the
    // keywords may all match while the posting still screens the user out.
    if (coverage === 'covered' && requirement.years !== null && years < requirement.years) {
      coverage = 'partial';
    }

    // Skills-only support is real but thin — never a full cover on its own.
    if (coverage === 'covered' && top.length === 0 && foundRatio < 1) {
      coverage = 'partial';
    }

    return { requirement, coverage, evidence: coverage === 'gap' ? [] : top, missing };
  });
}

/** Run a full scan of a job description against the profile. */
export function scanJobDescription(
  jdText: string,
  profile: ResumeProfile,
  opts: { company?: string; jobTitle?: string; now?: Date; id?: string } = {},
): ScanResult {
  const requirements = extractRequirements(jdText);
  const guessed = guessPosting(jdText);
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? `scan-${now.getTime()}`,
    company: opts.company ?? guessed.company,
    jobTitle: opts.jobTitle ?? guessed.jobTitle,
    jdText,
    rows: buildEvidenceTable(requirements, profile, now),
    scannedAt: now.getTime(),
  };
}

/**
 * Keywords the posting wants that appear nowhere in the profile, ranked by how
 * many required rows they block. This is the "what to write next" list.
 */
export function topGaps(rows: readonly EvidenceRow[], limit = 10): string[] {
  const weight = new Map<string, number>();

  for (const row of rows) {
    if (row.coverage === 'covered') continue;
    const w = row.requirement.necessity === 'required' ? 2 : 1;
    for (const k of row.missing) weight.set(k, (weight.get(k) ?? 0) + w);
  }

  return [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

export { extractRequirements, keywords };
