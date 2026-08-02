/**
 * Tier 5 — the one batched model call.
 *
 * Everything about this file is shaped by "one call, not one per field". The
 * unknowns are numbered, sent as a single list, and the reply is a single
 * object keyed by those numbers. A brand-new application reaches at most one
 * call here; a repeat at the same company reaches none, because tier 2 will
 * have learned the answers the first time round.
 *
 * The prompt is grounded strictly in the profile. The model is told, in as
 * many words, to leave a field blank rather than invent a plausible answer —
 * a fabricated employment date on a real job application is a far worse
 * outcome than an empty box the user fills in during review.
 */
import { ask, BudgetExhaustedError } from '@/lib/llm';
import type { JsonSchema } from '@/lib/llm/types';
import type { FillContext } from './labels';
import type { BatchModel } from './resolve';
import type { HarvestedField } from './types';

const SYSTEM = [
  'You fill in job application forms on behalf of one candidate.',
  'You are given the candidate profile and a numbered list of form fields.',
  'Answer only from the profile. Never invent an employer, a date, a degree,',
  'a qualification, or a number that is not in the profile.',
  'If the profile does not contain the answer, return an empty string for that',
  'field. An empty answer is always correct when you do not know; a plausible',
  'guess on a real application is not.',
  'When a field lists options, reply with exactly one of those option values.',
  'Keep free-text answers concise and in the candidate’s own register.',
].join(' ');

/** Compact profile view. Sending the whole resume would be tokens for nothing. */
function profileDigest(ctx: FillContext): string {
  const { contact, experience, education, skills } = ctx.profile;

  const lines: string[] = [
    'CANDIDATE',
    ...Object.entries(contact)
      .filter(([, f]) => f.value)
      .map(([key, f]) => `- ${key}: ${f.value}`),
  ];

  if (experience.length > 0) {
    lines.push('EXPERIENCE');
    for (const e of experience.slice(0, 5)) {
      lines.push(`- ${e.title || 'role'} at ${e.company || 'unknown'}`);
      for (const bullet of e.bullets.slice(0, 3)) lines.push(`  · ${bullet}`);
    }
  }

  if (education.length > 0) {
    lines.push('EDUCATION');
    for (const e of education) lines.push(`- ${e.degree} — ${e.school}`);
  }

  if (skills.length > 0) lines.push(`SKILLS: ${skills.slice(0, 40).join(', ')}`);

  const prefs = Object.entries(ctx.preferences).filter(([, v]) => v);
  if (prefs.length > 0) {
    lines.push('STATED PREFERENCES');
    for (const [key, value] of prefs) lines.push(`- ${key}: ${value}`);
  }

  return lines.join('\n');
}

function fieldList(fields: readonly HarvestedField[]): string {
  return fields
    .map((f) => {
      const parts = [`${f.id}: ${f.label || f.name || 'unlabelled field'}`];
      if (f.required) parts.push('(required)');
      if (f.options.length > 0) {
        parts.push(`options: ${f.options.map((o) => o.value).join(' | ')}`);
      }
      return parts.join(' ');
    })
    .join('\n');
}

/**
 * Ask for a flat `{ fieldId: answer }` object.
 *
 * Every field is a required property so the model must account for each one,
 * even if only to return an empty string — which is a cheaper signal to handle
 * than a silently absent key.
 */
function schemaFor(fields: readonly HarvestedField[]): JsonSchema {
  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    properties[f.id] = {
      type: 'string',
      description: f.label || f.name,
    };
  }

  return {
    type: 'object',
    properties,
    required: fields.map((f) => f.id),
    additionalProperties: false,
  };
}

export const batchModel: BatchModel = {
  async answer(fields, ctx) {
    if (fields.length === 0) return {};

    const { data } = await ask<Record<string, string>>({
      system: SYSTEM,
      prompt: [
        profileDigest(ctx),
        '',
        'FIELDS TO ANSWER',
        fieldList(fields),
      ].join('\n'),
      schema: schemaFor(fields),
      maxTokens: 2048,
    });

    // Trust nothing: keep only keys we asked about, and only strings.
    const wanted = new Set(fields.map((f) => f.id));
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      if (wanted.has(key) && typeof value === 'string') out[key] = value.trim();
    }
    return out;
  },
};

/**
 * The chain treats a throw as "degrade to review". Re-exported so callers can
 * tell a spent budget from a genuine provider failure when reporting to the user.
 */
export { BudgetExhaustedError };
