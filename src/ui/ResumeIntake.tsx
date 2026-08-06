/**
 * Getting a resume into the extension.
 *
 * Shared by the side panel and the first-run setup page, because "add your
 * resume" is the one step nothing else works without and it must behave
 * identically in both places.
 *
 * The paste fallback is not a convenience. A scanned PDF, a locked corporate
 * export, or a format nobody anticipated would otherwise be a dead end with no
 * way forward — and a dead end at step one is indistinguishable from a broken
 * extension.
 */
import { useRef, useState } from 'react';
import { extractText, fromPastedText } from '@/lib/resume/extract';
import { parseResume } from '@/lib/resume/parse';
import { saveProfile } from '@/lib/db/repo';
import { Button, Notice } from './dq';

type Mode = 'drop' | 'paste';

export default function ResumeIntake({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>('drop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pasted, setPasted] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function ingest(read: () => Promise<ReturnType<typeof fromPastedText>>) {
    setBusy(true);
    setError('');
    try {
      await saveProfile(parseResume(await read()));
      onDone?.();
    } catch (err) {
      // Surfaced verbatim: every throw on this path is already written to be
      // read by the person holding the file.
      setError(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  }

  const takeFile = (file: File) => void ingest(() => extractText(file));
  const takePaste = () => void ingest(async () => fromPastedText(pasted));

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button primary={mode === 'drop'} onClick={() => setMode('drop')}>
          Upload a file
        </Button>
        <Button primary={mode === 'paste'} onClick={() => setMode('paste')}>
          Paste the text
        </Button>
      </div>

      {mode === 'drop' ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const file = e.dataTransfer.files[0];
              if (file) takeFile(file);
            }}
            onClick={() => input.current?.click()}
            className={`grid cursor-pointer place-items-center border-2 border-dashed p-6 text-center ${
              over ? 'border-gold bg-window-hi' : 'border-frame-dim bg-window'
            }`}
          >
            <div className="space-y-1">
              <p className="text-[12px] text-parchment">
                {busy ? 'Reading…' : 'Drop a resume — PDF, DOCX, or text'}
              </p>
              <p className="text-[10px] text-faint">Parsed on your machine. Nothing is uploaded.</p>
            </div>
          </div>

          <input
            ref={input}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) takeFile(file);
            }}
          />
        </>
      ) : (
        <div className="space-y-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={10}
            placeholder="Paste the whole resume here — headings included, so Experience and Education can be found."
            className="dq-input w-full p-2 text-[11px] leading-snug"
          />
          <Button primary onClick={takePaste} disabled={busy || pasted.trim().length === 0}>
            {busy ? 'Parsing…' : 'Parse this'}
          </Button>
        </div>
      )}

      {error && (
        <Notice tone="bad">
          {error}
          {mode === 'drop' && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setMode('paste')}
                className="underline hover:text-parchment"
              >
                Paste it instead
              </button>
              .
            </>
          )}
        </Notice>
      )}
    </div>
  );
}
