# AGENTS.md

**Instructions for AI coding agents working in the Dark War codebase.**

This is a roguelike remake of Mission Thunderbolt (1992) built with TypeScript,
Pixi.js, and Electron. It features continuous actor movement, CTDM time dilation,
mouse-aiming, destructible terrain, and LAN multiplayer.

## Required project context

Before changing world, terrain, rendering, asset, save, or multiplayer code, read:

1. `docs/ART-DIRECTION.md` — authoritative visual and emotional direction.
2. `docs/TERRAIN-AND-WORLD.md` — authoritative world/terrain decisions.
3. `docs/ROADMAP.md` — milestone order and cross-branch handoff ledger.
4. `docs/ARCHITECTURE.md` — current runtime boundaries and approved direction.

Dark War is unreleased. Compatibility with old saves, generated worlds, and
network clients is explicitly not required. Prefer clean replacement of obsolete
formats and code paths over compatibility shims. Each branch must still finish in
a playable, type-safe, tested state.

The product is a cheerful, outline-free, modern pixel-art rebuilding adventure,
not a grimdark combat showcase. Preserve the hopeful tone, painterly clusters,
limited vibrant palette, colored atmospheric light, and building/community
focus defined in `docs/ART-DIRECTION.md`.

---

## Build, Type Check, and Run Commands

```bash
# Development
npm run dev                    # Build TypeScript + Vite, then launch Electron
npm run dev:online             # Build and launch in multiplayer mode (connects to localhost:7777)
npm run watch                  # Vite watch mode (run `npx electron .` separately)

# Multiplayer
npm run multiplayer:server     # Start authoritative WebSocket server (tsx) — for non-LAN/manual hosting
npm run online:client          # Launch additional client without rebuilding

# Type Checking
npm run type-check             # Type-check both client and server
npm run type-check:client      # Type-check client only (tsconfig.json)
npm run type-check:server      # Type-check server only (tsconfig.server.json)

# Testing
npm test                       # Run the Vitest unit suite once
npm run test:watch             # Vitest watch mode

# Building
npm run build:ts               # Compile TypeScript (tsc) + bundle with Vite
npm run build                  # Full distributable build (macOS/Windows/Linux via electron-builder)
```

**Vitest** covers the deterministic logic (simulation, helpers, netcode
encoding, tile/map systems, entity lifecycle) as co-located `*.test.ts` files;
type-checking remains the primary validation for the Electron/Pixi/DOM layers.
No linter is configured.

---

## Code Style Guidelines

### TypeScript

- **Strict mode enabled** — All strict TypeScript compiler options are on
- **Explicit types for function signatures** — Always type parameters and return values
- **No implicit any** — All values must have explicit or inferred types

### Imports

- **Use named imports with relative paths**
  ```typescript
  import { GameEntity } from "../entities/game-entity";
  import { RNG } from "../utils/rng";
  import { idxFor, passableFor, tileAtFor } from "../utils/helpers";
  ```
- **Never use default exports** — Only named exports
- **One class/system per file**
- **Filenames are kebab-case** (`game-entity.ts`, `outside-level.ts`, `multiplayer-client.ts`); no barrel/`index.ts` files — import the specific module directly

### Naming Conventions

- **PascalCase:** Classes, interfaces, types, enums
- **camelCase:** Functions, variables, properties, methods
- **SCREAMING_SNAKE_CASE:** Constants and configuration values

### Formatting

- **Prettier is configured** — use `npm run format` / `npm run format:check` for broad formatting passes
- **No ESLint configured** — type-checking and tests are the primary automated validation
- **Indentation:** 2 spaces
- **Semicolons:** Always use them
- **String quotes:** Double quotes preferred
- **Trailing commas:** Use in multiline arrays/objects

### Documentation

- **File headers:** Include JSDoc comment explaining purpose
- **Public method docs:** Use JSDoc comments for public APIs
- **Self-documenting code:** Prefer clear variable/function names over comments
- **Inline comments:** Only when logic is non-obvious

### Error Handling

- **Minimal explicit error handling** — Most functions assume valid input
- **Defensive checks for critical operations**
- **No try-catch in normal flow** — Let errors propagate naturally
- **Type guards for discriminated unions:**
  ```typescript
  if (entity.kind === EntityKind.MONSTER) {
    const monster = entity as Monster;
  }
  ```

