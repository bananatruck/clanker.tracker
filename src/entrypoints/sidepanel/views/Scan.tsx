/**
 * The ATS scan — requirement → evidence table.
 *
 * Deliberately not a match percentage. A number tells you nothing you can act
 * on; a row saying "they want Kubernetes and nothing in your resume mentions
 * it" tells you exactly what to write next. Every requirement in the posting
 * gets a row, covered or not, so nothing is quietly dropped.
 *
 * It reads the posting off the open tab rather than asking for a paste. The
 * scan is free and entirely local, and that combination is only worth
 * anything if running it costs the user nothing but a click — a scan you have
 * to assemble by hand is a scan you run twice and then stop running.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { scanJobDescription, topGaps } from '@/lib/ats/evidence';
import type { ExtractedPosting } from '@/lib/ats/posting';
import { getProfile, saveScan } from '@/lib/db/repo';
import { askPage, NotInjectableError } from '@/lib/fill/inject';
import { scanSummary, type Coverage, type EvidenceRow, type ScanResult } from '@/types/ats';
import { Button, Notice, Window } from '@/ui/dq';
import CoverLetter from '@/ui/CoverLetter';

const COVERAGE_MARK: Record<Coverage, { glyph: string; tone: string; label: string }> = {
  covered: { glyph: '✔', tone: 'text-ok', label: 'covered' },
  partial: { glyph: '~', tone: 'text-warn', label: 'partial' },
  gap: { glyph: '✖', tone: 'text-bad', label: 'gap' },
};

type PagePosting = ExtractedPosting & { url: string };

export default function Scan() {
  const profile = useLiveQuery(() => getProfile(), []);
  const [jd, setJd] = useState('');
  const [posting, setPosting] = useState<PagePosting | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [reading, setReading] = useState(true);
  const [error, setError] = useState('');

  const readPage = useCallback(async () => {
    setReading(true);
    setError('');
    try {
      const found = await askPage<PagePosting | null>({ type: 'clanker:posting' });
      setPosting(found);
      if (found) setJd(found.description);
      else setError('No job posting found on this tab. Paste the description instead.');
    } catch (err) {
      setPosting(null);
      setError(
        err instanceof NotInjectableError
          ? err.message
          : 'Could not read this page. Paste the description instead.',
      );
    } finally {
      setReading(false);
    }
  }, []);

  useEffect(() => {
    void readPage();
  }, [readPage]);

  if (profile === undefined) return <p className="text-[13px] text-faint">Loading…</p>;

  if (!profile) {
    return (
      <Notice>
        Add a resume on the Profile tab first — the scan matches a posting against your bullets.
      </Notice>
    );
  }

  const run = async () => {
    if (!jd.trim()) return;
    const result = scanJobDescription(jd, profile);
    setScan(result);
    await saveScan(result);
  };

  return (
    <div className="space-y-2">
      <Window
        title="This posting"
        right={
          <button
            onClick={() => void readPage()}
            className="font-mono text-[12px] text-faint hover:text-gold"
          >
            re-read ▶
          </button>
        }
      >
        {reading ? (
          <p className="text-[13px] text-faint">Reading the page…</p>
        ) : posting ? (
          <>
            <p className="truncate text-[14px] text-parchment">{posting.title || 'Untitled role'}</p>
            <p className="truncate font-mono text-[12px] text-muted">
              {posting.company || 'unknown company'}
            </p>
            <p className="mt-1 font-mono text-[11px] text-faint">
              {posting.description.length.toLocaleString()} characters ·{' '}
              {posting.source === 'json-ld'
                ? 'structured data'
                : posting.source === 'selector'
                  ? 'known layout'
                  : 'densest text block'}
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-snug text-muted">{error}</p>
        )}
      </Window>

      <details className="dq-window">
        <summary className="cursor-pointer px-2 py-1 font-mono text-[12px] text-faint hover:text-gold">
          {posting ? 'Edit what was read' : 'Paste the description'}
        </summary>
        <div className="p-2 pt-0">
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description…"
            rows={8}
            className="dq-input w-full resize-y p-2 text-[13px] leading-snug"
          />
        </div>
      </details>

      <div className="flex items-center justify-between gap-2">
        <Button primary onClick={run} disabled={!jd.trim()} className="flex-1">
          Scan against my resume
        </Button>
        <span className="shrink-0 font-mono text-[12px] text-faint">free · local</span>
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
      <Notice>
        No requirements found. Postings written as prose sometimes need the bulleted section
        pasted on its own.
      </Notice>
    );
  }

  return (
    <div className="space-y-2">
      <Window title={`${summary.total} requirements`}>
        <div className="flex justify-between font-mono text-[12px]">
          <span className="text-ok">✔ {summary.covered} covered</span>
          <span className="text-warn">~ {summary.partial} partial</span>
          <span className="text-bad">✖ {summary.gaps} gap</span>
        </div>

        {summary.requiredGaps > 0 && (
          <p className="mt-2 text-[13px] leading-snug text-muted">
            <span className="text-bad">{summary.requiredGaps}</span> of the gaps are on
            requirements the posting calls required — those are the ones that get you filtered.
          </p>
        )}
      </Window>

      {gaps.length > 0 && (
        <Window title="What to write next">
          <div className="flex flex-wrap gap-1">
            {gaps.map((gap) => (
              <span
                key={gap}
                className="border-2 border-frame-dim px-1.5 py-0.5 font-mono text-[12px] text-bad"
              >
                {gap}
              </span>
            ))}
          </div>
        </Window>
      )}

      <Window title="Requirement → evidence">
        <div className="space-y-1">
          {scan.rows.map((row) => (
            <Row key={row.requirement.id} row={row} />
          ))}
        </div>
      </Window>

      <CoverLetter scan={scan} />
    </div>
  );
}

function Row({ row }: { row: EvidenceRow }) {
  const [open, setOpen] = useState(row.coverage !== 'covered');
  const { requirement } = row;
  const mark = COVERAGE_MARK[row.coverage];

  return (
    <article className="border-2 border-frame-dim">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left hover:bg-window-hi"
      >
        <span className={`shrink-0 font-mono text-[12px] ${mark.tone}`} title={mark.label}>
          {mark.glyph}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug text-parchment">{requirement.text}</span>
          <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-wide text-faint">
            {requirement.necessity}
            {' · '}
            <span className={mark.tone}>{mark.label}</span>
            {requirement.years !== null && ` · ${requirement.years}y asked`}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-1.5 border-t-2 border-frame-dim px-2 py-1.5">
          {row.evidence.length > 0 ? (
            row.evidence.map((ev, i) => (
              <div key={i} className="text-[13px] leading-snug">
                <p className="text-muted">{ev.text}</p>
                <p className="mt-0.5 font-mono text-[11px] text-faint">
                  {ev.company || 'profile'}
                  {ev.title && ` · ${ev.title}`}
                  {' · '}
                  {Math.round(ev.score * 100)}% match
                </p>
              </div>
            ))
          ) : (
            <p className="text-[13px] leading-snug text-muted">
              Nothing in your resume covers this.
            </p>
          )}

          {row.missing.length > 0 && (
            <p className="font-mono text-[11px] text-faint">
              missing: <span className="text-bad">{row.missing.join(', ')}</span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}
