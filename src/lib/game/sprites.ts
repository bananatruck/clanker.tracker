/**
 * Sprites, authored as pixel data rather than shipped as image files.
 *
 * Two reasons this is data and not a spritesheet:
 *
 *   1. **Licensing is settled by construction.** These are original work,
 *      MIT alongside the code, with no third-party provenance to audit and
 *      nothing to justify to store review. The CC0 packs named in
 *      docs/ASSETS.md can replace any of these later — the manifest below is
 *      the seam for exactly that — but nothing is blocked waiting for art.
 *   2. **It stays legible.** A sprite is N lines of text in a diff.
 *      Recolouring a faction or fixing a stray pixel is an edit, not a
 *      round-trip through an image editor and a binary blob in git.
 *
 * Format: one character per pixel, indexed into PALETTE. `.` is transparent.
 * Every sprite is 32x32 so the renderer never has to ask.
 *
 * ## What makes the set read as one world
 *
 * Coherence here is not a matter of drawing well, it is a matter of drawing to
 * the same rules, and there are four:
 *
 *   - **One contour.** Every sprite carries a single-pixel `o` silhouette and
 *     no interior black. The previous set outlined every internal shape, which
 *     at 16px left the outline occupying most of the character.
 *   - **One light source, upper left.** Each material is a three-tone ramp
 *     (light / base / shadow) and the shadow tone always falls on the right.
 *   - **One skeleton.** Humanoids share a head box, a shoulder line, a hem and
 *     a ground line, so the cast stands on the same floor at the same scale.
 *   - **One palette.** Nothing introduces a colour outside the ramps below.
 */

export const SPRITE_SIZE = 32;

/**
 * The shared palette: three tones per material, plus a single contour colour.
 *
 * Deliberately small and deliberately shared. Units drawn from one palette
 * read as one world, which is most of what makes a set of sprites look drawn
 * by one hand rather than assembled from several.
 */
export const PALETTE: Record<string, string | null> = {
  '.': null, // transparent
  o: '#0a0d1c', // contour — the silhouette, and nothing else

  1: '#ffd9a8', // skin
  2: '#f0b47e',
  3: '#b87a4e',

  4: '#dfe6fa', // steel
  5: '#98a4cc',
  6: '#59638f',

  7: '#3a53c8', // cloth blue — the crusade's colour
  8: '#24379a',
  9: '#141f5e',

  a: '#ffe98a', // gold — crowns, plumes, the things that matter
  b: '#ffc233',
  c: '#b07d1e',

  d: '#e6584f', // red — roof tile, banner, sponsor patch
  e: '#b12f2c',
  f: '#6d1a1a',

  g: '#c08a52', // wood and peasant cloth
  h: '#8a5a2b',
  i: '#553416',

  j: '#ccd3e4', // stone
  k: '#98a1bc',
  l: '#5d6684',

  m: '#ffb45c', // orange — the Pig King, who is orange
  n: '#f07d18',
  p: '#a34c05',

  q: '#86e070', // green — grass, and a status LED that is nominal
  r: '#3f9440',
  s: '#235c28',

  t: '#4b5268', // chassis — data centres and the Chud Lord's plate
  u: '#333a4d',
  v: '#1a1f2b',

  w: '#ffffff',
  x: '#1b2340', // eyes
  y: '#6ef0d0', // LED core
  z: '#0d1330', // the ground shadow — the one thing outside the silhouette
};

export interface SpriteDef {
  id: string;
  /** What this is, for the manifest and for anyone replacing it. */
  label: string;
  rows: readonly string[];
}

/**
 * Sir Khums Alaude. A knight of no particular distinction.
 *
 * Gold plume, blue surcoat, and a helm that stops at the brow — a hero whose
 * face you never see is a silhouette, and the storyboard needs him readable.
 * From tier Devastator a sponsor logo appears on the chest, panel 402; that
 * variant is `khlaude-sponsored`.
 */
