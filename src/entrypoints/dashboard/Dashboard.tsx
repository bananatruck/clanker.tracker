/**
 * The dashboard: everything about you, at full width, in its own tab.
 *
 * The side panel is 420 pixels wide because it lives beside a job application,
 * and that is the right shape for filling one form. It is the wrong shape for
 * the other half of a job hunt — reading your own history, correcting what the
 * parser got wrong, and seeing what six weeks of applying actually produced.
 * Those want a page.
 *
 * The structure follows the one every job tool converges on, because it is
 * correct: a rail of who you are on the left, the substance on the right. What
 * it does *not* copy is the parts of those tools that exist to sell you
 * something — there is no upgrade card, no match score, no recruiter
 * visibility toggle, no streak. Nothing here is trying to get you to open it
 * tomorrow; the game already does that, honestly, off work you actually did.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { allApplications, getProfile, totalDp } from '@/lib/db/repo';
import { costStats, funnelStats } from '@/lib/tracker/stats';
import { STATUS_COLOR, STATUS_LABEL, isStale } from '@/lib/tracker/funnel';
import { shortDay } from '@/lib/tracker/table';
import { levelFromDp, tierForLevel, TIERS, distanceToCitadel } from '@/lib/game/economy';
import { ACTORS } from '@/lib/game/atlas';
import type { ResumeProfile } from '@/types/profile';
import { Meter, Window } from '@/ui/dq';
import Actor from '@/ui/Actor';
import Backdrop from '@/ui/game/Backdrop';
import Profile from '@/entrypoints/sidepanel/views/Profile';
import Tracker from '@/entrypoints/sidepanel/views/Tracker';
import Crusade from '@/entrypoints/sidepanel/views/Crusade';
import Settings from '@/entrypoints/sidepanel/views/Settings';

export type Section = 'home' | 'profile' | 'tracker' | 'crusade' | 'settings';

/**
 * The nav.
 *
 * Five entries, and every one of them is a place your own data lives. The
 * tools this is modelled on carry seven or eight, of which three are a job
 * board we do not have and a referral programme we will never have.
 */
const SECTIONS: ReadonlyArray<{ id: Section; label: string; blurb: string }> = [
  { id: 'home', label: 'Home', blurb: 'Where the crusade stands' },
  { id: 'profile', label: 'My Profile', blurb: 'What autofill answers with' },
  { id: 'tracker', label: 'Applications', blurb: 'Everything you have sent' },
  { id: 'crusade', label: 'Crusade', blurb: 'Clankerdom Deliverance' },
  { id: 'settings', label: 'Settings', blurb: 'Key, voice, budget' },
];

const SECTION_GLYPH: Record<Section, string> = {
  home: '⌂',
  profile: '◆',
  tracker: '≡',
  crusade: '♜',
  settings: '⚙',
};

