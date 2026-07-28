# Terrain and World Architecture

This document is the authoritative design for Dark War's terrain, elevation,
world-space, prefab, and art-authoring work. It records accepted decisions and
the implementation sequence. If another document conflicts with this one, this
one wins for these systems.

## Product target

Dark War should support procedural and handcrafted terrain that can meet without
visible seams. Players can alter terrain, build structures, cross static rivers
and lakes, climb readable mountains, descend into canyons, and enter caves or
buildings. The presentation should remain a fast, legible, modern top-down
pixel-art game rather than becoming a voxel or fluid-simulation showcase.

The world is post-apocalyptic but the experience is optimistic: rebuilding,
gardening, crafting, community, and playful discovery are the visual and
gameplay defaults. Ruins provide raw material and history, not a permanent
grimdark grade. All visuals follow `docs/ART-DIRECTION.md`.

The game has no public compatibility obligations. During this work it is valid
to replace save and network formats, discard old saves, bump the multiplayer
protocol, and make disruptive internal changes. Do not spend implementation time
on legacy migrations, compatibility adapters intended only for old releases, or
dual-format persistence.

## Accepted architecture

### Semantic runtime data is authoritative

Gameplay stores what a cell _is_, never which atlas rectangle happens to draw it.
Tiled and Aseprite are build-time authoring inputs. Tiled global IDs, atlas
coordinates, generated visual variants, and editor-only layers must not appear in
authoritative saves or multiplayer state.

Authoring uses stable string keys such as `ground.grass` and `structure.wall`.
The asset compiler assigns compact runtime IDs and produces validated manifests.

### The world is 2D planes connected by portals

```text
World
└── WorldSpace
    └── WorldPlane
        ├── semantic tile layers
        ├── elevation
        ├── sparse special state
        ├── entities
        └── portals
```

- A `WorldSpace` is a coherent location: outside, MegaCorp facility, cave
  system, sewer, or building interior.
- A `WorldPlane` is one independently simulated 2D map: surface, basement,
  upper floor, or cave level.
- Doors, stairs, ladders, cave mouths, and holes are portals between planes.
- Normally only an occupied plane simulates, and the client renders only the
  local player's plane.
- This generalizes today's per-depth `LevelWorld` behavior without pushing a
  `z` coordinate through every physics, FOV, pathfinding, and rendering call.

### Cells are compositional and stored as structures of arrays

A single `TileType` cannot represent grass under a tree, water under a bridge,
or a floor under a door. The target storage uses compact parallel arrays:

```typescript
interface WorldPlaneLayers {
  ground: Uint16Array;
  structure: Uint16Array;
  fixture: Uint16Array;
  elevation: Int16Array;
  damage: Uint8Array;
}
```

This interface is illustrative; fields may change when the visual slice proves
what is required. The durable decisions are compositional semantic layers,
typed-array storage, and sparse records for exceptional state. A `WorldCell`
may be exposed as a convenient view, but hot paths must not allocate an object
per cell.

Use compact layers for common grid-aligned state that affects terrain,
navigation, collision, or neighboring visuals: ground, walls, fences, trees,
bridges, doors, lamps, and damage. Use entities for things that move, tick
independently, have AI or inventory, live off-grid, or require an independent
lifecycle. Sparse fixture records can hold uncommon interaction state without
turning every fixture into an entity.

### Elevation is discrete, signed, and visually bounded

Elevation is stored in an `Int16Array`. It can represent tall mountains and deep
canyons, including negative elevations, but ordinary authored terrain should use
readable terraces. Most neighboring cells should differ by zero or one step.

- Neighboring elevation differences create cliff boundaries.
- Ramps, stairs, ladders, or climbing points permit traversal.
- Broad mountains use nested terraces.
- A visible canyon floor is lower terrain on the same plane.
- A bottomless hole or cave entrance is a portal to another plane.
- Large sheer drops use a constant-cost tall-cliff or chasm treatment; rendering
  work must not grow linearly with the numeric height difference.

Cliff pixels are deliberately hand-authored. Their placement is still automatic:
the visual resolver selects tops, faces, corners, stairs, and shadows from local
elevation and terrain relationships.

### Water is static terrain

Water is semantic ground or surface data with movement and presentation rules.
It may distinguish shallow, deep, river, polluted, or other useful categories
and may carry a visual flow direction. There is no pressure, volume, spreading,
flooding, evaporation, or per-tick fluid simulation unless a future gameplay
decision explicitly adds it.

### Visuals are derived by rule family

There is no universal autotiler.

