# Dark War Architecture

This document describes the current Dark War architecture. Detailed terrain decisions live in
[`TERRAIN-AND-WORLD.md`](TERRAIN-AND-WORLD.md); ordered work and branch handoffs
live in [`ROADMAP.md`](ROADMAP.md).

Architecture supports the cheerful rebuilding direction recorded in
[`ART-DIRECTION.md`](ART-DIRECTION.md). Presentation must preserve its
outline-free, color-rich, atmospherically lit pixel language; engine semantics
should support building, cultivation, repair, and community as first-class
activities rather than assuming all terrain change is destruction.

## Runtime boundaries

```text
src/engine/   deterministic platform-independent simulation
src/client/   Pixi rendering, browser UI, input, and sound
src/net/      shared client protocol and state-delta codec
server/       authoritative WebSocket host
electron/     desktop shell, embedded server, and LAN discovery
apps/         build-variant homes and documentation
```

`src/engine` must not import Pixi, DOM APIs, Electron, `ws`, Node modules, or
platform globals. `src/engine-purity.test.ts` enforces this boundary. The same
engine runs offline, in the Electron client, and on the authoritative server.

The existing source roots are the package boundaries. Moving them into npm
workspaces is not an active roadmap item; it would be a packaging change rather
than a prerequisite for the world work.

## Core runtime

- `Game` owns `GameState`, generation, level transitions, FOV refresh, and
  serialization.
- `GameLoop` uses a fixed timestep with interpolated presentation.
- Simulation is a deterministic command/event pipeline under
  `src/engine/systems/simulation/`.
- Physics uses continuous world-pixel positions and `detect-collisions`.
- `EntityManager` exclusively owns entity spawn/removal lifecycle.
- The Pixi renderer draws a camera-sized tile window rather than the whole map.

Entity `worldX` and `worldY` values are authoritative. `gridX` and `gridY` are
read-only derived coordinates and must never be assigned.

## Current world implementation

Fresh outside, dungeon, and terrain-laboratory levels now use authoritative
`WorldPlane` storage. They own aligned semantic typed arrays and resolve gameplay
properties directly from those layers. Runtime tile mutations flow through
`utils/state-tiles.ts`. Save files,
multiplayer keyframes, and multiplayer deltas now serialize all five semantic
layers directly. Runtime damage also uses the plane layer exclusively; there is
no duplicate damage array. Legacy scalar saves and clients are intentionally
rejected.

All runtime tile reads use `state.tiles`, including AI, commands/events, repair,
pathfinding, exploration, client interaction, physics, FOV, and rendering.
`GameState` and level snapshots have no scalar map or damage fields.

Each production plane also owns a derived `WorldVisualState`. It caches
deterministic coordinate hashes and per-family neighborhood classifications in
typed arrays. Canonical semantic writes refresh at most a 3×3 neighborhood
(wrapped outside, clipped in dungeons). The cache is never serialized and never
feeds simulation; it can always be rebuilt from semantic layers.

`core/world-semantics.ts` owns the shared ground/structure/fixture IDs, stable
authoring keys, complete current-tile classification, and the conversion boundary
used by scalar-layout procedural generators before runtime.

The server owns one `LevelWorld` per stable `WorldAddress`. Players migrate
independently through typed doors, stairs, ladders, cave mouths, and holes.
Unoccupied planes do not simulate. The surface, numbered MegaCorp floors, the
park grotto cave, and the park workshop interior are the current concrete world
spaces.

## Approved world direction

The scalar runtime representation has been replaced by this structure:

```text
World
└── WorldSpace                 outside, facility, cave system
    └── WorldPlane             surface, floor, basement, cave level
        ├── ground layer       compact semantic IDs
        ├── structure layer
        ├── fixture layer
        ├── elevation          signed Int16
        ├── damage
        ├── sparse state
        ├── entities
        └── portals
```

The physical layout is a structure of typed arrays, not an object per cell.
Collision, opacity, destructibility, and visuals are synthesized from semantic
layers. WorldPlanes remain 2D; portals generalize today's stairs and hole-fall
transitions. Static water is terrain, not a fluid simulation.
Resolved gameplay flags are cached in compact arrays on each `WorldPlane`, so
per-tick FOV and pathfinding do not allocate semantic cell objects. The local
reachable-region flood fill is likewise cached per player until the plane's
semantic revision invalidates it.

This was a deliberate breaking rewrite. There is no requirement to load old saves
or communicate with old clients. The layered serialization and delta conversion
bumped `PROTOCOL_VERSION`; version 10 carries the current player/item shape,
stable world identities, portals, and authoritative terrain-shaping actions.
The superseded scalar runtime fields have been deleted.

Destructive hand-tool behavior is capability-specific: ordinary melee affects
actors only, the Pickaxe damages ordinary wall and floor cells over repeated
hits, and the Matter Manipulator restores its full fixture/block mining and
placement behavior—including holowall removal and placement—without converting
floor cells into holes.

## Authoring boundary

Aseprite sources and Tiled tilesets/maps are authoring inputs. A build-time asset
compiler produces atlases, visual manifests, and semantic prefabs. Editor tile
IDs and atlas coordinates never become gameplay state. Runtime edits pass through
deterministic per-family visual resolvers and update bounded dirty neighborhoods.
Compiled prefabs support validated requirements, rotations/reflection, edge
sockets, spawn and portal markers, and deterministic `WorldPlane` stamping. The
Tiled-authored cave rest stop is composed into a procedurally carved cave as the
reference integration.

## Multiplayer

Online play is server-authoritative and always real-time. Clients send monotonic
input sequence numbers; server snapshots acknowledge the highest processed
sequence. Movement-only client prediction is reconciled against authoritative
snapshots. Firing and hits remain server-authoritative.

State broadcasts use keyframes and deltas. The protocol deliberately rejects
mismatched versions. While the game is unreleased, compatibility with previous
protocol versions is not required.

Simulated worlds are keyed by world-space and plane identity. Empty planes
remain frozen; players may occupy different planes and migrate independently.

## Build variants

| Variant           | Status              | Host                | Join                      |
| ----------------- | ------------------- | ------------------- | ------------------------- |
| Electron desktop  | Working             | Embedded LAN server | LAN/manual server         |
| Headless server   | Working             | Authoritative rooms | n/a                       |
| Static web client | Working             | No                  | Manual `ws`/`wss` address |
| Arcade cabinet    | Scaffolded/deferred | TBD                 | TBD                       |

Browsers cannot host or perform UDP LAN discovery. A web client may join a
reachable LAN server by address and should use `wss://` when served over HTTPS.

## Validation

- `npm run type-check` checks client and server TypeScript.
- `npm test` covers deterministic engine, map, lifecycle, and network logic.
- `src/engine-purity.test.ts` guards platform boundaries.
- World changes require focused resolver, storage, physics/FOV, serialization,
  and multiplayer tests.
- Each branch must leave the game playable. Breaking formats are allowed;
  broken builds and half-converted runtime paths are not.
