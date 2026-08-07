/**
 * The act you are standing in, from the shared public art when it is present
 * and from the deterministic painter everywhere else.
 *
 * This is the single backdrop seam for the whole application. The battle,
 * title card, act strip and dashboard all use it, so installed art cannot be
 * visible in one part of the game while another silently keeps drawing the
 * fallback.
 */
import { useEffect, useRef, useState } from 'react';
import { BACKDROP_H, BACKDROP_W, drawBackdrop } from '@/lib/game/backdrop';
import { BACKDROPS } from '@/lib/game/atlas';
import { assetUrl, loadSheet } from '@/lib/game/assets';
import type { Tier } from '@/lib/game/economy';

export default function Backdrop({ tier, className = '' }: { tier: Tier; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void loadSheet(BACKDROPS[tier]).then((sheet) => live && setInstalled(sheet !== null));
    return () => {
      live = false;
    };
  }, [tier]);

  useEffect(() => {
    if (installed === true) return;
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawBackdrop(ctx, tier);
  }, [tier, installed]);

  if (installed) {
    return (
      <img
        src={assetUrl(BACKDROPS[tier])}
        alt=""
        aria-hidden
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <canvas
      ref={canvas}
      width={BACKDROP_W}
      height={BACKDROP_H}
      aria-hidden
      className={`h-full w-full object-cover ${className}`}
      style={{ imageRendering: 'pixelated', objectFit: 'cover' }}
    />
  );
}
