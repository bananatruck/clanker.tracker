/**
 * The pack.
 *
 * Three things you are carrying, in one grid: what you are holding, what the
 * crusade has put in your hands, and what you can actually do — the last being
 * the skills off your own resume, one slot each.
 *
 * The skills are the part that matters. They are not a game reward; they are
 * the list the ATS scan matches against and the list autofill answers from, so
 * an inventory that fills up as you correct your profile is showing you real
 * progress on the tool disguised as progress in the game. It is the only place
 * the two halves of this project are literally the same screen.
 */
import { iconForSkill, storyItemsFor, weaponFor } from '@/lib/game/items';
import Item from '@/ui/game/Item';

export default function Inventory({
  level,
  skills,
}: {
  level: number;
  /** From the parsed resume. Empty until one is loaded, which is honest. */
  skills: readonly string[];
}) {
  const weapon = weaponFor(level);
  const story = storyItemsFor(level);

  return (
    <div className="space-y-3">
      <section>
        <h3 className="dq-label mb-1.5">Equipped</h3>
        <div className="flex items-center gap-2">
          <Item file={weapon.file} name={weapon.name} size={48} />
          <div className="min-w-0">
            <p className="text-[14px] text-parchment">{weapon.name}</p>
            <p className="font-mono text-[11.5px] text-faint">
              carried from Lv {weapon.from}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="dq-label mb-1.5">Carried</h3>
        <ul className="space-y-1">
          {story.map((it) => (
            <li key={it.id} className="flex items-center gap-2">
              <Item file={it.file} name={it.name} size={38} />
              <span className="min-w-0">
                <span className="block text-[13.5px] leading-tight text-parchment">{it.name}</span>
                <span className="block text-[12px] leading-snug text-muted">{it.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="dq-label mb-1.5">
          Skills{' '}
          <span className="font-mono text-[11.5px] text-faint">
            {skills.length === 0 ? 'none yet' : `${skills.length}`}
          </span>
        </h3>

        {skills.length === 0 ? (
          <p className="text-[13px] leading-snug text-muted">
            Empty until a resume is loaded. Every skill it finds becomes a slot here — and the
            same list is what the scan matches against and what autofill answers from.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {skills.map((skill) => (
              <li key={skill} className="flex flex-col items-center" style={{ width: 52 }}>
                <Item file={iconForSkill(skill)} name={skill} size={44} />
                <span className="mt-0.5 w-full truncate text-center font-mono text-[10px] text-muted">
                  {skill}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
