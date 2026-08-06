/**
 * The act you are standing in, painted to a canvas.
 *
 * Drawn at 192×120 and stretched with smoothing off, which is the whole trick:
 * the browser scales it with nearest-neighbour, so a 4-pixel cloud stays a
 * 4-pixel cloud instead of becoming a soft grey smear. Any other scaling mode
 * turns pixel art into a blurry photograph of pixel art.
 *
 * It draws once per act and never again — the scene is deterministic, so there
 * is nothing to animate and nothing to invalidate.
 */
import { useEffect, useRef } from 'react';
import { BACKDROP_H, BACKDROP_W, drawBackdrop } from '@/lib/game/backdrop';
import type { Tier } from '@/lib/game/economy';

export default function Backdrop({ tier, className = '' }: { tier: Tier; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawBackdrop(ctx, tier);
  }, [tier]);

  return (
    <canvas
      ref={canvas}
      width={BACKDROP_W}
      height={BACKDROP_H}
      aria-hidden
      className={`h-full w-full ${className}`}
      style={{ imageRendering: 'pixelated', objectFit: 'cover' }}
    />
  );
}