const KHLAUDE: readonly string[] = [
  '..............oooo..............',
  '.............oaabbo.............',
  '.............oabbbo.............',
  '.............obbbbo.............',
  '...........ooobbbboo............',
  '..........o445555555o...........',
  '..........o5555555555o..........',
  '.........o555555555555o.........',
  '.........o255555555553o.........',
  '.........o566666666666o.........',
  '.........o552222222266o.........',
  '.........o552xx22xx266o.........',
  '.........o552xx22xx266o.........',
  '.........o552222222366o.........',
  '.........o5o22233233o6o.........',
  '.......oo.o.o222233o.o.oo.......',
  '......o55o.o66666666o.o66o......',
  '.....o5555oo66666666oo6666o.....',
  '.....o5555oo78888899oo6666o.....',
  '.....o5555o7888888899o6666o.....',
  '.....o55557888888888996666o.....',
  '.....o55557888888888996666o.....',
  '.....o55557888888888996666o.....',
  '.....o55557888888888996666o.....',
  '.....o4444bbbbbaabbbbb5555o.....',
  '.....o4444cccccccccccc5555o.....',
  '.....o4444o6666oo6666o5555o.....',
  '......ooooo6666oo6666ooooo......',
  '..........o6666oo6666o..........',
  '.........o4444zzzzz444o.........',
  '.......zzzzzzzzzzzzzzzzzzz......',
  '..............zzzzz.............',
];

/** The same knight, with the sponsor patch. Storyboard panel 402. */
const KHLAUDE_SPONSORED: readonly string[] = [
  '..............oooo..............',
  '.............oaabbo.............',
  '.............oabbbo.............',
  '.............obbbbo.............',
  '...........ooobbbboo............',
  '..........o445555555o...........',
  '..........o5555555555o..........',
  '.........o555555555555o.........',
  '.........o255555555553o.........',
  '.........o566666666666o.........',
  '.........o552222222266o.........',
  '.........o552xx22xx266o.........',
  '.........o552xx22xx266o.........',
  '.........o552222222366o.........',
  '.........o5o22233233o6o.........',
  '.......oo.o.o222233o.o.oo.......',
  '......o55o.o66666666o.o66o......',
  '.....o5555oo66666666oo6666o.....',
  '.....o5555oo78888899oo6666o.....',
  '.....o5555o788eeeee99o6666o.....',
  '.....o5555788edwwwde996666o.....',
  '.....o5555788eewwwee996666o.....',
  '.....o55557888eeeee8996666o.....',
  '.....o55557888888888996666o.....',
  '.....o4444bbbbbaabbbbb5555o.....',
  '.....o4444cccccccccccc5555o.....',
  '.....o4444o6666oo6666o5555o.....',
  '......ooooo6666oo6666ooooo......',
  '..........o6666oo6666o..........',
  '.........o4444zzzzz444o.........',
  '.......zzzzzzzzzzzzzzzzzzz......',
  '..............zzzzz.............',
];

/**
 * Poo R. PeePole. Unarmed, and the storyboard is clear that they do not fight
 * back — so there is no attack frame for this sprite and there should not be.
 * Bare arms and bare feet: at side-panel size a figure in one brown tone
 * collapses into a blob, and skin is what keeps the silhouette a person.
 */
const PAWN: readonly string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '...........oooooooooo...........',
  '..........ohhhhhhhhhho..........',
  '..........oiiiiiiiiiio..........',
  '..........oiiiiiiiiiio..........',
  '.........o22iiiiiiii33o.........',
  '.........oi2222222223io.........',
  '.........o222222222233o.........',
  '.........o222xx22xx233o.........',
  '.........o222xx22xx233o.........',
  '..........o2222222233o..........',
  '...........o22233233o...........',
  '........oo..o222233o..oo........',
  '.......oggo..oooooo..ohho.......',
  '......oggggoooooooooohhhho......',
  '......oggggogggggghhohhhho......',
  '.......oggogggggggghhohho.......',
  '......o222gggggggggghh333o......',
  '......o222gggggggggghh333o......',
  '......o222gggggggggghh333o......',
  '......o222iiiiiiiiiiii333o......',
  '......o222ogggggggghho333o......',
  '......o222oogggggghhoo333o......',
  '......o222oiiiiooiiiio333o......',
  '.......ooooiiiiooiiiioooo.......',
  '..........oiiiiooiiiio..........',
  '.........o22222zzz2222o.........',
  '........zzzzzzzzzzzzzzzzz.......',
  '...............zzz..............',
];

/**
 * A Chilled Ren. Drawn short rather than scaled down: the head stays the adult
 * head size and the body loses rows, which is the whole trick to reading a
 * pixel figure as a child.
 */
