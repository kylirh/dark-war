# Dark War Execution Roadmap

This is the canonical cross-branch roadmap. Every branch and coding agent should
use it together with `docs/TERRAIN-AND-WORLD.md`. Update milestone status and the
handoff ledger here when work lands. Do not create competing roadmap documents.
Visual work also follows `docs/ART-DIRECTION.md`.

Compatibility with unreleased saves, worlds, and network clients is not a goal.
Prefer the clean target design over migration scaffolding. Keep each branch
playable and validated, but allow deliberate save resets and protocol breaks.

## Status legend

- **NEXT** — approved next work; safe to pick up.
- **IN PROGRESS** — currently owned; coordinate before overlapping it.
- **PLANNED** — ordered but depends on earlier work.
- **DEFERRED** — intentionally outside the completed foundation program.
- **COMPLETE** — implemented and verified.

## Milestone 0 — Architecture record and slice specification

**Status: COMPLETE**

- Keep `docs/TERRAIN-AND-WORLD.md` authoritative.
- Specify the prototype scene and its semantic inputs.
- Establish naming conventions for semantic authoring keys.
- Define the baseline measurement protocol; capture measurements when the slice
  first renders in Milestone 1.

Exit: the slice can be built without reopening foundational architecture
questions.

## Milestone 1 — Isolated visual terrain slice

**Status: COMPLETE**

- Establish the cheerful rebuilding art direction, role palette, and repo-owned
  environment/character boards.
- Apply an initial palette and outline-removal pass to the legacy generated atlas
  so the playable game begins moving toward the target immediately.
- Author one cliff family, water edge, soft-ground blend, tree, bridge, stairs,
  and cave mouth.
- Render the fixed scene through a development-only resolver.
- Compare corner/dual-grid and blob/Wang approaches where they are candidates.
- Choose a resolver family per content category based on art cost and failure
  cases, not micro-performance.

Current prototype decision: use 16-state dual-grid transitions for soft,
non-blocking ground blends and canonical blob/mixed-Wang transitions for static
water shorelines. The runtime comparison remains available in the fixed scene
so authored art can be reevaluated without changing semantics.

Exit: the scene reads as the hopeful, outline-free Dark War direction, terrain
edits repair without seams, and tall drops do not scale draw work with height.

## Milestone 2 — Layered semantic storage

**Status: COMPLETE**

The production `WorldPlane` SoA container and centralized cell-semantics resolver
are implemented. Terrain-laboratory, dungeon, and outside levels use it
authoritatively. `GameState` and level snapshots no longer contain scalar maps.

The shared `GroundType`, `StructureType`, and `FixtureType` vocabulary now
classifies every current `TileType`, preserves meaningful bases such as grass
under trees and sidewalk under lights, and provides a tested conversion boundary
for existing procedural generators.

The outside generator now emits an authoritative `WorldPlane`. Runtime door,
building, mining, destruction, hole, repair, and damage mutations use one
canonical helper that updates semantic layers and physics invalidation. Depth
snapshots retain the same outside plane. Persistence and netcode serialize that
plane directly.

Dungeon generation now also converts immediately into authoritative layered
storage, including wall/door structures and stair fixtures. Fresh gameplay and
in-memory depth snapshots therefore use `WorldPlane` on every ordinary level.
Save files and multiplayer keyframes now contain the five plane layers, and
multiplayer deltas diff each layer independently. Protocol version 6 rejects old
clients, and legacy scalar saves are intentionally unsupported. Damage reads and
writes `WorldPlane.layers.damage` directly, with no duplicate runtime array.
Gameplay, pathfinding, client interaction, repair, AI, exploration, tests, and
level lifecycle all read through `TileSource`. `WorldPlane` retains only a
private resolved-tile cache for hot presentation reads; it cannot become gameplay
authority or be mutated externally.

- Structure-of-arrays plane storage is authoritative.
- Current tiles are classified into ground, structure, and fixture semantics.
- Passability, opacity, destructibility, and tile presentation are synthesized.
- Physics, FOV, renderer, simulation, pathfinding, and tests use `TileSource`.
- Superseded scalar map and damage fields are deleted.

