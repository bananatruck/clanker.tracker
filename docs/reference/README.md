# Reference

Images the interface was designed against. **Nothing here is used at runtime**
and nothing here is shipped in the extension.

They live outside `public/` deliberately: WXT copies that directory into the
bundle verbatim, so a design reference parked there was adding 150 kB to every
install for a picture nobody would ever see.

| File | What it is | Where it went |
|---|---|---|
| `pixel-art-gui.webp` | A free pixel-art RPG GUI pack — parchment panels in wooden frames, green title bars, slot grids | The whole `dq-window` / `dq-banner` / `dq-slot` vocabulary in `src/ui/tokens.css`, and the landing page |

**On the file itself:** it came from a pack distributed as free. "Free to use"
and "free to redistribute" are different permissions, and this repository has
not verified it holds the second one. It is kept because it is genuinely what
the theme was drawn from and a design decision with no visible source is a
design decision nobody can check — but if the pack's licence turns out to
forbid redistribution, this file goes and the link to the pack stays. Nothing
in the extension depends on it either way.
