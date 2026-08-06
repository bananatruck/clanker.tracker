/**
 * A character on screen, animated, from whichever art is actually installed.
 *
 * Draws to a canvas rather than positioning a background-image, because the
 * frames are found at runtime and have different widths — a CSS sprite strip
 * assumes a uniform grid, and rips are not a uniform grid.
 *
 * Falls back to the built-in pixel sprite with no visible seam: same box, same
 * baseline, same alignment. The scene above it does not know which it got.
 */
import { useEffect, useRef, useState } from 'react';
import { framesFor, loadSheet, type LoadedSheet } from '@/lib/game/assets';
import type { ActorArt } from '@/lib/game/atlas';
import Sprite from './Sprite';

export default function Actor({
  art,
  /** Multiplies the atlas height. 1 is the size the scene was designed at. */
  scale = 1,
  /** Pauses the animation on its first frame — for a defeated or waiting actor. */
  still = false,
  className = '',
  label,
}: {
  art: ActorArt;
  scale?: number;
  still?: boolean;
  className?: string;
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sheet, setSheet] = useState<LoadedSheet | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadSheet(art.file).then((s) => live && setSheet(s));
    return () => {
      live = false;
    };
  }, [art.file]);

  useEffect(() => {
    if (!sheet) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;

    const frames = framesFor(sheet, art);
    if (frames.length === 0) return;

    // The canvas is sized to the widest frame so a wide pose (a raised sword,
    // a thrown cape) is not clipped by a narrow one, and every frame is drawn
    // centred in that box so the character does not jitter sideways.
    const width = Math.max(...frames.map((f) => f.w));
    const height = Math.max(...frames.map((f) => f.h));
    canvas.current!.width = width;
    canvas.current!.height = height;

    let raf = 0;
    let index = 0;
    let last = 0;
    const step = 1000 / art.fps;

    const draw = (now: number) => {
      if (!still && now - last >= step) {
        index = (index + 1) % frames.length;
        last = now;
      }

      const f = frames[still ? 0 : index]!;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      // Bottom-aligned: these characters stand on a floor, and centring them
      // vertically makes a tall pose float.
      ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, (width - f.w) / 2, height - f.h, f.w, f.h);

      if (!still) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sheet, art, still]);

  if (sheet === undefined) {
    // Reserve the space while the sheet decodes, or the scene reflows under
    // the player the moment it arrives.
    return <div style={{ height: art.height * scale }} className={className} aria-hidden />;
  }

  if (sheet === null) {
    // The built-in sprites are one frame each, so the animation has to come
    // from outside them. A two-pixel bob is the cheapest thing that makes a
    // standing character read as alive rather than as a decal, and it costs
    // nothing to author for every sprite at once.
    return (
      <div className={className}>
        <div className={still ? undefined : 'dq-idle'} role="img" aria-label={label}>
          <Sprite id={art.fallback} scale={Math.max(1, Math.round((art.height * scale) / 32))} />
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className={className}
      style={{
        height: art.height * scale,
        width: 'auto',
        imageRendering: 'pixelated',
        transform: art.flip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
