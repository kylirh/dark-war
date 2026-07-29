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
- **DEFERRED** — intentionally outside the active program.
- **DONE** — merged and verified.

## Milestone 0 — Architecture record and slice specification

**Status: DONE**

- Keep `docs/TERRAIN-AND-WORLD.md` authoritative.
- Specify the prototype scene and its semantic inputs.
- Establish naming conventions for semantic authoring keys.
- Define the baseline measurement protocol; capture measurements when the slice
  first renders in Milestone 1.

Exit: the slice can be built without reopening foundational architecture
questions.

## Milestone 1 — Isolated visual terrain slice

**Status: IN PROGRESS**

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

**Status: IN PROGRESS**

The production `WorldPlane` SoA container and centralized cell-semantics resolver
are implemented. The terrain laboratory now uses it authoritatively; its scalar
collision map is a derived projection. Ordinary dungeon/outside generation,
mutation, saves, and netcode still require coordinated conversion.

The shared `GroundType`, `StructureType`, and `FixtureType` vocabulary now
classifies every current `TileType`, preserves meaningful bases such as grass
under trees and sidewalk under lights, and provides a tested conversion boundary
for existing procedural generators.

The outside generator now emits an authoritative `WorldPlane`. Runtime door,
building, mining, destruction, hole, repair, and damage mutations use one
canonical helper that keeps semantic layers, derived scalar projection, and
physics invalidation synchronized. Depth snapshots retain the same outside
plane. Persistence and netcode remain to migrate.

Dungeon generation now also converts immediately into authoritative layered
storage, including wall/door structures and stair fixtures. Fresh gameplay and
in-memory depth snapshots therefore use `WorldPlane` on every ordinary level.
Persistence and multiplayer payloads remain the last scalar authorities to
replace before the old map fields can be deleted.

- Replace the scalar tile model with a structure-of-arrays plane model.
- Classify current `TileType` use into ground, structure, and fixture semantics.
- Centralize synthesized passability, opacity, and destructibility.
- Update generators, mutation helpers, physics, FOV, renderer, save state, and
  network state as one coordinated breaking change.
- Delete superseded scalar-map paths instead of retaining compatibility layers.
- Bump the multiplayer protocol once for the new authoritative representation.

Exit: current gameplay works on the new semantic layers; type-checks and tests
pass; old save files are intentionally unsupported.

## Milestone 3 — Deterministic visual resolver

**Status: PLANNED**

- Move connectivity and presentation selection into pure resolver modules.
- Implement per-family rules for ground, walls, shores, roads/rivers, cliffs,
  roofs, and decoration as their assets become available.
- Add dirty-neighborhood invalidation and deterministic coordinate hashing.
- Make the renderer consume resolved visual layers rather than rediscovering
  semantic rules.

Exit: a one-cell semantic edit performs bounded work and produces deterministic,
seam-correct visuals offline and online.

## Milestone 4 — Aseprite and Tiled asset compiler

**Status: PLANNED**

- Establish `assets-src/` as the home for committed authoring sources.
- Automate Aseprite atlas/metadata export.
- Import Tiled `.tsj` terrain and Wang metadata.
- Generate compact runtime manifests and validate every reference and mask.
- Keep generated outputs reproducible and clearly separated from source assets.

Exit: one documented command reproduces the prototype atlas and manifests from
committed sources.

## Milestone 5 — Elevation and static-water gameplay

**Status: PLANNED**

- Add `Int16` elevation to world planes.
- Add elevation-aware collision, traversal, stairs/ramps, raising, and lowering.
- Add static shallow/deep/river water and shoreline behavior.
- Implement visible depressions, bounded tall cliffs, and chasm portal behavior.
- Update save/network formats directly; do not write legacy migrations.

Exit: terrain editing, save/load, and authoritative multiplayer agree on the new
state and presentation.

## Milestone 6 — WorldSpaces, WorldPlanes, and portals

**Status: PLANNED**

- Generalize per-depth worlds into stable world-space and plane identities.
- Generalize stairs and hole falls into portal transitions.
- Support outside, building interiors, basements, upper floors, and cave planes.
- Freeze inactive planes and render only the local player's plane.

Exit: players can move independently among outside, building, and cave planes in
offline and multiplayer games.

## Milestone 7 — Semantic prefabs

**Status: PLANNED**

- Import Tiled `.tmj` content as semantic prefab stamps.
- Add rotations, reflections, portals, spawn markers, required surroundings,
  edge sockets, and deterministic boundary repair.
- Join handcrafted facilities and caves to procedural terrain through the same
  resolver used by ordinary world generation.

Exit: representative authored content joins procedural content without gameplay
or graphical seams.

## Milestone 8 — Content expansion

**Status: PLANNED**

- Expand biomes, cliff families, shorelines, roads, rivers, forests, structures,
  multi-floor interiors, and underground generation.
- Add player-facing terrain editing constraints and feedback.
- Expand rebuilding, gardening, construction, community, companion, and
  settlement-upgrade assets as primary content families.
- Give non-combat actions effects and animation polish equal to combat.
- Formalize the AI-assisted concept, generator-code, cleanup, and validation
  workflow after the human-authored pipeline is proven.

Exit: the system is productive for repeated content creation, not merely a
successful prototype.

## Deferred work

**Status: DEFERRED**

- Dynamic fluid simulation.
- General voxels or volumetric rendering.
- WFC.
- LDtk integration.
- Runtime AI-generated assets.
- Public-server operations and the arcade variant until the terrain/world program
  no longer needs foundational changes.

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

| Milestone | Branch/owner               | Scope                                            | Status      | Dependencies/notes                 |
| --------- | -------------------------- | ------------------------------------------------ | ----------- | ---------------------------------- |
| M0        | `codex/terrain-foundation` | Architecture, slice specification, semantic keys | done        | Initial elevation classifier added |
| M1        | `codex/terrain-foundation` | Art reset, visual slice, elevation topology      | in progress | Production tile families remain    |
| M2        | unassigned                 | Layered semantic storage                         | blocked     | M1 field requirements              |
| M3        | unassigned                 | Production visual resolver                       | blocked     | M1 and M2                          |
| M4        | unassigned                 | Aseprite/Tiled compiler                          | blocked     | M1 asset conventions               |