const CHILD: readonly string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...........oooooooooo...........',
  '..........ohhhhhhhhhho..........',
  '..........oiiiiiiiiiio..........',
  '..........oiiiiiiiiiio..........',
  '.........o22iiiiiiii33o.........',
  '.........o222222222233o.........',
  '.........o222xx22xx233o.........',
  '.........o222xx22xx233o.........',
  '..........o2222222233o..........',
  '...........o22233233o...........',
  '............o222233o............',
  '.............oooooo.............',
  '........ooo.ogggghho.ooo........',
  '.......o222ogggggghho333o.......',
  '.......o222gggggggghh333o.......',
  '.......o222gggggggghh333o.......',
  '.......o222iiiiiiiiii333o.......',
  '.......o222oogggghhoo333o.......',
  '........ooooiiiooiiioooo........',
  '...........oiiiooiiio...........',
  '...........oiiiooiiio...........',
  '..........o2222zzz333o..........',
  '.........zzzzzzzzzzzzzzz........',
  '...............zzz..............',
];

/**
 * The Chud Lord of Unemployment. Cast as the arch-villain and the last line of
 * defence — half a head taller than the knight and twice as broad, horned, and
 * with two red slits where a face would be.
 *
 * Standing square and unarmed. cast.md is explicit that the wave, not an
 * attack, is his important frame.
 */
const CHUDLORD: readonly string[] = [
  '................................',
  '.......o................o.......',
  '......ojo..............oko......',
  '......ojjo..oooooooo..okko......',
  '......ojjo.ottuuvvvvo.okko......',
  '......ojjoottuuuuvvvvookko......',
  '......ojjjttuuuuuuvvvvkkko......',
  '.......oottuuuuuuuuvvvvoo.......',
  '........ottuuuuuuuuvvvvo........',
  '........ottuuuuuuuuvvvvo........',
  '........ottuuuuuuuuvvvvo........',
  '........otuedeeuuedeevvo........',
  '........otueeeeuueeeevvo........',
  '.........ottuuuuuuvvvvo.........',
  '..........ottuuuuvvvvo..........',
  '..........ovvvvvvvvvvo..........',
  '...........oooooooooo...........',
  '....oooo..otuuuuuuuvvo..oooo....',
  '...ouuuuootuuuuuuuuuvvoovvvvo...',
  '...ouuuuotuuuttttttuuvvovvvvo...',
  '...ouuuutuuuttttttttuuvvvvvvo...',
  '...ouuuutuuttttttttttuvvvvvvo...',
  '...ouuuutuuuttttttttuuvvvvvvo...',
  '...ouuuuvvvvvvvvvvvvvvvvvvvvo...',
  '...ouuuuvvvvvvvvvvvvvvvvvvvvo...',
  '..otttttootuuuuuuuuuvvoottttto..',
  '..ottttto.otuuuuuuuvvo.ottttto..',
  '..otttttoovvvvvoovvvvvoottttto..',
  '...ooooo.ovvvvvoovvvvvo.ooooo...',
  '........otttttzzzzztttto........',
  '.....zzzzzzzzzzzzzzzzzzzzzzz....',
  '..............zzzzz.............',
];

/**
 * The same figure, waving, hand raised above the horns.
 *
 * cast.md calls this the single most important frame in the game, which is why
 * it reads at 32px without a caption.
 */