export default function Dashboard({ initial }: { initial?: Section }) {
  const [section, setSection] = useState<Section>(initial ?? 'home');

  const profile = useLiveQuery(() => getProfile(), []);
  const apps = useLiveQuery(() => allApplications(), [], []);
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;

  const { level } = levelFromDp(dp);
  const tier = tierForLevel(level);
  const tierTitle = TIERS.find((t) => t.tier === tier)?.title ?? 'Squire';
  const name = profile?.contact.fullName.value || profile?.contact.email.value || 'Unnamed';

  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]!;

  return (
    <div className="dashboard-shell min-h-full">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <span className="dashboard-brand-mark">c</span>
          <span>
            <strong>clanker<span>.</span>tracker</strong>
            <small>application command</small>
          </span>
        </div>

        <div className="dashboard-avatar">
          <Backdrop tier={tier} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07150f] via-transparent to-transparent" />
          <div className="absolute bottom-1 right-4">
            <Actor art={ACTORS['khlaude-walk']!} scale={0.9} still />
          </div>
          <div className="absolute bottom-3 left-3 text-white">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200">Current rank</p>
            <p className="text-[17px] font-semibold">{tierTitle}</p>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Dashboard">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
              className="dashboard-nav-item"
            >
              <span aria-hidden>{SECTION_GLYPH[s.id]}</span>
              <span>
                <strong>{s.label}</strong>
                <small>{s.blurb}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="dashboard-rank-card">
          <div className="flex items-baseline justify-between">
            <span>{name}</span>
            <strong>Lv {level}</strong>
          </div>
          <div className="mt-2"><Meter value={levelFromDp(dp).progress} cells={14} /></div>
          <p>{dp} DP · {distanceToCitadel(level)} nodes left</p>
        </div>
      </aside>

      <main className="dashboard-main min-w-0">
        <header className="dashboard-heading">
          <div>
            <p className="dashboard-eyebrow">Command / {active.label}</p>
            <h1>{active.label}</h1>
            <p>{active.blurb}</p>
          </div>
          <div className="dashboard-status">
            <span className="status-dot" aria-hidden />
            <span>Local data</span>
            <strong>{apps.length} applications</strong>
          </div>
        </header>

        <div className={`dashboard-body ${section === 'tracker' ? 'dashboard-body-wide' : ''}`}>
          {section === 'home' ? (
            <Home apps={apps} profile={profile} dp={dp} onGo={setSection} />
          ) : section === 'profile' ? (
            <Profile />
          ) : section === 'tracker' ? (
            <Tracker wide />
          ) : section === 'crusade' ? (
            <Crusade />
          ) : (
            <Settings />
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Home.
 *
 * Counts and rates, and nothing that is a score. A "profile strength" or a
 * "match rating" is a number nobody can act on, and inventing one is how a
 * tracker starts moralising at someone having a bad month.
 *
 * It used to be four numbers, a paragraph, and then two thirds of a blank
 * page. The numbers were the whole screen and they are the least useful thing
 * on it — you cannot do anything with "14 sent". So the space underneath is
 * now what you owe: the applications with a next action written on them, and
 * the ones that have gone quiet. Opening this tab should tell you what to do
 * next, not how you are doing.
 */
function Home({
  apps,
  profile,
  dp,
  onGo,
}: {
  apps: Awaited<ReturnType<typeof allApplications>>;
  profile: ResumeProfile | null | undefined;
  dp: number;
  onGo: (s: Section) => void;
}) {
  const funnel = funnelStats(apps);
  const cost = costStats(apps);
  const { level, progress, dpIntoLevel, dpForNext } = levelFromDp(dp);
  const tier = tierForLevel(level);
  const tierTitle = TIERS.find((item) => item.tier === tier)?.title ?? 'Squire';
  const name = profile?.contact.fullName.value || profile?.contact.email.value || 'Unnamed applicant';

  const owed = apps.filter((a) => (a.nextAction ?? '').trim() !== '' && !isDone(a.status));
  const quiet = apps.filter((a) => isStale(a));
  const recent = apps.slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      <section className="home-hero">
        <div className="absolute inset-0" aria-hidden>
          <Backdrop tier={tier} />
          <div className="absolute inset-0 bg-gradient-to-r from-[#06130d]/95 via-[#06130d]/75 to-[#06130d]/20" />
        </div>
        <div className="home-hero-copy">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-200">
            Today’s command
          </p>
          <h2>{name}</h2>
          <p>
            {apps.length === 0
              ? 'Load your profile, open a posting, and start the first run.'
              : `${funnel.responses} replies from ${funnel.total} applications. ${quiet.length + owed.length || 'Nothing'} waiting on you.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="home-hero-primary" onClick={() => onGo('tracker')}>Open applications</button>
            <button className="home-hero-secondary" onClick={() => onGo('crusade')}>Enter the crusade</button>
          </div>
        </div>
        <div className="home-hero-rank">
          <div className="flex items-end justify-center" aria-hidden>
            <Actor art={ACTORS['khlaude-walk']!} scale={1.15} still />
          </div>
          <p>{tierTitle} · Level {level}</p>
          <div className="mt-1.5"><Meter value={progress} cells={14} /></div>
          <small>{dpIntoLevel}/{dpForNext} DP to next</small>
        </div>
      </section>

      {/*
        A flat sunken row, not four framed windows. Every element on this page
        was wearing the same heavy frame, which left nothing with any weight —
        when everything is a window, the reader has no way to tell what is a
        section and what is a number.
      */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat n={funnel.total} k="sent" />
        <Stat n={`${Math.round(funnel.responseRate * 100)}%`} k="replied" />
        <Stat n={funnel.byStatus.interview} k="interviews" tone="ok" />
        <Stat
          n={cost.medianLlmCalls}
          k="median model calls"
          tone={cost.medianLlmCalls === 0 ? 'ok' : 'warn'}
        />
      </div>

      {apps.length === 0 ? (
        <Window title="Nothing sent yet">
          <p className="text-[14.5px] leading-relaxed text-muted">
            Open a job application and a badge appears in the corner of the page. Press it and the
            form fills itself. Everything you send lands here.
          </p>
          <button className="dq-btn mt-2.5 px-3 py-1.5" onClick={() => onGo('profile')}>
            Add a resume first
          </button>
        </Window>
      ) : (
        <>
          <Window
            title="What needs you"
            right={
              <span className="font-mono text-[12.5px]">
                {owed.length + quiet.length === 0 ? 'nothing' : owed.length + quiet.length}
              </span>
            }
          >
            {owed.length === 0 && quiet.length === 0 ? (
              <p className="text-[14px] text-muted">
                Nothing is waiting on you. Write a next action on a row in the tracker and it shows
                up here.
              </p>
            ) : (
              <ul className="space-y-1">
                {owed.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 py-0.5">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-parchment">
                      {a.company || 'Unknown'}
                      <span className="text-muted"> — {a.nextAction}</span>
                    </span>
                    <span className={`shrink-0 font-mono text-[11.5px] ${STATUS_COLOR[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </li>
                ))}
                {quiet.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 py-0.5">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-parchment">
                      {a.company || 'Unknown'}
                      <span className="text-muted"> — no reply in a month</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-bad">quiet</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="dq-btn mt-2.5 px-3 py-1.5" onClick={() => onGo('tracker')}>
              Open the tracker
            </button>
          </Window>

          <div className="grid gap-4 lg:grid-cols-2">
            <Window title="Recently sent">
              <ul className="space-y-1">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-parchment">
                      {a.company || 'Unknown'}
                      <span className="text-faint"> · {a.role || 'role unrecorded'}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-faint">
                      {shortDay(a.appliedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Window>

            <Window
              title="What it cost"
              right={
                <span className="font-mono text-[12.5px]">
                  {Math.round(cost.freeShare * 100)}% free
                </span>
              }
            >
              <p className="text-[14px] leading-relaxed text-muted">
                The claim is that the median application costs nothing. This is that claim measured
                against your own history rather than asserted — median, not mean, because one
                Workday monster must not make a hundred free Greenhouse fills read as expensive.
              </p>
            </Window>
          </div>
        </>
      )}
    </div>
  );
}

const isDone = (status: string) => status === 'rejected' || status === 'ghosted' || status === 'offer';

const TONE = { gold: 'text-gold', ok: 'text-ok', warn: 'text-warn' } as const;

function Stat({
  n,
  k,
  tone = 'gold',
}: {
  n: number | string;
  k: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="dq-slot flex-col items-start px-3 py-2.5">
      <p className={`font-mono text-[26px] leading-none ${TONE[tone]}`}>{n}</p>
      <p className="dq-label mt-1.5">{k}</p>
    </div>
  );
}
