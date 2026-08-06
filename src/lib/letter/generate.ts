/**
 * Cover letter generation.
 *
 * The one place in this extension that spends a model call on purpose, and it
 * is built around a single constraint: **the letter may only claim things the
 * scan already found evidence for.**
 *
 * That is what the requirement-to-evidence table is for. A model handed a job
 * description and a resume will happily write "I led the migration to
 * Kubernetes" because the posting asked for Kubernetes, and a fabricated claim
 * in a cover letter is a lie the user signs their name to. So the prompt
 * carries the *covered* rows with their supporting bullets as the only
 * permitted material, and names the gaps explicitly as things not to claim.
 *
 * Voice comes from the user's own writing, passed through whole. Three real
 * paragraphs of someone's prose match them far better than any set of
 * adjectives about their tone, and the samples stay legible and deletable in a
 * way a derived style vector would not.
 */
import { ask, type JsonSchema } from '@/lib/llm';
import type { EvidenceRow, ScanResult } from '@/types/ats';
import type { WritingSample } from '@/lib/db/schema';
import type { ResumeProfile } from '@/types/profile';

export interface LetterRequest {
  scan: ScanResult;
  profile: ResumeProfile;
  samples: readonly WritingSample[];
  /** Anything the user wants said that the resume does not carry. */
  notes?: string;
}

export interface GeneratedLetter {
  text: string;
  /** Requirements the letter was allowed to speak to. */
  grounding: string[];
  calls: number;
}

/** How many samples to send. Enough to establish a voice, not a corpus. */
const MAX_SAMPLES = 3;
const MAX_SAMPLE_CHARS = 2500;

/** Evidence rows worth building an argument on. */
export function groundingRows(rows: readonly EvidenceRow[], limit = 6): EvidenceRow[] {
  return rows
    .filter((r) => r.coverage !== 'gap' && r.evidence.length > 0)
    .sort((a, b) => {
      // Required beats preferred; within that, strongest evidence first.
      const need = Number(b.requirement.necessity === 'required') -
        Number(a.requirement.necessity === 'required');
      if (need !== 0) return need;
      return (b.evidence[0]?.score ?? 0) - (a.evidence[0]?.score ?? 0);
    })
    .slice(0, limit);
}

/** Requirements with nothing behind them. Named so the model cannot claim them. */
export function gapClaims(rows: readonly EvidenceRow[], limit = 8): string[] {
  return rows
    .filter((r) => r.coverage === 'gap')
    .slice(0, limit)
    .map((r) => r.requirement.text);
}

export function buildPrompt(req: LetterRequest): { system: string; prompt: string } {
  const { scan, profile, samples, notes } = req;

  const grounded = groundingRows(scan.rows);
  const gaps = gapClaims(scan.rows);

  const evidenceBlock = grounded
    .map((row) => {
      const bullets = row.evidence
        .slice(0, 2)
        .map((e) => `    - ${e.text}${e.company ? ` (${e.company})` : ''}`)
        .join('\n');
      return `  REQUIREMENT: ${row.requirement.text}\n${bullets}`;
    })
    .join('\n\n');

  const voiceBlock = samples
    .slice(0, MAX_SAMPLES)
    .map((s, i) => `  --- SAMPLE ${i + 1} (${s.label}) ---\n${s.text.slice(0, MAX_SAMPLE_CHARS)}`)
    .join('\n\n');

  const system = [
    'You write cover letters that sound like the specific person who is applying.',
    '',
    'Absolute rules:',
    '1. Every claim about the applicant must be supported by the EVIDENCE section.',
    '   You may rephrase a bullet. You may not invent a project, a technology, a',
    '   metric, an employer, or a duration that is not there.',
    '2. Never claim anything from the GAPS section. Those are requirements the',
    '   applicant does not demonstrably meet. Say nothing about them at all —',
    '   do not apologise for them, do not promise to learn them.',
    '3. Match the voice in WRITING SAMPLES: sentence length, rhythm, formality,',
    '   how they open and close. If the samples are plain, write plainly.',
    '4. No filler openings. Never "I am writing to express my interest in".',
    '5. Three or four short paragraphs. No bullet lists. No headers. No signature',
    '   block — the applicant adds that themselves.',
  ].join('\n');

  const prompt = [
    `ROLE: ${scan.jobTitle || 'the advertised role'}`,
    `COMPANY: ${scan.company || 'the company'}`,
    `APPLICANT: ${profile.contact.fullName.value || 'the applicant'}`,
    '',
    'EVIDENCE — the only material you may draw claims from:',
    evidenceBlock || '  (none — write briefly about motivation only, claim no experience)',
    '',
    gaps.length > 0 ? `GAPS — never claim these:\n${gaps.map((g) => `  - ${g}`).join('\n')}` : '',
    '',
    voiceBlock
      ? `WRITING SAMPLES — match this voice:\n${voiceBlock}`
      : 'WRITING SAMPLES: none supplied. Write plainly and avoid corporate register.',
    '',
    notes?.trim() ? `THE APPLICANT ALSO WANTS SAID:\n  ${notes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, prompt };
}

const SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    letter: {
      type: 'string',
      description: 'The cover letter body, three to four short paragraphs.',
    },
  },
  required: ['letter'],
  additionalProperties: false,
};

/**
 * Write the letter. One call, always — there is no retry loop and no
 * multi-pass refinement, because each pass is another charge against a budget
 * the user is paying for out of their own key.
 */
export async function generateLetter(req: LetterRequest): Promise<GeneratedLetter> {
  const { system, prompt } = buildPrompt(req);

  const { data, calls } = await ask<{ letter: string }>({
    system,
    prompt,
    schema: SCHEMA,
    maxTokens: 2000,
  });

  return {
    text: (data.letter ?? '').trim(),
    grounding: groundingRows(req.scan.rows).map((r) => r.requirement.text),
    calls,
  };
}
