/**
 * The side panel shell.
 *
 * The nav only lists screens that do something. A tab that opens a placeholder
 * is the exact failure this rebuild is correcting — it makes a half-built tool
 * feel finished, which is worse than looking unfinished.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { levelFromDp, tierForLevel, TIERS } from '@/lib/game/economy';
import { totalDp } from '@/lib/db/repo';
import Dashboard from './views/Dashboard';
import Profile from './views/Profile';
import Scan from './views/Scan';
import Fill from './views/Fill';
import Tracker from './views/Tracker';
import Crusade from './views/Crusade';
import Settings from './views/Settings';

export type Route =
  | 'dashboard'
  | 'profile'
  | 'scan'
  | 'fill'
  | 'tracker'
  | 'crusade'
  | 'settings';

const ROUTES: ReadonlyArray<{ id: Route; label: string }> = [
  { id: 'dashboard', label: 'Home' },
  { id: 'profile', label: 'Profile' },
  { id: 'scan', label: 'Scan' },
  { id: 'fill', label: 'Fill' },
  { id: 'tracker', label: 'Tracker' },
  { id: 'crusade', label: 'Crusade' },
  { id: 'settings', label: 'Settings' },
];

export default function App({ initialRoute }: { initialRoute?: Route } = {}) {
  const [route, setRoute] = useState<Route>(initialRoute ?? 'dashboard');

  // DP is never stored as a running total — it is always the sum of the deeds
  // ledger, which is what makes "idle can never outpace real work" checkable.
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;
  const { level } = levelFromDp(dp);
  const tierTitle = TIERS.find((t) => t.tier === tierForLevel(level))?.title ?? 'Squire';

  return (
    <div className="flex h-full flex-col bg-window text-parchment">
      <header className="dq-banner flex items-baseline justify-between px-2.5 py-2">
        <h1 className="font-mono text-[15px] font-semibold">
          clanker<span className="opacity-70">.</span>tracker
        </h1>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[12.5px] opacity-90">
            {tierTitle} · Lv {level}
          </span>
          {/* The panel is 420px because it lives beside an application. Reading
              your own history wants a page, so there is always one click to it. */}
          <button
            onClick={() =>
              chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
            }
            title="Open the dashboard in a tab"
            className="border-2 border-banner-ink/40 px-1.5 py-0.5 font-mono text-[11.5px] hover:border-banner-ink"
          >
            dashboard ▸
          </button>
        </div>
      </header>

      <nav className="flex gap-0.5 overflow-x-auto border-b-4 border-frame bg-window-hi px-1 py-1">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoute(r.id)}
            aria-current={route === r.id ? 'page' : undefined}
            className={`shrink-0 border-2 px-1.5 py-1 text-[12.5px] ${
              route === r.id
                ? 'border-frame bg-banner font-semibold text-banner-ink'
                : 'border-transparent text-muted hover:border-frame-dim hover:text-parchment'
            }`}
          >
            {r.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-2">
        {route === 'dashboard' ? (
          <Dashboard onNavigate={(next) => setRoute(next as Route)} />
        ) : route === 'profile' ? (
          <Profile />
        ) : route === 'scan' ? (
          <Scan />
        ) : route === 'fill' ? (
          <Fill />
        ) : route === 'tracker' ? (
          <Tracker />
        ) : route === 'crusade' ? (
          <Crusade />
        ) : (
          <Settings />
        )}
      </main>
    </div>
  );
}
