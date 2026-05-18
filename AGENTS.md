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

# Building
npm run build:ts               # Compile TypeScript (tsc) + bundle with Vite
npm run build                  # Full distributable build (macOS/Windows/Linux via electron-builder)
```

**No tests or linting configured.** Type-checking is the primary validation method.

---

## Code Style Guidelines

### TypeScript

- **Strict mode enabled** — All strict TypeScript compiler options are on
- **Explicit types for function signatures** — Always type parameters and return values
- **No implicit any** — All values must have explicit or inferred types

### Imports

- **Use named imports with relative paths**
  ```typescript
  import { GameEntity } from "../entities/GameEntity";
  import { RNG } from "../utils/RNG";
  import { idxFor, passableFor, tileAtFor } from "../utils/helpers";
  ```
- **Never use default exports** — Only named exports
- **One class/system per file**

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
entity.worldX = 5 * 32 + 16;  // grid position * tile size + half tile
entity.worldY = 10 * 32 + 16;

// ✅ CORRECT — helper function
setPositionFromGrid(entity, 5, 10);

// ✅ CORRECT — for movement, set velocity
entity.velocityX = 225;  // pixels per second
entity.velocityY = 0;
```

- **`worldX`/`worldY`:** Float pixel coordinates — **source of truth**
- **`gridX`/`gridY`:** Integer tile coordinates — **computed getters, read-only**
- **Tiles are 32×32 pixels:** `CELL_CONFIG.w = 32`, `CELL_CONFIG.h = 32`
- **Map dimensions:** Dungeon = 64×36, Outside = 128×72

### Helper Functions — Two Variants

Many helpers come in two variants. Use `For` versions for outside levels or any non-standard map size:

```typescript
// Standard dungeon (uses global MAP_WIDTH/MAP_HEIGHT)
idx(x, y)
inBounds(x, y)
tileAt(map, x, y)
passable(map, x, y)

// Explicit dimensions (required for outside levels, recommended in systems)
idxFor(x, y, width)
inBoundsFor(x, y, width, height)
tileAtFor(map, x, y, width, height)
passableFor(map, x, y, width, height)
```

### Entity System

All entities extend `GameEntity` which provides continuous movement:
```typescript
export abstract class GameEntity {
  worldX: number;           // Pixel position
  worldY: number;
  prevWorldX: number;       // For interpolation
  prevWorldY: number;
  velocityX: number = 0;    // Pixels per second
  velocityY: number = 0;
  facingAngle: number = 0;  // Radians (0 = right, PI/2 = down)
  get gridX(): number { }   // READ-ONLY
  get gridY(): number { }   // READ-ONLY
  physicsBody?: Body;       // Set by Physics system
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

- **Flat array:** `TileType[]` — dungeon is `MAP_WIDTH × MAP_HEIGHT` (64×36), outside is 128×72
- **Index with:** `idxFor(x, y, width)` — always prefer the `For` variant in systems
- **Query tile:** `tileAtFor(map, x, y, width, height)`
- **Check passable:** `passableFor(map, x, y, width, height)`
- **Set tile:** `setTileFor(map, x, y, TileType.FLOOR, width)`

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
import { RNG } from "../utils/RNG";

RNG.int(10);           // Random integer 0–9
RNG.choose(array);     // Random element from non-empty array
RNG.chance(0.5);       // 50% chance, returns true
```

### Simulation Modules

The simulation is split into domain modules under `src/systems/simulation/`:
- `index.ts` — `stepSimulationTick`, `processEventQueue`, public re-exports
- `commands.ts` — `enqueueCommand` + all `resolve*Command` handlers
- `events.ts` — all `process*Event` handlers + `processEventQueue`
- `ai.ts` — monster steering, utility bot BFS, `generateAICommands`
- `explosives.ts` — grenade/mine fuse logic, chain explosions, effects
- `helpers.ts` — `pushEvent`, `canActorAct`, `hasClearLineOfSight`, entity queries
- `constants.ts` — all simulation constants (speeds, delays, config)

