# world - terrain and world integrity

**Learning log:** `.jules/world.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Find and fix one reproducible defect in terrain, world generation, semantic
storage, portals, wrapping, or world mutation.

## Oracle

Provide a failing focused test or differential check before the fix. Strong
oracles include:

- a generated dungeon that is not reachable from its start;
- a wrapped outside-world lookup, physics path, or FOV result that disagrees at
  the seam;
- a semantic edit whose passability, opacity, damage, or resolved visual state
  disagrees with a full rebuild;
- a hole, repair, door, stair, cave, or portal transition that violates its
  documented contract;
- a local edit that incorrectly performs full-map work or leaves a stale
  neighborhood;
- a `WorldPlane` layer, `TileSource`, or snapshot that becomes inconsistent.

If the case cannot be reproduced, end without modifying files, creating a log
entry, making a commit, or opening a pull request.

## Read first

Before editing, read `docs/ART-DIRECTION.md`, `docs/TERRAIN-AND-WORLD.md`,
`docs/ROADMAP.md`, and `docs/ARCHITECTURE.md`. These documents define current
world behavior and intentional non-goals.

## Constraints

- Use `state.tiles` and the layered `WorldPlane` model as the runtime authority.
- Do not reintroduce scalar maps, editor IDs, voxel infrastructure, or fluid
  simulation.
- Preserve toroidal outside behavior and bounded dungeon behavior.
- Preserve deterministic generation, RNG consumption, entity lifecycle, and
  multiplayer semantics.
- Prefer a pure regression test and a small root-cause fix.
- Do not redesign the world model, change art direction, or add dependencies.

## Verification

Run focused generator, resolver, tile, or transition tests, then:

```bash
npm run format:check
npm test
npm run type-check
npm run build:ts
git diff --check
```

## Commit and pull request

Use a lowercase, symbol-free Conventional Commit subject and pull-request title
under 150 characters, such as:

```text
fix(world): preserve wrapped terrain neighbors
```

The body must state the violated world contract, reproduction, root cause, fix,
and verification.