### State Management

- **Central state object:** All game state lives in `GameState` type
- **Access via Game class:** Use `Game.getState()` to read state
- **Immutability not enforced** — Direct mutation is common and acceptable
- **Commands and events:** Use command queue for scheduling actions, event queue for cascading effects

---

## Critical Patterns and Gotchas

### Coordinate System (CRITICAL)

**NEVER set `gridX` or `gridY` directly — they are read-only getters!**

```typescript
// ❌ WRONG
entity.gridX = 5;
entity.gridY = 10;

// ✅ CORRECT — use worldX/worldY (pixels, source of truth)
entity.worldX = 5 * 32 + 16; // grid position * tile size + half tile
entity.worldY = 10 * 32 + 16;

// ✅ CORRECT — helper function
setPositionFromGrid(entity, 5, 10);

// ✅ CORRECT — for movement, set velocity
entity.velocityX = 225; // pixels per second
entity.velocityY = 0;
```

- **`worldX`/`worldY`:** Float pixel coordinates — **source of truth**
- **`gridX`/`gridY`:** Integer tile coordinates — **computed getters, read-only**
- **Tiles are 32×32 pixels:** `CELL_CONFIG.w = 32`, `CELL_CONFIG.h = 32`
- **Map dimensions:** Dungeon = 128×96, Outside = 128×72

### Helper Functions

Tile helpers take explicit `width`/`height` (the `For` suffix). There are no
global-width variants — always pass the level's `mapWidth`/`mapHeight`:

```typescript
idxFor(x, y, width);
inBoundsFor(x, y, width, height);
tileAtFor(map, x, y, width, height);
setTileFor(map, x, y, width, tile);
passableFor(map, x, y, width, height);
```

### Entity System

All entities extend `GameEntity` which provides continuous movement:

```typescript
export abstract class GameEntity {
  worldX: number; // Pixel position
  worldY: number;
  prevWorldX: number; // For interpolation
  prevWorldY: number;
  velocityX: number = 0; // Pixels per second
  velocityY: number = 0;
  facingAngle: number = 0; // Radians (0 = right, PI/2 = down)
  get gridX(): number {} // READ-ONLY
  get gridY(): number {} // READ-ONLY
  physicsBody?: Body; // Set by Physics system
}
```

Entity types: `PlayerEntity`, `MonsterEntity`, `ItemEntity`, `BulletEntity`, `ExplosiveEntity`

Monster definitions are data-driven in `src/engine/content/monster-defs.ts`.
Current types include basic melee/ranged enemies, utility bots, pets/friendlies,
thieves, breeders, explosive enemies, invisible enemies, deep ranged enemies,
and miniboss-scale threats.

Discriminate by `EntityKind` enum:

```typescript
if (entity.kind === EntityKind.MONSTER) {
  const monster = entity as Monster;
}
```

### Current Map Representation

- **Canonical accessor:** `state.tiles` (a `TileSource`) — read/write tiles via
  `getTile(x, y)`, `setTile(x, y, tile)`, `passable(x, y)`. Generated levels use
  an authoritative `WorldPlane` with ground, structure, fixture, elevation, and
  damage typed arrays.
- **Dungeons:** bounded `128×96` maps generated in full up front by
  `generateDungeon` (`src/engine/core/dungeon-generator.ts`) — rooms + caves connected
  by a Prim's MST with extra loop edges, doors at corridor pinches, and a sealed
  impenetrable border. Deterministic from a per-level seed; full connectivity is
  unit-tested.
- **Derived flat array:** `state.map` is a synchronized `TileType[]` projection
  sized `mapWidth × mapHeight` (outside is 128×72). It temporarily supports
  systems awaiting semantic-query migration; it is not serialized authority.
- **Persistence/network:** `SerializedWorldPlane` carries all five semantic
  layers. Multiplayer deltas diff each layer independently. Legacy scalar saves
  and pre-v6 clients are intentionally unsupported.