Import from `"../systems/simulation"` (the index) to get all public exports.

### Multiplayer Considerations

- Two modes: `offline` (default) and `online`
- In `online` mode, server is authoritative (runs Game + Physics)
- Clients send velocity updates and actions
- Per-player FOV and explored state tracked separately
- LAN hosting: Electron embeds the server as a child process; UDP discovery via `electron/server-manager.js`

---

## Project Structure

```
src/
├── config/
│   └── sprites.ts            # Sprite sheet configuration
├── core/
│   ├── Game.ts               # State manager, level transitions, FOV, serialization
│   ├── GameLoop.ts           # Fixed 60Hz timestep with accumulator
│   ├── Map.ts                # BSP dungeon generation (64×36)
│   └── OutsideLevel.ts       # Procedural outside level generation (128×72)
├── entities/
│   ├── GameEntity.ts         # Base class with worldX/worldY
│   ├── PlayerEntity.ts
│   ├── MonsterEntity.ts
│   ├── ItemEntity.ts
│   ├── BulletEntity.ts
│   └── ExplosiveEntity.ts
├── net/
│   └── MultiplayerClient.ts  # WebSocket client for online mode
├── systems/
│   ├── FOV.ts                # Field of view (rot.js PreciseShadowcasting)
│   ├── GameMenu.ts           # Main menu, pause menu, multiplayer lobby
│   ├── Input.ts              # Keyboard/mouse input handling
│   ├── IntroStory.ts         # Intro lore slides shown before new game
│   ├── MouseTracker.ts       # Mouse world-position and aiming angle
│   ├── Music.ts              # Background music
│   ├── Physics.ts            # Collision detection (detect-collisions)
│   ├── Preferences.ts        # Persistent user settings and keybindings
│   ├── Renderer.ts           # Pixi.js rendering with interpolation
│   ├── RetroWindowChrome.ts  # Window chrome / UI shell
│   ├── Sound.ts              # Sound effects
│   ├── TitleScreen.ts        # Animated title screen
│   ├── UI.ts                 # In-game HUD updates
│   └── simulation/           # Simulation system (split into domain modules)
│       ├── index.ts          # Public API: stepSimulationTick, enqueueCommand, etc.
│       ├── constants.ts      # All simulation constants
│       ├── helpers.ts        # pushEvent, canActorAct, LOS, entity queries
│       ├── ai.ts             # Monster steering + AI command generation
│       ├── commands.ts       # Command management + all resolve*Command
│       ├── events.ts         # processEventQueue + all process*Event handlers
│       └── explosives.ts     # Grenade/mine fuse, chain explosions, effects
├── utils/
│   ├── helpers.ts            # idxFor(), inBoundsFor(), passableFor(), dist(), etc.
│   ├── multiplayer.ts        # Multiplayer utility helpers
│   ├── pathfinding.ts        # A* pathfinding (click-to-move)
│   ├── repair.ts             # applyRepairAt(), findNearestRepairTarget()
│   ├── RNG.ts                # Deterministic random number generator
│   └── walls.ts              # applyWallDamageAt() for destructible walls
└── types/
    └── index.ts              # All TypeScript type definitions

server/
└── multiplayer-server.ts     # Authoritative WebSocket server

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
// Coordinate conversion (prefer the For variants in systems code)
idx(x, y)                              // Grid → array index (uses global MAP_WIDTH)
idxFor(x, y, width)                    // Grid → array index (explicit width)
inBounds(x, y)                         // Within dungeon map bounds
inBoundsFor(x, y, width, height)       // Within explicit-size map bounds
tileAt(map, x, y)                      // Get tile type (dungeon dimensions)
tileAtFor(map, x, y, width, height)    // Get tile type (explicit dimensions)
passable(map, x, y)                    // Walkable? (dungeon dimensions)
passableFor(map, x, y, width, height)  // Walkable? (explicit dimensions)
setTile(map, x, y, tileType)           // Set tile (dungeon dimensions)
setTileFor(map, x, y, tileType, width) // Set tile (explicit dimensions)

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
