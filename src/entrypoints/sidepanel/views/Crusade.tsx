/**
 * Clankerdom Deliverance.
 *
 * The march is the level curve made visible: Kh. Laude advances one node per
 * level toward a Citadel he cannot take, and the ground behind him turns from
 * homes to rubble to data centres as the acts progress. That transformation is
 * the story — it is not decoration on top of the tracker, it *is* the tracker,
 * drawn.
 *
 * Every string of narration comes from lib/game/lore, which is transcribed
 * from the author's storyboard and tested against it. Nothing is written here.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { allApplications, getProfile, totalDp } from '@/lib/db/repo';
import { db } from '@/lib/db/schema';
import {
  levelFromDp,
  tierForLevel,
  TIERS,
  distanceToCitadel,
  CITADEL_LEVEL,
  DEEDS,
} from '@/lib/game/economy';
import { ACT_0, ACTS, ENDING, fanfareAllowed } from '@/lib/game/lore';
import { evaluateAchievements, statsFrom } from '@/lib/game/achievements';
import { ACTORS, crusadeFoe } from '@/lib/game/atlas';
import { Meter, Window } from '@/ui/dq';
import Sprite from '@/ui/Sprite';
import Scene from '@/ui/game/Scene';
import Acts from '@/ui/game/Acts';
import Inventory from '@/ui/game/Inventory';
import Item from '@/ui/game/Item';
import { medalFor } from '@/lib/game/items';
import Title from '@/ui/game/Title';
import Actor from '@/ui/Actor';

/** How many march nodes to draw. The whole crusade, compressed to one strip. */
const NODES = 24;

export default function Crusade() {
  const apps = useLiveQuery(() => allApplications(), [], []);
  const deeds = useLiveQuery(() => db.deeds.toArray(), [], []);
  // No default, deliberately: DP is the sum of a table, so this screen cannot
  // say anything true until that table has been read, and `0` would mean
  // showing a level-zero crusade to someone who has sent two hundred
  // applications. Undefined is the honest value while it loads.
  const dp = useLiveQuery(() => totalDp(), []);
  const profile = useLiveQuery(() => getProfile(), []);

  const { level, dpIntoLevel, dpForNext, progress } = levelFromDp(dp ?? 0);
  const tier = tierForLevel(level);
  const tierTitle = TIERS.find((t) => t.tier === tier)?.title ?? 'Squire';

  const stats = statsFrom(apps, deeds, level);
  const achievements = evaluateAchievements(stats);
  const earned = achievements.filter((a) => a.earned).length;

  // Panels the player has actually reached. Act 0 is always available: they
  // have already been read it.
  const seen = [...ACT_0, ...ACTS].filter(
    (b) => b.trigger.kind === 'firstRun' || (b.trigger.kind === 'level' && level >= b.trigger.level),
  );
  const latest = seen.at(-1);

  const hasOffer = stats.offers > 0;

  if (dp === undefined) return <Title />;

  return (
    <div className="space-y-2">
      {/* The scene stays. Everything else is one panel at a time. */}
      {/*
        The scene leads, because the level number is not the story — the ground
        Kh. Laude is standing on is, and it changes act by act underneath him.
        The most recent panel he has actually reached speaks over it.
      */}
      <Scene
        tier={tier}
        hero={ACTORS['khlaude-battle']!}
        foe={crusadeFoe(level, stats.interviews > 0 ? 3 : 1)}
        speaker={latest ? 'Kh. Laude' : undefined}
        line={latest?.copy}
      />

      <Window
        title={tierTitle}
        right={<span className="font-mono text-[12px] text-gold">{dp} DP</span>}
      >
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[16px] text-parchment">Level {level}</p>
          <p className="font-mono text-[12px] text-muted">
            {dpIntoLevel}/{dpForNext} to next
          </p>
        </div>
        <div className="mt-1.5">
          <Meter value={progress} cells={16} />
        </div>
        {latest && <p className="mt-1.5 font-mono text-[11px] text-faint">{latest.panel}</p>}

        {/* Act V turns the fanfare off. The silence is a story beat. */}
        {!fanfareAllowed(level) && (
          <p className="mt-2 font-mono text-[12px] text-faint">— no fanfare from here</p>
        )}
      </Window>

      <Tabs
        panels={[
          {
            id: 'march',
            label: 'March',
            body: (
              <>
                <Acts tier={tier} level={level} />
                <div className="mt-2">
                  <March level={level} tier={tier} />
                </div>
              </>
            ),
          },
          {
            id: 'pack',
            label: 'Pack',
            body: <Inventory level={level} skills={profile?.skills ?? []} />,
          },
          {
            id: 'deeds',
            label: `Deeds ${earned}/${achievements.length}`,
            body: <Deeds stats={stats} achievements={achievements} level={level} />,
          },
        ]}
      />

      {hasOffer && (
        <Window title="The Adoption">
          <div className="mb-2 flex items-end justify-center gap-6">
            <Actor art={ACTORS['pigking']!} scale={0.8} label="The Pig King" />
            <Actor art={ACTORS['chudlord']!} scale={0.55} label="The Chud Lord, waving" />
          </div>
          {ENDING.filter((b) => b.trigger.kind === 'offer').map((beat) => (
            <p key={beat.id} className="mb-1 text-[14px] leading-relaxed text-parchment">
              {beat.copy}
            </p>
          ))}
        </Window>
      )}

    </div>
  );
}

