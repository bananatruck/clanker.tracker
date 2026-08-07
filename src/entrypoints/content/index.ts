/**
 * Content script. Detects a supported ATS, harvests the form, and runs the
 * fill on request from the side panel.
 *
 * It touches no database directly. A content script runs in the page's origin,
 * so IndexedDB here belongs to the job board — every read came back empty and
 * every write landed in their storage. Everything persistent goes through the
 * background worker; see lib/db/messages.ts.
 *
 * It never touches the submit button on its own. Auto-submit is opt-in,
 * per-site, and unlocked only after a verified clean run — see
 * lib/fill/autosubmit.ts.
 */
import { askBackground } from '@/lib/db/messages';
import { extractPosting } from '@/lib/ats/posting';
import { detectAts } from '@/lib/fill/adapters';
import { findApplicationForm, harvestForm } from '@/lib/fill/harvest';
import { readGate } from '@/lib/fill/account';
import { removeLauncher, renderLauncher, resetLauncher } from '@/lib/fill/launcher';
import { runFill } from '@/lib/fill/run';
import { emptyPreferences, type Preferences } from '@/lib/fill/types';
import { identifyPosting } from '@/lib/tracker/funnel';
import { watchSubmission } from '@/lib/tracker/watch';
import type { ResumeProfile } from '@/types/profile';

/** Messages the side panel sends us. */
type Request =
  | { type: 'clanker:ping' }
  | { type: 'clanker:probe' }
  | { type: 'clanker:posting' }
  | { type: 'clanker:fill' };

declare global {
  interface Window {
    /** Set once the listener is installed. See the guard in main(). */
    __clankerReady?: boolean;
  }
}

