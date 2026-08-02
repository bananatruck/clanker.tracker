/**
 * Settings — the provider, the model, and the key.
 *
 * The key is written to `chrome.storage.local` and never to IndexedDB. That
 * split is the reason a `.clankdb` export can dump every Dexie table without
 * leaking a credential, so it is worth keeping even though one storage area
 * would obviously be simpler.
 *
 * The key never leaves this machine except as an `x-goog-api-key` (or
 * equivalent) header on a call you triggered. There is no backend to send it
 * to even if we wanted one.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ask,
  currentBudgetStatus,
  getLlmConfig,
  setLlmConfig,
  PROVIDERS,
  type LlmConfig,
  type ProviderId,
} from '@/lib/llm';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; echo: string }
  | { kind: 'fail'; error: string };

export default function Settings() {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  const budget = useLiveQuery(() => currentBudgetStatus(), [], undefined);

  useEffect(() => {
    void getLlmConfig().then(setConfig);
  }, []);

  if (!config) return <p className="font-mono text-[11px] text-faint">Loading…</p>;

  const provider = PROVIDERS[config.provider];

  const patch = async (next: Partial<LlmConfig>) => {
    setConfig(await setLlmConfig(next));
    setSaved(true);
    setTest({ kind: 'idle' });
    setTimeout(() => setSaved(false), 2000);
  };

  /**
   * Spend exactly one real call to prove the key works.
   *
   * A test that only checked the string looked non-empty would be theatre —
   * the failure people actually hit is a key that is valid-looking and
   * rejected. This goes through `ask()` like any other call, so it is counted
   * against the day's budget rather than sneaking around it.
   */
  const runTest = async () => {
    setTest({ kind: 'testing' });
    try {
      const result = await ask<{ ok: string }>({
        system: 'You are a connectivity check. Reply with the word "connected".',
        prompt: 'Reply with {"ok": "connected"}.',
        schema: {
          type: 'object',
          properties: { ok: { type: 'string' } },
          required: ['ok'],
        },
        maxTokens: 64,
      });
      setTest({ kind: 'ok', echo: String(result.data.ok).slice(0, 40) });
    } catch (err) {
      setTest({ kind: 'fail', error: err instanceof Error ? err.message : 'failed' });
    }
  };

  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded border border-border bg-surface p-2.5">
        <h2 className="font-mono text-[10px] uppercase tracking-wide text-faint">Provider</h2>

        <select
          value={config.provider}
          onChange={(e) => void patch({ provider: e.target.value as ProviderId })}
          className="w-full rounded border border-border bg-base px-2 py-1 text-[11px] text-text outline-none focus:border-accent-dim"
        >
          {Object.values(PROVIDERS).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <input
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          onBlur={() => void patch({ model: config.model })}
          placeholder="model"
          className="w-full rounded border border-border bg-base px-2 py-1 font-mono text-[11px] text-text outline-none placeholder:text-faint focus:border-accent-dim"
        />

        <p className="font-mono text-[9px] leading-relaxed text-faint">
          {provider.local
            ? 'runs on your machine · no key, no quota, nothing leaves'
            : `${provider.dailyLimit}/day before the budget degrades to deterministic-only`}
        </p>
      </section>

      {!provider.local && (
        <section className="space-y-2 rounded border border-border bg-surface p-2.5">
          <h2 className="font-mono text-[10px] uppercase tracking-wide text-faint">API key</h2>

          <div className="flex gap-1">
            <input
              type={reveal ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              onBlur={() => void patch({ apiKey: config.apiKey })}
              placeholder="paste your key"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 rounded border border-border bg-base px-2 py-1 font-mono text-[11px] text-text outline-none placeholder:text-faint focus:border-accent-dim"
            />
            <button
              onClick={() => setReveal((r) => !r)}
              className="shrink-0 rounded border border-border px-2 font-mono text-[10px] text-muted hover:bg-surface-hi hover:text-text"
            >
              {reveal ? 'hide' : 'show'}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => void runTest()}
              disabled={!config.apiKey || test.kind === 'testing'}
              className="rounded bg-accent-dim px-2 py-1 font-mono text-[10px] text-text hover:bg-accent disabled:opacity-40"
            >
              {test.kind === 'testing' ? 'Testing…' : 'Test key'}
            </button>
            {saved && <span className="font-mono text-[9px] text-certain">saved</span>}
            {provider.keyUrl && (
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto font-mono text-[9px] text-muted underline decoration-border hover:text-accent"
              >
                get a key
              </a>
            )}
          </div>

          {test.kind === 'ok' && (
            <p className="font-mono text-[10px] text-certain">
              key works · model replied “{test.echo}”
            </p>
          )}
          {test.kind === 'fail' && (
            <p className="font-mono text-[10px] leading-relaxed text-missing">{test.error}</p>
          )}

          <p className="text-[10px] leading-relaxed text-faint">
            Stored in <span className="font-mono">chrome.storage.local</span>, never in the
            database and never in a <span className="font-mono">.clankdb</span> export. It
            leaves this machine only as a header on a call you triggered.
          </p>
        </section>
      )}

      {budget && (
        <section className="rounded border border-border bg-surface p-2.5">
          <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">
            Today
          </h2>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[15px] leading-none text-text">{budget.used}</span>
            <span className="font-mono text-[10px] text-faint">of {budget.limit} calls</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-base">
            <div
              className={budget.exhausted ? 'h-full bg-missing' : budget.warn ? 'h-full bg-guessed' : 'h-full bg-certain'}
              style={{ width: `${Math.min(100, (budget.used / Math.max(1, budget.limit)) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
            The median application costs zero calls. If this number climbs fast, tiers 1–4 are
            missing and that is a bug worth reporting.
          </p>
        </section>
      )}
    </div>
  );
}