/**
 * One panel at a time.
 *
 * The Crusade tab had eight stacked windows and ran to nearly three thousand
 * pixels, which is not a screen — it is a scroll with a battle at the top of
 * it. Nothing was removed; it is grouped, and the grouping is the obvious one:
 * where you are, what you are carrying, what you have done.
 */
function Tabs({
  panels,
}: {
  panels: ReadonlyArray<{ id: string; label: string; body: React.ReactNode }>;
}) {
  const [open, setOpen] = useState(panels[0]!.id);
  const current = panels.find((p) => p.id === open) ?? panels[0]!;

  return (
    <section className="dq-window">
      <div role="tablist" className="dq-banner flex gap-1 px-1 py-1">
        {panels.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === open}
            onClick={() => setOpen(p.id)}
            className={`flex-1 border-2 px-2 py-1 font-mono text-[12px] ${
              p.id === open
                ? 'border-frame bg-window text-parchment'
                : 'border-transparent text-banner-ink/85 hover:border-banner-ink/40'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="p-2">{current.body}</div>
    </section>
  );
}

/** The ledger and the deeds of note, which are the same claim twice. */
function Deeds({
  stats,
  achievements,
  level,
}: {
  stats: ReturnType<typeof statsFrom>;
  achievements: ReturnType<typeof evaluateAchievements>;
  level: number;
}) {
  return (
    <div className="space-y-3">
      <section>
        <h3 className="dq-label mb-1.5">
          The ledger
          <span className="ml-2 text-faint">{distanceToCitadel(level)} to the Citadel</span>
        </h3>
        <dl className="space-y-0.5 font-mono text-[12px]">
          <Deed label={DEEDS.application.label} count={stats.applications} each={DEEDS.application.dp} />
          <Deed label={DEEDS.oa.label} count={stats.oas} each={DEEDS.oa.dp} />
          <Deed label={DEEDS.interview.label} count={stats.interviews} each={DEEDS.interview.dp} />
        </dl>
        <p className="mt-2 text-[12px] leading-snug text-faint">
          DP is only ever the sum of this ledger. Nothing decays, and nothing idle can outpace what
          you actually did.
        </p>
      </section>

      <section>
        <h3 className="dq-label mb-1.5">Deeds of note</h3>
        <div className="space-y-1">
          {achievements.map(({ achievement, earned: got, progress: p }) => (
            <div
              key={achievement.id}
              className={`flex items-start gap-2 border-2 px-1.5 py-1 ${
                got ? 'border-gold-dim' : 'border-frame-dim'
              }`}
            >
              {medalFor(achievement.id) ? (
                <Item file={medalFor(achievement.id)!} name={achievement.title} size={40} dim={!got} />
              ) : (
                <div className={got ? '' : 'opacity-25 grayscale'}>
                  <Sprite id={achievement.sprite} scale={1} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] ${got ? 'text-gold' : 'text-muted'}`}>
                  {got ? achievement.title : '???'}
                </p>
                <p className="text-[12px] leading-snug text-faint">
                  {got ? achievement.description : achievement.requirement}
                </p>
                {!got && p > 0 && (
                  <div className="mt-1">
                    <Meter value={p} cells={12} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Deed({ label, count, each }: { label: string; count: number; each: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-faint">{label}</dt>
      <dd className="shrink-0 text-parchment">
        {count}
        <span className="text-faint"> · {count * each} DP</span>
      </dd>
    </div>
  );
}

/**
 * The march strip.
 *
 * Ground behind the warband has already been taken, and what stands on it
 * depends on how far the crusade has gone: homes become rubble, and from
 * Devastator the rubble becomes data centres. The Tower is always on the
 * horizon and never gets closer, which is the point of it.
 */
function March({ level, tier }: { level: number; tier: string }) {
  const reached = Math.min(NODES, Math.round((level / CITADEL_LEVEL) * NODES));
  const paving = tier === 'devastator' || tier === 'ascendant';

  const strip = useRef<HTMLDivElement>(null);
  const here = useRef<HTMLDivElement>(null);

  // The whole road is far wider than a side panel, and the one node the player
  // cares about is the one they are standing on. Left alone the strip opens at
  // node zero, so by mid-game the warband is off the right-hand edge and the
  // screen reads as an unbroken row of rubble.
  useLayoutEffect(() => {
    const box = strip.current;
    const node = here.current;
    if (!box || !node) return;
    box.scrollLeft = node.offsetLeft - box.clientWidth / 2 + node.clientWidth / 2;
  }, [reached]);

  return (
    <Window title="The road to the Citadel">
      <div ref={strip} className="flex items-end gap-0.5 overflow-x-auto pb-1">
        {Array.from({ length: NODES }, (_, i) => {
          if (i === reached) {
            return (
              <div key={i} ref={here} className="shrink-0">
                <Sprite id={paving ? 'khlaude-sponsored' : 'khlaude'} scale={1} />
              </div>
            );
          }
          if (i < reached) {
            return <Sprite key={i} id={paving ? 'datacentre' : 'rubble'} scale={1} />;
          }
          return <Sprite key={i} id="house" scale={1} />;
        })}
        <Sprite id={level >= CITADEL_LEVEL ? 'citadel' : 'tower'} scale={1} />
      </div>
      <p className="font-mono text-[11px] text-faint">
        {reached} of {NODES} nodes · the Tower never gets closer
      </p>
    </Window>
  );
}
