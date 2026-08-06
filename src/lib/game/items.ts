/**
 * The item icons, put to work.
 *
 * The art folder carries several hundred item icons and the game was using
 * none of them — it had four characters, five encounters and five backdrops
 * mapped, and everything else in there sat unread. This is the mapping that
 * fixes that: medals for the deeds of note, a weapon that changes with the
 * act, the story items the cast actually carries, and an inventory where every
 * skill off your resume is a thing you are holding.
 *
 * Like lib/game/atlas.ts, **this is a mapping and not art**. It names files;
 * it does not contain them. Nothing here is loadable without the folder, and
 * everything here degrades to the built-in sprites without it — see
 * lib/game/assets.ts and ui/game/Item.tsx.
 *
 * Two rules keep it from turning into decoration:
 *
 *   1. **An icon is a claim about the thing it labels.** The abacus is on the
 *      achievement about applications that cost nothing, the sealed letters
 *      are on the one about somebody finally replying. Picking icons for how
 *      they look produces a grid that means nothing.
 *   2. **The same input always gets the same icon.** A skill that changes its
 *      picture between renders is noise; the picker is a hash, not a shuffle.
 */

const ITEMS = 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Items - Item Icons';
const SWORDS = 'Sprites/PC _ Computer - Dragon Quest I and II HD-2D Remake - Items - Swords';

/** Path to an item icon, by bare name. */
export const item = (name: string): string => `${ITEMS}/${name}.png`;

/** Path to a sword, by bare name. */
export const sword = (name: string): string => `${SWORDS}/${name}.png`;

/* --------------------------------------------------------------- medals */

/**
 * A medal per deed of note.
 *
 * Chosen for what the achievement is about rather than for looking impressive,
 * which is why the flashiest icons are not on the easiest ones: the abacus
 * beats a greatsword on the achievement about counting, because the
 * achievement is about counting.
 */
export const MEDALS: Record<string, string> = {
  // The first application. A sword that has already been used once.
  'first-blood': item('Broken_Sword'),
  // Five applications, one level. The kit a squire is actually issued.
  squire: item('Bronze_Shield'),
  // Ten fills that cost nothing. An abacus, for the arithmetic.
  'free-ten': item('Astraeas_Abacus'),
  // Somebody on the other end read it. Letters, sealed and delivered.
  'first-reply': item('BottleLetters'),
  // An interview. One river dried.
  river: item('CleanWater'),
  // Twenty distinct companies. Breadth is a map, not a pile.
  breadth: item('AdventurersMap1'),
  // Seven consecutive days. A bell you ring every morning.
  streak: item('BanishingBell'),
  // A hundred applications, counted honestly.
  'count-them': item('Astraeas_Abacus'),
  // Warlord. Now the greatsword.
  warlord: item('Bastard_Sword'),
  // Volume with the model bill still at zero.
  throughput: item('GoldCard'),
  // The Citadel. The sword you are not supposed to be able to get.
  citadel: item('ErdricksSword2'),
  // The Adoption. A crown, because that is the ending.
  adoption: item('GoldCirclet'),
};

/** The medal for an achievement, or null to fall back to its sprite. */
export const medalFor = (id: string): string | null => MEDALS[id] ?? null;

/* -------------------------------------------------------------- weapons */

/**
 * What Kh. Laude is carrying, by act.
 *
 * A progression that is *not* earned and is not a reward — it tracks the act,
 * which tracks the level, which tracks the applications. It is the one place
 * the game lets you look more powerful over time, and the joke is that the
 * sword gets better exactly as the thing you are doing with it gets worse.
 */
export interface Weapon {
  /** Level from which it is carried. */
  from: number;
  name: string;
  file: string;
}

