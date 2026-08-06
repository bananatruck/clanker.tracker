/**
 * First-run setup. Opens once, in a full tab, on install.
 *
 * A side panel is too narrow to read a proclamation in and too narrow to paste
 * a resume into, and both of those are things the user only ever does once.
 *
 * Only one step is required. The resume is what everything else is built on;
 * the API key and the writing samples buy the cover letter and nothing else,
 * so asking for them as blockers would be asking people to hand over a
 * credential before they have seen the thing work.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  addWritingSample,
  deleteWritingSample,
  getProfile,
  setSetting,
  SETUP_DONE_KEY,
  writingSamples,
} from '@/lib/db/repo';
import { getLlmConfig, setLlmConfig, PROVIDERS, type ProviderId } from '@/lib/llm';
import { ACT_0 } from '@/lib/game/lore';
import { Button, Notice, Window } from '@/ui/dq';
import ResumeIntake from '@/ui/ResumeIntake';

const STEPS = ['The Proclamation', 'Your resume', 'Cover letters', 'Your voice', 'Ride'] as const;

export default function Setup() {
  const [step, setStep] = useState(0);

  return (
    <div className="min-h-full bg-field p-6">
      <div className="mx-auto w-full max-w-[640px] space-y-3">
        <header className="flex items-baseline justify-between">
          <h1 className="font-mono text-[15px] text-parchment">
            clanker<span className="text-gold">.</span>tracker
          </h1>
          <span className="dq-label">
            {step + 1}/{STEPS.length} · {STEPS[step]}
          </span>
        </header>

        <ol className="flex gap-1">
          {STEPS.map((label, i) => (
            <li
              key={label}
              title={label}
              className={`h-1.5 flex-1 border ${
                i <= step ? 'border-gold bg-gold' : 'border-frame-dim bg-field'
              }`}
            />
          ))}
        </ol>

        {step === 0 && <Proclamation onDone={() => setStep(1)} />}
        {step === 1 && <ResumeStep onNext={() => setStep(2)} />}
        {step === 2 && <KeyStep onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <VoiceStep onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && <Done />}
      </div>
    </div>
  );
}

/**
 * Act 0, panels 000-003, played one panel at a time.
 *
 * Copy comes from lib/game/lore, which is transcribed from the author's
 * storyboard. Nothing here is written or edited locally.
 */
function Proclamation({ onDone }: { onDone: () => void }) {
  const [panel, setPanel] = useState(0);
  const beat = ACT_0[panel]!;
  const last = panel === ACT_0.length - 1;

  // Enter and Space advance, the way a JRPG textbox does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        last ? onDone() : setPanel((p) => p + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onDone]);

  return (
    <Window>
      <p className="min-h-[7rem] px-1 py-2 text-[13px] leading-relaxed text-parchment">
        {beat.copy}
      </p>

      <div className="flex items-center justify-between border-t-2 border-frame-dim pt-2">
        <span className="font-mono text-[10px] text-faint">{beat.panel}</span>
        <Button primary onClick={() => (last ? onDone() : setPanel((p) => p + 1))}>
          {last ? 'Ride for Clankerdom ▶' : 'Continue ▶'}
        </Button>
      </div>
    </Window>
  );
}

function ResumeStep({ onNext }: { onNext: () => void }) {
  const profile = useLiveQuery(() => getProfile(), []);

  return (
    <div className="space-y-3">
      <Window title="Your resume">
        <p className="mb-2 text-[12px] leading-relaxed text-muted">
          Everything else is built on this. It is parsed on your machine and never uploaded —
          the whole extension works offline apart from cover letters.
        </p>
        <ResumeIntake />
      </Window>

      {profile && (
        <Notice>
          Parsed <span className="text-parchment">{profile.source.fileName}</span> ·{' '}
          {profile.experience.length} roles · {profile.skills.length} skills. You can correct
          any of it later on the Profile tab.
        </Notice>
      )}

      <div className="flex justify-end">
        <Button primary disabled={!profile} onClick={onNext}>
          {profile ? 'Continue ▶' : 'Add a resume to continue'}
        </Button>
      </div>
    </div>
  );
}

/**
 * The key step. Optional, and it says so — autofill and the keyword scan are
 * fully deterministic and never touch a provider.
 */
function KeyStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getLlmConfig().then((cfg) => {
      setProvider(cfg.provider);
      setApiKey(cfg.apiKey);
    });
  }, []);

  const info = PROVIDERS[provider];

  return (
    <div className="space-y-3">
      <Window title="Cover letters — optional">
        <p className="mb-2 text-[12px] leading-relaxed text-muted">
          Autofill and the keyword scan are deterministic and free: they run entirely on your
          machine and never call a provider. A key is only needed for the cover letter button,
          and for the occasional free-text question no saved answer covers.
        </p>

        <label className="dq-label mb-1 block">Provider</label>
        <div className="mb-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
            <Button key={id} primary={provider === id} onClick={() => setProvider(id)}>
              {PROVIDERS[id].label}
            </Button>
          ))}
        </div>

        {!info.local && (
          <>
            <label className="dq-label mb-1 block" htmlFor="key">
              API key
            </label>
            <input
              id="key"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaved(false);
              }}
              placeholder={`Your ${info.label} key`}
              className="dq-input mb-1 w-full px-2 py-1 text-[12px]"
            />
            <p className="text-[10px] leading-snug text-faint">
              Stored in chrome.storage.local on this machine, never in the database — so the
              database export can dump every table without carrying your credential out with it.
              {info.keyUrl && (
                <>
                  {' '}
                  <a
                    href={info.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gold underline"
                  >
                    Get a key
                  </a>
                  .
                </>
              )}
            </p>
          </>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Button
            onClick={async () => {
              await setLlmConfig({ provider, apiKey: apiKey.trim() });
              setSaved(true);
            }}
          >
            Save key
          </Button>
          {saved && <span className="font-mono text-[10px] text-ok">✔ saved</span>}
        </div>
      </Window>

      <div className="flex justify-between">
        <Button onClick={onBack}>◀ Back</Button>
        <Button primary onClick={onNext}>
          {apiKey.trim() || info.local ? 'Continue ▶' : 'Skip for now ▶'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Writing samples.
 *
 * Kept whole rather than distilled into a style description: a model given
 * three real paragraphs of someone's prose matches them far better than one
 * handed a list of adjectives about it.
 */
function VoiceStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const samples = useLiveQuery(() => writingSamples(), [], []);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');

  return (
    <div className="space-y-3">
      <Window title="Your voice — optional">
        <p className="mb-2 text-[12px] leading-relaxed text-muted">
          Paste anything you have written that sounds like you: an old cover letter, an essay,
          a long email. The cover letter button uses these as the voice to match, so a letter
          reads like you wrote it rather than like a model did.
        </p>

        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void addWritingSample(label, text);
            setLabel('');
            setText('');
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What is this? e.g. cover letter, Acme"
            className="dq-input w-full px-2 py-1 text-[12px]"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Paste the writing here."
            className="dq-input w-full p-2 text-[11px] leading-snug"
          />
          <Button type="submit" disabled={!text.trim()}>
            Add sample
          </Button>
        </form>

        {samples.length > 0 && (
          <ul className="mt-2 space-y-1">
            {samples.map((s) => (
              <li key={s.id} className="flex items-center gap-2 border-2 border-frame-dim px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[11px] text-parchment">
                  {s.label}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-faint">
                  {s.text.split(/\s+/).length} words
                </span>
                <button
                  type="button"
                  onClick={() => void deleteWritingSample(s.id)}
                  className="shrink-0 font-mono text-[10px] text-faint hover:text-bad"
                >
                  ✖
                </button>
              </li>
            ))}
          </ul>
        )}
      </Window>

      <div className="flex justify-between">
        <Button onClick={onBack}>◀ Back</Button>
        <Button primary onClick={onNext}>
          {samples.length > 0 ? 'Continue ▶' : 'Skip for now ▶'}
        </Button>
      </div>
    </div>
  );
}

function Done() {
  useEffect(() => {
    void setSetting(SETUP_DONE_KEY, true);
  }, []);

  return (
    <div className="space-y-3">
      <Window>
        <p className="px-1 py-2 text-[13px] leading-relaxed text-parchment">
          Ride for Clankerdom.
        </p>
        <div className="border-t-2 border-frame-dim pt-2 text-[12px] leading-relaxed text-muted">
          <p>
            Open a job application and click the toolbar icon. The side panel scans the posting
            against your resume, fills the form, and shows you everything before anything is
            submitted — it never presses submit on its own.
          </p>
        </div>
      </Window>

      <div className="flex justify-end">
        <Button primary onClick={() => window.close()}>
          Close this tab
        </Button>
      </div>
    </div>
  );
}
