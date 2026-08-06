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
import { useLiveQuery } from 'dexie-react-hooks';
import { allApplications, totalDp } from '@/lib/db/repo';
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
import { Meter, Window } from '@/ui/dq';
import Sprite from '@/ui/Sprite';

/** How many march nodes to draw. The whole crusade, compressed to one strip. */
const NODES = 24;

export default function Crusade() {
  const apps = useLiveQuery(() => allApplications(), [], []);
  const deeds = useLiveQuery(() => db.deeds.toArray(), [], []);
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;

  const { level, dpIntoLevel, dpForNext, progress } = levelFromDp(dp);
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

  return (
    <div className="space-y-2">
      <Window
        title={tierTitle}
        right={<span className="font-mono text-[10px] text-gold">{dp} DP</span>}
      >
        <div className="flex items-center gap-2">
          <Sprite id={tier === 'devastator' || tier === 'ascendant' ? 'khlaude-sponsored' : 'khlaude'} scale={3} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[13px] text-parchment">Level {level}</p>
            <p className="font-mono text-[10px] text-muted">
              {dpIntoLevel}/{dpForNext} to next
            </p>
            <div className="mt-1">
              <Meter value={progress} cells={16} />
            </div>
          </div>
        </div>

        {/* Act V turns the fanfare off. The silence is a story beat. */}
        {!fanfareAllowed(level) && (
          <p className="mt-2 font-mono text-[10px] text-faint">— no fanfare from here</p>
        )}
      </Window>

      <March level={level} tier={tier} />

      {latest && (
        <Window title="The march">
          <p className="text-[12px] leading-relaxed text-parchment">{latest.copy}</p>
          <p className="mt-1 font-mono text-[9px] text-faint">{latest.panel}</p>
        </Window>
      )}

      {hasOffer && (
        <Window title="The Adoption">
          <div className="mb-2 flex items-center gap-2">
            <Sprite id="pigking" scale={3} />
            <Sprite id="chudlord-wave" scale={2} />
          </div>
          {ENDING.filter((b) => b.trigger.kind === 'offer').map((beat) => (
            <p key={beat.id} className="mb-1 text-[12px] leading-relaxed text-parchment">
              {beat.copy}
            </p>
          ))}
        </Window>
      )}

      <Window
        title="The ledger"
        right={
          <span className="font-mono text-[10px] text-faint">
            {distanceToCitadel(level)} to the Citadel
          </span>
        }
      >
        <dl className="space-y-0.5 font-mono text-[10px]">
          <Deed label={DEEDS.application.label} count={stats.applications} each={DEEDS.application.dp} />
          <Deed label={DEEDS.oa.label} count={stats.oas} each={DEEDS.oa.dp} />
          <Deed label={DEEDS.interview.label} count={stats.interviews} each={DEEDS.interview.dp} />
        </dl>
        <p className="mt-2 text-[10px] leading-snug text-faint">
          DP is only ever the sum of this ledger. Nothing decays, and nothing idle can outpace
          what you actually did.
        </p>
      </Window>

      <Window
        title="Deeds of note"
        right={
          <span className="font-mono text-[10px] text-gold">
            {earned}/{achievements.length}
          </span>
        }
      >
        <div className="space-y-1">
          {achievements.map(({ achievement, earned: got, progress: p }) => (
            <div
              key={achievement.id}
              className={`flex items-start gap-2 border-2 px-1.5 py-1 ${
                got ? 'border-gold-dim' : 'border-frame-dim'
              }`}
            >
              <div className={got ? '' : 'opacity-25 grayscale'}>
                <Sprite id={achievement.sprite} scale={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] ${got ? 'text-gold' : 'text-muted'}`}>
                  {got ? achievement.title : '???'}
                </p>
                <p className="text-[10px] leading-snug text-faint">
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
      </Window>
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

  return (
    <Window title="The road to the Citadel">
      <div className="flex items-end gap-0.5 overflow-x-auto pb-1">
        {Array.from({ length: NODES }, (_, i) => {
          if (i === reached) {
            return <Sprite key={i} id={paving ? 'khlaude-sponsored' : 'khlaude'} scale={2} />;
          }
          if (i < reached) {
            return <Sprite key={i} id={paving ? 'datacentre' : 'rubble'} scale={2} />;
          }
          return <Sprite key={i} id="house" scale={2} />;
        })}
        <Sprite id={level >= CITADEL_LEVEL ? 'citadel' : 'tower'} scale={2} />
      </div>
      <p className="font-mono text-[9px] text-faint">
        {reached} of {NODES} nodes · the Tower never gets closer
      </p>
    </Window>
  );
}
