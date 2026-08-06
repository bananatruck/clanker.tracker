# Asset provenance

Every bundled asset, its source, and its licence. Chrome Web Store review asks for this, and a public repo needs it to be auditable.

## What actually ships

**Nothing third-party.** Every sprite in the extension is original work, authored as pixel data in [`src/lib/game/sprites.ts`](../src/lib/game/sprites.ts) and MIT alongside the code.

| Asset | Form | Licence |
|---|---|---|
| All character, building and terrain sprites | 16×16 palette-indexed text in `src/lib/game/sprites.ts` | **MIT**, original |
| `docs/demo/*.png` | README screenshots captured from the running extension | **MIT**, original |

Sprites are data rather than image files for two reasons:

1. **Licensing is settled by construction.** There is no third-party provenance to audit, nothing to justify at store review, and no dependency on an upstream pack staying available.
2. **They stay legible.** A 16×16 sprite is sixteen lines of text in a diff. Recolouring a faction or fixing a stray pixel is an edit, not a round-trip through an image editor and a binary blob in git.

`SPRITES` in that file is the seam for replacing any of them with real spritesheet art later — the renderer only asks for pixels, so nothing else changes.

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
| **Ripped sprites from commercial games** (Spriters Resource, Bulbagarden, etc.) | Copyrighted by their publishers. A public repo and a Web Store listing are both places a rightsholder can reach, and the look they provide is reachable without them — the sprites here are Dragon Quest *inspired*, drawn from scratch. |

## Theme packs

**Dropped.** The `.clank` loader and the third-party theme store are not part of the extension. The visual language is one thing, shipped whole, rather than a substrate for art nobody here has licensed.
