/**
 * Content script. Detects a supported ATS, harvests the form, and runs the
 * fill on request from the side panel.
 *
 * It never touches the submit button on its own. Auto-submit is opt-in,
 * per-site, and unlocked only after a verified clean run — see
 * lib/fill/autosubmit.ts.
 */
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
    console.debug('[clanker] content script ready on', location.hostname);
  },
});
