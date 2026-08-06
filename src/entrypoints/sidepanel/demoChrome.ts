/**
 * A `chrome.*` stand-in, so the side panel can be opened as an ordinary web
 * page — `sidepanel.html#/demo` over a local server.
 *
 * This exists for one reason: the README's screenshots have to be the real UI
 * rendering real data, or they will drift from what ships and start lying. A
 * mockup drawn in a design tool cannot be wrong, which is exactly the problem
 * with one. Under this shim every screen runs its actual code path — the same
 * Dexie database, the same resolver, the same components.
 *
 * It is loaded only from the `#/demo` route, so it is a separate chunk and
 * never reaches a user's browser. Everything it answers is a fixture; nothing
 * here changes how the extension behaves when `chrome` is genuinely present.
 */

/** A Greenhouse posting with enough substance for the scan to have opinions. */
const POSTING = {
  title: 'Senior Backend Engineer',
  company: 'Hexweave',
  url: 'https://boards.greenhouse.io/hexweave/jobs/4118820',
  description: [
    'About the role',
    '',
    'Hexweave runs the settlement layer behind a few thousand merchants. We are',
    'hiring a senior backend engineer to own the services that move money and to',
    'keep them boring.',
    '',
    'What we are looking for',
    '',
    '- 5+ years building and operating backend services in production',
    '- Strong Go or Python, and comfort reading a language you have not written',
    '- Experience designing and evolving PostgreSQL schemas under load',
    '- You have run something on Kubernetes and have opinions about it',
    '- Familiarity with event-driven systems: Kafka, or something like it',
    '- A track record of improving reliability you can point at with numbers',
    '',
    'Nice to have',
    '',
    '- Exposure to payments, ledgers, or double-entry accounting',
    '- Terraform or another infrastructure-as-code tool',
    '- Experience mentoring engineers earlier in their careers',
    '',
    'What you will do',
    '',
    '- Design, build and operate services that settle merchant balances daily',
    '- Reduce on-call load by fixing causes rather than adding dashboards',
    '- Work with product to scope what should not be built',
  ].join('\n'),
};

/** What the content script would have reported about the page above. */
const PROBE = { ats: 'greenhouse', fieldCount: 24, requiredCount: 11 };

/** What a clean run on it looks like: everything free, two left for the user. */
const FILL = { ok: true, filled: 22, skipped: 2, llmCalls: 0 };

const TAB = { id: 1, url: POSTING.url, active: true, title: `${POSTING.title} · Hexweave` };

type Callback = (value: unknown) => void;

/** The last argument, when it is a function. Chrome's callback convention. */
function callbackOf(args: unknown[]): Callback | null {
  const last = args.at(-1);
  return typeof last === 'function' ? (last as Callback) : null;
}

function reply(message: unknown): unknown {
  const type = (message as { type?: string } | null)?.type;
  switch (type) {
    case 'clanker:ping':
      return { ok: true };
    case 'clanker:probe':
      return PROBE;
    case 'clanker:posting':
      return POSTING;
    case 'clanker:fill':
      return FILL;
    default:
      return null;
  }
}

/**
 * Install the shim, but only when there is no real `chrome` to shadow.
 *
 * The guard is the whole safety argument: in the extension `chrome.storage`
 * exists, this returns immediately, and nothing below can run.
 */
export function installDemoChrome(): void {
  const existing = (globalThis as { chrome?: { storage?: unknown } }).chrome;
  if (existing?.storage) return;

  const store = new Map<string, unknown>();

  const storage = {
    local: {
      async get(keys?: string | string[] | null) {
        const wanted =
          typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [...store.keys()];
        return Object.fromEntries(
          wanted.filter((k) => store.has(k)).map((k) => [k, store.get(k)]),
        );
      },
      async set(items: Record<string, unknown>) {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      },
      async remove(keys: string | string[]) {
        for (const k of typeof keys === 'string' ? [keys] : keys) store.delete(k);
      },
    },
  };

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      lastError: undefined,
      getURL: (path: string) => path,
      sendMessage: (...args: unknown[]) => callbackOf(args)?.({ ok: true, data: null }),
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
    storage,
    tabs: {
      async query() {
        return [TAB];
      },
      async get() {
        return TAB;
      },
      create: (info: { url?: string }) => window.open(info.url, '_blank'),
      sendMessage: (...args: unknown[]) => {
        // The signature is (tabId, message, options?, callback?) — the shim
        // answers the message and ignores the frame, because there is only one.
        callbackOf(args)?.(reply(args[1]));
      },
    },
    scripting: {
      // One frame, and it is the one with the form in it.
      async executeScript() {
        return [{ frameId: 0, result: PROBE.fieldCount }];
      },
    },
  };
}
