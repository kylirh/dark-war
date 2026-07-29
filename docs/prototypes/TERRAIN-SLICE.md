# Terrain Slice Specification

This is the fixed acceptance scene for Milestones 0 and 1 of
`docs/ROADMAP.md`. It is a development fixture, not a production level. Keep its
semantic layout stable while comparing art and resolver approaches.

## Purpose

The slice must answer four questions with pixels and measurements:

1. Does discrete elevation read clearly in Dark War's top-down style?
2. Which resolver family minimizes art cost without producing bad junctions?
3. Can ground, water, cliffs, vegetation, structures, and portals compose?
4. Can a local edit update visuals with bounded work?

## Running the current slice

```bash
npm run dev:terrain
```

For the browser development build, run `npm run dev:web` and open
`http://localhost:5174/?skipTitle=1&terrainPrototype=1`.

The current implementation lives in
`src/engine/systems/terrain/terrain-prototype.ts`. It uses aligned typed arrays
owned by the production `WorldPlane` for ground, structure, fixture, signed
elevation, and damage. `WorldPlane` is the canonical `TileSource`; its generated
scalar collision projection temporarily connects the fixture to remaining
physics and pathfinding consumers. The normal outside and dungeon generators are
unchanged.

Press `[` to lower the marked test cell and `]` to raise its neighboring test
cell. The edited cell is highlighted in warm gold; the rest of the reclassified
3×3 dependency area is highlighted in mint. The story log reports the before
and after elevation and the exact number of visual cells resolved. Press `\` to
switch between the 47-blob shoreline and the 16-state dual-grid comparison.

The generated direction boards under
`assets-src/references/art-direction/` are mood, color, and shape references
only. They are not tilesheets, sources of gameplay identity, or exact rendering
targets. `docs/ART-DIRECTION.md` is authoritative when a board is ambiguous.

## Planes

### `prototype.outside/surface`

- Size: 40×30 cells.
- Bounded for repeatable inspection; wrap behavior is tested separately.
- Base ground: `ground.grass` at elevation `0`.
- Terraces: broad regions at elevations `2`, `5`, and `8`.
- Tall escarpment: a local boundary from `0` to `12`; it must use bounded visual
  work rather than twelve face sprites.
- Canyon: a visible floor at elevation `-4` connected by stairs or terraces.
- River: `ground.water.river` enters `ground.water.deep` lake cells.
- Shore: shallow-water cells separate ordinary walkable ground from deep water
  where the selected visual rules require them.
- Bridge: `structure.bridge.wood` crosses the river while preserving water below.
- Trees: `structure.tree.trunk` appears over grass; canopy is presentation.
- Cave mouth: portal fixture in an authored cliff boundary.
- Rebuilding vignette: a patched workshop/home, garden bed, construction crate,
  flowers, and repaired ruins test Dark War's hopeful material vocabulary.

Required topology cases:

- straight, convex, and concave cliff boundaries;
- cliff termination against water;
- three-material ground junction;
- river bend and river-to-lake transition;
- tree next to a cliff and shoreline;
- bridge ends meeting dry ground;
- stair opening through a cliff;
- tall drop next to an ordinary one-step terrace.

### `prototype.cave/entry`

- Size: 12×10 cells.
- Base ground: `ground.rock.floor`.
- Boundary: `structure.wall.rock`.
- One return portal to the outside cave mouth.
- No attempt to render the outside plane behind or above the cave.

## Edit fixtures

The slice exposes two deterministic actions:

1. `lower-test-cell`: lower a marked surface cell by one elevation step.
2. `raise-test-cell`: raise a marked surface cell by one elevation step.

Each action records which semantic cells and resolved visual cells changed. The
resolver passes when the changed visual region remains within the declared rule
radius and all affected seams repair automatically.

## Semantic authoring keys

Authoring keys are lowercase dotted paths. They describe gameplay semantics, not
art variants. Numeric runtime IDs are generated; never hand-author or persist
them as external identity.

Initial prototype vocabulary:

```text
ground.void
ground.grass
ground.dirt
ground.rock
ground.rock.floor
ground.sand
ground.water.shallow
ground.water.deep
ground.water.river

structure.none
structure.wall.rock
structure.wall.concrete
structure.fence.metal
structure.tree.trunk
structure.bridge.wood
structure.door

