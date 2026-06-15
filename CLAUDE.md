# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Dark War?

A roguelike remake of Mission Thunderbolt (1992) built with TypeScript, Pixi.js, and Electron. Features continuous fluid movement (not grid-locked), a Cognitive Time Dilation Module (CTDM) combat system, mouse-aiming combat, destructible walls, and LAN multiplayer. See `.github/copilot-instructions.md` for the full long-term vision.

## Commands

```bash
npm run dev              # Build TypeScript + Vite, then launch Electron
npm run dev:online       # Build and launch in online multiplayer mode (connects to localhost:7777)
npm run multiplayer:server  # Start the WebSocket multiplayer server (tsx)
npm run online:client    # Launch an additional client without rebuilding
npm run watch            # Vite watch mode (run `npx electron .` separately)
npm run build:ts         # Compile TypeScript (tsc) + bundle with Vite
npm run build            # Full distributable build (macOS/Windows/Linux via electron-builder)
npm run type-check       # Type-check both client and server without emitting
npm run type-check:client  # Type-check client only (tsconfig.json)
npm run type-check:server  # Type-check server only (tsconfig.server.json)
npm test                 # Run the Vitest unit suite once
npm run test:watch       # Vitest in watch mode
```

Unit tests run on **Vitest** and live next to the code they cover as
`*.test.ts`. They focus on the deterministic logic (simulation, helpers,
netcode encoding, map/tile systems, entity lifecycle) rather than the
Electron/Pixi/DOM layers. No linter is configured.

## Architecture

### Build Pipeline

Vite bundles `src/client/main.ts` into `app/game.js` (IIFE format). Electron loads `app/index.html` which references this bundle. The server (`server/multiplayer-server.ts`) is bundled separately into `app/server-bundle.js` and can run as a child process within the Electron app. The server also runs directly via `tsx` for development.

### Core Loop

`DarkWar` class in `src/client/main.ts` orchestrates everything:

- **GameLoop** (`src/engine/core/game-loop.ts`): Fixed 60Hz timestep with accumulator pattern. Calls `update(dt)` at fixed rate and `render(alpha)` at variable framerate with interpolation.
- **Simulation** (`src/engine/systems/simulation/`): Tick-based command/event system running at 20 ticks/sec (`SIM_DT_MS = 50`). Split into domain modules: `constants`, `sim-helpers`, `ai`, `commands`, `explosives`, `events`, `tick` (entry point with `stepSimulationTick`). Player actions become Commands, resolved into Events (damage, death, pickup, etc.). AI commands generated after player commands each tick.
- **Physics** (`src/engine/systems/physics.ts`): Uses `detect-collisions` library for continuous collision detection. Wall sliding, bullet movement, explosive physics.
- **Game** (`src/engine/core/game.ts`): Central state manager. Holds all `GameState`, handles level transitions (descend/ascend), serialization, FOV updates, and multiplayer player management.

### Coordinate System (Critical)

- **`worldX`/`worldY`**: Float pixel coordinates — the source of truth for all entity positions
- **`gridX`/`gridY`**: Read-only getters on `GameEntity`, derived as `Math.floor(worldX / 32)`
- **Never set `gridX`/`gridY` directly** — they are computed properties
- Tiles are 32×32 pixels. Use `entity.worldX`/`entity.worldY` to position entities
- Movement: set `entity.velocityX`/`entity.velocityY` (pixels per second)

### Entity System

All entities extend `GameEntity` (`src/engine/entities/game-entity.ts`) which provides `worldX`/`worldY`, velocity, facing angle, and physics body. Entity types: `PlayerEntity`, `MonsterEntity`, `ItemEntity`, `BulletEntity`, `ExplosiveEntity`. Discriminated by `EntityKind` enum.

**Entity lifecycle** is owned by `EntityManager` (`src/engine/core/entity-manager.ts`), accessible as `state.entityManager`. It owns the entity array (shared in place with `state.entities`) and is the **only** way to add/remove entities — use `spawn()`, `destroy()`, `destroyWhere()`, `destroyByIds()`, `replaceAll()`. Never `state.entities.push(...)` or reassign `state.entities` directly; that desyncs physics bodies and network deltas. The manager tracks `spawnedIds`/`removedIds` diffs, which `Physics.syncEntityBodies()` consumes to reconcile colliders incrementally each frame. `Physics.rebuildAll(state)` rebuilds the whole physics world (walls + all entity bodies) on level transitions.

### CTDM (Cognitive Time Dilation Module)

The CTDM is an in-game item the player can find and equip. When active, it slows time based on threat level (nearby alert enemies). Time scale smoothly interpolates between `SLOWMO_SCALE` (0.05) and real-time. The `sim.timeScale` and `sim.targetTimeScale` fields on `GameState` control this. CTDM has a charge meter that drains under threat and recharges when safe. Toggle with `C`.

