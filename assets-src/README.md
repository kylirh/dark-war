# Dark War authoring sources

This directory owns committed art and map-authoring sources. Runtime assets are
generated under `app/assets/`.

Read these in order before making art:

1. [`docs/ART-DIRECTION.md`](../docs/ART-DIRECTION.md) — canonical mood, color,
   rendering, character, environment, and AI-art rules.
2. [`STYLE.md`](STYLE.md) — compact Aseprite production checklist.
3. [`docs/TERRAIN-AND-WORLD.md`](../docs/TERRAIN-AND-WORLD.md) — semantic world,
   terrain, elevation, and authoring architecture.

Source types:

- `.aseprite` — reviewed pixel art, palettes, layers, tags, slices, and pivots.
- `.tsj` — Tiled tileset and Wang/terrain metadata.
- `.tmj` — Tiled semantic maps and prefab stamps.
- `palettes/` — importable working palettes.
- `references/` — direction boards and mood references, never production tiles.

Never use an editor tile ID or atlas coordinate as gameplay identity. Authoring
files use stable semantic keys documented in
`docs/prototypes/TERRAIN-SLICE.md`; the asset compiler will generate compact
runtime IDs and validate references.

`assets/dark-war.aseprite` predates this directory and remains in place until
the Aseprite export pipeline is implemented. Its art is legacy source, not the
approved visual target; replace or split it in playable asset-family increments.
