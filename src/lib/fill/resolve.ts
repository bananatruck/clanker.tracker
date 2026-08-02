/**
 * The five-tier resolver chain.
 *
 * This is the file the entire cost argument lives in. Rules, in order of how
 * badly breaking them would hurt:
 *
 *   1. Escalate cheapest-first and stop at the first tier that answers.
 *   2. Tier 5 is *batched* — one call for every field still unknown, never one
 *      call per field. A form with twelve unknowns costs one call, not twelve.
 *   3. Never escalate a field a cheaper tier could have answered. If you find
 *      yourself adding a model call to a path tier 3 could handle, add the
 *      rule to tier 3 instead.
 *   4. Running out of budget is not an error. The chain returns what tiers 1-4
 *      resolved and marks the rest unresolved for review.
 *
 * Tier 2 is what makes the median application free: every field the user
 * accepts or corrects is written back, so the same question answered once on
 * Greenhouse fills itself on Lever forever after.
 */
import type { Confidence } from '@/types/profile';
import type {
  FillPlan,
  HarvestedField,
  Resolution,
  ResolverTier,
  UnresolvedField,
} from './types';
import { resolutionConfidence } from './types';
import { matchLabel, matchOption, type FillContext } from './labels';
import { questionHash } from './normalize';
import { resolveBySimilarity, type Candidate, type Embedder } from './similarity';
import type { KnownField } from './adapters';

/** Tier 2 lookup, injected so the chain has no direct Dexie dependency. */
export interface AnswerMemory {
  recall(rawQuestion: string): Promise<string | null>;
}

/** Tier 5, injected for the same reason. Returns one answer per field id. */
export interface BatchModel {
  answer(
    fields: readonly HarvestedField[],
    ctx: FillContext,
  ): Promise<Record<string, string>>;
}

export interface ResolveDeps {
  ctx: FillContext;
  /** Tier 1: field id → known profile field, precomputed from the adapter. */
  adapterHits?: Map<string, KnownField>;
  memory?: AnswerMemory;
  embedder?: Embedder | null;
  model?: BatchModel | null;
}

/** Tier 1 values come straight off the profile. */
function knownFieldValue(field: KnownField, ctx: FillContext): string {
  const { contact } = ctx.profile;
  switch (field) {
    case 'firstName':
      return contact.firstName.value;
    case 'lastName':
      return contact.lastName.value;
    case 'fullName':
      return contact.fullName.value;
    case 'email':
      return contact.email.value;
    case 'phone':
      return contact.phone.value;
    case 'location':
      return contact.location.value;
    case 'linkedin':
      return contact.linkedin.value;
    case 'github':
      return contact.github.value;
    case 'website':
      return contact.website.value;
    case 'resume':
      return ''; // file inputs are handled outside the value chain
  }
}

/** What tier 4 compares a label against. */
export function candidatesFor(ctx: FillContext): Candidate[] {
  const { contact } = ctx.profile;
  const { preferences } = ctx;

  return [
    { text: 'first name given name', value: contact.firstName.value },
    { text: 'last name surname family name', value: contact.lastName.value },
    { text: 'full legal name', value: contact.fullName.value },
    { text: 'email address', value: contact.email.value },
    { text: 'phone number', value: contact.phone.value },
    { text: 'city location where you live', value: contact.location.value },
    { text: 'linkedin profile url', value: contact.linkedin.value },
    { text: 'github profile url', value: contact.github.value },
    { text: 'personal website portfolio url', value: contact.website.value },
    { text: 'authorised to work legally eligible', value: preferences.workAuthorized },
    { text: 'need visa sponsorship', value: preferences.requiresSponsorship },
    { text: 'willing to relocate', value: preferences.willingToRelocate },
    { text: 'salary expectation desired compensation', value: preferences.salaryExpectation },
    { text: 'notice period when can you start', value: preferences.noticePeriod },
    { text: 'pronouns', value: preferences.pronouns },
    { text: 'gender', value: preferences.gender },
    { text: 'race ethnicity', value: preferences.race },
    { text: 'veteran status', value: preferences.veteranStatus },
    { text: 'disability status', value: preferences.disabilityStatus },
    { text: 'current employer company', value: ctx.profile.experience[0]?.company ?? '' },
    { text: 'current job title role', value: ctx.profile.experience[0]?.title ?? '' },
  ];
}