const CHUDLORD_WAVE: readonly string[] = [
  '................................',
  '.......o................o.......',
  '......ojo..............okoo.....',
  '......ojjo..oooooooo..okktto....',
  '......ojjo.ottuuvvvvo.oktttto...',
  '......ojjoottuuuuvvvvootttttto..',
  '......ojjjttuuuuuuvvvvktttttto..',
  '.......oottuuuuuuuuvvvvotttto...',
  '........ottuuuuuuuuvvvvouttuo...',
  '........ottuuuuuuuuvvvvouuuuo...',
  '........ottuuuuuuuuvvvvouuuuo...',
  '........otuedeeuuedeevvouuuuo...',
  '........otueeeeuueeeevvouuuuo...',
  '.........ottuuuuuuvvvvoouuuuo...',
  '..........ottuuuuvvvvo.ouuuuo...',
  '..........ovvvvvvvvvvo.ouuuuo...',
  '...........oooooooooo..ouuuuo...',
  '....oooo..otuuuuuuuvvo.ouuuuo...',
  '...ouuuuootuuuuuuuuuvvoouuuuo...',
  '...ouuuuotuuuttttttuuvvooooo....',
  '...ouuuutuuuttttttttuuvvo.......',
  '...ouuuutuuttttttttttuvvo.......',
  '...ouuuutuuuttttttttuuvvo.......',
  '...ouuuuvvvvvvvvvvvvvvvvo.......',
  '...ouuuuvvvvvvvvvvvvvvvvo.......',
  '..otttttootuuuuuuuuuvvoo........',
  '..ottttto.otuuuuuuuvvo..........',
  '..otttttoovvvvvoovvvvvo.........',
  '...ooooo.ovvvvvoovvvvvo.........',
  '........otttttzzzzztttto........',
  '.....zzzzzzzzzzzzzzzzzzzzzzz....',
  '..............zzzzz.............',
];

/**
 * The Glorious Beautiful Orange Capitalist Pig King. Fat, orange, crowned.
 *
 * The belly is the joke, so it has to read as a body rather than a shape: arms
 * cut away from it with a keyline, a belt across it, trotters under it.
 */
const PIGKING: readonly string[] = [
  '.........o..o..o..o..o..........',
  '........oaooaooaooaooao.........',
  '........obooboobooboobo.........',
  '........obbbbbbbbbbbbbbo........',
  '........obbbbbbbbbbbbbbo........',
  '........occcccccccccccco........',
  '.........ooommnnppppooo.........',
  '.......oooommnnnnppppoooo.......',
  '......ommnnnnnnnnnpppppppo......',
  '.....ommnnnnnnnnnnnpppppppo.....',
  '.....ommnnpxxmnnnppxxpppppo.....',
  '.....ommnnpxxmnnnppxxpppppo.....',
  '......ommnnnnnnnnnpppppppo......',
  '.......oooomnnmmmmnppoooo.......',
  '.........omnnmpmmpmnppo.........',
  '.........omnnmmmmmmnppo.........',
  '..........omnnmmmmnppo..........',
  '..........oommnnppppoo..........',
  '....o....oppppppppppppo....o....',
  '...ono.oomnnnnnnnnnnnppoo.opo...',
  '..onnnoomnnnnnnnnnnnnnppoopppo..',
  '.onnnnnonnnnnnnnnnnnnnnpopppppo.',
  '.onnnnnonnnnnccccccnnnnnopppppo.',
  '.onnnnnobbbbbcaaaacbbbbbopppppo.',
  '.onnnnnobbbbbcaaaacbbbbbopppppo.',
  '..onnnoomnnnnccccccnnnppoopppo..',
  '...onoooomnnnnnnnnnnnppoooopo...',
  '....o..o.omnnnnnnnnnppo.o..o....',
  '........opppppoooopppppo........',
  '........opppppzzzzzppppo........',
  '....zzzzzzzzzzzzzzzzzzzzzzzzz...',
  '..............zzzzz.............',
];

/**
 * The Tower. King Net And Yahoo's seat, always on the horizon and never
 * closer. One window lit, because he never comes down.
 */
const TOWER: readonly string[] = [
  '................................',
  '.........oo.oo.oo.oo.oo.........',
  '........okkokkokkokkokko........',
  '........okkokkokkokkokko........',
  '........okkkkkkkkkkkkkko........',
  '........ollllllllllllllo........',
  '........ojkkkkkkkkkkkllo........',
  '........ojkkkkkbbkkkkllo........',
  '........ojkkkkbaabkkkllo........',
  '........olllllbaablllllo........',
  '........ojkkkkbaabkkkllo........',
  '........ojkklkkbbkklkllo........',
  '........ojkkkkkkkkkkkllo........',
  '........ollllllllllllllo........',
  '........ojkkkkkkkkkkkllo........',
  '........ojkklkkkkkklkllo........',
  '........ojkkkkkkkkkkkllo........',
  '........ollllllllllllllo........',
  '........ojkkkkkkkkkkkllo........',
  '........ojkklkkkkkklkllo........',
  '........ojkkkkkkkkkkkllo........',
  '........ollllllllllllllo........',
  '........ojkkkkkkkkkkkllo........',
  '........ojkklkkkkkklkllo........',
  '........ojkkkkkkkkkkkllo........',
  '.......oolllllllllllllloo.......',
  '......ojkkkkkkkvvvkkkkkllo......',
  '......ojkkkkkkvvvvvkkkkllo......',
  '......ojkkkkkkvvvvvkkkkllo......',
  '......ojkkkkkkvvvvvkkkkllo......',
  '......ojkkkkkkvvvvvkkkkllo......',
  '.......oooooooooooooooooo.......',
];

