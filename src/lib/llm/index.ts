/**
 * The one entry point for spending an LLM call.
 *
 * Everything that wants tier 5 goes through `ask()`, so the budget counter
 * cannot be bypassed and the "median application costs zero calls" claim stays
 * measurable rather than aspirational.
 *
 * Keys live in chrome.storage.local, never in IndexedDB — that is what lets
 * the `.clankdb` export dump every Dexie table without leaking a credential.
 */
import { budgetStatus, canSpend, initialBudget, spend, type BudgetState } from './budget';
import { callProvider } from './providers';
import {
  BudgetExhaustedError,
  PROVIDERS,
  type LlmConfig,
  type LlmRequest,
  type LlmResult,
  type ProviderId,
} from './types';

export * from './types';
export * from './budget';

const CONFIG_KEY = 'llm.config';
const BUDGET_KEY = 'llm.budget';

const DEFAULT_CONFIG: LlmConfig = {
  provider: 'gemini',
  model: PROVIDERS.gemini.defaultModel,
  apiKey: '',
};

async function readLocal<T>(key: string, fallback: T): Promise<T> {
  const got = await chrome.storage.local.get(key);
  return (got[key] as T | undefined) ?? fallback;
}

export function getLlmConfig(): Promise<LlmConfig> {
  return readLocal(CONFIG_KEY, DEFAULT_CONFIG);
}

export async function setLlmConfig(patch: Partial<LlmConfig>): Promise<LlmConfig> {
  const next = { ...(await getLlmConfig()), ...patch };
  // Switching provider without naming a model would otherwise carry the old
  // provider's model string across and 404 on the first call.
  if (patch.provider && !patch.model) next.model = PROVIDERS[patch.provider].defaultModel;
  await chrome.storage.local.set({ [CONFIG_KEY]: next });
  return next;
}

export function getBudget(): Promise<BudgetState> {
  return readLocal(BUDGET_KEY, initialBudget());
}

async function putBudget(state: BudgetState): Promise<void> {
  await chrome.storage.local.set({ [BUDGET_KEY]: state });
}

/** Current quota picture, for the settings screen and the fill HUD. */
export async function currentBudgetStatus(): Promise<
  ReturnType<typeof budgetStatus> & { provider: ProviderId }
> {
  const [cfg, state] = await Promise.all([getLlmConfig(), getBudget()]);
  return { ...budgetStatus(state, cfg.provider), provider: cfg.provider };
}

/** Whether tier 5 is available at all right now. */
export async function canEscalate(): Promise<boolean> {
  const [cfg, state] = await Promise.all([getLlmConfig(), getBudget()]);
  return Boolean(cfg.apiKey || PROVIDERS[cfg.provider].local) && canSpend(state, cfg.provider);
}

/**
 * Spend exactly one call.
 *
 * Throws `BudgetExhaustedError` when the day's quota is gone — callers are
 * expected to catch that and continue deterministically, not to surface it as
 * a failure. Everything else (network, auth, bad JSON) is a real error.
 */
export async function ask<T>(req: LlmRequest): Promise<LlmResult<T>> {
  const cfg = await getLlmConfig();

  if (!cfg.apiKey && !PROVIDERS[cfg.provider].local) {
    throw new BudgetExhaustedError(cfg.provider); // no key is, functionally, no budget
  }

  const state = await getBudget();
  if (!canSpend(state, cfg.provider)) throw new BudgetExhaustedError(cfg.provider);

  const data = await callProvider<T>(cfg, req);

  // Charged only on success. A 500 from the provider is not the user's quota.
  await putBudget(spend(state));

  return { data, calls: 1 };
}
