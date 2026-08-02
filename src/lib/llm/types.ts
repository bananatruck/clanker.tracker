/**
 * One interface over every provider, because the user brings their own key
 * and we don't get to choose which.
 *
 * Two rules hold across all of them:
 *   1. Every call is JSON-schema-constrained. Free-text parsing of an LLM
 *      response is a bug generator; the resolver needs a typed object back.
 *   2. Every call is batched. Tier 5 gets *one* call for every field still
 *      unknown after tiers 1-4 — never one call per field.
 */

export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'openrouter' | 'ollama';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  /** Requests per day before the budget tracker degrades to deterministic-only. */
  dailyLimit: number;
  /** Whether the key is sent to a third party at all. Ollama is local. */
  local: boolean;
  keyUrl?: string;
}

/**
 * The default is Gemini Flash: its free tier tightened in April 2026 to
 * Flash-only at roughly 250 requests/day, which is still far more than the
 * median day's applications cost — because the median application costs zero.
 *
 * Pinned to a concrete version rather than a `-latest` alias. An alias that
 * silently moves under a resolver whose whole job is deterministic output is a
 * bad trade — but it does mean this line goes stale: `gemini-2.5-flash` now
 * returns 404 for keys issued after its retirement, which is a confusing way
 * to learn your key is fine. The model is editable in Settings for exactly
 * that reason.
 */
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-3.6-flash',
    dailyLimit: 250,
    local: false,
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-opus-5',
    dailyLimit: 1000,
    local: false,
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-5',
    dailyLimit: 1000,
    local: false,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'google/gemini-2.5-flash',
    dailyLimit: 1000,
    local: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    defaultModel: 'llama3.1',
    dailyLimit: Number.MAX_SAFE_INTEGER, // your machine, your rules
    local: true,
  },
};

/** A JSON Schema subset — enough for the object-shaped replies we ask for. */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: false;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  /** The reply must validate against this. Every call is structured. */
  schema: JsonSchema;
  maxTokens?: number;
}

export interface LlmConfig {
  provider: ProviderId;
  model: string;
  apiKey: string;
  /** Ollama only — where the local server lives. */
  baseUrl?: string;
}

export interface LlmResult<T> {
  data: T;
  /** Always 1 — kept explicit so the tracker can never undercount. */
  calls: number;
}

/** Thrown when a provider is reachable but unhappy. Carries the status. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Thrown when the daily budget is spent. The caller degrades, never fails. */
export class BudgetExhaustedError extends Error {
  constructor(readonly provider: ProviderId) {
    super(`Daily budget exhausted for ${provider}`);
    this.name = 'BudgetExhaustedError';
  }
}