Exit: current gameplay works on the new semantic layers; type-checks and tests
pass; old save files are intentionally unsupported.

## Milestone 3 — Deterministic visual resolver

**Status: COMPLETE**

The production resolver derives typed-array caches for stable
coordinate hashes, same-ground connectivity, wall/hole masks, shoreline masks,
bounded cliff context, building roof/facade roles, and fence orientation.
Semantic edits refresh a clipped or wrapped 3×3 neighborhood, and both live and
preview renderers consume the cached classifications and deterministic variant
hashes. These caches are presentation-only and are rebuilt rather than
serialized. Production shoreline and cliff artwork lands with its semantic
gameplay in Milestone 5; extending the resolver with another content family is
now a data-oriented addition rather than renderer logic.

- Extend per-family rules for ground, shores, roads/rivers, cliffs,
  roofs, and decoration as their assets become available.
- Connect production shoreline and cliff artwork as those asset families land.

Exit: a one-cell semantic edit performs bounded work and produces deterministic,
seam-correct visuals offline and online.

## Milestone 4 — Aseprite and Tiled asset compiler

**Status: COMPLETE**

`assets-src/assets.json` now declares generated atlases and active Aseprite
families. `npm run gen:visual-assets` regenerates the main atlas, optionally
exports enabled Aseprite sources through its CLI, imports standard Tiled JSON,
and writes a deterministic runtime visual manifest. The compiler validates PNG
dimensions, atlas grids, supported resolvers, duplicate family masks, complete
16-mask cardinal sets, and Wang metadata. Its editor-independent contracts run
as part of `npm test`.

- Establish `assets-src/` as the home for committed authoring sources.
- Automate Aseprite atlas/metadata export.
- Import Tiled `.tsj` terrain and Wang metadata.
- Generate compact runtime manifests and validate every reference and mask.
- Keep generated outputs reproducible and clearly separated from source assets.

Exit: one documented command reproduces the prototype atlas and manifests from
committed sources.

## Milestone 5 — Elevation and static-water gameplay

**Status: COMPLETE**

Production planes now enforce directional elevation traversal: equal-height
neighbors connect normally, cliff edges receive thin constant-cost physics
boundaries, and one-step changes connect only through authored stairs. The same
contract drives command movement, AI searches, click-to-move pathfinding,
knockback, client prediction, and authoritative server physics.

The outside world contains deterministic signed terraces, a shallow/deep pond,
a directional static river outlet, and a bridge that preserves water beneath
it. Cached shore, river, and bounded cliff classifications drive cheerful water,
edge, face, stair, and shadow presentation. The Matter Manipulator raises and
lowers eligible clear terrain at the cursor with `[` and `]`; offline and online
commands mutate the same semantic layer, invalidate at most a 3×3 neighborhood,
and replicate through per-layer elevation deltas. Protocol version 7 introduced
the authoritative action; the current version 8 also carries stable world and
portal identities. Holes now transition through the same world-plane system.

- Add `Int16` elevation to world planes.
- Add elevation-aware collision, traversal, stairs/ramps, raising, and lowering.
- Add static shallow/deep/river water and shoreline behavior.
- Implement visible depressions, bounded tall cliffs, and chasm portal behavior.
- Update save/network formats directly; do not write legacy migrations.

Exit: terrain editing, save/load, and authoritative multiplayer agree on the new
state and presentation.

## Milestone 6 — WorldSpaces, WorldPlanes, and portals

**Status: COMPLETE**

Stable `WorldAddress` identities now drive the system: the surface is
`outside/surface`, facility levels are `megacorp/floor-N`, runtime snapshots and
saves carry both IDs, offline caches and the multiplayer server key worlds by
address, and clients require a keyframe when identity changes even if dimensions
and progression depth happen to match. Typed portal records own their source,
destination, entry policy, and transition kind. The park grotto is the first
independent cave plane and round-trips through a visible cave-mouth portal;
MegaCorp floors remain the first building planes. Offline and authoritative
multiplayer transitions resolve the same portal contracts. Empty server planes
remain frozen and every client renders only its active plane.

