/**
 * Getting the fill engine onto whatever page the user is actually looking at.
 *
 * The content script is registered declaratively for the ATS platforms we have
 * adapters for, so those pages are ready before the user clicks anything. That
 * covers a minority of real job applications. The rest are company careers
 * pages, small ATSs, and one-off forms — and the generic adapter written for
 * exactly those could never run, because nothing ever injected the script
 * anywhere else.
 *
 * The fix is `activeTab` + `scripting` rather than a standing host permission
 * on every site. `activeTab` grants access to the current tab when the user
 * invokes the extension, which is precisely the shape of this feature: you
 * press Fill, we get that one page, and the grant lapses. Asking every user to
 * approve read-and-change-all-your-data at install time to fill a form they
 * have to click a button for anyway is a bad trade, and it is the permission
 * most likely to get an extension pulled from review.
 */

/** How long to wait for a freshly injected script to start answering. */
const READY_TIMEOUT_MS = 2000;
const POLL_MS = 50;

/** Built by WXT from src/entrypoints/content/. */
const CONTENT_SCRIPT = 'content-scripts/content.js';

export class NotInjectableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotInjectableError';
  }
}

/**
 * Send a message to a tab, resolving to null instead of rejecting when nothing
 * is listening. A tab without our content script is an ordinary state, not an
 * error worth surfacing as a crash.
 *
 * `frameId` matters more than it looks. Plenty of company careers pages embed
 * the real Greenhouse or Lever form in an iframe, and a tab-wide message is
 * answered by whichever frame replies first — which may be an ad, a cookie
 * banner, or the empty wrapper page. Addressing one frame makes that
 * deterministic.
 */
export function sendToTab<T>(
  tabId: number,
  message: unknown,
  frameId?: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const done = (reply: T) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(reply ?? null);
    };
    if (frameId === undefined) chrome.tabs.sendMessage(tabId, message, done);
    else chrome.tabs.sendMessage(tabId, message, { frameId }, done);
  });
}

async function isAlive(tabId: number, frameId?: number): Promise<boolean> {
  return (await sendToTab<{ ok: true }>(tabId, { type: 'clanker:ping' }, frameId)) !== null;
}

/**
 * Which frame holds the application form.
 *
 * Counting fields in every frame and taking the busiest one beats trusting the
 * top frame: on an embedded ATS the top frame has no form at all, and on a
 * normal page the top frame wins this count anyway. Falls back to the top
 * frame if the count cannot be taken.
 */
export async function bestFormFrame(tabId: number): Promise<number> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => document.querySelectorAll('input, textarea, select').length,
    });

    let bestFrame = 0;
    let bestCount = -1;
    for (const r of results) {
      const count = typeof r.result === 'number' ? r.result : 0;
      if (count > bestCount) {
        bestCount = count;
        bestFrame = r.frameId ?? 0;
      }
    }
    return bestFrame;
  } catch {
    return 0;
  }
}

/**
 * Chrome refuses injection into its own pages, the Web Store, and other
 * extensions. Detecting that up front turns an opaque scripting error into a
 * sentence that explains why the button did nothing.
 */
export function refuseReason(url: string | undefined): string | null {
  if (!url) return 'This tab has not finished loading.';
  if (/^(chrome|edge|about|devtools):/i.test(url) || url.startsWith('chrome-extension:')) {
    return 'Chrome blocks extensions on browser pages. Open the job application first.';
  }
  if (/^https:\/\/chromewebstore\.google\.com/i.test(url)) {
    return 'Chrome blocks extensions on the Web Store.';
  }
  if (url.startsWith('file:')) {
    return 'Local files need "Allow access to file URLs" enabled for this extension.';
  }
  return null;
}

/**
 * Make sure the fill engine is running in `tabId`, injecting it if it is not.
 *
 * Safe to call on a tab that already has it: the script guards its own
 * re-entry, and we ping before injecting anyway.
 */
export async function ensureContentScript(tabId: number, frameId?: number): Promise<void> {
  if (await isAlive(tabId, frameId)) return;

  const tab = await chrome.tabs.get(tabId);
  const refused = refuseReason(tab.url);
  if (refused) throw new NotInjectableError(refused);

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [CONTENT_SCRIPT],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // The common case is not a page Chrome forbids — it is activeTab having
    // lapsed because the user switched tabs after opening the panel. That is
    // recoverable in one click, so say which click.
    if (/Cannot access contents|must request permission|not been granted/i.test(message)) {
      throw new NotInjectableError(
        'Click the clanker.tracker toolbar icon on this tab to grant access, then Refresh.',
      );
    }
    if (/cannot be scripted|Cannot access a chrome/i.test(message)) {
      throw new NotInjectableError('Chrome will not let extensions run on this page.');
    }
    throw new NotInjectableError(`Could not start on this page: ${message}`);
  }

  // executeScript resolves when the file has run, but the listener registers a
  // tick later on some pages. Poll rather than sleep a fixed amount.
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isAlive(tabId, frameId)) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  throw new NotInjectableError('The page did not respond after loading the fill engine.');
}

/** The active tab's id, or null when there is somehow no active tab. */
export async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

/**
 * Inject if needed, then send to the frame that actually holds the form.
 *
 * This is the call every screen should use — it is what makes the extension
 * work on a careers page nobody wrote an adapter for.
 */
export async function askPage<T>(message: unknown): Promise<T> {
  const tabId = await activeTabId();
  if (tabId === null) throw new NotInjectableError('No active tab.');

  // Injecting first means the frame count is taken with our script already in
  // place, so the ping below cannot race the injection it is checking for.
  await ensureContentScript(tabId);
  const frameId = await bestFormFrame(tabId);
  await ensureContentScript(tabId, frameId);

  const reply = await sendToTab<T>(tabId, message, frameId);
  if (reply === null) throw new Error('The page stopped responding mid-request.');
  return reply;
}
