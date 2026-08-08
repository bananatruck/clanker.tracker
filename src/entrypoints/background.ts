/**
 * Service worker. Owns everything that must outlive a tab:
 *   - **the database** — see lib/db/messages.ts for why this is not optional
 *   - the daily LLM budget counter
 *   - message routing between content scripts and the side panel
 */
import {
  getProfile,
  getSetting,
  logApplication,
  recallAnswer,
  recordFillRun,
  rememberAnswer,
  totalDp,
} from '@/lib/db/repo';
import { levelFromDp, tierForLevel } from '@/lib/game/economy';
import { barkFor } from '@/lib/game/lore';
import { getCredentials } from '@/lib/fill/credentials';
import type { DbRequest, DbResponse } from '@/lib/db/messages';

/**
 * Run one request against the repository.
 *
 * Split out from the listener so the reply path has exactly one shape: every
 * outcome, including a thrown one, comes back as a DbResponse. A content
 * script that gets no reply cannot tell "empty" from "broken", and that
 * ambiguity is what hid the origin bug for so long.
 */
async function handle(request: DbRequest): Promise<unknown> {
  switch (request.type) {
    case 'db:getProfile':
      return (await getProfile()) ?? null;

    // The skirmish line for the player's tier. Lives here because the content
    // script cannot see the deeds ledger the level is derived from.
    case 'db:bark': {
      const { level } = levelFromDp(await totalDp());
      return barkFor(tierForLevel(level));
    }

    case 'db:getSetting':
      return getSetting(request.key, request.fallback);

    case 'db:recallAnswer':
      return (await recallAnswer(request.question))?.answer ?? null;

    case 'db:rememberAnswer':
      await rememberAnswer(request.question, request.answer, request.ats);
      return true;

    case 'db:recordFillRun':
      await recordFillRun(request.run);
      return true;

    // Secrets live in chrome.storage.local rather than Dexie. They are handed
    // to the content script only for an explicit Fill action on an account
    // wall; page JavaScript has no extension API with which to request them.
    case 'account:getCredentials':
      return getCredentials();

    case 'db:logApplication':
      return logApplication(request.init);
  }
}

export default defineBackground(() => {
  // Let Chrome open the panel itself while it still owns the toolbar click's
  // user-activation token. Do not put an async settings lookup between the
  // click and sidePanel.open(): Chrome will reject the call once that token is
  // gone, even though the user genuinely clicked the action.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[clanker] side panel behaviour:', err));

  const openSetup = () => chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });

  /**
   * Setup opens once, on install, in a full tab.
   *
   * `reason === 'install'` and not `'update'`: reopening this on every version
   * bump would put a wizard in front of someone who finished it months ago.
   */
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void openSetup();
    }
  });

  /**
   * The badge on the page asks for the panel.
   *
   * A content script cannot open a side panel — only an extension context can,
   * and only while a user gesture is still the reason — so the click is
   * forwarded here and opened against the tab it came from.
   */
  chrome.runtime.onMessage.addListener((request: { type?: string }, sender) => {
    if (request?.type !== 'clanker:open-panel') return false;
    const tabId = sender.tab?.id;
    // This call must happen synchronously in the message event dispatched by
    // the launcher's click. Awaiting IndexedDB (or any promise) first consumes
    // the user gesture and makes Chrome reject the panel request.
    if (tabId !== undefined) {
      void chrome.sidePanel.open({ tabId }).catch((err) =>
        console.error('[clanker] page launcher:', err),
      );
    }
    return false;
  });

  chrome.runtime.onMessage.addListener((request: DbRequest, _sender, sendResponse) => {
    if (
      typeof request?.type !== 'string' ||
      (!request.type.startsWith('db:') && !request.type.startsWith('account:'))
    ) return false;

    handle(request)
      .then((data) => sendResponse({ ok: true, data } satisfies DbResponse))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies DbResponse),
      );

    // Keep the channel open for the async reply.
    return true;
  });
});
