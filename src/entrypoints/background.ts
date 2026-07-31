/**
 * Service worker. Owns everything that must outlive a tab:
 *   - the daily LLM budget counter
 *   - the tracker sync queue (best-effort, retries, never blocks a fill)
 *   - message routing between content scripts and the side panel
 */
export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel rather than a popup.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[clanker] side panel behaviour:', err));

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html#/onboarding') });
    }
  });
});
