/**
 * The five acts, as a road.
 *
 * The level meter says how far you have come and says nothing about where that
 * is. This does: five floors in order, the one you are standing on marked, and
 * the level each of the others starts at. Nothing is hidden behind a lock —
 * the story is in the repo and knowing a meadow becomes a wasteland is not a
 * spoiler, it is the reason to keep going.
 *
 * It is also the only screen that shows every backdrop at once, which makes it
 * the one that catches an act being drawn wrong.
 */
import { TIERS, type Tier } from '@/lib/game/economy';
import Backdrop from '@/ui/game/Backdrop';

/** One line per act. What the ground is, in the fewest words that carry it. */
const GROUND: Record<Tier, string> = {
  squire: 'A green meadow, and a hamlet still standing',
  'knight-errant': 'The river valley, before it was dried',
  warlord: 'The dust of a town already taken',
  devastator: 'A plain gone the colour of nothing',
  ascendant: 'A lit room you have finally been let into',
};

export default function Acts({ tier, level }: { tier: Tier; level: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1">
      {TIERS.map((t) => {
        const here = t.tier === tier;
        const reached = level >= t.from;

        return (
          <li
            key={t.tier}
            aria-current={here ? 'step' : undefined}
            className={`border-2 ${here ? 'border-gold' : 'border-frame-dim'}`}
            title={GROUND[t.tier]}
          >
            <div className="relative aspect-[8/5] overflow-hidden">
              <Backdrop tier={t.tier} />
              {/* Acts still ahead are dimmed rather than hidden. You can see
                  where this is going; you have not been there yet. */}
              {!reached && <div className="absolute inset-0 bg-field/55" />}
            </div>

            <div className={`px-1 py-0.5 ${here ? 'bg-gold-dim' : 'bg-window-hi'}`}>
              <p
                className={`truncate font-mono text-[10.5px] ${
                  here ? 'text-window' : reached ? 'text-parchment' : 'text-faint'
                }`}
              >
                {t.title}
              </p>
              <p
                className={`font-mono text-[10px] ${here ? 'text-window/80' : 'text-faint'}`}
              >
                {here ? 'you are here' : `Lv ${t.from}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