/** A family home. Razed from tier 1 onward — two per application. */
const HOUSE: readonly string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...............ooo..............',
  '.............oodeeo.............',
  '............oedeeeeoo...........',
  '..........oodeeeeeeeeo..........',
  '.........oedeeeeeeeeeeoo........',
  '.......oodeeeeeeeeeeeeeeo.......',
  '......oedeeeeeeeeeeeeeeeeoo.....',
  '....oodeeeeeeeeeeeeeeeeeeeeo....',
  '...oedeeeeeeeeeeeeeeeeeeeeeeoo..',
  '..odeeeeeeeeeeeeeeeeeeeeeeeeeeo.',
  '..offfffffffffffffffffffffffffo.',
  '...oghhhhhhhhhhhhhhhhhhhhhiioo..',
  '...oghhhhhhhhhhhhhhhhhhhhhiio...',
  '...oghhbbbhhhhiiiihhhhccchiio...',
  '...oghbaaabhhiiiiiihhccccciio...',
  '...oghbaaabhhiiiiiihhccccciio...',
  '...oghbaaabhhiiiiiihhccccciio...',
  '...oghhbbbhhhiiiibihhhccchiio...',
  '...oghhhhhhhhiiiiiihhhhhhhiio...',
  '...oghhhhhhhhhiiiihhhhhhhhiio...',
  '..oooooooooooooooooooooooooooo..',
  '.oqqqqqqqqqqqqqqqqqqqqqqqqqqqqo.',
  '.orrrrrrrrrrrrrrrrrrrrrrrrrrrro.',
  '..oooooooooooooooooooooooooooo..',
];

/** A home already taken: a broken wall, a fallen beam, scattered stone. */
const RUBBLE: readonly string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '.......................oo.......',
  '......................oiho......',
  '....o.oo...o.........oiho.......',
  '...ogohhooogoo......oiho........',
  '...oghhhhhhhiio....oiho.........',
  '...oghhhhhhhiio...oiho..........',
  '...oghhhhhhhiio..oiho...........',
  '...oghhiihhhiio.oiho...ooo......',
  '...oghiiiihhiiooiho...olllo.....',
  '...oghiiiihhiioihoo...olllooo...',
  '...oghiiiihhiiihlllooooooolllo..',
  '...oghhiihhhiiholllolllo.olllo..',
  '..oooooooooooooooooolllooooooo..',
  '.orrrrrrrrrrrrrrrrrrrrrrrrrrrro.',
  '.osssssssssssssssssssssssssssso.',
  '..oooooooooooooooooooooooooooo..',
];

/**
 * A New Data Centre. Replaces cleared ground from tier Devastator, cooled by
 * the river you dried. The LEDs are nominal. They are always nominal.
 */
const DATACENTRE: readonly string[] = [
  '................................',
  '................................',
  '.....oooooooooooooooooooooo.....',
  '....otttttttttttttttttttttto....',
  '....otttttttttttttttttttttto....',
  '....otuuuuuuuuuuuuuuuuuuuvvo....',
  '....otuuuuuuuuuuuuuuuuuuuvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuvttttttttttttvvyqvvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuuuuuuuuuuuuuuuuuuuvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuvttttttttttttvvyqvvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuuuuuuuuuuuuuuuuuuuvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuvttttttttttttvvyqvvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuuuuuuuuuuuuuuuuuuuvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuvttttttttttttvvyqvvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuuuuuuuuuuuuuuuuuuuvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuvttttttttttttvvyqvvvo....',
  '....otuvvvvvvvvvvvvvvvvvvvvo....',
  '....otuuuuuuuuuuuuuuuuuuuvvo....',
  '...ootuuuuuuuuuuuuuuuuuuuvvoo...',
  '..ollllllllllllllllllllllllllo..',
  '..ollllllllllllllllllllllllllo..',
  '...oooooooooooooooooooooooooo...',
  '................................',
];

