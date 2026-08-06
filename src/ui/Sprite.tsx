/**
 * Drawing a sprite.
 *
 * Canvas rather than an <img>: the pixel data is already in memory, so
 * encoding it to a data URI only to have the browser decode it again would be
 * work for nothing. `imageSmoothingEnabled = false` plus the CSS
 * `image-rendering: pixelated` is what keeps a 16px sprite crisp at 4x —
 * without both, the browser blurs it and the whole look collapses.
 */
import { useEffect, useRef } from 'react';
import { SPRITE_SIZE, SPRITES, spritePixels } from '@/lib/game/sprites';

export default function Sprite({
  id,
  scale = 3,
  className = '',
  title,
}: {
  id: string;
  scale?: number;
  className?: string;
  title?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    const pixels = spritePixels(id);
    for (let i = 0; i < pixels.length; i++) {
      const colour = pixels[i];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(i % SPRITE_SIZE, Math.floor(i / SPRITE_SIZE), 1, 1);
    }
  }, [id]);

  return (
    <canvas
      ref={canvas}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      title={title ?? SPRITES[id]?.label}
      aria-label={SPRITES[id]?.label}
      role="img"
      className={className}
      style={{
        width: SPRITE_SIZE * scale,
        height: SPRITE_SIZE * scale,
        imageRendering: 'pixelated',
      }}
    />
  );
}