- **Index with:** `idxFor(x, y, width)` — always prefer the `For` variant in systems
- **Query tile:** `tileAtFor(map, x, y, width, height)`
- **Check passable:** `passableFor(map, x, y, width, height)`
- **Set tile:** `setTileFor(map, x, y, width, TileType.FLOOR)`

This is current implementation guidance, not the target architecture. The active
program replaces the scalar `TileType[]` with compositional typed-array layers on
2D WorldPlanes, signed discrete elevation, static water, and portal-linked
WorldSpaces. Do not extend the scalar enum with new ground/structure/fixture
combinations when the approved layered model is the appropriate solution.

### Rendering, Camera & Wrap-Around

- **Windowed rendering:** `renderer.ts` sizes the canvas to the viewport and
  draws only the tiles in a window around the camera each frame — no DOM
  scrolling. The camera (`cameraWorldX/Y`) smooth-follows the player and is
  clamped to the map edge on bounded levels.
- **Toroidal outside world:** level 0 (`levelKind === "outside"`) wraps — walk
  off one edge, reappear on the other. The wrap math lives in `src/engine/utils/wrap.ts`
  (`wrapValue`, `wrapDelta`, `nearestWrappedImage`) and is applied in the
  renderer (window lookups, camera, entity images), physics (position/bullet
  wrap instead of clamp), and FOV (`computeFOVFrom(..., wraps)`). Dungeons are
  sealed so they never hit a seam.
- **Mouse → world:** `MouseTracker` adds the camera window origin
  (`renderer.getCameraTopLeft()`) to the canvas pixel / zoom.

### CTDM Time Dilation

- **CTDM is an in-game item** the player finds (not active from the start)
- When active: threat level computed from nearby alert monsters → time slows proportionally
- `sim.timeScale` and `sim.targetTimeScale` on `GameState` control the dilation
- Player toggle with `C` key; auto-disables when charge hits 0
- Without CTDM: time always runs at near-real-time (`REAL_TIME_SCALE = 0.85`)

### Command/Event Pattern

```typescript
// Schedule player action
enqueueCommand(state, {
  type: CommandType.FIRE,
  actorId: player.id,
  tick: state.sim.nowTick,
  data: { type: "FIRE", dx: 0, dy: 0, weapon: WeaponType.PISTOL },
  priority: 1,
  source: "PLAYER",
});

// Commands → Events during tick processing
// Events cascade: damage → death → loot drop → chain explosions
```

### RNG Usage

**Always use deterministic RNG for gameplay logic:**

```typescript
import { RNG } from "../utils/rng";

RNG.int(10); // Random integer 0–9
RNG.choose(array); // Random element from non-empty array
RNG.chance(0.5); // 50% chance, returns true
```

### Entity Lifecycle

Add/remove entities only through `state.entityManager` (`src/engine/core/entity-manager.ts`) — `spawn()`, `destroy()`, `destroyWhere()`, `destroyByIds()`, `replaceAll()`. It owns the entity array in place and tracks spawn/remove diffs that `Physics.syncEntityBodies()` uses to reconcile colliders. Direct `state.entities.push(...)` or reassigning `state.entities` will desync physics bodies and network deltas.

### Simulation Modules

The simulation is split into domain modules under `src/engine/systems/simulation/` (no barrel — import the specific file):

- `tick.ts` — `stepSimulationTick` (entry point), hole-fall and item-pickup processing
- `commands.ts` — `enqueueCommand` + all `resolve*Command` handlers
- `events.ts` — all `process*Event` handlers + `processEventQueue`
- `ai.ts` — monster steering, utility bot BFS, `generateAICommands`
- `explosives.ts` — grenade/mine fuse logic, chain explosions, effects
- `sim-helpers.ts` — `pushEvent`, `canActorAct`, `hasClearLineOfSight`, entity queries
- `constants.ts` — all simulation constants (speeds, delays, config)

### Multiplayer Considerations

- Two modes: `offline` (default) and `online`
- In `online` mode, server is authoritative (runs Game + Physics), always real time (no CTDM/time dilation)
- **Per-depth worlds:** one `LevelWorld` (Game + Physics) per depth, shared by everyone on that depth; players migrate individually on stairs/holes via `Game.detachPlayer`/`attachExistingPlayer` (only the acting player moves)
- Wire format is versioned (`src/net/protocol.ts`, `PROTOCOL_VERSION`); mismatched clients are rejected
- Protocol breaks are allowed during the approved world rewrite. Bump the
  version and replace the old encoding; do not maintain compatibility branches.
