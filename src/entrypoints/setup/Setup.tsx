/**
 * First-install setup: a guided path from an empty extension to a useful one.
 *
 * The resume is the only required input. Account assistance, an LLM provider,
 * and writing samples are valuable but optional, so every one of those screens
 * explains exactly which feature it unlocks and remains skippable. Progress is
 * stored in IndexedDB; closing this tab cannot throw the user back to page one.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  getProfile,
  getSetting,
  setSetting,
  SETUP_DONE_KEY,
  SETUP_FURTHEST_KEY,
  SETUP_STEP_KEY,
  writingSamples,
} from '@/lib/db/repo';
import { assetUrl } from '@/lib/game/assets';
import { ACT_0 } from '@/lib/game/lore';
import {
  ask,
  getLlmConfig,
  setLlmConfig,
  PROVIDERS,
  type ProviderId,
} from '@/lib/llm';
import {
  getCredentials,
  hasCredentials,
  setCredentials,
  type Credentials,
} from '@/lib/fill/credentials';
import { profileCompleteness } from '@/types/profile';
import { Button, Notice, Window } from '@/ui/dq';
import ResumeIntake from '@/ui/ResumeIntake';
import WritingSamples from '@/ui/WritingSamples';

const STEPS = [
  { label: 'Welcome', blurb: 'What the extension does' },
  { label: 'Resume', blurb: 'Build the local profile' },
  { label: 'Applications', blurb: 'Review defaults and sign-ins' },
  { label: 'AI camp', blurb: 'Optional provider setup' },
  { label: 'Your voice', blurb: 'Optional writing samples' },
  { label: 'Field guide', blurb: 'Learn the full journey' },
  { label: 'Ride', blurb: 'Launch Clankerdom' },
] as const;

const LAST_STEP = STEPS.length - 1;

export default function Setup({ initialStep }: { initialStep?: number }) {
  const [step, setStep] = useState(initialStep ?? 0);
  const [furthest, setFurthest] = useState(initialStep ?? 0);
  const [loaded, setLoaded] = useState(initialStep !== undefined);
  const completed = useLiveQuery(() => getSetting(SETUP_DONE_KEY, false), [], false) ?? false;

  useEffect(() => {
    if (initialStep !== undefined) return;
    void Promise.all([
      getSetting(SETUP_DONE_KEY, false),
      getSetting(SETUP_STEP_KEY, 0),
      getSetting(SETUP_FURTHEST_KEY, 0),
    ]).then(([done, saved, reached]) => {
      const restored = Math.max(0, Math.min(LAST_STEP, done ? LAST_STEP : saved));
      setStep(restored);
      setFurthest(Math.max(restored, Math.min(LAST_STEP, reached)));
      setLoaded(true);
    });
  }, [initialStep]);

  const goTo = (next: number) => {
    const safe = Math.max(0, Math.min(LAST_STEP, next));
    const reached = Math.max(furthest, safe);
    setStep(safe);
    setFurthest(reached);
    void Promise.all([
      setSetting(SETUP_STEP_KEY, safe),
      setSetting(SETUP_FURTHEST_KEY, reached),
    ]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!loaded) {
    return <div className="setup-shell grid min-h-full place-items-center text-white/70">Opening the gates…</div>;
  }

  const current = STEPS[step]!;

  return (
    <div className="setup-shell min-h-full p-4 sm:p-6">
      <div className="setup-layout">
        <aside className="setup-sidebar">
          <div className="setup-brand">
            <img src={assetUrl('icons/icon-48.png')} alt="" aria-hidden="true" />
            <span>
              <strong>clanker<span>.</span>tracker</strong>
              <small>first-install campaign</small>
            </span>
          </div>

          <div className="setup-sidebar-copy">
            <p className="setup-kicker">Your commission</p>
            <h1>Make the journey functional.</h1>
            <p>One required step, three useful options, then a field guide for your first application.</p>
          </div>

          <ol className="setup-steps" aria-label="Setup progress">
            {STEPS.map((item, index) => {
              const available = completed || index <= furthest;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => available && goTo(index)}
                    disabled={!available}
                    aria-current={index === step ? 'step' : undefined}
                    data-complete={completed || index < furthest}
                  >
                    <span className="setup-step-number">
                      {completed || index < furthest ? '✓' : String(index + 1).padStart(2, '0')}
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.blurb}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <p className="setup-local-note">
            <span aria-hidden>◆</span>
            Resume, profile, scans, applications, and game progress stay on this device.
          </p>
        </aside>

        <main className="setup-main">
          <header className="setup-main-header">
            <div>
              <p>Step {step + 1} of {STEPS.length}</p>
              <h2>{current.label}</h2>
            </div>
            <span>{current.blurb}</span>
          </header>

          <div className="setup-stage">
            {step === 0 && <WelcomeStep onNext={() => goTo(1)} />}
            {step === 1 && <ResumeStep onNext={() => goTo(2)} />}
            {step === 2 && <ApplicationStep onBack={() => goTo(1)} onNext={() => goTo(3)} />}
            {step === 3 && <AiStep onBack={() => goTo(2)} onNext={() => goTo(4)} />}
            {step === 4 && <VoiceStep onBack={() => goTo(3)} onNext={() => goTo(5)} />}
            {step === 5 && <GuideStep onBack={() => goTo(4)} onNext={() => goTo(6)} />}
            {step === 6 && <Done onBack={() => goTo(5)} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const features = [
    ['◎', 'Scan', 'Match a posting against evidence in your resume.'],
    ['▣', 'Fill', 'Answer application fields, then show every answer for review.'],
    ['✎', 'Write', 'Create a grounded cover letter in your own voice.'],
    ['≡', 'Track', 'Log what you sent, its status, cost, and next action.'],
    ['♜', 'Crusade', 'Turn real job-hunt progress into your campaign.'],
    ['◇', 'Stay local', 'Keep personal data on the machine where you installed it.'],
  ] as const;

  return (
    <div className="space-y-4">
      <section className="setup-welcome-card">
        <p className="setup-kicker">Clankerdom Deliverance</p>
        <h3>Your job hunt becomes one connected campaign.</h3>
        <p>
          This setup gives every tool the information it needs and tells you exactly when the
          extension is local, when it may contact an AI provider, and when you remain in control.
        </p>
      </section>

      <div className="setup-feature-grid">
        {features.map(([glyph, title, copy]) => (
          <article className="setup-feature-card" key={title}>
            <span aria-hidden>{glyph}</span>
            <div><strong>{title}</strong><p>{copy}</p></div>
          </article>
        ))}
      </div>

      <blockquote className="setup-proclamation">
        <span>{ACT_0[0]!.copy}</span>
        <strong>{ACT_0.at(-1)!.copy}</strong>
      </blockquote>

      <div className="setup-actions setup-actions-end">
        <Button primary onClick={onNext}>Begin setup ▶</Button>
      </div>
    </div>
  );
}

function ResumeStep({ onNext }: { onNext: () => void }) {
  const profile = useLiveQuery(() => getProfile(), []);

  return (
    <div className="space-y-4">
      <div className="setup-explainer">
        <span className="setup-required">Required</span>
        <div>
          <h3>Your resume powers Scan and Fill.</h3>
          <p>PDF, DOCX, TXT, and Markdown are parsed locally. The original file is never uploaded.</p>
        </div>
      </div>

      <Window title="Choose the source of truth">
        <ResumeIntake />
      </Window>

      {profile && (
        <Notice>
          ✔ <span className="text-parchment">{profile.source.fileName}</span> is ready ·{' '}
          {profile.experience.length} roles · {profile.skills.length} skills ·{' '}
          {profile.experience.flatMap((role) => role.bullets).length} evidence bullets
        </Notice>
      )}

      <div className="setup-actions setup-actions-end">
        <Button primary disabled={!profile} onClick={onNext}>
          {profile ? 'Review application setup ▶' : 'Add a resume to continue'}
        </Button>
      </div>
    </div>
  );
}

function ApplicationStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const profile = useLiveQuery(() => getProfile(), []);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existingPassword, setExistingPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (loaded || !profile) return;
    void getCredentials().then((credentials) => {
      setEmail(credentials.email || profile.contact.email.value);
      setExistingPassword(credentials.password !== '');
      setAuto(credentials.auto);
      setLoaded(true);
    });
  }, [loaded, profile]);

  const completeness = profile ? profileCompleteness(profile) : null;
  const effectivePassword = password !== '' || existingPassword;

  const save = async () => {
    await setCredentials({
      email: email.trim(),
      ...(password ? { password } : {}),
      auto: effectivePassword && auto,
    });
    setExistingPassword(effectivePassword);
    setPassword('');
    setSaved(true);
  };

  const continueSetup = async () => {
    await save();
    onNext();
  };

  return (
    <div className="space-y-4">
      <div className="setup-explainer">
        <span className="setup-optional">Useful</span>
        <div>
          <h3>Confirm what applications will use.</h3>
          <p>Normal form filling needs only your local profile. Sign-in details are optional.</p>
        </div>
      </div>

      {profile && completeness && (
        <div className="setup-profile-summary">
          <div>
            <span>Applicant</span>
            <strong>{profile.contact.fullName.value || 'Name needs review'}</strong>
            <small>{profile.contact.email.value || 'Email needs review'}</small>
          </div>
          <div>
            <span>Profile parse</span>
            <strong>{completeness.total - completeness.missing}/{completeness.total} contact fields</strong>
            <small>{completeness.missing ? `${completeness.missing} can be corrected in My Profile` : 'Contact block is complete'}</small>
          </div>
          <div>
            <span>Deterministic tools</span>
            <strong>Scan + Fill ready</strong>
            <small>No provider key is required</small>
          </div>
        </div>
      )}

      <Window title="Job-board sign-ins — optional">
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          Some Workday-style boards make you create an account before showing the application.
          Save a dedicated job-board password if you want Clanker to prepare that step too.
        </p>

        <label className="dq-label mb-1 block" htmlFor="setup-account-email">Application email</label>
        <input
          id="setup-account-email"
          className="dq-input mb-3 w-full px-2 py-1.5"
          type="email"
          value={email}
          placeholder="the email address you apply with"
          onChange={(event) => { setEmail(event.target.value); setSaved(false); }}
        />

        <label className="dq-label mb-1 block" htmlFor="setup-account-password">Job-board password</label>
        <input
          id="setup-account-password"
          className="dq-input mb-2 w-full px-2 py-1.5"
          type="password"
          value={password}
          placeholder={existingPassword ? 'A saved password is already available' : 'optional — use a dedicated password'}
          autoComplete="new-password"
          onChange={(event) => { setPassword(event.target.value); setSaved(false); }}
        />

        <label className="setup-check-row">
          <input
            type="checkbox"
            checked={auto && effectivePassword}
            disabled={!effectivePassword}
            onChange={(event) => { setAuto(event.target.checked); setSaved(false); }}
          />
          <span>
            <strong>Prepare account forms automatically</strong>
            <small>Clanker still stops for your review and never submits an application.</small>
          </span>
        </label>

        <p className="mt-3 border-t border-frame-dim pt-2 text-[12px] leading-relaxed text-faint">
          Credentials live in chrome.storage.local and never enter an export. Chrome does not
          encrypt this file at rest, so skip this step on a shared or untrusted machine.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <Button onClick={() => void save()}>Save application defaults</Button>
          {saved && <span className="font-mono text-[12px] text-ok">✔ saved locally</span>}
        </div>
      </Window>

      <div className="setup-actions">
        <Button onClick={onBack}>◀ Back</Button>
        <Button primary onClick={() => void continueSetup()}>
          {effectivePassword ? 'Continue ▶' : 'Continue without a password ▶'}
        </Button>
      </div>
    </div>
  );
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'fail'; error: string };

function AiStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  useEffect(() => {
    void getLlmConfig().then((config) => {
      setProvider(config.provider);
      setApiKey(config.apiKey);
    });
  }, []);

  const info = PROVIDERS[provider];

  const save = async () => {
    await setLlmConfig({ provider, apiKey: info.local ? '' : apiKey.trim() });
    setSaved(true);
  };

  const testConnection = async () => {
    setTest({ kind: 'testing' });
    try {
      await save();
      await ask<{ ok: string }>({
        system: 'You are a connectivity check. Return only the requested JSON.',
        prompt: 'Reply with {"ok":"connected"}.',
        schema: {
          type: 'object',
          properties: { ok: { type: 'string' } },
          required: ['ok'],
        },
        maxTokens: 2048,
      });
      setTest({ kind: 'ok' });
    } catch (error) {
      setTest({ kind: 'fail', error: error instanceof Error ? error.message : 'Connection failed' });
    }
  };

  const continueSetup = async () => {
    await save();
    onNext();
  };

  return (
    <div className="space-y-4">
      <div className="setup-explainer">
        <span className="setup-optional">Optional</span>
        <div>
          <h3>Add AI only for the tools that need it.</h3>
          <p>Scan, standard autofill, tracking, and the RPG work without a key.</p>
        </div>
      </div>

      <div className="setup-power-map">
        <div><span>Local</span><strong>Resume scan</strong><small>Always available</small></div>
        <div><span>Local</span><strong>Known form fields</strong><small>Always available</small></div>
        <div data-ai="true"><span>AI</span><strong>Cover letters + unknown questions</strong><small>Provider required</small></div>
      </div>

      <Window title="Bring your own provider">
        <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
            <Button
              key={id}
              primary={provider === id}
              onClick={() => {
                if (id !== provider) setApiKey('');
                setProvider(id);
                setSaved(false);
                setTest({ kind: 'idle' });
              }}
            >
              {PROVIDERS[id].label}
            </Button>
          ))}
        </div>

        {info.local ? (
          <Notice>Ollama stays local and needs no API key. Make sure its server is running before testing.</Notice>
        ) : (
          <>
            <label className="dq-label mb-1 block" htmlFor="setup-api-key">API key</label>
            <input
              id="setup-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSaved(false);
                setTest({ kind: 'idle' });
              }}
              placeholder={`Your ${info.label} key`}
              spellCheck={false}
              autoComplete="off"
              className="dq-input w-full px-2 py-1.5"
            />
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
              Stored on this machine and sent only to {info.label} when you trigger an AI-backed
              action. It is excluded from Clanker database exports.
              {info.keyUrl && <> <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-gold underline">Get a key</a>.</>}
            </p>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()}>{saved ? 'Saved' : 'Save provider'}</Button>
          <Button
            primary
            disabled={(!info.local && !apiKey.trim()) || test.kind === 'testing'}
            onClick={() => void testConnection()}
          >
            {test.kind === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          <span className="text-[11px] text-faint">Testing spends one provider request.</span>
        </div>

        {test.kind === 'ok' && <p className="mt-2 font-mono text-[12px] text-ok">✔ Provider connected</p>}
        {test.kind === 'fail' && <Notice tone="bad">✖ {test.error}</Notice>}
      </Window>

      <div className="setup-actions">
        <Button onClick={onBack}>◀ Back</Button>
        <Button primary onClick={() => void continueSetup()}>
          {apiKey.trim() || info.local ? 'Continue with AI ▶' : 'Skip AI for now ▶'}
        </Button>
      </div>
    </div>
  );
}

function VoiceStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const samples = useLiveQuery(() => writingSamples(), [], []);

  return (
    <div className="space-y-4">
      <div className="setup-explainer">
        <span className="setup-optional">Optional</span>
        <div>
          <h3>Give cover letters a voice that is actually yours.</h3>
          <p>Samples stay whole, readable, and deletable. They are used only when you ask for a letter.</p>
        </div>
      </div>

      <Window title="Add one or more writing samples">
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          Paste an old cover letter, essay, or thoughtful email. A few genuine paragraphs are
          more useful than a list of tone adjectives.
        </p>
        <WritingSamples />
      </Window>

      {samples.length > 0 && <Notice>✔ {samples.length} voice sample{samples.length === 1 ? '' : 's'} ready for grounded cover letters.</Notice>}

      <div className="setup-actions">
        <Button onClick={onBack}>◀ Back</Button>
        <Button primary onClick={onNext}>{samples.length ? 'Continue ▶' : 'Skip for now ▶'}</Button>
      </div>
    </div>
  );
}

function GuideStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const profile = useLiveQuery(() => getProfile(), []);
  const samples = useLiveQuery(() => writingSamples(), [], []);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof getLlmConfig>> | null>(null);
  const [credentials, setCredentialState] = useState<Credentials | null>(null);

  useEffect(() => {
    void Promise.all([getLlmConfig(), getCredentials()]).then(([nextConfig, nextCredentials]) => {
      setConfig(nextConfig);
      setCredentialState(nextCredentials);
    });
  }, []);

  const aiReady = Boolean(config && (config.apiKey || PROVIDERS[config.provider].local));
  const accountReady = hasCredentials(credentials);

  const journey = [
    ['1', 'Open a real job posting', 'Greenhouse, Lever, Ashby, Workable, Workday, LinkedIn, or another application page.'],
    ['2', 'Click the Clanker crest', 'The Chrome toolbar icon opens the side panel beside the posting. Pin it if you use it often.'],
    ['3', 'Scan before you fill', 'Clanker maps each requirement to resume evidence and shows honest gaps.'],
    ['4', 'Fill, then review', 'Every proposed answer is labelled by source. Unknowns stay blank. Clanker never presses Submit.'],
    ['5', 'Send and track it', 'After you submit, log the application; status changes and next actions live in the dashboard.'],
    ['6', 'Advance the Crusade', 'Applications, replies, interviews, and offers award DP. Idle time never outruns real work.'],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="setup-explainer">
        <span className="setup-required">Field guide</span>
        <div>
          <h3>Your first application, from posting to campaign progress.</h3>
          <p>This is the repeatable loop the extension is built around.</p>
        </div>
      </div>

      <ol className="setup-journey">
        {journey.map(([number, title, copy]) => (
          <li key={number}>
            <span>{number}</span>
            <div><strong>{title}</strong><p>{copy}</p></div>
          </li>
        ))}
      </ol>

      <Window title="Your campaign readiness">
        <div className="setup-readiness">
          <ReadyLine ready={Boolean(profile)} title="Local profile" copy={profile ? profile.source.fileName : 'Resume required'} />
          <ReadyLine ready title="Scan, Fill, and Track" copy="Ready without network calls" />
          <ReadyLine ready={accountReady} optional title="Account assistance" copy={accountReady ? 'Sign-in defaults saved' : 'Skipped — normal fills still work'} />
          <ReadyLine ready={aiReady} optional title="AI tools" copy={aiReady && config ? `${PROVIDERS[config.provider].label} configured` : 'Skipped — add a provider in Settings later'} />
          <ReadyLine ready={samples.length > 0} optional title="Writing voice" copy={samples.length ? `${samples.length} sample${samples.length === 1 ? '' : 's'} saved` : 'Skipped — letters will use a neutral voice'} />
        </div>
      </Window>

      <Notice>Nothing is submitted automatically. Review is always the final gate between Clanker and the application.</Notice>

      <div className="setup-actions">
        <Button onClick={onBack}>◀ Back</Button>
        <Button primary onClick={onNext}>Commission the campaign ▶</Button>
      </div>
    </div>
  );
}

function ReadyLine({
  ready,
  optional = false,
  title,
  copy,
}: {
  ready: boolean;
  optional?: boolean;
  title: string;
  copy: string;
}) {
  return (
    <div data-ready={ready}>
      <span aria-hidden>{ready ? '✔' : optional ? '○' : '✖'}</span>
      <strong>{title}</strong>
      <small>{copy}</small>
      {optional && !ready && <em>optional</em>}
    </div>
  );
}

function Done({ onBack }: { onBack: () => void }) {
  const profile = useLiveQuery(() => getProfile(), []);
  const [launching, setLaunching] = useState(false);

  const launch = async () => {
    if (!profile) return;
    setLaunching(true);
    await Promise.all([
      setSetting(SETUP_DONE_KEY, true),
      setSetting(SETUP_STEP_KEY, LAST_STEP),
      setSetting(SETUP_FURTHEST_KEY, LAST_STEP),
    ]);
    window.location.assign(chrome.runtime.getURL('dashboard.html'));
  };

  return (
    <div className="space-y-4">
      <section className="setup-finish-card">
        <img src={assetUrl('icons/icon-128.png')} alt="" aria-hidden="true" />
        <p className="setup-kicker">Commission accepted</p>
        <h3>Your Clankerdom journey is ready.</h3>
        <p>
          The dashboard opens next. From there you can review the parsed profile, watch the
          application board, revisit Settings, or enter the Crusade. On a job page, click the
          same crest in Chrome to open the working side panel.
        </p>
        <div className="setup-final-loop">
          <span>Job posting</span><b>→</b><span>Scan</span><b>→</b><span>Fill + review</span><b>→</b><span>Track</span><b>→</b><span>DP</span>
        </div>
      </section>

      {!profile && <Notice tone="bad">A local profile is still required. Return to Resume before launching.</Notice>}

      <div className="setup-actions">
        <Button onClick={onBack}>◀ Field guide</Button>
        <Button primary disabled={!profile || launching} onClick={() => void launch()}>
          {launching ? 'Opening dashboard…' : 'Open my command dashboard ▶'}
        </Button>
      </div>
    </div>
  );
}
