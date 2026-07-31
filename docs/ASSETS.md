# Asset provenance

Every bundled asset, its source, and its licence. Chrome Web Store review asks for this, and a public repo needs it to be auditable.

**Rule for the bundled default theme: CC0 only.** No attribution obligations, no share-alike, no ambiguity.

## Bundled

| Asset set | Source | Licence | Used for |
|---|---|---|---|
| **Tiny Swords** (free pack) | [pixelfrog-assets.itch.io/tiny-swords](https://pixelfrog-assets.itch.io/tiny-swords) | **CC0 1.0** | Visual backbone. Knight/pawn units, houses, defense towers, castles, terrain tiles, decorations, UI frames. 64×64. |
| **8-Directional Knight** | Hormelz (itch.io, CC0 tag) | **CC0 1.0** | Chud Lord, companion archetype variants |
| **Holy Knights Sprite Pack** | itch.io, CC0 tag | **CC0 1.0** | Additional companion units |
| **Kenney UI / Particle / Audio packs** | [kenney.nl](https://kenney.nl) | **CC0 1.0** | Overlay chrome, particle atlases, pixel fonts, impact/collapse/fanfare SFX |

Crediting is not required by CC0. It is recorded here anyway because these packs are good and the authors deserve it.

## Original work

Authored for this project, MIT alongside the code:

- The Tower (King Net And Yahoo's seat)
- The Glorious Beautiful Orange Capitalist Pig King
- New Data Centre tileset — racks, cooling fins, status LEDs
- All recolors into the Obsidian palette

## Explicitly excluded

| Not used | Why |
|---|---|
| **OpenGameArt LPC** | CC-BY-SA 3.0 / GPL — attribution **and** share-alike. Viral licensing on a distributed extension isn't worth it. |
| **Tiny Swords Enemy Pack** | Paid. Not needed — the targets in this game are houses, villages and terrain, all in the free pack. |
| Ripped sprites from commercial games (Spriters Resource, Bulbagarden, etc.) | Copyrighted. See theme packs below. |

## Theme packs

The extension ships a `.clank` theme loader. Packs are **data-only** — sprites, palette, atlas, lore strings, no executable content — which Manifest V3 requires regardless.

Third-party themes are **imported by the user from local disk**. They are not bundled with the extension, not hosted by this project, and not distributed through the Chrome Web Store listing. Pack authors are responsible for the licensing of their own art.

## Verification

`pnpm assets:verify` checks every file under `public/themes/default/` against the SHA manifest in `assets.lock.json` and fails if anything is unaccounted for.
