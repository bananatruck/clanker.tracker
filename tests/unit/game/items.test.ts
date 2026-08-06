/**
 * The item mapping.
 *
 * This module names files it does not contain, which makes exactly one class
 * of bug possible and very easy to ship: a path that is subtly wrong. Nothing
 * throws — `Item` just quietly draws an empty slot — so a typo in a directory
 * name would take out three hundred icons at once and look like "the art isn't
 * installed". These tests are the cheap half of that: shape, stability, and
 * coverage of the things that have to have an icon.
 */
import { describe, expect, it } from 'vitest';
import {
  MEDALS,
  STORY_ITEMS,
  WEAPONS,
  iconForSkill,
  item,
  storyItemsFor,
  sword,
  weaponFor,
} from '@/lib/game/items';
import { ACHIEVEMENTS } from '@/lib/game/achievements';

describe('paths', () => {
  it('points inside the art folder the atlas uses', () => {
    // Everything the loader resolves is relative to public/, and every other
    // art path in the project starts with this.
    expect(item('GoldCard')).toMatch(/^Sprites\//);
    expect(sword('Copper_Sword')).toMatch(/^Sprites\//);
  });

  it('ends every path in .png', () => {
    const all = [
      ...Object.values(MEDALS),
      ...STORY_ITEMS.map((i) => i.file),
      ...WEAPONS.map((w) => w.file),
    ];
    for (const path of all) expect(path, path).toMatch(/\.png$/);
  });

  it('never doubles a separator or leaves a blank segment', () => {
    for (const path of Object.values(MEDALS)) {
      expect(path, path).not.toMatch(/\/\//);
      expect(path.split('/').every((seg) => seg.length > 0), path).toBe(true);
    }
  });
});

describe('medals', () => {
  /**
   * The grid has a hole in it otherwise, and a hole reads as a bug rather than
   * as an achievement nobody drew an icon for.
   */
  it('covers every achievement', () => {
    for (const a of ACHIEVEMENTS) {
      expect(MEDALS[a.id], `no medal for "${a.id}"`).toBeDefined();
    }
  });

  it('has no medals for achievements that do not exist', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const id of Object.keys(MEDALS)) {
      expect(ids.has(id), `medal for unknown achievement "${id}"`).toBe(true);
    }
  });
});

describe('weapons', () => {
  it('starts at level 1, so there is never an empty hand', () => {
    expect(WEAPONS[0]!.from).toBe(1);
    expect(weaponFor(0).name).toBe('Copper Sword');
  });

  it('is ordered by level', () => {
    for (let i = 1; i < WEAPONS.length; i++) {
      expect(WEAPONS[i]!.from).toBeGreaterThan(WEAPONS[i - 1]!.from);
    }
  });

  it('carries the best one reached, not the one exactly matched', () => {
    expect(weaponFor(19).name).toBe('Iron Broadsword');
    expect(weaponFor(20).name).toBe('Fire Blade');
    expect(weaponFor(34).name).toBe('Fire Blade');
  });

  it('tops out rather than running off the end', () => {
    expect(weaponFor(999).name).toBe("Erdrick's Sword");
  });
});

describe('story items', () => {
  it('gives you something from the first level', () => {
    // Act 0 hands you the commission. An empty pack at level 1 would be a
    // beat the storyboard does not have.
    expect(storyItemsFor(1).length).toBeGreaterThan(0);
  });

  it('reveals as the acts turn, never hiding one you already had', () => {
    const levels = [1, 10, 20, 35, 50, 60];
    let previous = 0;
    for (const level of levels) {
      const count = storyItemsFor(level).length;
      expect(count, `level ${level}`).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it('has unique ids', () => {
    const ids = STORY_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes a note on every one', () => {
    // An item with no line is a decoration, and decorations do not go in a
    // pack that is supposed to be the story.
    for (const i of STORY_ITEMS) expect(i.note.trim().length, i.id).toBeGreaterThan(0);
  });
});

describe('iconForSkill', () => {
  it('is stable for the same skill', () => {
    expect(iconForSkill('PostgreSQL')).toBe(iconForSkill('PostgreSQL'));
  });

  it('ignores case and surrounding space', () => {
    expect(iconForSkill('  postgresql ')).toBe(iconForSkill('PostgreSQL'));
  });

  it('gives different skills different icons, mostly', () => {
    // Not a guarantee — the list is finite and collisions are fine. What
    // would be wrong is every skill landing on one icon.
    const skills = ['Go', 'Python', 'Kafka', 'Terraform', 'Docker', 'Redis', 'gRPC', 'CI/CD'];
    const icons = new Set(skills.map(iconForSkill));
    expect(icons.size).toBeGreaterThan(4);
  });

  it('always returns a path', () => {
    for (const skill of ['', 'x', 'a very long skill name indeed', '日本語']) {
      expect(iconForSkill(skill)).toMatch(/^Sprites\/.+\.png$/);
    }
  });
});
