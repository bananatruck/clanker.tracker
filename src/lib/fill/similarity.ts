/**
 * Tier 4 — local embedding similarity.
 *
 * Catches the paraphrases tier 3's table misses ("Tell us where you're based
 * right now") without spending a call. It is the last free tier, so every
 * field it answers is one tier 5 never sees.
 *
 * The embedder is injected rather than imported. Two reasons: the matching
 * logic is then testable without loading a model, and if the model fails to
 * load the chain skips tier 4 and escalates instead of breaking the fill.
 * A missing tier degrades cost, not correctness.
 */

export interface Embedder {
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

/** Cosine similarity. Vectors are assumed same-length; mismatch scores 0. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** A thing the profile can answer with, described in words the model can read. */
export interface Candidate {
  /** Natural-language description of the field, e.g. "email address". */
  text: string;
  value: string;
}

/**
 * Similarity is only trusted above this. Set high on purpose: a wrong answer
 * that looks certain is worse than an unanswered field the user fills in, and
 * tier 5 is right there as the next step.
 */
export const SIMILARITY_THRESHOLD = 0.72;

export interface SimilarityMatch {
  value: string;
  score: number;
}

/**
 * Best candidate for a label, or null if nothing clears the threshold.
 *
 * One `embed` call covers the label and every candidate, so this costs one
 * local inference per field rather than one per comparison.
 */
export async function resolveBySimilarity(
  label: string,
  candidates: readonly Candidate[],
  embedder: Embedder,
  threshold = SIMILARITY_THRESHOLD,
): Promise<SimilarityMatch | null> {
  const usable = candidates.filter((c) => c.value.trim() !== '');
  if (!label.trim() || usable.length === 0) return null;

  const vectors = await embedder.embed([label, ...usable.map((c) => c.text)]);
  const labelVector = vectors[0];
  if (!labelVector) return null;

  let best: SimilarityMatch | null = null;

  for (let i = 0; i < usable.length; i++) {
    const vector = vectors[i + 1];
    if (!vector) continue;

    const score = cosine(labelVector, vector);
    if (score >= threshold && (!best || score > best.score)) {
      best = { value: usable[i]!.value, score };
    }
  }

  return best;
}

/**
 * Tier 4's model backend.
 *
 * **Not wired yet, deliberately.** Returning null means the chain skips tier 4
 * and escalates to tier 5, which is the documented behaviour of the seam — so
 * the fill is correct today, just fractionally more expensive on the ~5% of
 * fields tier 4 would have caught.
 *
 * It is unwired because plugging in transformers.js is not a dependency
 * decision, it is a product one, and it needs an explicit call:
 *
 *   - MiniLM weights are ~23 MB. Fetching them from the HuggingFace CDN on
 *     first run would contradict the privacy claim in the README — "the only
 *     network calls are to the LLM provider whose key you supplied, and to any
 *     sync target you explicitly connect". Bundling them instead keeps that
 *     promise but puts 23 MB into the store listing.
 *   - onnxruntime-web needs `wasm-unsafe-eval` in the extension CSP, which is
 *     a real widening of the manifest for a tier that saves ~5% of one call.
 *
 * Everything above this function is finished and tested: supply any `Embedder`
 * and tier 4 starts working with no further change here.
 */
export async function loadLocalEmbedder(): Promise<Embedder | null> {
  return null;
}
