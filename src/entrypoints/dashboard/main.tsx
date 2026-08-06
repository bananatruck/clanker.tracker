import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard, { type Section } from './Dashboard';
import '@/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

/** `#/demo` and `#/demo/profile` — the same convention the side panel uses. */
const DEMO = /^#\/demo(?:\/([a-z]+))?$/;
const DIRECT = /^#\/([a-z]+)$/;

async function boot() {
  const demo = DEMO.exec(location.hash);

  if (demo) {
    const { installDemoChrome } = await import('@/entrypoints/sidepanel/demoChrome');
    installDemoChrome();
    const { seedDemoData } = await import('@/lib/tracker/demo');
    await seedDemoData();
  }

  // `#/demo` alone carries no section, and must not be read by the direct
  // matcher as a section literally named "demo".
  const section = (demo ? demo[1] : DIRECT.exec(location.hash)?.[1]) as Section | undefined;

  createRoot(root!).render(
    <StrictMode>
      <Dashboard initial={section} />
    </StrictMode>,
  );
}

void boot();
