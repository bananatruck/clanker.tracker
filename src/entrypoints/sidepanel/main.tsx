import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

/**
 * `#/demo` seeds a plausible crusade and opens the board on it.
 *
 * This is how the README screenshots are taken: the real UI rendering the
 * real database, so a picture that looks wrong means the app is wrong. It
 * refuses to run if you have applications of your own — see lib/tracker/demo.
 */
async function boot() {
  const hash = location.hash;

  if (hash === '#/demo') {
    const { seedDemoData } = await import('@/lib/tracker/demo');
    await seedDemoData();
  }

  createRoot(root!).render(
    <StrictMode>
      <App initialRoute={hash === '#/demo' ? 'tracker' : undefined} />
    </StrictMode>,
  );
}

void boot();
