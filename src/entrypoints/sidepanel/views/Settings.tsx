/**
 * Settings — the provider, the key, and the voice.
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
import {
  clearCredentials,
  emptyCredentials,
  getCredentials,
  maskPassword,
  setCredentials,
  type Credentials,
} from '@/lib/fill/credentials';
import { Button, Meter, Window } from '@/ui/dq';
import WritingSamples from '@/ui/WritingSamples';

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

  if (!config) return <p className="text-[13px] text-faint">Loading…</p>;

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
        // Not 64. Thinking models spend output tokens on reasoning before they
        // write anything, and a budget that small is consumed entirely by it —
        // which surfaced as "empty response" and looked like a bad key.
        maxTokens: 2048,
      });
      setTest({ kind: 'ok', echo: String(result.data.ok).slice(0, 40) });
    } catch (err) {
      setTest({ kind: 'fail', error: err instanceof Error ? err.message : 'failed' });
    }
  };

  return (
    <div className="space-y-2">
      <Window title="Provider">
        <select
          value={config.provider}
          onChange={(e) => void patch({ provider: e.target.value as ProviderId })}
          className="dq-input mb-1 w-full px-2 py-1 text-[13px]"
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
          className="dq-input w-full px-2 py-1 text-[13px]"
        />

        <p className="mt-1 font-mono text-[11px] leading-relaxed text-faint">
          {provider.local
            ? 'runs on your machine · no key, no quota, nothing leaves'
            : `${provider.dailyLimit}/day before the budget degrades to deterministic-only`}
        </p>
      </Window>

      {!provider.local && (
        <Window title="API key">
          <div className="mb-1 flex gap-1">
            <input
              type={reveal ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              onBlur={() => void patch({ apiKey: config.apiKey })}
              placeholder="paste your key"
              spellCheck={false}
              autoComplete="off"
              className="dq-input min-w-0 flex-1 px-2 py-1 text-[13px]"
            />
            <Button onClick={() => setReveal((r) => !r)}>{reveal ? 'hide' : 'show'}</Button>
          </div>

          <div className="flex items-center gap-1">
            <Button primary onClick={() => void runTest()} disabled={!config.apiKey || test.kind === 'testing'}>
              {test.kind === 'testing' ? 'Testing…' : 'Test key'}
            </Button>
            {saved && <span className="font-mono text-[11px] text-ok">✔ saved</span>}
            {provider.keyUrl && (
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto font-mono text-[11px] text-muted underline hover:text-gold"
              >
                get a key
              </a>
            )}
          </div>

          {test.kind === 'ok' && (
            <p className="mt-1 font-mono text-[12px] text-ok">
              ✔ key works · model replied “{test.echo}”
            </p>
          )}
          {test.kind === 'fail' && (
            <p className="mt-1 font-mono text-[12px] leading-relaxed text-bad">✖ {test.error}</p>
          )}

          <p className="mt-1 text-[12px] leading-relaxed text-faint">
            Stored in <span className="font-mono">chrome.storage.local</span>, never in the
            database and never in a <span className="font-mono">.clankdb</span> export. It leaves
            this machine only as a header on a call you triggered.
          </p>
        </Window>
      )}

      <Window title="Your voice">
        <p className="mb-2 text-[13px] leading-snug text-muted">
          Used only by the cover letter button, to write in your voice rather than a model's.
        </p>
        <WritingSamples />
      </Window>

      {budget && (
        <Window title="Today">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[18px] leading-none text-gold">{budget.used}</span>
            <span className="font-mono text-[12px] text-faint">of {budget.limit} calls</span>
          </div>
          <div className="mt-1.5">
            <Meter value={budget.used / Math.max(1, budget.limit)} />
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            The median application costs zero calls. If this number climbs fast, tiers 1–4 are
            missing and that is a bug worth reporting.
          </p>
        </Window>
      )}

      <AccountCredentials />

      <Window title="Setup">
        <Button
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') })}
        >
          Reopen the setup page
        </Button>
      </Window>
    </div>
  );
}

/**
 * Sign-in details for the boards that make you register before they will show
 * you a form.
 *
 * Deliberately blunt about where the password goes. A store that oversells its
 * own protection is worse than one that does not exist, and the honest version
 * is short: it is a file in your Chrome profile, it is not encrypted, and it
 * never leaves the machine or enters an export.
 */
function AccountCredentials() {
  const [creds, setCreds] = useState<Credentials>(emptyCredentials());
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getCredentials().then(setCreds);
  }, []);

  const save = async (next: Partial<Credentials>) => {
    await setCredentials(next);
    setCreds(await getCredentials());
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <Window
      title="Sign-in details"
      right={
        saved ? <span className="font-mono text-[12px] text-ok">saved</span> : undefined
      }
    >
      <p className="mb-2 text-[13px] leading-snug text-muted">
        Half of all applications begin with "create an account". With these saved, that step
        happens without you.
      </p>

      <label className="dq-label mb-1 block">Email</label>
      <input
        className="dq-input mb-2 w-full"
        type="email"
        value={creds.email}
        placeholder="the address you apply with"
        onChange={(e) => setCreds({ ...creds, email: e.target.value })}
        onBlur={() => void save({ email: creds.email })}
      />

      <label className="dq-label mb-1 block">Password</label>
      <div className="mb-2 flex gap-1">
        <input
          className="dq-input min-w-0 flex-1"
          type="password"
          value={draft}
          placeholder={creds.password ? maskPassword(creds.password) : 'a password for job boards'}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          disabled={draft === ''}
          onClick={() => {
            void save({ password: draft });
            setDraft('');
          }}
        >
          Save
        </Button>
      </div>

      <label className="flex cursor-pointer items-start gap-2 py-1">
        <input
          type="checkbox"
          className="mt-1"
          checked={creds.auto}
          onChange={(e) => void save({ auto: e.target.checked })}
        />
        <span className="text-[13px] leading-snug">
          Make accounts automatically
          <span className="block text-[12px] text-faint">
            Off by default. Typing a password into a page is not a thing to do on someone's
            behalf until they have said so once.
          </span>
        </span>
      </label>

      <p className="mt-2 border-t-2 border-frame-dim pt-1.5 text-[12px] leading-snug text-faint">
        Stored in <span className="font-mono">chrome.storage.local</span>, never in the database
        and never in a <span className="font-mono">.clankdb</span> export. It is a file in your
        Chrome profile and it is <b className="text-warn">not encrypted at rest</b> — anything
        with your unlocked machine can read it.
      </p>

      {creds.password !== '' && (
        <button
          className="mt-2 font-mono text-[12px] text-bad underline"
          onClick={() => {
            void clearCredentials().then(() => setCreds(emptyCredentials()));
          }}
        >
          forget these
        </button>
      )}
    </Window>
  );
}
