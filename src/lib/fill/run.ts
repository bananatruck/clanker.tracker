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
import {
  applyAnswer,
  applyFile,
  clearHighlight,
  highlight,
  type FileAttachment,
} from './apply';
import { acceptsTextAttachment, documentFieldKind } from './documents';
import { findApplicationForm, harvestForm, type AnswerElement } from './harvest';
import { batchModel } from './model';
import { clearOverlays, showReview, type ReviewRow } from './overlay';
import { resolveFields, tierBreakdown, type AnswerMemory } from './resolve';
import type { FillContext } from './labels';
import type { RunRecord } from './records';
import { reportProgress, type FieldProgress, type FillPhase } from './progress';
import type { HarvestedField, Resolution } from './types';
import { prepareRepeaters } from './repeaters';
import type { StoredDocument } from '@/lib/db/schema';

export interface RunHooks {
  memory: AnswerMemory;
  /** Called once per accepted answer, to grow tier 2. */
  remember(field: HarvestedField, answer: string): Promise<void>;
  /** Persist measured fill quality for the dashboard and regression checks. */
  record(run: RunRecord): Promise<void>;
  /**
   * The skirmish line for the player's current tier, if the game has one.
   * Decoration only — a failure to fetch it must never stop a fill.
   */
  bark?(): Promise<string | null>;
  /** Exact local bytes selected during setup; never reconstructed from text. */
  resumeDocument?: StoredDocument | null;
  /** A generated letter already matched to this posting by the background worker. */
  coverLetter?: {
    text: string;
    attachment: FileAttachment;
  } | null;
}

export interface RunOutcome {
  filled: number;
  skipped: number;
  llmCalls: number;
  run: RunRecord;
  cancelled: boolean;
  /** Structured facts verified on this page, retained across later steps. */
  completedPaths: string[];
}