### Multiplayer

Two modes: `offline` (default) and `online`. In online mode, an authoritative WebSocket server (`server/multiplayer-server.ts`) runs the Game and Physics simulation. Clients send velocity updates and actions; the server uses per-player FOV and explored state. Online play is always **real time** — there is no CTDM/time dilation, and the CTDM item is not spawned.

**Per-depth worlds:** the server simulates one `LevelWorld` (its own `Game` + `Physics`) per depth, shared by everyone on that depth (co-op: same layout, same monsters). Players are tracked by depth and migrate between worlds individually — taking stairs (`DESCEND`/`ASCEND`, validated on the stairs tile) or falling through a hole (a player ending a tick on a `HOLE` tile drops to the next depth with fall damage) moves only that player, never the whole party. Empty worlds are frozen but retained. Migration carries the player entity (HP/inventory) via `Game.detachPlayer`/`attachExistingPlayer` and forces a keyframe so the client rebaselines on the new world.

**Protocol** (`src/net/protocol.ts`, `PROTOCOL_VERSION`): the server stamps its version in the `welcome` message and clients refuse to play on a mismatch. Bump it whenever the wire format changes.

**Input sequence numbers**: every client `velocity`/`action` carries a monotonic `seq`. The server records the highest processed seq per client and echoes it as `ackSeq` on every state message (`MultiplayerClient.getLastAckedSeq()`).

**Client-side prediction** (movement-only v1): the online client predicts the local player immediately under the latest local input (`Physics.predictLocalMovement` — single-entity movement vs walls), so input feels instant. On each snapshot `reconcileLocalPlayer` keeps most of the prediction and eases out residual error; large gaps (teleport, hole-fall, respawn) hard-snap to the server. Firing and hit resolution stay fully server-authoritative; remote entities come straight from the server. See `src/client/main.ts` (`predictLocalPlayer`, `reconcileLocalPlayer`, `ensurePredictionWorld`).

**Delta-compressed broadcasts** (`src/net/state-delta.ts`): instead of the full `GameState` every tick, the server keeps a per-client baseline and sends `state_full` (keyframe — on join, level change, new game, and every ~5s) or `state_delta` (changed entities by id, explored additions, map/wallDamage index changes, changed scalars). The client applies deltas onto its baseline to reconstruct a full `SerializedState` and feeds the existing `deserialize()` path. A baseline mismatch triggers a `request_keyframe`.

**LAN multiplayer**: The Electron app can host an embedded server (child process via `electron/server-manager.js`) and advertises it over UDP LAN discovery. Other players on the same network see available games via `DiscoveryManager`. All managed through the in-game GameMenu — no separate terminal needed.

### Map Generation

- **Dungeon** (`src/engine/core/dungeon-generator.ts`): dungeon levels are **bounded** `128×96` maps generated **in full up front** (no streaming). `generateDungeon(width, height, depth, rng)` places varied rectangular and cellular-automata "cave" rooms, connects them with a Prim's MST plus a few extra loop edges (so the layout isn't a pure tree), carves corridors, drops doors at corridor pinch points, and seals an impenetrable border. The start is room 0's center (an up-stair) and the down-stair sits in the farthest room. Generation is deterministic from a per-level seed (`new RandomNumberGenerator(seed)`); full connectivity (stairs reachable from start) is enforced and unit-tested. `Game.createDungeonLevel` calls it and `spawnLevelEntities` scatters monsters/items scaled to floor area.
- **Outside** (`src/engine/core/outside-level.ts`): Procedural exterior level. Size `OUTSIDE_MAP_WIDTH × OUTSIDE_MAP_HEIGHT` (128×72). The outside world (`levelKind === "outside"`, depth 0) is **toroidal**: walking off any edge wraps to the opposite side so it feels infinite. Its outer ring of tiles is kept walkable so the seam is never blocked. Dungeon levels are bounded and sealed, so the player never reaches a seam — the same wrap code runs for both, gated by `levelKind`.

### Rendering & Camera

The renderer (`src/client/systems/renderer.ts`) uses **windowed rendering**: the Pixi canvas is sized to the visible viewport and each frame draws only the tiles in a window around the camera (`cameraWorldX/Y`, smooth-followed onto the player). There is no DOM scrolling. This scales to large levels and is what makes the toroidal world possible — on wrapping levels the tile loop and entity/effect positions use wrapped lookups (`src/engine/utils/wrap.ts`: `wrapValue`, `wrapDelta`, `nearestWrappedImage`), the camera wraps (taking the short way across the seam), and the camera is clamped to the map edge on bounded levels. `MouseTracker` converts canvas pixels to world coordinates via the live camera window origin (`getCameraTopLeft`). Wrapping is also applied in **physics** (entity/bullet positions wrap instead of clamping on the outside) and **FOV** (`computeFOVFrom(..., wraps)` folds shadowcasting probes across the seam).

