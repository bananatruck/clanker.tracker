/**
 * The cover letter button and what it produces.
 *
 * Sits under the scan results because that is where its grounding lives: the
 * letter may only claim requirements the evidence table already covered, and
 * showing the count next to the button makes that visible rather than
 * implicit.
 *
 * This is the only button in the extension that knowingly spends money, so it
 * says so before it is pressed, not after.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateLetter, groundingRows } from '@/lib/letter/generate';
import {
  deleteLetter,
  getProfile,
  lettersForScan,
  saveLetter,
  updateLetterText,
  writingSamples,
} from '@/lib/db/repo';
import { getLlmConfig, PROVIDERS, BudgetExhaustedError } from '@/lib/llm';
import type { ScanResult } from '@/types/ats';
import { Button, Notice, Window } from './dq';

export default function CoverLetter({ scan }: { scan: ScanResult }) {
  const profile = useLiveQuery(() => getProfile(), []);
  const samples = useLiveQuery(() => writingSamples(), [], []);
  const letters = useLiveQuery(() => lettersForScan(scan.id), [scan.id], []);
  const config = useLiveQuery(() => getLlmConfig(), []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  const grounded = groundingRows(scan.rows);
  const hasKey = Boolean(config && (config.apiKey || PROVIDERS[config.provider].local));

  const write = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      const letter = await generateLetter({ scan, profile, samples, notes });
      await saveLetter({
        scanId: scan.id,
        company: scan.company,
        role: scan.jobTitle,
        text: letter.text,
      });
      setNotes('');
    } catch (err) {
      setError(
        err instanceof BudgetExhaustedError
          ? 'No key set, or the daily budget is spent. Check Settings.'
          : err instanceof Error
            ? err.message
            : 'Could not write the letter.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Cover letter"
      right={
        <span className="font-mono text-[12px] text-faint">
          {grounded.length} grounded {grounded.length === 1 ? 'claim' : 'claims'}
        </span>
      }
    >
      <p className="mb-2 text-[13px] leading-snug text-muted">
        Written from the {grounded.length} requirements your resume actually covers. It is told
        not to claim the gaps — a fabricated line in a cover letter is one you sign your name to.
      </p>

      {samples.length === 0 && (
        <p className="mb-2 font-mono text-[12px] text-warn">
          No writing samples yet — it will write plainly rather than in your voice. Add some in
          Settings.
        </p>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Anything to mention that your resume doesn't say? (optional)"
        className="dq-input mb-2 w-full p-1.5 text-[13px] leading-snug"
      />

      <div className="flex items-center gap-2">
        <Button primary onClick={write} disabled={busy || !hasKey || !profile}>
          {busy ? 'Writing…' : 'Write a cover letter'}
        </Button>
        <span className="font-mono text-[12px] text-faint">costs 1 call</span>
      </div>

      {!hasKey && (
        <p className="mt-2 font-mono text-[12px] text-warn">
          This is the one feature that needs an API key. Add one in Settings.
        </p>
      )}

      {error && (
        <div className="mt-2">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}

      {letters.length > 0 && (
        <div className="mt-2 space-y-2">
          {letters.map((letter) => (
            <LetterCard
              key={letter.id}
              id={letter.id}
              text={letter.text}
              edited={letter.edited}
              createdAt={letter.createdAt}
            />
          ))}
        </div>
      )}
    </Window>
  );
}

function LetterCard({
  id,
  text,
  edited,
  createdAt,
}: {
  id: string;
  text: string;
  edited: boolean;
  createdAt: number;
}) {
  const [draft, setDraft] = useState(text);
  const [copied, setCopied] = useState(false);
  const dirty = draft !== text;

  return (
    <article className="dq-window p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-[11px] text-faint">
          {new Date(createdAt).toLocaleString()}
          {edited && <span className="text-muted"> · edited</span>}
        </span>
        <button
          type="button"
          onClick={() => void deleteLetter(id)}
          className="font-mono text-[12px] text-faint hover:text-bad"
        >
          ✖
        </button>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={12}
        className="dq-input w-full p-2 text-[13px] leading-relaxed"
      />

      <div className="mt-1 flex items-center gap-1">
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(draft);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? '✔ copied' : 'Copy'}
        </Button>
        <Button disabled={!dirty} onClick={() => void updateLetterText(id, draft)}>
          Save edits
        </Button>
        <span className="ml-auto font-mono text-[11px] text-faint">
          {draft.trim().split(/\s+/).filter(Boolean).length} words
        </span>
      </div>
    </article>
  );
}