/** Map adapter selectors onto harvested field ids, for tier 1. */
function adapterHitsFor(
  elements: Map<string, AnswerElement>,
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
  await prepareRepeaters(doc, ctx.profile);
  const form = findApplicationForm(doc);
  const { fields, elements } = harvestForm(form);
  const { hits, ats } = adapterHitsFor(elements, doc, location.hostname);
  const documentKinds = new Map(
    fields.map((field) => [field.id, documentFieldKind(field, hits.get(field.id))] as const),
  );

  /**
   * The live checklist the side panel draws while this runs.
   *
   * Held here and rebroadcast whole on every change rather than sent as
   * deltas: a run is a few dozen fields, the panel may open halfway through,
   * and a receiver that has to reassemble a stream to know the current state
   * is a receiver that can be wrong about it.
   */
  const progress = new Map<string, FieldProgress>();
  const say = (phase: FillPhase, llmCalls = 0, error?: string) =>
    reportProgress({ phase, ats: ats.id, fields: [...progress.values()], llmCalls, error });

  say('reading');

  // A cover letter is job-specific grounded writing. It must never fall into
  // the generic answer model or global answer memory when no matching letter
  // exists, because either path could reuse prose written for another job.
  const plan = await resolveFields(
    fields.filter((field) => documentKinds.get(field.id) !== 'cover-letter'),
    {
      ctx,
      adapterHits: hits,
      memory: hooks.memory,
      model: batchModel,
    },
  );

  const byId = new Map<string, Resolution>(plan.resolutions.map((r) => [r.fieldId, r]));

  if (hooks.resumeDocument) {
    for (const field of fields) {
      if (field.kind !== 'file') continue;
      if (documentKinds.get(field.id) !== 'resume') continue;
      byId.set(field.id, {
        fieldId: field.id,
        value: hooks.resumeDocument.fileName,
        tier: 1,
        confidence: 'certain',
      });
    }
  }

  if (hooks.coverLetter) {
    for (const field of fields) {
      if (documentKinds.get(field.id) !== 'cover-letter') continue;
      const el = elements.get(field.id);
      const isCompatibleFile =
        field.kind === 'file' &&
        el instanceof HTMLInputElement &&
        acceptsTextAttachment(el.accept);
      if (field.kind === 'file' && !isCompatibleFile) continue;

      byId.set(field.id, {
        fieldId: field.id,
        value: isCompatibleFile
          ? hooks.coverLetter.attachment.fileName
          : hooks.coverLetter.text,
        tier: 1,
        confidence: 'certain',
      });
    }
  }

  // Only fields the run actually intends to touch reach review; a field the
  // page had already filled is not the user's problem to re-approve.
  const pending: HarvestedField[] = fields.filter(
    (field) =>
      field.existingValue.trim() === '' && (field.kind !== 'file' || byId.has(field.id)),
  );

  const rows: ReviewRow[] = pending.map((field) => ({
    field,
    resolution: byId.get(field.id) ?? null,
  }));

  // Every field the run intends to touch appears at once, already carrying the
  // answer the resolver found. The checklist is then a list that ticks rather
  // than a list that grows, so its length stops changing under the reader.
  for (const field of pending) {
    const answer = byId.get(field.id);
    progress.set(field.id, {
      id: field.id,
      label: field.label || field.name || 'Unlabelled field',
      required: field.required,
      state: answer ? 'pending' : 'needs-you',
      value: answer?.value ?? '',
      tier: answer?.tier ?? null,
    });
  }
  say('answering', plan.llmCalls);

  // Highlight in place so the overlay and the page agree about what is certain.
  for (const field of pending) {
    const el = elements.get(field.id);
    if (el) highlight(el, byId.get(field.id)?.confidence ?? 'missing');
  }

  // Decoration, so it is never allowed to fail the run it decorates.
  const bark = await hooks.bark?.().catch(() => null) ?? null;

  say('reviewing', plan.llmCalls);
  const outcome = await showReview(rows, plan.llmCalls, bark);

  for (const field of pending) {
    const el = elements.get(field.id);
    if (el) clearHighlight(el);
  }

  const emptyRun: RunRecord = {
    ats: ats.id,
    totalFields: pending.length,
    certainFields: pending.filter((field) => byId.get(field.id)?.confidence === 'certain').length,
    correctedFields: outcome.corrected.size,
    unfilledRequired: 0,
    at: Date.now(),
  };

  if (!outcome.submitted) {
    say('cancelled', plan.llmCalls);
    return {
      filled: 0,
      skipped: pending.length,
      llmCalls: plan.llmCalls,
      run: emptyRun,
      cancelled: true,
      completedPaths: [],
    };
  }

  let filled = 0;
  let skipped = 0;

  say('writing', plan.llmCalls);

  for (const field of pending) {
    // The user's correction wins over the resolver's answer, so the checklist
    // shows what actually went into the page rather than what was proposed.
    const value = outcome.values.get(field.id) ?? '';
    const el = elements.get(field.id);
    const row = progress.get(field.id)!;

    if (!el || value.trim() === '') {
      skipped++;
      progress.set(field.id, { ...row, state: 'needs-you', value: '' });
      say('writing', plan.llmCalls);
      continue;
    }

    const documentKind = documentKinds.get(field.id);
    const attachment =
      documentKind === 'resume'
        ? hooks.resumeDocument
        : documentKind === 'cover-letter'
          ? hooks.coverLetter?.attachment
          : null;
    const result =
      field.kind === 'file' && el instanceof HTMLInputElement && attachment
        ? applyFile(el, attachment)
        : await applyAnswer(el, value, field.options);
    if (result.ok) {
      filled++;
      progress.set(field.id, { ...row, state: 'filled', value });
      // Learn the answer under the question as this site phrased it.
      if (
        field.label &&
        field.kind !== 'file' &&
        documentKind !== 'cover-letter'
      ) await hooks.remember(field, value);
    } else {
      skipped++;
      progress.set(field.id, { ...row, state: 'needs-you', value: '' });
    }
    say('writing', plan.llmCalls);
  }

  const unfilledRequired = pending.filter(
    (field) => field.required && progress.get(field.id)?.state !== 'filled',
  ).length;

  const run: RunRecord = { ...emptyRun, unfilledRequired, at: Date.now() };
  await hooks.record(run);

  say('done', plan.llmCalls);

  const completedPaths = pending
    .filter((field) => progress.get(field.id)?.state === 'filled')
    .map((field) => field.semanticPath)
    .filter((path): path is string => Boolean(path));

  return { filled, skipped, llmCalls: plan.llmCalls, run, cancelled: false, completedPaths };
}

export { tierBreakdown };
