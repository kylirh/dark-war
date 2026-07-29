# Dark War authoring sources

This directory owns committed art and map-authoring sources. Runtime assets are
generated under `app/assets/`.

Read these in order before making art:

1. [`docs/ART-DIRECTION.md`](../docs/ART-DIRECTION.md) — canonical mood, color,
   rendering, character, environment, and AI-art rules.
2. [`STYLE.md`](STYLE.md) — compact Aseprite production checklist.
3. [`docs/TERRAIN-AND-WORLD.md`](../docs/TERRAIN-AND-WORLD.md) — semantic world,
   terrain, elevation, and authoring architecture.
4. [`PREFABS.md`](PREFABS.md) — exact Tiled map, layer, marker, and transform
   contract.

Source types:

- `.aseprite` — reviewed pixel art, palettes, layers, tags, slices, and pivots.
- `.tsj` — Tiled tileset and Wang/terrain metadata.
- `.tmj` — Tiled semantic maps and prefab stamps.
- `palettes/` — importable working palettes.
- `references/` — direction boards and mood references, never production tiles.

Never use an editor tile ID or atlas coordinate as gameplay identity. Authoring
files use stable semantic keys documented in
`docs/prototypes/TERRAIN-SLICE.md`; `npm run gen:visual-assets` generates the
runtime manifests and validates image bounds, semantic families, masks, Wang
metadata, semantic prefab layers, transforms, requirements, and markers.

`legacy/dark-war.aseprite` is retained only as a recovery/reference source. It
is disabled in `assets.json` and is not the approved visual target. Add new
Aseprite family sources to `assets.json` with committed PNG/JSON destinations;
the compiler exports active sources when `aseprite` is on `PATH` or `ASEPRITE`
points to the executable. Replace the legacy source in playable family-sized
increments.

The standard authoring loop is:

1. Edit an active `.aseprite` source and/or `.tsj` in this directory.
2. Run `npm run gen:visual-assets`.
3. Review `app/assets/img/sprites.png` and
   `app/assets/data/visual-manifest.json`; prefab changes also regenerate
   `src/generated/semantic-prefabs.json`.
4. Run `npm test` before committing source and generated output together.