export const WEAPONS: readonly Weapon[] = [
  { from: 1, name: 'Copper Sword', file: sword('Copper_Sword') },
  { from: 10, name: 'Iron Broadsword', file: sword('Bastard_Sword') },
  { from: 20, name: 'Fire Blade', file: sword('Fire_Blade') },
  { from: 35, name: 'Dragonsbane', file: sword('Dragonsbane') },
  { from: 50, name: 'Massacre Sword', file: sword('MassacreSword') },
  { from: 60, name: "Erdrick's Sword", file: sword('ErdricksSword') },
];

export function weaponFor(level: number): Weapon {
  let held = WEAPONS[0]!;
  for (const w of WEAPONS) if (level >= w.from) held = w;
  return held;
}

/* ----------------------------------------------------------- story items */

/**
 * What is in the pack, and what put it there.
 *
 * Every one is a beat from the storyboard rather than a pickup: the drawing
 * survives the rubble in Act II, the proclamation is what you were handed at
 * the start, and the stipend is the reason you took the commission. They
 * appear when the beat that produced them has happened, and none of them does
 * anything. That is the point of them.
 */
export interface StoryItem {
  id: string;
  name: string;
  file: string;
  /** One line. From the beat, not invented at the call site. */
  note: string;
  /** Level at which the beat that produces it has happened. */
  from: number;
}

export const STORY_ITEMS: readonly StoryItem[] = [
  {
    id: 'proclamation',
    name: 'The Proclamation',
    file: item('GalScroll'),
    note: 'The commission. It uses the word “dynasty” eleven times.',
    from: 1,
  },
  {
    id: 'stipend',
    name: 'The Stipend',
    file: item('GoldCard'),
    note: 'Why you took it. It has not been increased.',
    from: 1,
  },
  {
    id: 'drawing',
    name: "A Chilled Ren's Drawing",
    file: item('AdventurersMap2'),
    note: 'It survived the rubble. You did not put it down.',
    from: 10,
  },
  {
    id: 'ledger',
    name: 'The Ledger',
    file: item('Astraeas_Abacus'),
    note: 'Every home, every village, every river. In your own handwriting.',
    from: 20,
  },
  {
    id: 'floodgate',
    name: 'The Floodgate Key',
    file: item('FloodgateKey'),
    note: 'The river did not dry by itself.',
    from: 35,
  },
  {
    id: 'badge',
    name: 'The Badge',
    file: item('GoldCirclet'),
    note: 'Crown, badge, dental. You are inside now.',
    from: 50,
  },
];

export const storyItemsFor = (level: number): StoryItem[] =>
  STORY_ITEMS.filter((i) => level >= i.from);

/* ---------------------------------------------------------------- skills */

/**
 * Icons a skill can be handed, chosen so the grid reads as a kit.
 *
 * Weapons, armour and tools, and nothing consumable — a skill you have is not
 * a herb you use up. Kept as an explicit list rather than a directory scan
 * because the folder is not in this repository and a mapping that depends on
 * what happens to be on disk is a mapping that breaks differently on every
 * machine.
 */
const SKILL_ICONS: readonly string[] = [
  'Iron_Armour',
  'Bronze_Shield',
  'GreatHelm',
  'Golden_Claws',
  'Boomerang',
  'Battleaxe',
  'Bamboolance',
  'Magic_Key',
  'Echo_Flute',
  'Prayer_Ring',
  'RingOfClarity',
  'Sages_Stone',
  'Silver_Shield',
  'WarriorHelmet',
  'Flame_Shield',
  'GoldBracer',
  'DragonShield',
  'Full_Plate_Armour',
  'Assassins_Dagger',
  'Metal_Wing_Boomerang',
  'Rune_Staff',
  'Silk_Robe',
  'Mirror_Shield',
  'Knuckledusters',
].map(item);

/**
 * A stable icon for a skill.
 *
 * FNV-1a over the lowercased name. Any hash would do; what matters is that it
 * is a function of the skill and nothing else, so "PostgreSQL" is the same
 * object every time you open the tab, on every machine, forever.
 */
export function iconForSkill(skill: string): string {
  let hash = 0x811c9dc5;
  const key = skill.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return SKILL_ICONS[hash % SKILL_ICONS.length]!;
}
