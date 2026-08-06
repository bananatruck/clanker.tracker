/**
 * One fill run, end to end.
 *
 * harvest → resolve → review → apply → learn.
 *
 * The last step is the one that compounds: every value the user accepts or
 * corrects is written back to answer memory, so tier 2's hit rate climbs from
 * roughly a third on the first application to near-total by the thirtieth.
 * Skip the write-back and the tool never gets cheaper — it just stays clever.
 */
import { detectAts, knownFieldFor, type KnownField } from './adapters';
import { applyValue, clearHighlight, highlight } from './apply';
import { findApplicationForm, harvestForm, type FieldElement } from './harvest';
import { batchModel } from './model';
import { clearOverlays, showReview, type ReviewRow } from './overlay';
import { resolveFields, tierBreakdown, type AnswerMemory } from './resolve';
import type { FillContext } from './labels';
import type { RunRecord } from './autosubmit';
import type { HarvestedField, Resolution } from './types';

export interface RunHooks {
  memory: AnswerMemory;
  /** Called once per accepted answer, to grow tier 2. */
  remember(question: string, answer: string): Promise<void>;
  /** Called with the completed run so the auto-submit gate can score it. */
  record(run: RunRecord): Promise<void>;
  /**
   * The skirmish line for the player's current tier, if the game has one.
   * Decoration only — a failure to fetch it must never stop a fill.
   */
  bark?(): Promise<string | null>;
}

export interface RunOutcome {
  filled: number;
  skipped: number;
  llmCalls: number;
  run: RunRecord;
  cancelled: boolean;
}

/** Map adapter selectors onto harvested field ids, for tier 1. */
function adapterHitsFor(
  elements: Map<string, FieldElement>,
  doc: Document,
  host: string,
): { hits: Map<string, KnownField>; ats: ReturnType<typeof detectAts> } {
  const ats = detectAts(host, doc);
  const hits = new Map<string, KnownField>();

  for (const [id, el] of elements) {
    const known = knownFieldFor(ats, el, doc);
    if (known) hits.set(id, known);
  }

  return { hits, ats };
}

export async function runFill(ctx: FillContext, hooks: RunHooks): Promise<RunOutcome> {
  clearOverlays();

  const doc = document;
  const form = findApplicationForm(doc);
  const { fields, elements } = harvestForm(form);
  const { hits, ats } = adapterHitsFor(elements, doc, location.hostname);

  const plan = await resolveFields(fields, {
    ctx,
    adapterHits: hits,
    memory: hooks.memory,
    model: batchModel,
  });

  const byId = new Map<string, Resolution>(plan.resolutions.map((r) => [r.fieldId, r]));

  // Only fields the run actually intends to touch reach review; a field the
  // page had already filled is not the user's problem to re-approve.
  const pending: HarvestedField[] = fields.filter(
    (f) => f.existingValue.trim() === '' && f.kind !== 'file',
  );

  const rows: ReviewRow[] = pending.map((field) => ({
    field,
    resolution: byId.get(field.id) ?? null,
  }));

  // Highlight in place so the overlay and the page agree about what is certain.
  for (const field of pending) {
    const el = elements.get(field.id);
    if (el) highlight(el, byId.get(field.id)?.confidence ?? 'missing');
  }

  // Decoration, so it is never allowed to fail the run it decorates.
  const bark = await hooks.bark?.().catch(() => null) ?? null;

  const outcome = await showReview(rows, plan.llmCalls, bark);

  for (const field of pending) {
    const el = elements.get(field.id);
    if (el) clearHighlight(el);
  }

  const emptyRun: RunRecord = {
    ats: ats.id,
    totalFields: pending.length,
    certainFields: plan.resolutions.filter((r) => r.confidence === 'certain').length,
    correctedFields: outcome.corrected.size,
    unfilledRequired: 0,
    at: Date.now(),
  };

  if (!outcome.submitted) {
    return { filled: 0, skipped: pending.length, llmCalls: plan.llmCalls, run: emptyRun, cancelled: true };
  }

  let filled = 0;
  let skipped = 0;

  for (const field of pending) {
    const value = outcome.values.get(field.id) ?? '';
    const el = elements.get(field.id);
    if (!el || value.trim() === '') {
      skipped++;
      continue;
    }

    const result = applyValue(el, value, field.options);
    if (result.ok) {
      filled++;
      // Learn the answer under the question as this site phrased it.
      if (field.label) await hooks.remember(field.label, value);
    } else {
      skipped++;
    }
  }

  const unfilledRequired = pending.filter(
    (f) => f.required && (outcome.values.get(f.id) ?? '').trim() === '',
  ).length;

  const run: RunRecord = { ...emptyRun, unfilledRequired, at: Date.now() };
  await hooks.record(run);

  return { filled, skipped, llmCalls: plan.llmCalls, run, cancelled: false };
}

export { tierBreakdown };
