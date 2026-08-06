# Asset provenance

Every bundled asset, its source, and its licence. Chrome Web Store review asks for this, and a public repo needs it to be auditable.

## What actually ships

**Nothing third-party.** Every sprite in the extension is original work, authored as pixel data in [`src/lib/game/sprites.ts`](../src/lib/game/sprites.ts) and MIT alongside the code.

| Asset | Form | Licence |
|---|---|---|
| All character, building and terrain sprites | 32×32 palette-indexed text in `src/lib/game/sprites.ts` | **MIT**, original |
| `docs/demo/*.png` | README screenshots captured from the running extension | **MIT**, original |

Sprites are data rather than image files for two reasons:

1. **Licensing is settled by construction.** There is no third-party provenance to audit, nothing to justify at store review, and no dependency on an upstream pack staying available.
2. **They stay legible.** A 32×32 sprite is thirty-two lines of text in a diff. Recolouring a faction or fixing a stray pixel is an edit, not a round-trip through an image editor and a binary blob in git.

`SPRITES` in that file is the seam the loader falls back to. Everything below describes how to put something else in front of it.

---

## Bring your own art

The game reads sprite sheets and backdrops out of **`public/Sprites/`**, which is **gitignored**. Nothing you put there is committed or pushed by this repo, and a fresh clone has none of it — every actor falls back to the pixel sprites above and the extension works completely.

That split is deliberate. Whether a given file may sit on your disk is a question about you and whoever owns it; whether this repo redistributes it is a question about this repo, and the answer to that one is no. Ripped sheets from a commercial game are copyrighted by their publisher no matter which fan site is hosting them, and a public repo plus a Web Store listing are both places a rightsholder can reach.

### How it works

There is **no build step and no frame table**. Sheets from this era are laid out on transparency with a gutter between frames, so [`lib/game/sheet.ts`](../src/lib/game/sheet.ts) finds the frames by scanning the sheet's own alpha — a row of fully transparent pixels is a row boundary, a column of them is a frame boundary. Two projections, no configuration, and it re-derives itself whenever you change a file.

[`lib/game/atlas.ts`](../src/lib/game/atlas.ts) is the only thing you edit: it maps a part to a filename, an animation row, and a span of frames within that row. Indices clamp, so a substituted sheet with fewer rows draws the wrong-looking frame rather than crashing a render loop.

| Part | What it needs |
|---|---|
| `khlaude-walk` | An overworld walk cycle, front-facing |
| `khlaude-battle` | A large back-facing battle pose — conventionally the **last** row of a sheet, which is why the atlas addresses it as row `-1` |
| `chudlord`, `pigking` | Any two enemy sheets |
| `ENCOUNTERS[0..4]` | Five enemies, easiest first. Which one you meet is the count of **required gaps** in the scan, so the monster is a picture of the evidence table |
| `BACKDROPS[tier]` | Five full-frame images, one per act. Any aspect ratio; they are cropped to fill |

Files with no transparency slice to a single frame covering the whole image, which is exactly what a backdrop is — so both kinds of file go through one code path.

### Checking it took

`pnpm build` copies `public/` into the bundle; `pnpm shots` photographs the result. If the Crusade tab still shows pixel sprites on a flat navy field, the loader got `null` — the file is missing, the path in the atlas does not match what is on disk, or the browser refused to decode it.

## Candidates, if bundled art is ever wanted

Still the right shortlist, and still **CC0 only** — no attribution obligations, no share-alike, no ambiguity.

| Asset set | Source | Licence |
|---|---|---|
| **Tiny Swords** (free pack) | [pixelfrog-assets.itch.io/tiny-swords](https://pixelfrog-assets.itch.io/tiny-swords) | CC0 1.0 |
| **8-Directional Knight** | Hormelz (itch.io, CC0 tag) | CC0 1.0 |
| **Kenney UI / Particle / Audio packs** | [kenney.nl](https://kenney.nl) | CC0 1.0 |

## Explicitly excluded

| Not used | Why |
|---|---|
| **OpenGameArt LPC** | CC-BY-SA 3.0 / GPL — attribution **and** share-alike. Viral licensing on a distributed extension isn't worth it. |
| **Ripped sprites from commercial games** (Spriters Resource, Bulbagarden, etc.) | Copyrighted by their publishers, whichever fan site is hosting them — a game-specific page on a rip site is rips, not fan art. They can sit in your gitignored `public/Sprites/` and the game will use them; they do not enter this repo. |

## Theme packs

**Dropped.** The `.clank` loader and the third-party theme store are not part of the extension. The visual language is one thing, shipped whole, rather than a substrate for art nobody here has licensed.