- Clients send velocity/actions stamped with a monotonic `seq`; the server echoes the processed seq as `ackSeq`
- **Client-side prediction** (movement-only): the local player is predicted immediately and reconciled against server snapshots (`src/client/main.ts`, `Physics.predictLocalMovement`). Firing/hits stay server-authoritative
- **Delta broadcasts** (`src/net/state-delta.ts`): per-client keyframe + delta instead of full state every tick
- Per-player FOV and explored state tracked separately
- LAN hosting: Electron embeds the server as a child process; UDP discovery via `electron/server-manager.js`

---

## Project Structure

The source tree is split into engine/client/net by package boundary (see `docs/ARCHITECTURE.md`):

```
src/
├── engine/   # platform-agnostic core — NO DOM/Pixi/Electron/ws/node
│             # (types, config/sprites, core, entities, content, utils,
│             #  systems/{simulation,physics,fov}); guarded by engine-purity.test.ts
├── client/   # presentation — main.ts entry + systems/ (renderer, sound, input, UI)
├── net/      # wire protocol + WebSocket client + delta codec
server/       # headless multiplayer server
```

The three roots below all live under `src/`. Engine purity is enforced by
`src/engine-purity.test.ts`. Vite bundles `src/client/main.ts` → `app/game.js`.

```
engine/                       # PURE core — no DOM/Pixi/Electron/ws/node
├── config/
│   └── sprites.ts            # Sprite-sheet coordinates (data)
├── content/                  # Data-driven definitions (decoupled from behavior)
│   ├── monster-defs.ts       # Per-monster stats, AI archetype, spawn, abilities, loot
│   ├── item-defs.ts          # Per-item name/category/flags
│   └── sound-effects.ts      # SoundEffect IDs (pure data; client sound.ts plays them)
├── core/
│   ├── game.ts               # State manager, level transitions, FOV, serialization
│   ├── game-loop.ts          # Fixed 60Hz timestep with accumulator
│   ├── entity-manager.ts     # Entity add/remove + lifecycle diff tracking
│   ├── dungeon-generator.ts  # Bounded full-level dungeon generation (128×96)
│   ├── outside-level.ts      # Procedural toroidal outside level (128×72)
│   └── tile-source.ts        # TileSource interface + FlatTileSource adapter
├── entities/
│   ├── game-entity.ts        # Base class with worldX/worldY
│   ├── player-entity.ts
│   ├── monster-entity.ts
│   ├── item-entity.ts
│   ├── bullet-entity.ts
│   └── explosive-entity.ts
├── systems/
│   ├── fov.ts                # Field of view (rot.js PreciseShadowcasting)
│   ├── physics.ts            # Collision detection (detect-collisions)
│   └── simulation/           # Simulation system (domain modules, no barrel)
│       ├── tick.ts           # stepSimulationTick (entry), hole-falls, pickups
│       ├── constants.ts      # All simulation constants
│       ├── sim-helpers.ts    # pushEvent, canActorAct, LOS, entity queries
│       ├── ai.ts             # Monster steering + AI command generation
│       ├── commands.ts       # Command management + all resolve*Command
│       ├── events.ts         # processEventQueue + all process*Event handlers
│       └── explosives.ts     # Grenade/mine fuse, chain explosions, effects
├── utils/
│   ├── helpers.ts            # idxFor(), inBoundsFor(), passableFor(), dist(), etc.
│   ├── inventory.ts          # Inventory/weapon-slot helpers
│   ├── multiplayer.ts        # Multiplayer utility helpers
│   ├── pathfinding.ts        # A* pathfinding (click-to-move)
│   ├── repair.ts             # applyRepairAt(), findNearestRepairTarget()
│   ├── rng.ts                # Deterministic RNG (+ exported RandomNumberGenerator)
│   ├── walls.ts              # applyWallDamageAt() for destructible walls
│   └── wrap.ts               # Toroidal wrap helpers (wrapValue, wrapDelta, …)
└── types.ts                  # All TypeScript type definitions

client/                       # Presentation — Pixi/DOM/Electron-bridge layer
├── main.ts                   # DarkWar entry — orchestrates loop/render/input/net
└── systems/
    ├── renderer.ts           # Pixi.js windowed rendering with interpolation
    ├── input.ts              # Keyboard/mouse input handling
    ├── mouse-tracker.ts      # Mouse world-position and aiming angle
    ├── sound.ts              # Sound-effect playback (re-exports engine SoundEffect)
    ├── music.ts              # Background music
    ├── ui.ts                 # In-game HUD updates
    ├── game-menu.ts          # Main menu, pause menu, multiplayer lobby
    ├── title-screen.ts       # Animated title screen
    ├── intro-story.ts        # Intro lore slides shown before new game
    ├── character-modal.ts    # Character/stats modal
    ├── inventory-bar.ts      # Inventory hotbar UI
    ├── save-slots.ts         # Save/load slot dialog
    ├── preferences.ts        # Persistent user settings and keybindings
    ├── retro-window-chrome.ts # Window chrome / UI shell
    └── retro-modal.ts        # Shared retro modal component

net/
├── multiplayer-client.ts     # WebSocket client for online mode
├── protocol.ts               # PROTOCOL_VERSION (wire compatibility gate)
└── state-delta.ts            # Keyframe/delta encode + apply for broadcasts

server/
└── multiplayer-server.ts     # Authoritative WebSocket server (delta broadcasts)

electron/
├── main.js                   # Electron main process + IPC handlers
├── preload.js                # Electron preload (exposes IPC to renderer)
└── server-manager.js         # Embedded server process + UDP LAN discovery

app/
├── index.html                # Entry point
├── game.js                   # Vite output (IIFE bundle from src/client/main.ts)
└── server-bundle.js          # esbuild output (server for packaged app)
```

