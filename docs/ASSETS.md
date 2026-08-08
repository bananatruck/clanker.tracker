# Asset provenance

Every bundled asset, its source, and its licence. Chrome Web Store review asks for this, and a public repo needs it to be auditable.

## What builds from this tree ship

Extension bundles built from this tree contain the original fallback art authored as pixel data in
[`src/lib/game/sprites.ts`](../src/lib/game/sprites.ts), plus the project crest. Both ship under
the repository's MIT licence.

| Asset | Form | Licence |
|---|---|---|
| All character, building and terrain sprites | 32×32 palette-indexed text in `src/lib/game/sprites.ts` | **MIT**, original |
| clanker.tracker extension crest | Transparent pixel PNGs in `public/icons/` | **MIT**, project-owned AI-generated asset |

The crest's editable generated source and transparent master live in `docs/brand/`. The shipped
16, 32, 48 and 128px files are palette-reduced, hard-alpha derivatives tuned separately for
Chrome's toolbar and extension-management surfaces.

Sprites are data rather than image files for two reasons:

1. **Licensing is settled by construction.** There is no third-party provenance to audit, nothing to justify at store review, and no dependency on an upstream pack staying available.
2. **They stay legible.** A 32×32 sprite is thirty-two lines of text in a diff. Recolouring a faction or fixing a stray pixel is an edit, not a round-trip through an image editor and a binary blob in git.

`SPRITES` in that file is the seam the loader falls back to. Everything below describes how to put something else in front of it.

---

## Installed art in this working copy

The current `docs/demo/*.png` files were regenerated from this installed-art build. They are
documentation in the source tree, not runtime assets in the downloadable extension bundle.

The game reads sprite sheets, item icons and backdrops out of **`public/Sprites/`**, which is
**gitignored**. This working copy currently contains 421 files there. `pnpm build` copies them into
the local bundle and the application now uses them consistently across Scene, Title, Acts, the
dashboard, inventory, achievements, launcher and locally assembled landing page.

Their source and licence are not recorded in this repository. They therefore must be treated as
**local-only and not cleared for redistribution** until the owner supplies provenance. The newly
generated screenshots can also contain pixels from this pack, so those screenshots must not be
published under an MIT/original-art claim without the same review. A screenshot of copyrighted
art is still redistribution.

A fresh clone still has none of these files and falls back completely. To audit that path, run
`SHOTS_ART=procedural pnpm shots`.

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

`pnpm build` copies `public/` into the bundle; `pnpm shots` photographs that exact result by
default. If the Crusade tab still shows fallback sprites, the loader got `null` — the file is
missing, the path in the atlas does not match what is on disk, or the browser refused to decode it.

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
