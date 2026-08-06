/**
 * The ATS scan — requirement → evidence table.
 *
 * Deliberately not a match percentage. A number tells you nothing you can act
 * on; a row saying "they want Kubernetes and nothing in your resume mentions
 * it" tells you exactly what to write next. Every requirement in the posting
 * gets a row, covered or not, so nothing is quietly dropped.
 *
 * The scan is free and runs entirely locally, which is what makes it
 * reasonable to run on every posting you are merely considering.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { scanJobDescription, topGaps } from '@/lib/ats/evidence';
import { getProfile, saveScan } from '@/lib/db/repo';
import { scanSummary, type Coverage, type EvidenceRow, type ScanResult } from '@/types/ats';

const COVERAGE_LABEL: Record<Coverage, string> = {
  covered: 'covered',
  partial: 'partial',
  gap: 'gap',
};

const COVERAGE_TEXT: Record<Coverage, string> = {
  covered: 'text-ok',
  partial: 'text-warn',
  gap: 'text-bad',
};

const COVERAGE_BAR: Record<Coverage, string> = {
  covered: 'bg-ok',
  partial: 'bg-warn',
  gap: 'bg-bad',
};

export default function Scan() {
  const profile = useLiveQuery(() => getProfile(), []);
  const [jd, setJd] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);

  if (profile === undefined) {
    return <p className="font-mono text-[11px] text-faint">Loading…</p>;
  }

  if (!profile) {
    return (
      <p className="border border-frame bg-window px-2.5 py-2 text-[11px] text-muted">
        Add a resume on the Profile tab first — the scan matches a posting against your bullets.
      </p>
    );
  }

  const run = async () => {
    if (!jd.trim()) return;
    const result = scanJobDescription(jd, profile);
    setScan(result);
    await saveScan(result);
  };

  return (
    <div className="space-y-3">
      <textarea
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        placeholder="Paste the job description…"
        rows={6}
        className="w-full resize-y border border-frame bg-window px-2 py-1.5 text-[11px] leading-snug text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
      />

      <div className="flex items-center justify-between">
        <button
          onClick={run}
          disabled={!jd.trim()}
          className="bg-gold-dim px-2.5 py-1 font-mono text-[10px] text-parchment hover:bg-gold disabled:opacity-40"
        >
          Scan
        </button>
        <span className="font-mono text-[10px] text-faint">free · runs locally</span>
      </div>

      {scan && <Results scan={scan} />}
    </div>
  );
}

function Results({ scan }: { scan: ScanResult }) {
  const summary = scanSummary(scan.rows);
  const gaps = topGaps(scan.rows, 8);

  if (summary.total === 0) {
    return (
      <p className="border border-frame bg-window px-2.5 py-2 text-[11px] text-muted">
        No requirements found. Postings written as prose sometimes need the bulleted section
        pasted on its own.
      </p>
    );
  }

  const pct = (n: number) => (summary.total === 0 ? 0 : (n / summary.total) * 100);

  return (
    <div className="space-y-3">
      <section className="border border-frame bg-window p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
            {summary.total} requirements
          </span>
          <span className="font-mono text-[10px]">
            <span className="text-ok">{summary.covered} covered</span>
            <span className="text-faint"> · </span>
            <span className="text-warn">{summary.partial} partial</span>
            <span className="text-faint"> · </span>
            <span className="text-bad">{summary.gaps} gap</span>
          </span>
        </div>

        <div className="mt-2 flex h-1 overflow-hidden bg-field">
          <div className="bg-ok" style={{ width: `${pct(summary.covered)}%` }} />
          <div className="bg-warn" style={{ width: `${pct(summary.partial)}%` }} />
          <div className="bg-bad" style={{ width: `${pct(summary.gaps)}%` }} />
        </div>

        {summary.requiredGaps > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-muted">
            <span className="text-bad">{summary.requiredGaps}</span> of the gaps are on
            requirements the posting calls required — those are the ones that get you filtered.
          </p>
        )}
      </section>

      {gaps.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-mono text-[10px] uppercase tracking-wide text-faint">
            What to write next
          </h3>
          <div className="flex flex-wrap gap-1">
            {gaps.map((gap) => (
              <span
                key={gap}
                className="border border-bad/40 bg-window px-1.5 py-0.5 font-mono text-[10px] text-bad"
              >
                {gap}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-1">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-faint">
          Requirement → evidence
        </h3>
        {scan.rows.map((row) => (
          <Row key={row.requirement.id} row={row} />
        ))}
      </section>
    </div>
  );
}

function Row({ row }: { row: EvidenceRow }) {
  const [open, setOpen] = useState(row.coverage !== 'covered');
  const { requirement } = row;

  return (
    <article className="overflow-hidden border border-frame bg-window">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-window-hi"
      >
        <span className={`mt-1 h-3 w-0.5 shrink-0 ${COVERAGE_BAR[row.coverage]}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-snug text-parchment">{requirement.text}</span>
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wide text-faint">
            {requirement.necessity}
            {' · '}
            <span className={COVERAGE_TEXT[row.coverage]}>{COVERAGE_LABEL[row.coverage]}</span>
            {requirement.years !== null && ` · ${requirement.years}y asked`}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-frame px-2.5 py-2">
          {row.evidence.length > 0 ? (
            row.evidence.map((ev, i) => (
              <div key={i} className="text-[11px] leading-snug">
                <p className="text-muted">{ev.text}</p>
                <p className="mt-0.5 font-mono text-[9px] text-faint">
                  {ev.company || 'profile'}
                  {ev.title && ` · ${ev.title}`}
                  {' · '}
                  {Math.round(ev.score * 100)}% match
                </p>
              </div>
            ))
          ) : (
            <p className="text-[11px] leading-snug text-muted">
              Nothing in your resume covers this.
            </p>
          )}

          {row.missing.length > 0 && (
            <p className="font-mono text-[9px] text-faint">
              missing: <span className="text-bad">{row.missing.join(', ')}</span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}
