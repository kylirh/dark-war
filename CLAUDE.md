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

Vite bundles `src/main.ts` into `app/game.js` (IIFE format). Electron loads `app/index.html` which references this bundle. The server (`server/multiplayer-server.ts`) is bundled separately into `app/server-bundle.js` and can run as a child process within the Electron app. The server also runs directly via `tsx` for development.

### Core Loop

`DarkWar` class in `src/main.ts` orchestrates everything:
- **GameLoop** (`src/core/game-loop.ts`): Fixed 60Hz timestep with accumulator pattern. Calls `update(dt)` at fixed rate and `render(alpha)` at variable framerate with interpolation.
- **Simulation** (`src/systems/simulation/`): Tick-based command/event system running at 20 ticks/sec (`SIM_DT_MS = 50`). Split into domain modules: `constants`, `sim-helpers`, `ai`, `commands`, `explosives`, `events`, `tick` (entry point with `stepSimulationTick`). Player actions become Commands, resolved into Events (damage, death, pickup, etc.). AI commands generated after player commands each tick.
- **Physics** (`src/systems/physics.ts`): Uses `detect-collisions` library for continuous collision detection. Wall sliding, bullet movement, explosive physics.
- **Game** (`src/core/game.ts`): Central state manager. Holds all `GameState`, handles level transitions (descend/ascend), serialization, FOV updates, and multiplayer player management.

### Coordinate System (Critical)

- **`worldX`/`worldY`**: Float pixel coordinates — the source of truth for all entity positions
- **`gridX`/`gridY`**: Read-only getters on `GameEntity`, derived as `Math.floor(worldX / 32)`
- **Never set `gridX`/`gridY` directly** — they are computed properties
- Tiles are 32×32 pixels. Use `entity.worldX`/`entity.worldY` to position entities
- Movement: set `entity.velocityX`/`entity.velocityY` (pixels per second)

### Entity System

All entities extend `GameEntity` (`src/entities/game-entity.ts`) which provides `worldX`/`worldY`, velocity, facing angle, and physics body. Entity types: `PlayerEntity`, `MonsterEntity`, `ItemEntity`, `BulletEntity`, `ExplosiveEntity`. Discriminated by `EntityKind` enum.

**Entity lifecycle** is owned by `EntityManager` (`src/core/entity-manager.ts`), accessible as `state.entityManager`. It owns the entity array (shared in place with `state.entities`) and is the **only** way to add/remove entities — use `spawn()`, `destroy()`, `destroyWhere()`, `destroyByIds()`, `replaceAll()`. Never `state.entities.push(...)` or reassign `state.entities` directly; that desyncs physics bodies and network deltas. The manager tracks `spawnedIds`/`removedIds` diffs, which `Physics.syncEntityBodies()` consumes to reconcile colliders incrementally each frame. `Physics.rebuildAll(state)` rebuilds the whole physics world (walls + all entity bodies) on level transitions.

### CTDM (Cognitive Time Dilation Module)

The CTDM is an in-game item the player can find and equip. When active, it slows time based on threat level (nearby alert enemies). Time scale smoothly interpolates between `SLOWMO_SCALE` (0.05) and real-time. The `sim.timeScale` and `sim.targetTimeScale` fields on `GameState` control this. CTDM has a charge meter that drains under threat and recharges when safe. Toggle with `C`.

### Multiplayer

Two modes: `offline` (default) and `online`. In online mode, an authoritative WebSocket server (`server/multiplayer-server.ts`) runs the Game and Physics simulation. Clients send velocity updates and actions; the server uses per-player FOV and explored state. Online play is always **real time** — there is no CTDM/time dilation, and the CTDM item is not spawned.

**Per-depth worlds:** the server simulates one `LevelWorld` (its own `Game` + `Physics`) per depth, shared by everyone on that depth (co-op: same layout, same monsters). Players are tracked by depth and migrate between worlds individually — taking stairs (`DESCEND`/`ASCEND`, validated on the stairs tile) or falling through a hole (a player ending a tick on a `HOLE` tile drops to the next depth with fall damage) moves only that player, never the whole party. Empty worlds are frozen but retained. Migration carries the player entity (HP/inventory) via `Game.detachPlayer`/`attachExistingPlayer` and forces a keyframe so the client rebaselines on the new world.

**Protocol** (`src/net/protocol.ts`, `PROTOCOL_VERSION`): the server stamps its version in the `welcome` message and clients refuse to play on a mismatch. Bump it whenever the wire format changes.

