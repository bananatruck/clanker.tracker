/**
 * The encounter.
 *
 * Dragon Quest cuts to a battle with a hard white flash and no transition, and
 * copying that is not nostalgia — it is the reason you always know a fight has
 * started. Anything softer reads as a page loading, which is exactly what this
 * has to not read as: a fill beginning is a thing the extension is now doing
 * to a form on your screen, and the moment it starts should be unmistakable.
 *
 * It plays once, for well under a second, and then gets out of the way. A
 * transition you have to sit through is a transition people learn to resent.
 */
import { useEffect, useState } from 'react';

/** Long enough for the flash and the drop. Anything more is a cutscene. */
export const INTRO_MS = 1500;

export default function BattleIntro({
  /** Whose posting this is. The line reads better with a name and works without. */
  company,
  onDone,
}: {
  company?: string;
  onDone?: () => void;
}) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGone(true);
      onDone?.();
    }, INTRO_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  if (gone) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      <div className="dq-flash absolute inset-0 bg-white" />

      {/* In the message window, where Dragon Quest puts it — over the
          narration, because for this second and a half it *is* the narration.
          A floating banner in the middle of the frame would have to cover
          either the foe or the hero; there is no gap between them big enough
          in a 320-pixel panel, and the one place the game already reserves for
          a sentence is the bottom. */}
      <div className="dq-drop absolute inset-x-2 bottom-2">
        {/* Fully opaque, unlike the narration window it covers. Translucent
            here lets the line underneath ghost through it, which reads as a
            rendering fault rather than as a scene. */}
        <div className="dq-window bg-window px-3 py-2">
          {/* The real company name, not a monster this project invented. What
              you are actually up against is the posting. */}
          <p className="dq-speech text-center text-[15px] text-parchment">
            {company ? `${company} draws near!` : 'The posting draws near!'}
          </p>
        </div>
      </div>
    </div>
  );
}
