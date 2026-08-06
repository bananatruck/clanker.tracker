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
import { profileCompleteness, type ResumeProfile } from '@/types/profile';
import { Meter, Window } from '@/ui/dq';
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

export default function Dashboard({ initial }: { initial?: Section }) {
  const [section, setSection] = useState<Section>(initial ?? 'home');

  const profile = useLiveQuery(() => getProfile(), []);
  const apps = useLiveQuery(() => allApplications(), [], []);
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;

  const { level } = levelFromDp(dp);
  const tier = tierForLevel(level);
  const tierTitle = TIERS.find((t) => t.tier === tier)?.title ?? 'Squire';
  const name = profile?.contact.fullName.value || profile?.contact.email.value || 'Unnamed';

  return (
    <div className="min-h-full bg-window">
      <header className="dq-banner flex items-baseline justify-between px-5 py-2.5">
        <h1 className="font-mono text-[19px] font-semibold">
          clanker<span className="opacity-70">.</span>tracker
        </h1>
        <span className="font-mono text-[14px] opacity-90">
          {tierTitle} · Lv {level} · {dp} DP
        </span>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b-4 border-frame bg-window-hi px-3 py-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            aria-current={section === s.id ? 'page' : undefined}
            title={s.blurb}
            className={`shrink-0 border-2 px-3 py-1.5 text-[14px] ${
              section === s.id
                ? 'border-frame bg-banner font-semibold text-banner-ink'
                : 'border-transparent text-muted hover:border-frame-dim hover:text-parchment'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/*
        Applications is the one section that drops the rail.

        The rail answers "who am I", which every other screen is a variation
        on. The table answers "what have I sent", and it has nine columns that
        all earn their place — squeezing it into 850 pixels to keep a profile
        card visible beside it would be preferring the furniture to the work.
      */}
      <div
        className={`mx-auto grid gap-4 p-4 ${
          section === 'tracker' ? 'max-w-[1400px]' : 'max-w-[1180px] lg:grid-cols-[280px_1fr]'
        }`}
      >
        {/* The rail. Who you are, and how far the crusade has gone. */}
        <aside className={`flex flex-col gap-3 ${section === 'tracker' ? 'hidden' : ''}`}>
          {/*
            One card, not two. "You" and the tier meter were separate windows
            saying overlapping things about the same person, and the level and
            DP were already in the header bar above them — three places for two
            numbers. The rail is now identity and progress, once each.
          */}
          <Window title="You">
            <p className="text-[17px] leading-tight text-parchment">{name}</p>
            {profile && (
              <>
                <p className="mt-0.5 font-mono text-[12.5px] text-muted">
                  {profile.contact.email.value || (
                    <span className="text-bad">no email parsed</span>
                  )}
                </p>
                <Completeness profile={profile} />
                <p className="mt-1 font-mono text-[12px] text-faint">
                  {profile.experience.length} roles · {profile.skills.length} skills
                </p>
              </>
            )}
            {profile === null && (
              <p className="mt-1 text-[13px] leading-snug text-muted">
                No resume yet. Add one under My Profile and every form after it fills itself.
              </p>
            )}

            <div className="mt-3 border-t-2 border-frame-dim pt-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-parchment">{tierTitle}</span>
                <span className="font-mono text-[12.5px] text-gold">Lv {level}</span>
              </div>
              <div className="mt-1.5">
                <Meter value={levelFromDp(dp).progress} cells={18} />
              </div>
              <p className="mt-1.5 font-mono text-[12px] text-faint">
                {distanceToCitadel(level)} nodes to the Citadel
              </p>
            </div>
          </Window>

        </aside>

        <main className="min-w-0">
          {section === 'home' ? (
            <Home apps={apps} onGo={setSection} />
          ) : section === 'profile' ? (
            <Profile />
          ) : section === 'tracker' ? (
            <Tracker wide />
          ) : section === 'crusade' ? (
            <Crusade />
          ) : (
            <Settings />
          )}
        </main>
      </div>
    </div>
  );
}

function Completeness({ profile }: { profile: ResumeProfile }) {
  const { total, certain, missing } = profileCompleteness(profile);
  return (
    <>
      <div className="mt-2">
        <Meter value={certain / total} cells={total} />
      </div>
      <p className={`mt-1 font-mono text-[12px] ${missing > 0 ? 'text-warn' : 'text-ok'}`}>
        {certain}/{total} contact fields confirmed
      </p>
    </>
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
  onGo,
}: {
  apps: Awaited<ReturnType<typeof allApplications>>;
  onGo: (s: Section) => void;
}) {
  const funnel = funnelStats(apps);
  const cost = costStats(apps);

  const owed = apps.filter((a) => (a.nextAction ?? '').trim() !== '' && !isDone(a.status));
  const quiet = apps.filter((a) => isStale(a));
  const recent = apps.slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
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