/** The Citadel. Reachable at level 60, and not takeable without an offer. */
const CITADEL: readonly string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..oo.oo.oo.............oo.oo.oo.',
  '.okkokkokko...........okkokkokko',
  '.okkokkokko...........okkokkokko',
  '.okkkkklkko...........okkkkklkko',
  '.olllllllo............olllllllo.',
  '.ojkkkkllo............ojkkkkllo.',
  '.ojkkkkllo.oo.oo.oo.ooojkkkkllo.',
  '.ojkvvklkkokkokkokkokkokkkvvllo.',
  '.ojkvvklkkokkokkokkokkokkkvvllo.',
  '.ojkvvkkkkkkkkkkkkkkkkkkkkvvllo.',
  '.ojkvvkkllllllllllllllllkkvvllo.',
  '.ojkkkkkkkkkkkkkkkkkkkkkkkkkllo.',
  '.ojkkkkkkkkkkkkkkkkkkkkkkkkkllo.',
  '.ojkkkkkkkkkkkkcckkkkkkkkkkkllo.',
  '.ojkvvkkkkkkkkcbbckkkkkkkkvvllo.',
  '.ojkvvkkkkkkkcbbbbckkkkkkkvvllo.',
  '.ojkvvkkkkkkcbbcabbckkkkkkvvllo.',
  '.ojkvvkkkkkkcbccacbckkkkkkvvllo.',
  '.ojkkkkkkkkkcbccacbckkkkkkkkllo.',
  '.ojkkkkkkkkkcbccacbckkkkkkkkllo.',
  '.ojkkkkkkkkkcbccacbckkkkkkkkllo.',
  '.ojkkkkkkkkkcbccacbckkkkkkkkllo.',
  '.ojkkkkkkkkkkbccacbkkkkkkkkkllo.',
  '.ojkkkkkkkkkkkccackkkkkkkkkkllo.',
  '.ojkkkkkkkkkkkkcakkkkkkkkkkkllo.',
  '..oooooooooooooooooooooooooooo..',
  '................................',
];

export const SPRITES: Record<string, SpriteDef> = {
  khlaude: { id: 'khlaude', label: 'Sir Khums Alaude', rows: KHLAUDE },
  'khlaude-sponsored': {
    id: 'khlaude-sponsored',
    label: 'Kh. Laude, sponsored',
    rows: KHLAUDE_SPONSORED,
  },
  pawn: { id: 'pawn', label: 'Poo R. PeePole', rows: PAWN },
  child: { id: 'child', label: 'A Chilled Ren', rows: CHILD },
  chudlord: { id: 'chudlord', label: 'The Chud Lord of Unemployment', rows: CHUDLORD },
  'chudlord-wave': { id: 'chudlord-wave', label: 'The Chud Lord, waving', rows: CHUDLORD_WAVE },
  pigking: {
    id: 'pigking',
    label: 'The Glorious Beautiful Orange Capitalist Pig King',
    rows: PIGKING,
  },
  tower: { id: 'tower', label: 'The Tower', rows: TOWER },
  house: { id: 'house', label: 'A family home', rows: HOUSE },
  rubble: { id: 'rubble', label: 'Rubble', rows: RUBBLE },
  datacentre: { id: 'datacentre', label: 'A New Data Centre', rows: DATACENTRE },
  citadel: { id: 'citadel', label: 'The Citadel', rows: CITADEL },
};

/** Every pixel of a sprite as a colour, row-major, null where transparent. */
export function spritePixels(id: string): Array<string | null> {
  const def = SPRITES[id];
  if (!def) return [];

  const out: Array<string | null> = [];
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const row = def.rows[y] ?? '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      out.push(PALETTE[row[x] ?? '.'] ?? null);
    }
  }
  return out;
}

/**
 * Render a sprite as text. Used by the tests to assert the data is well-formed
 * without a canvas, and genuinely useful for eyeballing an edit in a terminal.
 */
export function spriteToAscii(id: string, on = '#', off = ' '): string {
  const def = SPRITES[id];
  if (!def) return '';
  return def.rows.map((row) => [...row].map((c) => (c === '.' ? off : on)).join('')).join('\n');
}
