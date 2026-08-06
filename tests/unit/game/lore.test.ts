/**
 * The storyboard is canonical.
 *
 * `storyboard/storyboard.md` says it outright: "If a lore string exists in the
 * game and not here, it is a bug." This test is that sentence, enforced — it
 * reads the author's storyboard off disk and checks every shipped string is
 * in it, verbatim. Rewording a line of the story to suit the code now fails
 * the build, which is the correct direction for that pressure to run.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACT_0, ACTS, ENDING, BARKS, beatsForLevel, fanfareAllowed, barkFor } from '@/lib/game/lore';
import { TIERS } from '@/lib/game/economy';

// Vitest runs from the repo root; import.meta.url is not a file URL after transform.
const storyboard = readFileSync(resolve(process.cwd(), 'storyboard/storyboard.md'), 'utf8');

const ALL_BEATS = [...ACT_0, ...ACTS, ...ENDING];

describe('lore is transcribed from the storyboard', () => {
  it.each(ALL_BEATS.map((b) => [b.id, b.copy] as const))(
    'panel %i copy appears verbatim in storyboard.md',
    (_id, copy) => {
      expect(storyboard).toContain(copy);
    },
  );

  it.each(
    TIERS.map((t) => t.tier).flatMap((tier) => BARKS[tier].map((bark) => [tier, bark] as const)),
  )('%s bark %s appears verbatim in storyboard.md', (_tier, bark) => {
    expect(storyboard).toContain(bark);
  });

  it('gives the Ascendant no barks at all, because the act is silent', () => {
    expect(BARKS.ascendant).toHaveLength(0);
    expect(barkFor('ascendant')).toBeNull();
  });

  it('uses every panel id exactly once', () => {
    const ids = ALL_BEATS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('beat triggers', () => {
  it('opens the crusade at level 1 with the burning hamlet', () => {
    expect(beatsForLevel(1).map((b) => b.id)).toEqual([100]);
  });

  it("fires the Chud Lord's letter at Warlord", () => {
    expect(beatsForLevel(20).map((b) => b.id)).toEqual([300]);
  });

  it('has nothing to say at a level with no beat', () => {
    expect(beatsForLevel(2)).toEqual([]);
  });

  it('lands every level beat on a level the economy can reach', () => {
    for (const beat of ACTS) {
      if (beat.trigger.kind !== 'level') continue;
      expect(beat.trigger.level).toBeGreaterThan(0);
      expect(beat.trigger.level).toBeLessThanOrEqual(60);
    }
  });
});

describe('the silence from Act V', () => {
  it('allows fanfare below level 50', () => {
    expect(fanfareAllowed(49)).toBe(true);
  });

  it('cuts fanfare from level 50, where the storyboard cuts it', () => {
    expect(fanfareAllowed(50)).toBe(false);
    expect(fanfareAllowed(60)).toBe(false);
  });
});
