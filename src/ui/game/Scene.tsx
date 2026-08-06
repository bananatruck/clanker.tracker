/**
 * The battle screen.
 *
 * Composed the way Dragon Quest composes one, because that composition is
 * doing work rather than being a reference: the ground you are standing on
 * fills the frame, the thing you are fighting is above you and facing you, you
 * are below it with your back to the camera, and the game speaks in a window
 * across the bottom. Nothing is labelled and you know where everything is.
 *
 * The five backdrops are the five acts. Applying at Squire happens in a green
 * meadow; by Warlord the same screen is the dust of a town already taken. The
 * crusade is never narrated in this component — the floor just keeps changing
 * under it, which is the whole point of the story.
 *
 * Degrades completely: with no art installed it draws the pixel sprites on the
 * field colour and every other part of the screen is identical.
 */
import { useEffect, useState } from 'react';
import { BACKDROPS, BACKDROP_SHADE, type ActorArt } from '@/lib/game/atlas';
import { assetUrl, loadSheet } from '@/lib/game/assets';
import type { Tier } from '@/lib/game/economy';
import Actor from '@/ui/Actor';
import Backdrop from '@/ui/game/Backdrop';

export interface SceneProps {
  tier: Tier;
  /** The hero. Always present; this is his crusade. */
  hero: ActorArt;
  /** What is in front of him, when anything is. */
  foe?: ActorArt | null;
  /** Name on the dialogue tab. Omit for narration with no speaker. */
  speaker?: string;
  /** One line, from the storyboard. Never written at the call site. */
  line?: string;
  /** Where the panel's own controls go — the command window, bottom left. */
  children?: React.ReactNode;
  /**
   * Something drawn over the whole frame — the encounter transition, and so
   * far only that. It lives here rather than at the call site because it has
   * to cover the backdrop and the actors, and only this component owns the box
   * they are positioned inside.
   */
  overlay?: React.ReactNode;
  /** Taller frames for a full page; the side panel gets the short one. */
  size?: 'panel' | 'page';
}

const HEIGHT = { panel: 320, page: 460 } as const;

export default function Scene({
  tier,
  hero,
  foe,
  speaker,
  line,
  children,
  overlay,
  size = 'panel',
}: SceneProps) {
  const backdrop = BACKDROPS[tier];
  const [ready, setReady] = useState<boolean | null>(null);

  // Probing the backdrop before painting it avoids the flash of a broken
  // image on an install with no art, which is the common case.
  useEffect(() => {
    let live = true;
    void loadSheet(backdrop).then((s) => live && setReady(s !== null));
    return () => {
      live = false;
    };
  }, [backdrop]);

  return (
    <div
      className="dq-window relative overflow-hidden"
      style={{ height: HEIGHT[size] }}
      data-scene={tier}
    >
      {ready ? (
        <>
          <img
            src={assetUrl(backdrop)}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: BACKDROP_SHADE[tier] }}
            aria-hidden
          />
        </>
      ) : (
        // No art installed — the common case, and a fresh clone's only case.
        // The act is drawn instead, which is a whole scene rather than a
        // degraded one: same five floors, same story told by the ground.
        // No tint over this one. `BACKDROP_SHADE` exists to drag a photograph
        // down to where a command window stays readable over it; these palettes
        // were chosen against that window in the first place, so the same tint
        // would only be throwing away contrast that was put there on purpose.
        <div className="absolute inset-0" aria-hidden>
          <Backdrop tier={tier} />
        </div>
      )}

      {/* The foe, upper third, facing down at you. */}
      {foe && (
        <div className="absolute inset-x-0 flex justify-center" style={{ top: '4%' }}>
          <Actor art={foe} scale={size === 'page' ? 1 : 0.62} label="The posting" />
        </div>
      )}

      {/* Kh. Laude, from behind, standing between you and it. */}
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: '30%' }}>
        <Actor art={hero} scale={size === 'page' ? 0.95 : 0.58} label="Sir Khums Alaude" />
      </div>

      {/* The command window sits over the scene, as it does in the game. */}
      {children && <div className="absolute bottom-2 left-2 z-10">{children}</div>}

      {line && <Speech speaker={speaker} line={line} />}

      {overlay}
    </div>
  );
}

/**
 * The dialogue window.
 *
 * The speaker's name rides on a tab above the box, which is how Dragon Quest
 * draws it and which is why you never have to read the line to know who is
 * talking. Set in the serif, because the game's voice and the tool's voice
 * should not look the same.
 */
export function Speech({ speaker, line }: { speaker?: string; line: string }) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-20">
      {speaker && (
        <div className="dq-window inline-block px-2.5 py-0.5">
          <span className="dq-speech text-[14px] font-semibold text-gold">{speaker}</span>
        </div>
      )}
      {/* Slightly translucent so the scene shows through, but nowhere near
          enough to cost the text its contrast — the line has to be readable
          over a bright meadow and a dark ruin alike. */}
      <div className="dq-window px-3 py-2" style={{ background: 'rgba(242, 227, 192, 0.94)' }}>
        <p className="dq-speech text-parchment">{line}</p>
      </div>
    </div>
  );
}