---

## Development Philosophy

- **Major architectural changes are encouraged** when they serve the vision
- Work in **playable chunks** — each step should result in a working game
- **Never leave codebase broken or half-implemented**
- Favor **flexible, modular designs** over premature optimization
- **Clarity, debuggability, extensibility** > short-term speed
- Old saves and protocol versions have no compatibility requirement while the
  game is unreleased
- Aseprite and Tiled are build-time authoring sources; gameplay identity must not
  depend on atlas coordinates or editor tile IDs
- Coordinate multi-branch work through `docs/ROADMAP.md`; update its handoff
  ledger when ownership or status changes

---

## Common Helper Functions

```typescript
// Coordinate conversion (all take explicit dimensions — pass mapWidth/mapHeight)
idxFor(x, y, width)                    // Grid → array index
inBoundsFor(x, y, width, height)       // Within explicit-size map bounds
tileAtFor(map, x, y, width, height)    // Get tile type
passableFor(map, x, y, width, height)  // Walkable?
setTileFor(map, x, y, width, tileType) // Set tile

// Entity positioning
setPositionFromGrid(entity, x, y)      // Teleport entity to grid cell center

// Distance and queries
dist([x1, y1], [x2, y2])              // Manhattan distance
entityAt(entities, x, y, filter?)     // Find entity at grid position
entitiesAt(entities, x, y)            // All entities at grid position

// RNG
RNG.int(n)                            // Random integer 0 to n-1
RNG.choose(array)                     // Random element from array
RNG.chance(probability)               // Returns true with given probability

// Walls and repair
applyWallDamageAt(state, x, y, damage)    // Damage/destroy wall tile
applyRepairAt(state, x, y)               // Repair damaged wall or fill hole
findNearestRepairTarget(state, x, y)     // BFS for nearest repairable tile
hasAnyRepairTarget(state)                // Quick check if repairs needed
```

---

## Key References

- **Terrain/world design:** `docs/TERRAIN-AND-WORLD.md`
- **Execution roadmap:** `docs/ROADMAP.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Agent quick context:** `.github/copilot-instructions.md`, `CLAUDE.md`
- **TypeScript config:** `tsconfig.json`, `tsconfig.server.json`
- **Build pipeline:** `vite.config.ts`, `package.json`
