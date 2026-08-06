import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { type Route } from './App';
import '@/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

/** `#/demo`, optionally deep-linked to one screen: `#/demo/scan`. */
const DEMO = /^#\/demo(?:\/([a-z]+))?$/;

/**
 * `#/demo` seeds a plausible crusade and opens the board on it.
 *
 * This is how the README screenshots are taken: the real UI rendering the
 * real database, so a picture that looks wrong means the app is wrong. It
 * refuses to run if you have applications of your own — see lib/tracker/demo.
 *
 * The per-screen route is what makes regenerating the whole set a loop over
 * URLs rather than a person clicking through tabs and hoping they got the
 * same crop each time.
 *
 * Both the shim and the seed are dynamic imports, so they are their own chunk
 * and the extension never loads either.
 */
async function boot() {
  const demo = DEMO.exec(location.hash);

  if (demo) {
    // Served over plain HTTP there is no `chrome` at all, and the first thing
    // the dashboard does is read the model budget out of chrome.storage.
    const { installDemoChrome } = await import('./demoChrome');
    installDemoChrome();

    const { seedDemoData } = await import('@/lib/tracker/demo');
    await seedDemoData();

    // The review overlay is not a side-panel screen — it renders into the job
    // board — so it gets a route of its own rather than a tab.
    if (demo[1] === 'overlay') {
      const { showDemoOverlay } = await import('./demoOverlay');
      await showDemoOverlay();
      return;
    }
  }

  createRoot(root!).render(
    <StrictMode>
      <App initialRoute={demo ? ((demo[1] as Route) ?? 'tracker') : undefined} />
    </StrictMode>,
  );
}

void boot();