- Generalize per-depth worlds into stable world-space and plane identities.
- Generalize stairs and hole falls into portal transitions.
- Support outside, building interiors, basements, upper floors, and cave planes.
- Freeze inactive planes and render only the local player's plane.

Exit: players can move independently among outside, building, and cave planes in
offline and multiplayer games.

## Milestone 7 — Semantic prefabs

**Status: COMPLETE**

The asset compiler now converts finite orthogonal Tiled `.tmj` maps into
editor-independent semantic prefab data. `stampSemanticPrefab` validates the
whole footprint and required surroundings before mutation; supports four
rotations and reflection; transforms socket directions; preserves spawn,
portal, and socket markers; and writes through `WorldPlane.editCell` for bounded
derived-state repair. The canonical cave rest stop is authored in Tiled and
stamped into the procedural park grotto, proving authored/procedural composition
through the same semantic and visual resolvers.

- Import Tiled `.tmj` content as semantic prefab stamps.
- Add rotations, reflections, portals, spawn markers, required surroundings,
  edge sockets, and deterministic boundary repair.
- Join handcrafted facilities and caves to procedural terrain through the same
  resolver used by ordinary world generation.

Exit: representative authored content joins procedural content without gameplay
or graphical seams.

## Milestone 8 — Content expansion

**Status: COMPLETE**

The foundation program now demonstrates repeated content creation rather than a
single laboratory: the production surface combines terraces, signed
depressions, static pond/river water, a bridge, forest/city families, a portal
cave, and a Tiled-authored workshop/garden vignette; the cave combines
procedural chambers with a second transformed semantic-prefab family. Production
rendering supports the rebuilding structures and fixtures. Terrain shaping has
clear reach, occupancy, material, clearance, water, and ±12 elevation feedback.
`assets-src/AI-WORKFLOW.md` formalizes provenance, grid reconstruction, review,
and validation. This completes the terrain/world foundation; further biomes,
settlements, and activities are ordinary game-content work built on it.

- Ship production surface, water, elevation, cave, facility, and rebuilding
  content through the shared semantic pipeline.
- Ship player-facing terrain-editing constraints and feedback.
- Prove a second Tiled prefab family with workshop, garden, flowers, crate,
  socket, and spawn semantics.
- Formalize the AI-assisted concept, generator-code, cleanup, provenance, and
  validation workflow.

Exit: the system is productive for repeated content creation, not merely a
successful prototype.

Ongoing game-content work will add more biomes, settlements, NPC activities,
companions, upgrades, and non-combat animation polish without changing this
foundation.

## Deferred work

**Status: DEFERRED**

- Dynamic fluid simulation.
- General voxels or volumetric rendering.
- WFC.
- LDtk integration.
- Runtime AI-generated assets.
- Public-server operations and the arcade variant remain separate product work.

## Cross-branch coordination

Branches should own one narrow deliverable and avoid editing the same central
files without coordination. Before starting:

1. Read `AGENTS.md`, this roadmap, and `docs/TERRAIN-AND-WORLD.md`.
2. Check the handoff ledger below and current branches/PRs.
3. State the milestone and files the branch intends to own.
4. Add tests or validators with deterministic logic changes.
5. Update documentation in the same branch when behavior changes.
6. Add a handoff entry when the branch is ready to merge or transfer.

### Handoff ledger

| Milestones | Branch/owner               | Scope                                       | Status | Notes                              |
| ---------- | -------------------------- | ------------------------------------------- | ------ | ---------------------------------- |
| M0–M8      | `codex/terrain-foundation` | Complete terrain/world foundation program   | done   | Tests, docs, and authoring sources |
| Next       | unassigned                 | Ordinary game content and product expansion | open   | Build on the completed foundation  |
