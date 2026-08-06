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
import Settings from './views/Settings';

export type Route = 'dashboard' | 'profile' | 'scan' | 'fill' | 'tracker' | 'settings';

const ROUTES: ReadonlyArray<{ id: Route; label: string }> = [
  { id: 'dashboard', label: 'Home' },
  { id: 'profile', label: 'Profile' },
  { id: 'scan', label: 'Scan' },
  { id: 'fill', label: 'Fill' },
  { id: 'tracker', label: 'Tracker' },
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
    <div className="flex h-full flex-col bg-field text-parchment">
      <header className="flex items-baseline justify-between border-b-2 border-frame px-2 py-1.5">
        <h1 className="font-mono text-[13px]">
          clanker<span className="text-gold">.</span>tracker
        </h1>
        <span className="font-mono text-[10px] text-gold">
          {tierTitle} · Lv {level}
        </span>
      </header>

      <nav className="flex gap-0.5 overflow-x-auto border-b-2 border-frame-dim px-1 py-1">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoute(r.id)}
            aria-current={route === r.id ? 'page' : undefined}
            className={`shrink-0 border-2 px-2 py-0.5 font-mono text-[10px] ${
              route === r.id
                ? 'border-gold bg-window-hi text-parchment'
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
        ) : (
          <Settings />
        )}
      </main>
    </div>
  );
}
