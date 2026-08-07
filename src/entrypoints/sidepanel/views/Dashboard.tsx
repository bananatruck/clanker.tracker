/**
 * The dashboard. What this replaced was a hardcoded list of milestones —
 * a screen that told the user about the project's progress rather than theirs.
 *
 * Everything here is read from the database, and nothing here is a score. A
 * "match rating" or "application health" would be a number nobody can act on,
 * and inventing one is how a tracker starts moralising at someone having a bad
 * month. Counts, rates, and what to do next — nothing else.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { allApplications, getProfile, totalDp } from '@/lib/db/repo';
import { costStats, funnelStats } from '@/lib/tracker/stats';
import { STATUS_LABEL } from '@/lib/tracker/funnel';
import { currentBudgetStatus } from '@/lib/llm';
import { levelFromDp, tierForLevel, TIERS, distanceToCitadel } from '@/lib/game/economy';
import { ACTORS } from '@/lib/game/atlas';
import { profileCompleteness, type ResumeProfile } from '@/types/profile';
import type { ApplicationStatus } from '@/lib/db/schema';
import { Button, Meter, Window } from '@/ui/dq';
import Actor from '@/ui/Actor';
import Backdrop from '@/ui/game/Backdrop';

const FUNNEL_ORDER: ApplicationStatus[] = [
  'applied',
  'oa',
  'interview',
  'offer',
  'rejected',
  'ghosted',
];

export default function Dashboard({ onNavigate }: { onNavigate: (route: string) => void }) {
  const profile = useLiveQuery(() => getProfile(), []);
  const apps = useLiveQuery(() => allApplications(), [], []);
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;
  const budget = useLiveQuery(() => currentBudgetStatus(), []);

  const funnel = funnelStats(apps);
  const cost = costStats(apps);
  const { level, dpIntoLevel, dpForNext, progress } = levelFromDp(dp);
  const tier = tierForLevel(level);
  const tierTitle = TIERS.find((t) => t.tier === tier)?.title ?? 'Squire';

  return (
    <div className="space-y-2">
      {/* The one thing standing between a fresh install and a working tool. */}
      {profile === null || profile === undefined ? (
        profile === undefined ? null : (
          <Window title="Start here">
            <p className="mb-2 text-[14px] leading-relaxed text-muted">
              There is no resume yet, so there is nothing to fill an application from.
            </p>
            <Button primary onClick={() => onNavigate('profile')}>
              Add your resume ▶
            </Button>
          </Window>
        )
      ) : (
        <Window
          title="You"
          right={
            <button
              onClick={() => onNavigate('profile')}
              className="font-mono text-[12px] text-faint hover:text-gold"
            >
              edit ▶
            </button>
          }
        >
          <Identity profile={profile} />
        </Window>
      )}

      <button
        type="button"
        onClick={() => onNavigate('crusade')}
        className="dashboard-quest-card group relative block h-32 w-full overflow-hidden text-left"
      >
        <div className="absolute inset-0" aria-hidden>
          <Backdrop tier={tier} />
          <div className="absolute inset-0 bg-gradient-to-r from-[#071b12]/95 via-[#071b12]/70 to-transparent" />
        </div>
        <div className="absolute bottom-0 right-5" aria-hidden>
          <Actor art={ACTORS['khlaude-walk']!} scale={0.8} still />
        </div>
        <div className="relative flex h-full max-w-[72%] flex-col justify-between p-3 text-white">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200">
              The crusade · {dp} DP
            </p>
            <p className="mt-1 text-[19px] font-semibold leading-none">{tierTitle}</p>
            <p className="mt-1 font-mono text-[11.5px] text-white/70">
              Level {level} · {distanceToCitadel(level)} nodes to the Citadel
            </p>
          </div>
          <div>
            <Meter value={progress} cells={14} />
            <p className="mt-1 font-mono text-[10.5px] text-white/70">
              {dpIntoLevel}/{dpForNext} to next · open campaign ↗
            </p>
          </div>
        </div>
      </button>

      <Window
        title="Applications"
        right={<span className="font-mono text-[12px] text-gold">{funnel.total}</span>}
      >
        {funnel.total === 0 ? (
          <p className="text-[13px] leading-snug text-muted">
            Nothing sent yet. Open a job application and the Fill tab will do the rest.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-x-2 gap-y-1">
              {FUNNEL_ORDER.map((status) => (
                <div key={status} className="flex items-baseline justify-between gap-1">
                  <dt className="truncate font-mono text-[12px] text-faint">
                    {STATUS_LABEL[status]}
                  </dt>
                  <dd className="font-mono text-[13px] text-parchment">
                    {funnel.byStatus[status]}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-2 flex items-baseline justify-between border-t-2 border-frame-dim pt-1.5">
              <span className="font-mono text-[12px] text-faint">replied</span>
              <span className="font-mono text-[13px] text-parchment">
                {funnel.responses}
                <span className="text-faint">
                  {' '}
                  · {Math.round(funnel.responseRate * 100)}%
                </span>
              </span>
            </div>

            {funnel.stale > 0 && (
              <p className="mt-1 font-mono text-[12px] text-warn">
                {funnel.stale} gone quiet — worth a nudge
              </p>
            )}
          </>
        )}
      </Window>

      {/*
        The cost claim, measured rather than asserted. If the median application
        is not free, the design has regressed and this is where it shows first.
      */}
      {funnel.total > 0 && (
        <Window title="What it cost">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[12px] text-faint">median model calls</span>
            <span
              className={`font-mono text-[15px] ${cost.medianLlmCalls === 0 ? 'text-ok' : 'text-warn'}`}
            >
              {cost.medianLlmCalls}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-[12px] text-faint">filled for free</span>
            <span className="font-mono text-[13px] text-parchment">
              {Math.round(cost.freeShare * 100)}%
            </span>
          </div>
          {budget && !budget.exhausted && (
            <p className="mt-1.5 font-mono text-[12px] text-faint">
              budget · {budget.used}/{budget.limit} today
            </p>
          )}
          {budget?.exhausted && (
            <p className="mt-1.5 font-mono text-[12px] text-warn">
              budget spent — filling deterministically only
            </p>
          )}
        </Window>
      )}

      <Window title="Do something">
        <div className="flex flex-wrap gap-1">
          <Button primary onClick={() => onNavigate('fill')}>
            Fill this page
          </Button>
          <Button onClick={() => onNavigate('scan')}>Scan the posting</Button>
          <Button onClick={() => onNavigate('tracker')}>Tracker</Button>
        </div>
      </Window>
    </div>
  );
}

function Identity({ profile }: { profile: ResumeProfile }) {
  const { total, certain, missing } = profileCompleteness(profile);
  const name = profile.contact.fullName.value || profile.contact.email.value || 'Unnamed';

  return (
    <>
      <p className="truncate text-[14px] text-parchment">{name}</p>
      <p className="truncate font-mono text-[12px] text-muted">
        {profile.contact.email.value || <span className="text-bad">no email parsed</span>}
        {profile.contact.phone.value && ` · ${profile.contact.phone.value}`}
      </p>

      <div className="mt-1.5 flex items-baseline justify-between font-mono text-[12px]">
        <span className="text-faint">
          {profile.experience.length} roles · {profile.skills.length} skills
        </span>
        <span className={missing > 0 ? 'text-warn' : 'text-ok'}>
          {certain}/{total} confirmed
        </span>
      </div>

      {missing > 0 && (
        <p className="mt-1 font-mono text-[12px] text-warn">
          {missing} contact {missing === 1 ? 'field' : 'fields'} missing — forms will ask for
          them
        </p>
      )}
    </>
  );
}