Every level is a **bounded** flat `TileType[]`, so serialization, `explored`/`wallDamage` indices, FOV, physics, and rendering all work directly. Index tiles with `idxFor(x, y, width)`.

**Tile access** (`src/engine/core/tile-source.ts`): a `TileSource` abstraction decouples tile read/write from storage. `state.tiles` is the canonical accessor — FOV, rendering, and physics all read through it (`getTile`/`passable`). For every level it is a `FlatTileSource` over `state.map`. Physics only colliders walls that border passable space (`Physics.ensureWallBody`), so large mostly-solid maps stay cheap; `updateTile(tiles, x, y)` reconciles a changed tile and its neighbours incrementally (destroyed walls, opened doors).

### Content & Assets

- **Content registries** (`src/engine/content/`): data-driven definitions decoupled from
  behavior. `monster-defs.ts` (`MONSTER_DEFS`) holds per-monster stats, the AI
  `behavior` archetype (`melee`/`ranged`/`bot`), spawn weight/`minDepth`/`miniboss`,
  ability `flags`, and loot; `MonsterEntity` and the spawner read it. `item-defs.ts`
  (`ITEM_DEFS`) holds per-item name/category/flags. Add new items/monsters here.
- **Asset pipeline** (`tools/`, run `npm run gen:assets`): art and sound are
  generated deterministically from code so they're reproducible and reviewable.
  `gen-spritesheet.mjs` composites procedural placeholder sprites onto a pristine
  base (`tools/sprites.base.png`) → `app/assets/img/sprites.png`; new cells must
  match `SPRITE_COORDS` in `src/engine/config/sprites.ts`. `gen-sounds.mjs` synthesizes
  WAV effects. `tools/png.mjs` is a dependency-free PNG codec (zlib only).

### Build Variants

One shared engine is consumed by four variants: **① Electron client** (`npm run
build`), **② headless server** (`server/multiplayer-server.ts`, `npm run
server:start`, `apps/server/`), **③ static web client** (`npm run build:web`,
`apps/web/` — single-player + join-by-address; can't host or LAN-discover), and
**④ arcade cabinet** (`apps/arcade/`, scaffolded, built last). See
`docs/ARCHITECTURE.md` for the variant matrix, the engine-purity rule, and the
optional npm-workspaces lift. The source tree is split by those package
boundaries: **`src/engine/`** is
the platform-agnostic core (types, config/sprites, core, entities, content, utils,
systems/{simulation,physics,fov}); **`src/client/`** is the presentation layer
(`main.ts` entry + `systems/` renderer/sound/input/UI); **`src/net/`** is the wire
protocol/client; and **`server/`** is the headless server. The Vite bundle entry
is `src/client/main.ts`. **New engine code must not import DOM/Pixi/Electron/ws/node**
— enforced by `src/engine-purity.test.ts`, which scans `src/engine` and fails on
any forbidden import. Sound IDs live in `src/engine/content/sound-effects.ts`
(pure data); `src/client/systems/sound.ts` is the DOM playback layer that re-exports
them. Lifting `src/engine` into a `packages/engine` workspace later is a
mechanical move.

### Key Utilities

- `src/engine/utils/helpers.ts`: `idxFor()`, `inBoundsFor()`, `passableFor()`, `tileAtFor()`, `setTileFor()`, `dist()`, `setPositionFromGrid()`
  - The tile helpers take explicit `width`/`height` (the `For` suffix) — there are no global-width variants; always pass the level's `mapWidth`/`mapHeight`
- `src/engine/utils/walls.ts`: `applyWallDamageAt()` for destructible walls
- `src/engine/utils/repair.ts`: `applyRepairAt()`, `findNearestRepairTarget()`, `hasAnyRepairTarget()` — used by utility bot
- `src/engine/utils/rng.ts`: Deterministic RNG — `RNG.int(n)`, `RNG.choose(arr)`, `RNG.chance(p)`. The `RandomNumberGenerator` class is exported for independent seeded instances (e.g. per-level dungeon generation).
- `src/engine/utils/pathfinding.ts`: A\* pathfinding for click-to-move

### State & Commands Pattern

Player input → `enqueueCommand(state, {...})` → `stepSimulationTick(state)` resolves commands → pushes events → `processEventQueue()` handles cascading effects (damage → death → loot drop → chain explosions). Access game state via `Game.getState()`.

## Code Style

- TypeScript strict mode. PascalCase for classes/types, camelCase for functions/variables.
- One class/system per file. Named imports with relative paths.
- Composition over inheritance. Pure functions where possible.
- Performance matters in rendering and physics paths.
