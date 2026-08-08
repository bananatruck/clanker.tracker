import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Setup from './Setup';
import '@/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

const DEMO_STEPS: Record<string, number> = {
  welcome: 0,
  resume: 1,
  applications: 2,
  ai: 3,
  voice: 4,
  guide: 5,
  ride: 6,
};

async function boot() {
  const demo = /^#\/demo(?:\/([a-z]+))?$/.exec(location.hash);
  if (demo) {
    const { installDemoChrome } = await import('@/entrypoints/sidepanel/demoChrome');
    installDemoChrome();
    const { seedDemoData } = await import('@/lib/tracker/demo');
    await seedDemoData();
  }

  createRoot(root!).render(
    <StrictMode>
      <Setup initialStep={demo ? (DEMO_STEPS[demo[1] ?? 'welcome'] ?? 0) : undefined} />
    </StrictMode>,
  );
}

void boot();
