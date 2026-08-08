/**
 * The fill trigger.
 *
 * Probes the active tab so the user knows what was found *before* committing to
 * anything, then hands off to the content script. The overlay that follows is
 * the review step — this button never submits an application.
 *
 * The probe injects on demand, so this works on any page with a form on it,
 * not only the six ATS hosts the content script is registered for. That was
 * the single biggest gap in the tool: the generic adapter existed and could
 * never run.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getProfile, totalDp } from '@/lib/db/repo';
import { currentBudgetStatus } from '@/lib/llm';
import { askPage, NotInjectableError } from '@/lib/fill/inject';
import { onProgress, type FillProgress } from '@/lib/fill/progress';
import { TIER_LABEL } from '@/lib/fill/types';
import { levelFromDp, tierForLevel } from '@/lib/game/economy';
import { Button, Notice, Window } from '@/ui/dq';
import FillRun from '@/ui/game/FillRun';

interface Probe {
  ats: string;
  fieldCount: number;
  requiredCount: number;
}

interface FillResult {
  ok: boolean;
  error?: string;
  account?: 'signup' | 'login';
  filled?: number;
  skipped?: number;
  llmCalls?: number;
  cancelled?: boolean;
}

export default function Fill() {
  const profile = useLiveQuery(() => getProfile(), []);
  const budget = useLiveQuery(() => currentBudgetStatus(), []);
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probeError, setProbeError] = useState('');
  const [result, setResult] = useState<FillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(true);

  /**
   * The live checklist, broadcast field by field from the page.
   *
   * Subscribed for the whole life of the tab rather than only during a run:
   * the panel can be opened mid-fill, and a listener attached on the button
   * press would miss everything that had already happened.
   */
  const [progress, setProgress] = useState<FillProgress | null>(null);
  useEffect(() => onProgress(setProgress), []);

  const refresh = useCallback(async () => {
    setProbing(true);
    setProbeError('');
    try {
      setProbe(await askPage<Probe>({ type: 'clanker:probe' }));
    } catch (err) {
      setProbe(null);
      // A page Chrome refuses to script is a normal state with a real reason.
      // Saying which is the difference between "broken" and "not here".
      setProbeError(
        err instanceof NotInjectableError
          ? err.message
          : 'Could not read this page. Reload it and try again.',
      );
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fill = async () => {
    setBusy(true);
    setResult(null);
    setProgress(null);
    try {
      setResult(await askPage<FillResult>({ type: 'clanker:fill' }));
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Fill failed' });
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) return <p className="text-[13px] text-faint">Loading…</p>;

  if (!profile) {
    return (
      <Notice>Add a resume on the Profile tab first — there is nothing to fill from yet.</Notice>
    );
  }

  /**
   * While a run is live the tab *is* the run: the crusade above, the
   * checklist below. Anything else on screen at that moment is competing with
   * the one thing the user is actually watching.
   */
  if (progress) {
    return (
      <FillRun
        progress={progress}
        tier={tierForLevel(levelFromDp(dp).level)}
        onDone={() => {
          setProgress(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Window title="This page">
        {probing ? (
          <p className="text-[13px] text-faint">Looking for a form…</p>
        ) : probe ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[14px] text-gold">{probe.ats}</span>
              <span className="font-mono text-[12px] text-muted">
                {probe.fieldCount} fields · {probe.requiredCount} required
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-muted">
              Nothing is submitted. You review every field before it lands.
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-snug text-muted">
            {probeError || 'No form found on this tab. Open a job application and refresh.'}
          </p>
        )}
      </Window>

      <div className="flex gap-1">
        <Button
          primary
          onClick={fill}
          disabled={!probe || probe.fieldCount === 0 || busy}
          className="flex-1"
        >
          {busy ? 'Filling…' : 'Fill this application'}
        </Button>
        <Button onClick={() => void refresh()}>Refresh</Button>
      </div>

      {budget && (
        <p className="font-mono text-[12px] text-faint">
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
        <Window title="Result">
          {result.ok ? (
            result.account ? (
              <>
                <p className="text-[13px] text-parchment">
                  Prepared {result.filled} {result.filled === 1 ? 'field' : 'fields'} for this{' '}
                  {result.account === 'signup' ? 'sign-up' : 'sign-in'} step.
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Review the page and continue it yourself. Clanker did not press the account button.
                </p>
              </>
            ) : result.cancelled ? (
              <p className="text-[13px] text-muted">Cancelled — nothing was written.</p>
            ) : (
              <>
                <p className="text-[13px] text-parchment">
                  Filled <span className="text-ok">{result.filled}</span>
                  {result.skipped ? (
                    <>
                      {' '}
                      · left <span className="text-warn">{result.skipped}</span> for you
                    </>
                  ) : null}
                </p>
                <p className="mt-1 font-mono text-[12px] text-faint">
                  {result.llmCalls === 0
                    ? 'zero model calls — every field came from a free tier'
                    : `${result.llmCalls} batched ${TIER_LABEL[5]} call`}
                </p>
              </>
            )
          ) : (
            <p className="text-[13px] text-bad">{result.error}</p>
          )}
        </Window>
      )}
    </div>
  );
}