/**
 * Constrain an answer to the field's own options.
 *
 * A select or radio group can only hold one of its options, so an answer that
 * maps to none of them is not an answer — better to leave the field for review
 * than to write something the widget will drop on submit.
 */
function fitToField(field: HarvestedField, value: string): string | null {
  if (field.options.length === 0) return value;
  return matchOption(value, field.options);
}

function record(
  out: Resolution[],
  field: HarvestedField,
  value: string,
  tier: ResolverTier,
): boolean {
  const fitted = fitToField(field, value);
  if (fitted === null || fitted.trim() === '') return false;

  out.push({
    fieldId: field.id,
    value: fitted,
    tier,
    confidence: resolutionConfidence(tier) as Confidence,
  });
  return true;
}

/**
 * Run the chain over a harvested form.
 *
 * Fields that already have a value are skipped entirely — the site or the user
 * put it there, and overwriting it is never an improvement.
 */
export async function resolveFields(
  fields: readonly HarvestedField[],
  deps: ResolveDeps,
): Promise<FillPlan> {
  const { ctx, adapterHits, memory, embedder, model } = deps;

  const resolutions: Resolution[] = [];
  const unresolved: UnresolvedField[] = [];
  const remaining: HarvestedField[] = [];

  for (const field of fields) {
    if (field.existingValue.trim() !== '') continue;
    if (field.kind === 'file') continue;

    // --- tier 1: the site adapter's verified selector map ---
    const known = adapterHits?.get(field.id);
    if (known) {
      const value = knownFieldValue(known, ctx);
      if (value && record(resolutions, field, value, 1)) continue;
    }

    // --- tier 2: answer memory, the reason a repeat costs nothing ---
    if (memory && field.label) {
      const remembered = await memory.recall(field.label);
      if (remembered && record(resolutions, field, remembered, 2)) continue;
    }

    // --- tier 3: the deterministic label table ---
    const matched = matchLabel(field.label, ctx);
    if (matched && record(resolutions, field, matched, 3)) continue;

    // --- tier 4: local embedding similarity, still free ---
    if (embedder && field.label) {
      const similar = await resolveBySimilarity(field.label, candidatesFor(ctx), embedder);
      if (similar && record(resolutions, field, similar.value, 4)) continue;
    }

    remaining.push(field);
  }

  // --- tier 5: one batched call for everything still unknown ---
  let llmCalls = 0;

  if (remaining.length > 0 && model) {
    try {
      const answers = await model.answer(remaining, ctx);
      llmCalls = 1;

      for (const field of remaining) {
        const answer = answers[field.id];
        if (!answer || !record(resolutions, field, answer, 5)) {
          unresolved.push({ fieldId: field.id, reason: 'no-match' });
        }
      }
    } catch {
      // Budget exhausted, no key, or the provider failed. Degrade: hand the
      // remainder to review rather than failing a fill that is mostly done.
      for (const field of remaining) {
        unresolved.push({ fieldId: field.id, reason: 'budget-exhausted' });
      }
    }
  } else {
    for (const field of remaining) {
      unresolved.push({ fieldId: field.id, reason: 'no-match' });
    }
  }

  return { resolutions, unresolved, llmCalls };
}

/** Per-tier counts, for the HUD and the cost claim in the README. */
export function tierBreakdown(plan: FillPlan): Record<ResolverTier, number> {
  const counts: Record<ResolverTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of plan.resolutions) counts[r.tier]++;
  return counts;
}

/** Stable key for writing an accepted answer back to tier 2. */
export const memoryKey = questionHash;
