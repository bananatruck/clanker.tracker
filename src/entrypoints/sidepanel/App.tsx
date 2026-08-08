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
import { assetUrl } from '@/lib/game/assets';
import { getProfile, totalDp } from '@/lib/db/repo';
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

const ROUTES: ReadonlyArray<{ id: Route; label: string; glyph: string }> = [
  { id: 'dashboard', label: 'Home', glyph: '⌂' },
  { id: 'profile', label: 'Profile', glyph: '◆' },
  { id: 'scan', label: 'Scan', glyph: '◎' },
  { id: 'fill', label: 'Fill', glyph: '▣' },
  { id: 'tracker', label: 'Tracker', glyph: '≡' },
  { id: 'crusade', label: 'Crusade', glyph: '♜' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

export default function App({ initialRoute }: { initialRoute?: Route } = {}) {
  const [route, setRoute] = useState<Route>(initialRoute ?? 'dashboard');

  // DP is never stored as a running total — it is always the sum of the deeds
  // ledger, which is what makes "idle can never outpace real work" checkable.
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;
  const profile = useLiveQuery(() => getProfile(), []);
  const { level } = levelFromDp(dp);
  const tierTitle = TIERS.find((t) => t.tier === tierForLevel(level))?.title ?? 'Squire';

  return (
    <div className="app-shell flex h-full flex-col text-parchment">
      <header className="app-topbar">
        <div className="app-brand">
          <img
            className="app-brand-logo"
            src={assetUrl('icons/icon-48.png')}
            alt=""
            aria-hidden="true"
          />
          <span>
            <strong>clanker<span>.</span>tracker</strong>
            <small>job hunt command</small>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setRoute('profile')}
            title={profile ? 'Review or replace your resume' : 'Upload your resume'}
            className="app-resume-action"
          >
            {profile ? 'Resume' : '+ Resume'}
          </button>
          <span className="app-rank">
            <small>{tierTitle}</small>
            <strong>Lv {level}</strong>
          </span>
          {/* The panel is 420px because it lives beside an application. Reading
              your own history wants a page, so there is always one click to it. */}
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })}
            title="Open the full dashboard"
            aria-label="Open the full dashboard"
            className="app-expand"
          >
            ↗
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Primary">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoute(r.id)}
            aria-current={route === r.id ? 'page' : undefined}
            className="app-nav-item"
          >
            <span className="app-nav-glyph" aria-hidden>{r.glyph}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-content flex-1 overflow-y-auto p-2.5">
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