**Input sequence numbers**: every client `velocity`/`action` carries a monotonic `seq`. The server records the highest processed seq per client and echoes it as `ackSeq` on every state message (`MultiplayerClient.getLastAckedSeq()`).

**Client-side prediction** (movement-only v1): the online client predicts the local player immediately under the latest local input (`Physics.predictLocalMovement` — single-entity movement vs walls), so input feels instant. On each snapshot `reconcileLocalPlayer` keeps most of the prediction and eases out residual error; large gaps (teleport, hole-fall, respawn) hard-snap to the server. Firing and hit resolution stay fully server-authoritative; remote entities come straight from the server. See `src/main.ts` (`predictLocalPlayer`, `reconcileLocalPlayer`, `ensurePredictionWorld`).

**Delta-compressed broadcasts** (`src/net/state-delta.ts`): instead of the full `GameState` every tick, the server keeps a per-client baseline and sends `state_full` (keyframe — on join, level change, new game, and every ~5s) or `state_delta` (changed entities by id, explored additions, map/wallDamage index changes, changed scalars). The client applies deltas onto its baseline to reconstruct a full `SerializedState` and feeds the existing `deserialize()` path. A baseline mismatch triggers a `request_keyframe`.

**LAN multiplayer**: The Electron app can host an embedded server (child process via `electron/server-manager.js`) and advertises it over UDP LAN discovery. Other players on the same network see available games via `DiscoveryManager`. All managed through the in-game GameMenu — no separate terminal needed.

### Map Generation

- **Dungeon (streamed)** (`src/core/level-streamer.ts`): dungeon levels are large `128×96` maps that start solid and fill in `16×16` connected room/corridor chunks around each player as they explore (`LevelStreamer.ensureAround`, driven by `Game.streamAroundPlayers` from the offline loop and the multiplayer `stepWorld`). Generation is deterministic from `state.levelSeed`; the down-stairs sit in a far chunk and are revealed on approach; monsters/items scatter into newly revealed chunks.
- **Outside** (`src/core/outside-level.ts`): Procedural exterior level (finite, not streamed). Size `OUTSIDE_MAP_WIDTH × OUTSIDE_MAP_HEIGHT` (128×72).

The streamed dungeon stays a **bounded** flat `TileType[]`, so serialization, `explored`/`wallDamage` indices, FOV, physics, and rendering all work unchanged — clients just receive carved tiles via the map delta and render them under fog. Index tiles with `idx(x, y)` or `idxFor(x, y, width)`.

**Tile access** (`src/core/tile-source.ts`, `src/core/chunked-map.ts`): a `TileSource` abstraction decouples tile read/write from storage. `state.tiles` is the canonical accessor — FOV, rendering, and physics all read through it (`getTile`/`passable`). For every level today it is a `FlatTileSource` over `state.map`; `ChunkedTileSource` (unbounded, generated on demand) exists for a future truly-infinite world. Physics only colliders walls that border passable space (`Physics.ensureWallBody`), so large mostly-solid maps stay cheap; `updateTile(tiles, x, y)` reconciles a changed tile and its neighbours incrementally (destroyed walls, opened doors, streamed-in chunks).

### Key Utilities

- `src/utils/helpers.ts`: `idx()`, `idxFor()`, `inBounds()`, `inBoundsFor()`, `passable()`, `passableFor()`, `tileAt()`, `tileAtFor()`, `dist()`, `setPositionFromGrid()`
  - Functions ending in `For` take explicit `width`/`height` — use these for outside levels or any non-standard map size
  - Functions without suffix use global `MAP_WIDTH`/`MAP_HEIGHT` constants
- `src/utils/walls.ts`: `applyWallDamageAt()` for destructible walls
- `src/utils/repair.ts`: `applyRepairAt()`, `findNearestRepairTarget()`, `hasAnyRepairTarget()` — used by utility bot
- `src/utils/rng.ts`: Deterministic RNG — `RNG.int(n)`, `RNG.choose(arr)`, `RNG.chance(p)`. The `RandomNumberGenerator` class is exported for independent seeded instances (e.g. per-chunk generation).
- `src/utils/pathfinding.ts`: A* pathfinding for click-to-move

### State & Commands Pattern

Player input → `enqueueCommand(state, {...})` → `stepSimulationTick(state)` resolves commands → pushes events → `processEventQueue()` handles cascading effects (damage → death → loot drop → chain explosions). Access game state via `Game.getState()`.

## Code Style

- TypeScript strict mode. PascalCase for classes/types, camelCase for functions/variables.
- One class/system per file. Named imports with relative paths.
- Composition over inheritance. Pure functions where possible.
- Performance matters in rendering and physics paths.
