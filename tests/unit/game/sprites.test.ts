/**
 * Sprites are hand-authored text, which means a stray character or a row of
 * the wrong length is a plausible edit rather than an impossible one — and
 * both fail silently at render time as a hole in a character's face.
 */
import { describe, expect, it } from 'vitest';
import { PALETTE, SPRITES, SPRITE_SIZE, spritePixels, spriteToAscii } from '@/lib/game/sprites';

const ids = Object.keys(SPRITES);

describe('sprite data', () => {
  it.each(ids)('%s is exactly 16 rows of 16 pixels', (id) => {
    const def = SPRITES[id]!;
    expect(def.rows).toHaveLength(SPRITE_SIZE);
    for (const row of def.rows) expect(row).toHaveLength(SPRITE_SIZE);
  });

  it.each(ids)('%s uses only characters the palette defines', (id) => {
    for (const row of SPRITES[id]!.rows) {
      for (const char of row) {
        expect(Object.hasOwn(PALETTE, char), `unknown pixel "${char}" in ${id}`).toBe(true);
      }
    }
  });

  it.each(ids)('%s is not blank', (id) => {
    expect(spritePixels(id).some((p) => p !== null)).toBe(true);
  });

  it('carries the whole cast the storyboard needs', () => {
    // cast.md names these; a missing one means a panel cannot be drawn.
    for (const id of ['khlaude', 'pawn', 'child', 'chudlord', 'pigking', 'tower']) {
      expect(ids).toContain(id);
    }
  });

  it('gives the Chud Lord a wave, the frame cast.md calls the most important', () => {
    expect(SPRITES['chudlord-wave']).toBeDefined();
    // It must differ from his standing frame, or the ending shows nothing.
    expect(SPRITES['chudlord-wave']!.rows).not.toEqual(SPRITES['chudlord']!.rows);
  });

  it('gives Kh. Laude a sponsored variant for tier Devastator', () => {
    expect(SPRITES['khlaude-sponsored']!.rows).not.toEqual(SPRITES['khlaude']!.rows);
  });

  it('returns one colour per pixel, transparent where the sprite is empty', () => {
    const pixels = spritePixels('khlaude');
    expect(pixels).toHaveLength(SPRITE_SIZE * SPRITE_SIZE);
    expect(pixels[0]).toBeNull(); // top-left corner is empty on every sprite
  });

  it('returns nothing for an id that does not exist', () => {
    expect(spritePixels('no-such-sprite')).toEqual([]);
    expect(spriteToAscii('no-such-sprite')).toBe('');
  });
});
