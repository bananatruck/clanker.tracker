/**
 * The profile review grid.
 *
 * This screen is the reason the parser is allowed to be cheap. Every extracted
 * value is shown with its confidence, anything uncertain is coloured, and one
 * click fixes it — which is faster and free compared to spending an LLM call
 * and still being wrong. A corrected field is marked `user` and no later
 * re-parse may overwrite it.
 */
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { extractText } from '@/lib/resume/extract';
import { parseResume, reparse } from '@/lib/resume/parse';
import { formatRange } from '@/lib/resume/dates';
import { correctContactField, getProfile, saveProfile } from '@/lib/db/repo';
import {
  CONTACT_KEYS,
  CONTACT_LABELS,
  profileCompleteness,
  type Confidence,
  type ContactKey,
  type ResumeProfile,
} from '@/types/profile';

const DOT: Record<Confidence, string> = {
  certain: 'bg-certain',
  guessed: 'bg-guessed',
  missing: 'bg-missing',
};

const CONFIDENCE_HINT: Record<Confidence, string> = {
  certain: 'Parsed with certainty',
  guessed: 'Best guess — please confirm',
  missing: 'Not found in the resume',
};

export default function Profile() {
  const profile = useLiveQuery(() => getProfile(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ingest(file: File) {
    setBusy(true);
    setError('');
    try {
      const parsed = parseResume(await extractText(file));
      await saveProfile(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  }

  if (profile === undefined) {
    return <p className="font-mono text-[11px] text-faint">Loading…</p>;
  }

  if (!profile) return <Dropzone onFile={ingest} busy={busy} error={error} />;

  return (
    <ProfileGrid
      profile={profile}
      busy={busy}
      error={error}
      onFile={ingest}
      onReparse={async () => {
        setBusy(true);
        await saveProfile(reparse(profile));
        setBusy(false);
      }}
    />
  );
}

function Dropzone({
  onFile,
  busy,
  error,
}: {
  onFile: (f: File) => void;
  busy: boolean;
  error: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="space-y-3">
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
          if (file) onFile(file);
        }}
        onClick={() => input.current?.click()}
        className={`grid cursor-pointer place-items-center rounded border border-dashed p-8 text-center transition-colors ${
          over ? 'border-accent bg-surface-hi' : 'border-border bg-surface hover:border-accent-dim'
        }`}
      >
        <div className="space-y-1.5">
          <p className="text-[12px] text-text">
            {busy ? 'Reading…' : 'Drop a resume — PDF, DOCX, or text'}
          </p>
          <p className="font-mono text-[10px] text-faint">
            Parsed on your machine. Nothing is uploaded.
          </p>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />

      {error && <p className="font-mono text-[10px] text-missing">{error}</p>}
    </div>
  );
}

function ProfileGrid({
  profile,
  busy,
  error,
  onFile,
  onReparse,
}: {
  profile: ResumeProfile;
  busy: boolean;
  error: string;
  onFile: (f: File) => void;
  onReparse: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { total, certain, missing } = profileCompleteness(profile);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-[12px] text-text">{profile.source.fileName}</h2>
          <p className="font-mono text-[10px] text-faint">
            {certain}/{total} certain
            {missing > 0 && <span className="text-missing"> · {missing} missing</span>}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onReparse}
            disabled={busy}
            className="rounded border border-border px-2 py-1 font-mono text-[10px] text-muted hover:bg-surface hover:text-text disabled:opacity-50"
          >
            Re-parse
          </button>
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="rounded border border-border px-2 py-1 font-mono text-[10px] text-muted hover:bg-surface hover:text-text disabled:opacity-50"
          >
            Replace
          </button>
        </div>
      </header>

      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />

      {error && <p className="font-mono text-[10px] text-missing">{error}</p>}

      <section className="space-y-1">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-faint">Contact</h3>
        <div className="overflow-hidden rounded border border-border">
          {CONTACT_KEYS.map((key) => (
            <ContactRow key={key} field={key} profile={profile} />
          ))}
        </div>
      </section>

      <section className="space-y-1">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-faint">
          Experience · {profile.experience.length}
        </h3>
        {profile.experience.length === 0 ? (
          <Empty>No work history parsed. Check the resume has an Experience heading.</Empty>
        ) : (
          profile.experience.map((entry) => (
            <article key={entry.id} className="rounded border border-border bg-surface p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-text">
                    {entry.title || <span className="text-missing">title not found</span>}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted">
                    {entry.company || <span className="text-missing">company not found</span>}
                    {entry.location && ` · ${entry.location}`}
                  </p>
                </div>
                <span
                  title={CONFIDENCE_HINT[entry.confidence]}
                  className={`mt-1 size-1.5 shrink-0 rounded-full ${DOT[entry.confidence]}`}
                />
              </div>

              <p className="mt-1 font-mono text-[10px] text-faint">
                {formatRange(entry.start, entry.end)}
              </p>

              <ul className="mt-1.5 space-y-1">
                {entry.bullets.map((bullet, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-muted">
                    <span className="text-faint">·</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>

      {profile.education.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-mono text-[10px] uppercase tracking-wide text-faint">Education</h3>
          {profile.education.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded border border-border bg-surface px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] text-text">{entry.school}</p>
                <p className="truncate font-mono text-[10px] text-muted">{entry.degree}</p>
              </div>
              <span className={`size-1.5 shrink-0 rounded-full ${DOT[entry.confidence]}`} />
            </div>
          ))}
        </section>
      )}

      <section className="space-y-1">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-faint">
          Skills · {profile.skills.length}
        </h3>
        <div className="flex flex-wrap gap-1">
          {profile.skills.map((skill) => (
            <span
              key={skill}
              className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted"
            >
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

/** One editable contact cell. Editing it promotes the field to `user`/certain. */
function ContactRow({ field, profile }: { field: ContactKey; profile: ResumeProfile }) {
  const value = profile.contact[field];
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const commit = async () => {
    if (draft !== null && draft !== value.value) await correctContactField(field, draft.trim());
    setDraft(null);
  };

  return (
    <div className="flex items-center gap-2 border-b border-border px-2 py-1.5 last:border-b-0">
      <span
        title={CONFIDENCE_HINT[value.confidence]}
        className={`size-1.5 shrink-0 rounded-full ${DOT[value.confidence]}`}
      />
      <span className="w-20 shrink-0 font-mono text-[10px] text-faint">
        {CONTACT_LABELS[field]}
      </span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') setDraft(null);
          }}
          className="min-w-0 flex-1 rounded-sm bg-base px-1 py-0.5 text-[11px] text-text outline-none ring-1 ring-accent-dim"
        />
      ) : (
        <button
          onClick={() => setDraft(value.value)}
          className="min-w-0 flex-1 truncate rounded-sm px-1 py-0.5 text-left text-[11px] hover:bg-surface-hi"
        >
          {value.value ? (
            <span className="text-text">{value.value}</span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </button>
      )}

      {value.source === 'user' && (
        <span className="shrink-0 font-mono text-[9px] text-certain">edited</span>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-border bg-surface px-2.5 py-2 text-[11px] text-muted">
      {children}
    </p>
  );
}
