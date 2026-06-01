# AGENTS.md

**Instructions for AI coding agents working in the Dark War codebase.**

This is a roguelike remake of Mission Thunderbolt (1992) built with TypeScript, Pixi.js, and Electron. Features continuous fluid movement, a CTDM (Cognitive Time Dilation Module) combat system, mouse-aiming, destructible walls, and LAN multiplayer. See `.github/copilot-instructions.md` for the full vision and `CLAUDE.md` for architecture details.

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

- **No ESLint or Prettier configured** — Follow existing patterns
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

Monster types: `MonsterType.MUTANT`, `MonsterType.RAT`, `MonsterType.SKULKER` (ranged), `MonsterType.UTILITY_BOT` (repairs walls)

Discriminate by `EntityKind` enum:

```typescript
if (entity.kind === EntityKind.MONSTER) {
  const monster = entity as Monster;
}
```

### Map Representation

- **Canonical accessor:** `state.tiles` (a `TileSource`) — read/write tiles via
  `getTile(x, y)`, `setTile(x, y, tile)`, `passable(x, y)`. Every level wraps the
  flat array in a `FlatTileSource`.
- **Dungeons:** bounded `128×96` maps generated in full up front by
  `generateDungeon` (`src/core/dungeon-generator.ts`) — rooms + caves connected
  by a Prim's MST with extra loop edges, doors at corridor pinches, and a sealed
  impenetrable border. Deterministic from a per-level seed; full connectivity is
  unit-tested.
- **Flat array (backing / serialization):** `TileType[]` sized
  `mapWidth × mapHeight` (outside is 128×72). The `*For` helpers operate on it
  directly in code that reads the array rather than `state.tiles`.
- **Index with:** `idxFor(x, y, width)` — always prefer the `For` variant in systems
- **Query tile:** `tileAtFor(map, x, y, width, height)`
- **Check passable:** `passableFor(map, x, y, width, height)`
- **Set tile:** `setTileFor(map, x, y, width, TileType.FLOOR)`

### Rendering, Camera & Wrap-Around

- **Windowed rendering:** `renderer.ts` sizes the canvas to the viewport and
  draws only the tiles in a window around the camera each frame — no DOM
  scrolling. The camera (`cameraWorldX/Y`) smooth-follows the player and is
  clamped to the map edge on bounded levels.
- **Toroidal outside world:** level 0 (`levelKind === "outside"`) wraps — walk
  off one edge, reappear on the other. The wrap math lives in `src/utils/wrap.ts`
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

Add/remove entities only through `state.entityManager` (`src/core/entity-manager.ts`) — `spawn()`, `destroy()`, `destroyWhere()`, `destroyByIds()`, `replaceAll()`. It owns the entity array in place and tracks spawn/remove diffs that `Physics.syncEntityBodies()` uses to reconcile colliders. Direct `state.entities.push(...)` or reassigning `state.entities` will desync physics bodies and network deltas.

### Simulation Modules

The simulation is split into domain modules under `src/systems/simulation/` (no barrel — import the specific file):

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
- Clients send velocity/actions stamped with a monotonic `seq`; the server echoes the processed seq as `ackSeq`
- **Client-side prediction** (movement-only): the local player is predicted immediately and reconciled against server snapshots (`src/main.ts`, `Physics.predictLocalMovement`). Firing/hits stay server-authoritative
- **Delta broadcasts** (`src/net/state-delta.ts`): per-client keyframe + delta instead of full state every tick
- Per-player FOV and explored state tracked separately
- LAN hosting: Electron embeds the server as a child process; UDP discovery via `electron/server-manager.js`

---

## Project Structure

The source tree is split by future-package boundary (see `docs/ARCHITECTURE.md`):

```
src/
├── engine/   # platform-agnostic core — NO DOM/Pixi/Electron/ws/node
│             # (types, config/sprites, core, entities, content, utils,
│             #  systems/{simulation,physics,fov}); guarded by engine-purity.test.ts
├── client/   # presentation — main.ts entry + systems/ (renderer, sound, input, UI)
├── net/      # wire protocol + WebSocket client + delta codec
server/       # headless multiplayer server
```

The subtrees below are shown relative to `src/engine/` unless noted (e.g.
`engine/core/game.ts`, `client/systems/renderer.ts`). Vite bundles
`src/client/main.ts` → `app/game.js`.

```
engine/
├── config/
│   └── sprites.ts            # Sprite sheet configuration
├── core/
│   ├── game.ts               # State manager, level transitions, FOV, serialization
│   ├── game-loop.ts          # Fixed 60Hz timestep with accumulator
│   ├── entity-manager.ts     # Entity add/remove + lifecycle diff tracking
│   ├── dungeon-generator.ts  # Bounded full-level dungeon generation (128×96)
│   ├── outside-level.ts      # Procedural outside level generation (128×72)
│   └── tile-source.ts        # TileSource interface + FlatTileSource adapter
├── entities/
│   ├── game-entity.ts        # Base class with worldX/worldY
│   ├── player-entity.ts
│   ├── monster-entity.ts
│   ├── item-entity.ts
│   ├── bullet-entity.ts
│   └── explosive-entity.ts
├── net/
│   ├── multiplayer-client.ts # WebSocket client for online mode
│   ├── protocol.ts           # PROTOCOL_VERSION (wire compatibility gate)
│   └── state-delta.ts        # Keyframe/delta encode + apply for broadcasts
├── systems/
│   ├── fov.ts                # Field of view (rot.js PreciseShadowcasting)
│   ├── game-menu.ts          # Main menu, pause menu, multiplayer lobby
│   ├── input.ts              # Keyboard/mouse input handling
│   ├── intro-story.ts        # Intro lore slides shown before new game
│   ├── mouse-tracker.ts      # Mouse world-position and aiming angle
│   ├── music.ts              # Background music
│   ├── physics.ts            # Collision detection (detect-collisions)
│   ├── preferences.ts        # Persistent user settings and keybindings
│   ├── renderer.ts           # Pixi.js rendering with interpolation
│   ├── retro-window-chrome.ts # Window chrome / UI shell
│   ├── retro-modal.ts        # Shared retro modal component
│   ├── character-modal.ts    # Character/stats modal
│   ├── inventory-bar.ts      # Inventory hotbar UI
│   ├── save-slots.ts         # Save/load slot dialog
│   ├── sound.ts              # Sound effects
│   ├── title-screen.ts       # Animated title screen
│   ├── ui.ts                 # In-game HUD updates
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
│   └── walls.ts              # applyWallDamageAt() for destructible walls
└── types.ts                  # All TypeScript type definitions

server/
└── multiplayer-server.ts     # Authoritative WebSocket server (delta broadcasts)

electron/
├── main.js                   # Electron main process + IPC handlers
├── preload.js                # Electron preload (exposes IPC to renderer)
└── server-manager.js         # Embedded server process + UDP LAN discovery

app/
├── index.html                # Entry point
├── game.js                   # Vite output (IIFE bundle from src/main.ts)
└── server-bundle.js          # esbuild output (server for packaged app)
```

---

## Development Philosophy

- **Major architectural changes are encouraged** when they serve the vision
- Work in **playable chunks** — each step should result in a working game
- **Never leave codebase broken or half-implemented**
- Favor **flexible, modular designs** over premature optimization
- **Clarity, debuggability, extensibility** > short-term speed

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

- **Full vision:** `.github/copilot-instructions.md`
- **Architecture:** `CLAUDE.md`
- **TypeScript config:** `tsconfig.json`, `tsconfig.server.json`
- **Build pipeline:** `vite.config.ts`, `package.json`