fixture.none
fixture.stairs
fixture.cave-mouth
fixture.light
fixture.crate
fixture.garden-bed
fixture.construction-marker
```

Visual-only names belong in generated visual metadata and may be more specific,
for example `cliff.rock.face.tall` or `ground.grass.edge.ne`. They must map back
to semantic keys and must not enter authoritative world state.

## Art constraints

- 32×32 gameplay grid.
- Crisp pixel edges and integer-aligned source rectangles.
- Outline-free, cluster-based rendering with no universal black contour.
- Limited, vibrant role palette with deep teal/plum shadows and warm highlights.
- Consistent upper-left light direction and cool ambient shadow.
- Terrain remains legible under FOV dimming and combat effects.
- Cliff sets deliberately author top edges, faces, inner/outer corners, stairs,
  and shadows.
- Soft transitions may use alpha layers, but transparent combinations must be
  tested at three-material junctions.
- Tall objects may exceed one cell visually but retain clear gameplay footprints.
- The scene must read as cheerful rebuilding: cultivated land, playful color,
  repaired structures, and signs of ordinary life outweigh decay and weaponry.

## Measurements

Capture these once the slice renders in-engine:

- median and worst frame time with the fixed camera;
- number of displayed tile sprites;
- resolver calls on initial load;
- cells reclassified by each edit fixture;
- sprites recreated or retargeted by each edit;
- atlas texture switches;
- semantic-layer and resolved-cache memory.

Record measurements in this file with the commit and hardware used. Do not invent
performance thresholds before the first baseline; the invariant is bounded local
work and no material regression from the current fixed scene.

### Initial visual baseline — 2026-07-28

- Fixed data size: 40×30, or 1,200 cells.
- Semantic layer memory: 2,400-byte ground + 2,400-byte structure + 2,400-byte
  fixture + 2,400-byte elevation + 1,200-byte damage = 10,800 bytes. The former
  temporary scalar projection has since been removed.
- Logical elevations present: `-4`, `0`, `2`, `5`, `8`, and `12`.
- Tall-drop selection is constant-cost through `cliffMagnitudeForDrop`; a drop
  greater than one selects one authored tall-face sprite.
- Browser visual inspection passed without console errors. Ground repetition was
  reduced after the first render by adding deterministic variants and removing
  per-tile highlight bands.
- The initial resolved cache uses four aligned 1,200-byte arrays: ground
  variant, cliff magnitude, cliff edge mask, and transition mask (4,800 bytes
  total).
- Each raise/lower action mutates one semantic cell and reclassifies a clipped
  radius-one neighborhood: 9 cells in the fixture, with no full-map visual or
  collision rebuild.
- Browser interaction verified both edit controls and their `8 → 7` / `8 → 9`
  story telemetry without console warnings or errors.
- The resolver harness proves all 47 canonical blob masks and all 16 dual-grid
  masks, and can render either over identical semantic water without changing
  ground or collision data.
- A camera-visible irregular pond exposed the practical tradeoff: dual-grid is
  economical and pleasantly soft for non-blocking ground blends, but shifts a
  water boundary half a cell and complicates bridge/fixture overlap. Blob/mixed
  Wang preserves the exact blocking shoreline and composes cleanly with the
  bridge. The diagnostic overlay uses composed edge/corner pieces, avoiding a
  requirement for 47 monolithic sprites.
- Frame-time, sprite-retarget, and atlas-switch measurements remain pending.

## Acceptance checklist

- [ ] Elevation reads without UI explanation.
- [ ] Inner and outer cliff corners are unambiguous.
- [x] Tall cliffs have constant-bounded rendering cost.
- [x] Static water, river, pond, and bridge compose in the fixed scene through
      the selected blob/mixed-Wang shoreline family.
- [x] Trees retain ground underneath them.
- [x] Raising/lowering repairs nearby visuals without a full-map pass.
- [ ] Cave entry moves between planes without simultaneous plane rendering.
- [ ] The scene satisfies the review checklist in `docs/ART-DIRECTION.md`.
- [ ] Resolver-family decisions are recorded below.

## Resolver decisions

Fill this table after the visual comparison rather than assuming one global
autotiler.

| Family       | Candidates                        | Selected | Evidence                                                                     |
| ------------ | --------------------------------- | -------- | ---------------------------------------------------------------------------- |
| Soft ground  | corner/dual-grid, blob            | selected | Dual-grid's 16 states minimize art and suit non-blocking painterly blends.   |
| Walls/fences | four-cardinal                     | pending  | pending                                                                      |
| Shorelines   | mixed Wang, blob                  | selected | Blob keeps visual and blocking boundaries aligned and preserves bridges.     |
| Roads/rivers | directional edges                 | pending  | pending                                                                      |
| Cliffs       | elevation topology + authored set | selected | Arbitrary drops collapse to step/tall visuals; a one-cell edit resolves 3×3. |
| Decoration   | deterministic hash                | selected | Stable variants are cached once and remain unchanged outside dirty cells.    |
