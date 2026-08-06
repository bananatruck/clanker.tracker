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
import { detectAts } from '@/lib/fill/adapters';
import { findApplicationForm, harvestForm } from '@/lib/fill/harvest';
import { runFill } from '@/lib/fill/run';
import { emptyPreferences, type Preferences } from '@/lib/fill/types';
import { identifyPosting } from '@/lib/tracker/funnel';
import { watchSubmission } from '@/lib/tracker/watch';
import type { ResumeProfile } from '@/types/profile';

/** Messages the side panel sends us. */
type Request = { type: 'clanker:probe' } | { type: 'clanker:fill' };

export default defineContentScript({
  matches: [
    'https://*.greenhouse.io/*',
    'https://*.lever.co/*',
    'https://*.ashbyhq.com/*',
    'https://*.workable.com/*',
    'https://*.myworkdayjobs.com/*',
    'https://www.linkedin.com/jobs/*',
  ],
  runAt: 'document_idle',

  main() {
    const ats = detectAts(location.hostname);
    console.debug('[clanker] content script ready on', location.hostname, '→', ats.id);

    /** Disarms any previous watcher, so re-filling a page cannot double-log. */
    let disarm: (() => void) | null = null;

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

    chrome.runtime.onMessage.addListener((request: Request, _sender, sendResponse) => {
      if (request.type === 'clanker:probe') {
        const { fields } = harvestForm(findApplicationForm(document));
        sendResponse({
          ats: ats.id,
          fieldCount: fields.length,
          requiredCount: fields.filter((f) => f.required).length,
        });
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
              },
            );

            // The run is over, but the application is not sent until the user
            // actually submits the page. Arm the watcher and let it log — see
            // lib/tracker/watch.ts for why this is not done right here.
            if (!outcome.cancelled && outcome.filled > 0) armTracker(outcome.llmCalls);

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