| Visual family                   | Resolver                                     |
| ------------------------------- | -------------------------------------------- |
| Soft ground transitions         | Corner or dual-grid Wang rules               |
| Walls and fences                | Four-cardinal connectivity                   |
| Shores and irregular boundaries | Eight-neighbor/blob or mixed Wang rules      |
| Roads and rivers                | Directional connectivity                     |
| Cliffs                          | Elevation differences plus authored topology |
| Roofs                           | Enclosure and region-boundary rules          |
| Cracks, grass, rubble           | Deterministic decoration rules               |

An edit changes semantic state, updates collision/opacity when needed, marks a
bounded neighborhood dirty, reclassifies local relationships, and resolves new
visual layers. Visual variation should normally be derived from a stable hash of
the world seed, world/plane identity, coordinates, and rule ID. Persist an
explicit variation only when authored or gameplay-significant.

### Handcrafted and procedural content share one representation

Tiled maps compile into semantic prefab stamps, not rendered runtime maps.
Prefabs may contain semantic layers, elevation, portals, spawn markers, rotation
rules, required surroundings, and edge/socket contracts. Procedural generation
places the same semantics. Both pass through the same runtime visual resolver;
that shared resolver is what removes seams.

Begin with deterministic sockets and boundary repair. Wave Function Collapse and
LDtk are explicitly deferred until a demonstrated content problem justifies the
extra toolchain and debugging cost.

## Authoring pipeline

- **Aseprite** is the source of truth for pixel tiles, sprites, palettes,
  animation tags, layers, slices, and pivots. Commit reviewed `.aseprite` files.
- **Tiled `.tsj`** files author tile metadata and Wang/terrain relationships.
- **Tiled `.tmj`** files author rooms, interiors, landmarks, and prefab stamps.
- **Photoshop** is useful for concepts, paintovers, large illustrations, and
  source textures, but final grid-aligned pixel work belongs in Aseprite.
- **AI** may create concepts, controlled variants, and deterministic drawing or
  validation code. Generated images become reviewed source material; AI does not
  generate runtime terrain on demand.

Art uses an outline-free, cluster-based pixel language with limited vibrant
palettes, colored shadows, and atmospheric light. Aseprite production work must
follow `assets-src/STYLE.md`; retained AI concepts preserve prompt provenance
and are reconstructed on the gameplay grid before export.

The target build flow is:

```text
assets-src/**/*.aseprite
assets-src/**/*.tsj
assets-src/**/*.tmj
          ↓
asset compiler and validators
          ↓
generated atlas + visual manifest + semantic prefabs
```

Validation must reject duplicate semantic keys, missing required masks, invalid
atlas rectangles, unknown gameplay semantics, unsupported terrain combinations,
and broken animation metadata.

## Prototype slice

The first visual scene must include:

- at least three ordinary elevation terraces;
- one unusually tall escarpment to prove bounded rendering;
- cliff tops, faces, inner corners, outer corners, and stairs or a ramp;
- grass, dirt, and rock transitions;
- trees over grass;
- a river entering a lake;
- a bridge;
- a visible canyon or depression;
- a cave-mouth portal into a small interior plane;
- one terrain-lowering edit and one terrain-raising edit.
- one small repaired homestead/workshop with a garden or active build site;
- visible signs of cultivation, reuse, and ordinary non-combat life.

The slice succeeds when elevation reads without explanatory UI, lighting and
shadows consistently communicate height, edits repair nearby visuals without
seams, layers compose correctly, tall drops have bounded rendering cost, and the
result looks like Dark War rather than a generic tile-engine demo.

## Performance constraints

- Editor formats are compiled before shipping and add no steady-state runtime
  work.
- Common semantic layers use typed arrays and compact runtime IDs.
- Visual changes recompute dirty neighborhoods, never the entire map.
- Large height differences have constant-bounded visual cost.
- Rendering remains camera-windowed and preserves atlas batching.
- Inactive planes do not simulate.
- Tiled, Aseprite, and semantic-property parsing never happens in a render loop.

An `Int16Array` elevation layer costs 24 KiB for a 128×96 dungeon and 18 KiB for
the current 128×72 outside map.

## Validation strategy

- Pure resolver unit tests cover all required connectivity masks and elevation
  relationships.
- Tile-layer tests cover synthesized passability, opacity, and destruction.
- Asset validation runs in the normal build/test workflow.
- Fixed prototype scenes support visual inspection and later screenshot tests.
- Multiplayer tests verify that authoritative semantic edits produce identical
  client state.
- Performance checks compare a fixed camera scene before and after the new
  resolver and reject full-map work on a single-cell edit.

## Non-goals for this program

- Compatibility with old saves, worlds, or network clients.
- A general voxel engine.
- Dynamic fluid simulation.
- Simultaneous multi-plane rendering.
- WFC as foundational generation infrastructure.
- A second level editor before Tiled has been proven insufficient.
- Runtime-generated AI art.
- A grim, militarized, combat-first visual identity.