export default defineContentScript({
  /**
   * Declarative registration covers the platforms we have adapters for, so
   * those pages are ready before the user clicks anything.
   *
   * Every *other* job application — company careers pages, small ATSs, one-off
   * forms — is reached on demand through activeTab + scripting when the user
   * presses Fill. See lib/fill/inject.ts for why that is the right permission
   * shape rather than requesting every host up front.
   */
  matches: [
    'https://*.greenhouse.io/*',
    'https://*.lever.co/*',
    'https://*.ashbyhq.com/*',
    'https://*.workable.com/*',
    'https://*.myworkdayjobs.com/*',
    'https://www.linkedin.com/jobs/*',
  ],
  runAt: 'document_idle',
  allFrames: true,

  main() {
    // A page can hold this script twice: once from the declarative match and
    // once because someone pressed Fill before it had run. Two listeners means
    // two replies to every message, and the second one is discarded silently —
    // so guard rather than debug that later.
    if (window.__clankerReady) return;
    window.__clankerReady = true;

    // The document is passed so a vendor form embedded inline on a company's
    // own domain is still recognised as that vendor's — see lib/fill/adapters.
    const ats = detectAts(location.hostname, document);
    console.debug('[clanker] content script ready on', location.hostname, '→', ats.id);

    /** Disarms any previous watcher, so re-filling a page cannot double-log. */
    let disarm: (() => void) | null = null;

    /** Set once a run has completed here, so the badge stops offering. */
    let filledHere = false;

    /**
     * Offer, without being asked.
     *
     * A side panel you have to remember to open is a side panel nobody opens.
     * The moment a page turns out to be an application — or the wall in front
     * of one — a badge appears in the corner and pressing it starts the run.
     *
     * Only the top frame draws it. Boards routinely embed the real form in an
     * iframe, and a badge per frame is three badges stacked on each other.
     */
    function offer(): void {
      if (window.top !== window.self) return;

      const gate = readGate(document).gate;
      const { fields } = harvestForm(findApplicationForm(document));

      renderLauncher(
        { gate, fields: fields.length, done: filledHere },
        () => {
          // Opening the panel is the background worker's job — a content
          // script cannot open a side panel, and the gesture has to be
          // forwarded while the user's click is still the reason for it.
          void chrome.runtime.sendMessage({ type: 'clanker:open-panel' }).catch(() => {});
        },
        // A single-file public sprite. The old path pointed at Hero_Roto.png,
        // which does not exist; using the campaign crown keeps the launcher
        // crisp without trying to squeeze an entire actor sheet into 34px.
        chrome.runtime.getURL('Sprites/items/GoldCirclet.png'),
      );
    }

    /**
     * Boards render their form after the script runs, and a single-page board
     * replaces it without a navigation. Watching the DOM is the only way the
     * badge appears at the right moment on both; debounced, because an
     * application form emits a great many mutations while it settles.
     */
    let pending = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(offer, 400) as unknown as number;
    });

    function armTracker(llmCalls: number): void {
      disarm?.();
      const form = findApplicationForm(document);

      disarm = watchSubmission(form, () => {
        disarm = null;
        const { company, role } = identifyPosting({
          host: location.hostname,
          title: document.title,
          url: location.href,
        });

        void askBackground({
          type: 'db:logApplication',
          init: {
            company,
            role,
            url: location.href,
            ats: ats.id,
            scanId: null,
            notes: '',
            llmCalls,
          },
        }).catch((err) => console.error('[clanker] could not log application:', err));
      });
    }

    if (window.top === window.self) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // A history change on a single-page board is a new posting, so an
      // earlier dismissal should not silence the badge on it forever.
      window.addEventListener('popstate', () => {
        resetLauncher();
        filledHere = false;
      });
      setTimeout(offer, 600);
    }

    chrome.runtime.onMessage.addListener((request: Request, _sender, sendResponse) => {
      // How the side panel tells "no script here" from "script here, no form".
      // Without it, injection could not be made idempotent.
      if (request.type === 'clanker:ping') {
        sendResponse({ ok: true });
        return false;
      }

      if (request.type === 'clanker:probe') {
        const { fields } = harvestForm(findApplicationForm(document));
        sendResponse({
          ats: ats.id,
          fieldCount: fields.length,
          requiredCount: fields.filter((f) => f.required).length,
        });
        return false;
      }

      // The scan reads the posting off the page rather than asking the user to
      // paste it. Free, local, and the difference between a scan you run on
      // everything you consider and one you run on nothing.
      if (request.type === 'clanker:posting') {
        const posting = extractPosting(document);
        const fallback = identifyPosting({
          host: location.hostname,
          title: document.title,
          url: location.href,
        });

        sendResponse(
          posting
            ? {
                ...posting,
                company: posting.company || fallback.company,
                title: posting.title || fallback.role,
                url: location.href,
              }
            : null,
        );
        return false;
      }

      if (request.type === 'clanker:fill') {
        void (async () => {
          try {
            const profile = await askBackground<ResumeProfile | null>({
              type: 'db:getProfile',
            });
            if (!profile) {
              sendResponse({ ok: false, error: 'No resume yet — add one in the side panel.' });
              return;
            }

            const preferences = await askBackground<Preferences>({
              type: 'db:getSetting',
              key: 'fill.preferences',
              fallback: emptyPreferences(),
            });

            const outcome = await runFill(
              { profile, preferences },
              {
                memory: {
                  recall: (question) =>
                    askBackground<string | null>({ type: 'db:recallAnswer', question }),
                },
                remember: async (question, answer) => {
                  await askBackground({
                    type: 'db:rememberAnswer',
                    question,
                    answer,
                    ats: ats.id,
                  });
                },
                record: async (run) => {
                  await askBackground({ type: 'db:recordFillRun', run });
                },
                bark: () => askBackground<string | null>({ type: 'db:bark' }),
              },
            );

            // The run is over, but the application is not sent until the user
            // actually submits the page. Arm the watcher and let it log — see
            // lib/tracker/watch.ts for why this is not done right here.
            if (!outcome.cancelled && outcome.filled > 0) {
              armTracker(outcome.llmCalls);
              filledHere = true;
              removeLauncher();
            }

            sendResponse({ ok: true, ...outcome });
          } catch (err) {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : 'Fill failed',
            });
          }
        })();

        // Keep the message channel open for the async reply.
        return true;
      }

      return false;
    });
  },
});
