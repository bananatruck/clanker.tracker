import { useState } from 'react';
import { levelFromDp, tierForLevel, TIERS, distanceToCitadel } from '@/lib/game/economy';

type Route = 'dashboard' | 'profile' | 'tracker' | 'tree' | 'crusade' | 'settings';

const ROUTES: ReadonlyArray<{ id: Route; label: string; milestone: string }> = [
  { id: 'dashboard', label: 'Dashboard', milestone: 'M0' },
  { id: 'profile', label: 'Profile', milestone: 'M1' },
  { id: 'tracker', label: 'Tracker', milestone: 'M3' },
  { id: 'tree', label: 'Skill Tree', milestone: 'M5' },
  { id: 'crusade', label: 'Crusade', milestone: 'M5' },
  { id: 'settings', label: 'Settings', milestone: 'M0' },
];

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard');

  // No persisted state yet — the Dexie layer lands in M1. Zero is honest.
  const dp = 0;
  const { level, dpIntoLevel, dpForNext, progress } = levelFromDp(dp);
  const tier = tierForLevel(level);
  const tierTitle = TIERS.find((t) => t.tier === tier)?.title ?? 'Squire';

  return (
    <div className="flex h-full flex-col bg-base text-text">
      <header className="border-b border-border px-3 py-2">
        <div className="flex items-baseline justify-between">
          <h1 className="font-mono text-[13px] tracking-tight">
            clanker<span className="text-accent">.</span>tracker
          </h1>
          <span className="font-mono text-[10px] text-faint">v0.0.1 · M0</span>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoute(r.id)}
            className={`shrink-0 rounded px-2 py-1 text-[11px] transition-colors ${
              route === r.id
                ? 'bg-surface-hi text-text'
                : 'text-muted hover:bg-surface hover:text-text'
            }`}
          >
            {r.label}
          </button>
        ))}
      </nav>

      {/* Crusade HUD — present on every route, because progress is the point. */}
      <section className="border-b border-border bg-surface px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] text-accent">
            {tierTitle} · Lv {level}
          </span>
          <span className="font-mono text-[10px] text-faint">
            {dpIntoLevel}/{dpForNext} DP
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-base">
          <div
            className="h-full bg-accent transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-faint">
          {distanceToCitadel(level)} nodes to the Citadel
        </p>
      </section>

      <main className="flex-1 overflow-y-auto p-3">
        {route === 'dashboard' ? <Dashboard /> : <Placeholder route={route} />}
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="space-y-4">
      <blockquote className="border-l-2 border-accent-dim pl-3 text-[12px] leading-relaxed text-muted">
        The King declares a crusade against a{' '}
        <em className="text-text">disgusting, evil, multi-billion-strong dynasty</em> — the
        family of <strong className="text-text">Poo R. PeePole</strong>, and their brood, the{' '}
        <strong className="text-text">Chilled Rens</strong>.
        <footer className="mt-2 font-mono text-[10px] text-faint">
          — proclamation of King Net And Yahoo, from the Tower
        </footer>
      </blockquote>

      <div className="rounded border border-border bg-surface p-3">
        <h2 className="mb-2 font-mono text-[11px] text-muted">No crusade yet</h2>
        <p className="text-[12px] leading-relaxed text-muted">
          Add a resume to raise the warband. Every application razes 2 family homes; every
          interview dries a river.
        </p>
      </div>

      <ul className="space-y-1 font-mono text-[10px] text-faint">
        <li>M0 · scaffold, manifest, economy ✓</li>
        <li>M1 · resume parse → profile → ATS scan</li>
        <li>M2 · autofill core</li>
        <li>M3 · tracker — usable daily from here</li>
      </ul>
    </div>
  );
}

function Placeholder({ route }: { route: Route }) {
  const milestone = ROUTES.find((r) => r.id === route)?.milestone ?? '';
  return (
    <div className="grid h-full place-items-center">
      <p className="font-mono text-[11px] text-faint">
        {route} · lands in {milestone}
      </p>
    </div>
  );
}
