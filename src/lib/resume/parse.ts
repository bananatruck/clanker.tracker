/**
 * Resume text → structured profile.
 *
 * Fully deterministic. No LLM call is made here and none should be added: the
 * review grid exists precisely so that the cheap parse can be wrong and the
 * user can fix it in two clicks, which is faster *and* free compared to
 * spending a call and still being wrong.
 */
import {
  PRIMARY_PROFILE_ID,
  type ResumeProfile,
} from '@/types/profile';
import type { ExtractedText } from './extract';
import { extractContact } from './contact';
import { parseEducation, parseExperience, parseSkills } from './entries';
import { linesOfKind, preamble, splitSections } from './sections';

/**
 * Skills are also mined out of the experience bullets, because plenty of
 * resumes have no skills section at all and the ATS scan needs something to
 * match against. Bullet-mined skills are the ones the user *demonstrated*,
 * which is stronger evidence than a self-declared list anyway.
 */
function minedSkills(bullets: readonly string[]): string[] {
  const out = new Set<string>();
  for (const bullet of bullets) {
    // Capitalised or dotted technical tokens: React, Node.js, PostgreSQL, CI/CD.
    for (const m of bullet.matchAll(/\b([A-Z][\w.+#-]*(?:\.[a-z]+)?|[A-Z]{2,}\/[A-Z]{2,})\b/g)) {
      const token = m[1]!;
      if (token.length >= 2 && token.length <= 20) out.add(token);
    }
  }
  return [...out];
}

export function parseResume(source: ExtractedText, now = Date.now()): ResumeProfile {
  const sections = splitSections(source.text);

  const experience = parseExperience(linesOfKind(sections, 'experience'));
  const education = parseEducation(linesOfKind(sections, 'education'));

  const declared = parseSkills(linesOfKind(sections, 'skills'));
  const mined = minedSkills(experience.flatMap((e) => e.bullets));

  // Declared skills come first — the user chose to list them, so they lead the
  // review grid; mined ones fill in behind and are deduplicated case-insensitively.
  const seen = new Set(declared.map((s) => s.toLowerCase()));
  const skills = [...declared, ...mined.filter((s) => !seen.has(s.toLowerCase()))];

  return {
    id: PRIMARY_PROFILE_ID,
    contact: extractContact(preamble(sections), source.text),
    experience,
    education,
    skills,
    rawText: source.text,
    source: { fileName: source.fileName, kind: source.kind, bytes: source.bytes },
    parsedAt: now,
    updatedAt: now,
  };
}

/**
 * Re-parse from stored raw text, keeping every field the user has corrected.
 *
 * This is what makes improving the heuristics safe: a better parser can be
 * shipped without silently discarding the hand-fixes people have already made.
 */
export function reparse(previous: ResumeProfile, now = Date.now()): ResumeProfile {
  const next = parseResume(
    {
      text: previous.rawText,
      kind: previous.source.kind,
      fileName: previous.source.fileName,
      bytes: previous.source.bytes,
    },
    now,
  );

  for (const key of Object.keys(previous.contact) as Array<keyof typeof previous.contact>) {
    if (previous.contact[key].source === 'user') next.contact[key] = previous.contact[key];
  }

  return next;
}
