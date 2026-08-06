/**
 * The fill trigger.
 *
 * Probes the active tab so the user knows what we found *before* committing to
 * anything, then hands off to the content script. The overlay that follows is
 * the review step — this button never submits an application.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getProfile } from '@/lib/db/repo';
import { currentBudgetStatus } from '@/lib/llm';
import { TIER_LABEL } from '@/lib/fill/types';

interface Probe {
  ats: string;
  fieldCount: number;
  requiredCount: number;
}

interface FillResult {
  ok: boolean;
  error?: string;
  filled?: number;
  skipped?: number;
  llmCalls?: number;
  cancelled?: boolean;
}

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function send<T>(tabId: number, type: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type }, (reply: T) => {
      // A tab with no content script rejects here; that is a normal state, not
      // an error worth surfacing as a crash.
      if (chrome.runtime.lastError) resolve(null);
      else resolve(reply ?? null);
    });
  });
}

export default function Fill() {
  const profile = useLiveQuery(() => getProfile(), []);
  const budget = useLiveQuery(() => currentBudgetStatus(), []);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [result, setResult] = useState<FillResult | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const id = await activeTabId();
    setProbe(id === null ? null : await send<Probe>(id, 'clanker:probe'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fill = async () => {
    const id = await activeTabId();
    if (id === null) return;
    setBusy(true);
    setResult(null);
    setResult(await send<FillResult>(id, 'clanker:fill'));
    setBusy(false);
  };

  if (!profile) {
    return (
      <p className="border border-frame bg-window px-2.5 py-2 text-[11px] text-muted">
        Add a resume on the Profile tab first — there is nothing to fill from yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <section className="border border-frame bg-window p-2.5">
        {probe ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] text-gold">{probe.ats}</span>
              <span className="font-mono text-[10px] text-faint">
                {probe.fieldCount} fields · {probe.requiredCount} required
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              Nothing is submitted. You review every field before it lands.
            </p>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-muted">
            No application form detected on this tab. Open a job application and refresh.
          </p>
        )}
      </section>

      <div className="flex gap-1">
        <button
          onClick={fill}
          disabled={!probe || busy}
          className="flex-1 bg-gold-dim px-2.5 py-1.5 font-mono text-[11px] text-parchment hover:bg-gold disabled:opacity-40"
        >
          {busy ? 'Filling…' : 'Fill this application'}
        </button>
        <button
          onClick={() => void refresh()}
          className="border border-frame px-2 py-1.5 font-mono text-[10px] text-muted hover:bg-window hover:text-parchment"
        >
          Refresh
        </button>
      </div>

      {budget && (
        <p className="font-mono text-[10px] text-faint">
          budget · {budget.used}/{budget.limit} today
          {budget.warn && !budget.exhausted && (
            <span className="text-warn"> · nearing the daily limit</span>
          )}
          {budget.exhausted && (
            <span className="text-bad"> · spent, filling deterministically only</span>
          )}
        </p>
      )}

      {result && (
        <section className="border border-frame bg-window p-2.5">
          {result.ok ? (
            result.cancelled ? (
              <p className="text-[11px] text-muted">Cancelled — nothing was written.</p>
            ) : (
              <>
                <p className="text-[11px] text-parchment">
                  Filled <span className="text-ok">{result.filled}</span>
                  {result.skipped ? (
                    <>
                      {' '}
                      · left <span className="text-bad">{result.skipped}</span> for you
                    </>
                  ) : null}
                </p>
                <p className="mt-1 font-mono text-[10px] text-faint">
                  {result.llmCalls === 0
                    ? 'zero model calls — every field came from a free tier'
                    : `${result.llmCalls} batched ${TIER_LABEL[5]} call`}
                </p>
              </>
            )
          ) : (
            <p className="text-[11px] text-bad">{result.error}</p>
          )}
        </section>
      )}
    </div>
  );
}
