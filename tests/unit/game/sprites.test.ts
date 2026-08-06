/**
 * Sprites are hand-authored text, which means a stray character or a row of
 * the wrong length is a plausible edit rather than an impossible one — and
 * both fail silently at render time as a hole in a character's face.
 */
import { describe, expect, it } from 'vitest';
import { PALETTE, SPRITES, SPRITE_SIZE, spritePixels, spriteToAscii } from '@/lib/game/sprites';

const ids = Object.keys(SPRITES);

describe('sprite data', () => {
  it.each(ids)('%s is exactly SPRITE_SIZE rows of SPRITE_SIZE pixels', (id) => {
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

/**
 * The rules that make twelve separate drawings look like one set.
 *
 * These are the things that were wrong before and would be easy to get wrong
 * again — an edit that breaks one of them does not throw, it just quietly
 * makes the game look assembled from parts.
 */
describe('sprite coherence', () => {
  const CONTOUR = 'o';
  const SHADOW = 'z';

  const at = (id: string, x: number, y: number) => SPRITES[id]!.rows[y]![x]!;

  it.each(ids)('%s carries a closed one-pixel contour', (id) => {
    // Every empty pixel touching the drawing must be the contour colour. This
    // is what a silhouette *is*, and it is the rule the 16x16 set broke by
    // outlining interior shapes until the outline was most of the character.
    // The ground shadow is the deliberate exemption: it sits outside the
    // silhouette on purpose, which is why it has its own palette entry.
    for (let y = 0; y < SPRITE_SIZE; y++) {
      for (let x = 0; x < SPRITE_SIZE; x++) {
        if (at(id, x, y) !== '.') continue;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SPRITE_SIZE || ny >= SPRITE_SIZE) continue;
          const neighbour = at(id, nx, ny);
          if (neighbour === '.' || neighbour === CONTOUR || neighbour === SHADOW) continue;
          expect.fail(`${id}: bare edge at ${x},${y} — "${neighbour}" with no contour`);
        }
      }
    }
  });

  it('stands the whole cast on one ground line', () => {
    // A character floating two pixels above another is the single most
    // visible way a set stops looking like one world, and it is invisible in
    // a diff.
    const lowest = (id: string) =>
      SPRITES[id]!.rows.reduce((low, row, y) => (row.includes(SHADOW) ? y : low), -1);

    const cast = ['khlaude', 'khlaude-sponsored', 'pawn', 'child', 'chudlord', 'chudlord-wave', 'pigking'];
    const lines = new Set(cast.map(lowest));
    expect([...lines]).toHaveLength(1);
    expect([...lines][0]).toBeGreaterThan(0);
  });

  it('gives every character a shadow and every building none', () => {
    const has = (id: string) => SPRITES[id]!.rows.some((row) => row.includes(SHADOW));
    for (const id of ['khlaude', 'pawn', 'child', 'chudlord', 'pigking']) {
      expect(has(id), `${id} should have a ground shadow`).toBe(true);
    }
    // Buildings sit on their own footing — a cast shadow under one would read
    // as a game piece rather than a place.
    for (const id of ['tower', 'house', 'rubble', 'datacentre', 'citadel']) {
      expect(has(id), `${id} should not have a ground shadow`).toBe(false);
    }
  });

  it('keeps every colour inside a three-tone ramp', () => {
    // No sprite may introduce a colour the palette does not already carry, and
    // the palette itself must stay a set of ramps rather than a paintbox.
    const used = new Set<string>();
    for (const id of ids) for (const row of SPRITES[id]!.rows) for (const ch of row) used.add(ch);

    expect(used.has(CONTOUR)).toBe(true);
    for (const ch of used) expect(Object.hasOwn(PALETTE, ch)).toBe(true);
    // 36 entries: ten three-tone ramps, plus transparent, contour, white,
    // eyes, an LED core and the shadow. Adding a colour outside a ramp is how
    // a palette stops being a palette, so it has to be a deliberate edit here.
    expect(Object.keys(PALETTE)).toHaveLength(36);
  });
});
