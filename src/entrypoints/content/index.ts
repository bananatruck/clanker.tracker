/**
 * Content script. Detects a supported ATS, harvests the form, and runs the
 * fill on request from the side panel.
 *
 * It never touches the submit button on its own. Auto-submit is opt-in,
 * per-site, and unlocked only after a verified clean run — see
 * lib/fill/autosubmit.ts.
 */
import {
  getProfile,
  getSetting,
  logApplication,
  recallAnswer,
  recordFillRun,
  rememberAnswer,
} from '@/lib/db/repo';
import { detectAts } from '@/lib/fill/adapters';
import { findApplicationForm, harvestForm } from '@/lib/fill/harvest';
import { runFill } from '@/lib/fill/run';
import { emptyPreferences, type Preferences } from '@/lib/fill/types';
import { identifyPosting } from '@/lib/tracker/funnel';
import { watchSubmission } from '@/lib/tracker/watch';

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

        void logApplication({
          company,
          role,
          url: location.href,
          ats: ats.id,
          scanId: null,
          notes: '',
          llmCalls,
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
            const profile = await getProfile();
            if (!profile) {
              sendResponse({ ok: false, error: 'No resume yet — add one in the side panel.' });
              return;
            }

            const preferences = await getSetting<Preferences>(
              'fill.preferences',
              emptyPreferences(),
            );

            const outcome = await runFill(
              { profile, preferences },
              {
                memory: {
                  async recall(question) {
                    return (await recallAnswer(question))?.answer ?? null;
                  },
                },
                remember: (question, answer) => rememberAnswer(question, answer, ats.id),
                record: (run) => recordFillRun(run),
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
