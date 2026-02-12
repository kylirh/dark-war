# AGENTS.md

**Instructions for AI coding agents working in the Dark War codebase.**

This is a roguelike remake of Mission Thunderbolt (1992) built with TypeScript, Pixi.js, and Electron. Features continuous fluid movement, Superhot-style time mechanics, mouse-aiming combat, destructible walls, and multiplayer support. See `.github/copilot-instructions.md` for the full vision and `CLAUDE.md` for architecture details.

---

## Build, Type Check, and Run Commands

```bash
# Development
npm run dev                    # Build TypeScript + Vite, then launch Electron
npm run dev:online             # Build and launch in multiplayer mode (connects to localhost:7777)
npm run watch                  # Vite watch mode (run `npx electron .` separately)

# Multiplayer
npm run multiplayer:server     # Start authoritative WebSocket server (tsx)
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

**Running a single test:** N/A - no test framework configured.

---

## Code Style Guidelines

### TypeScript

- **Strict mode enabled** - All strict TypeScript compiler options are on
- **Explicit types for function signatures** - Always type parameters and return values
- **No implicit any** - All values must have explicit or inferred types
- **Optional strictness:** `noUnusedLocals` and `noUnusedParameters` are disabled for flexibility during development

### Imports

- **Use named imports with relative paths**
  ```typescript
  import { GameEntity } from "../entities/GameEntity";
  import { RNG } from "../utils/RNG";
  import { dist, passable, tileAt } from "../utils/helpers";
  ```
- **Never use default exports** - Only named exports
- **Import order:** External libraries first, then internal imports grouped by directory
- **One class/system per file**

### Naming Conventions

- **PascalCase:** Classes, interfaces, types, enums
  ```typescript
  class GameEntity { }
  interface TileDefinition { }
  enum EntityKind { }
  ```
- **camelCase:** Functions, variables, properties, methods
  ```typescript
  function updateFOV(): void { }
  const playerEntity = new PlayerEntity(x, y);
  ```
- **SCREAMING_SNAKE_CASE:** Constants and configuration values
  ```typescript
  const SIM_DT_MS = 50;
  const MONSTER_SPEED = 225;
  const MAX_EVENTS_PER_TICK = 1000;
  ```

### Formatting

- **No ESLint or Prettier configured** - Follow existing patterns
- **Indentation:** 2 spaces
- **Semicolons:** Always use them
- **String quotes:** Double quotes preferred
- **Line length:** Keep reasonable (~100 chars), but not enforced
- **Trailing commas:** Use in multiline arrays/objects

### Documentation

- **File headers:** Include JSDoc comment explaining purpose
  ```typescript
  /**
   * Base class for all game entities with physics and continuous movement
   */
  export abstract class GameEntity { }
  ```
- **Public method docs:** Use JSDoc comments for public APIs
  ```typescript
  /**
   * Update field of view for a specific player
   */
  public updateFOVForPlayer(playerId: string): void { }
  ```
- **Self-documenting code:** Prefer clear variable/function names over comments
- **Inline comments:** Only when logic is non-obvious

### Error Handling

- **Minimal explicit error handling** - Most functions assume valid input
- **Defensive checks for critical operations:**
  ```typescript
  if (!inBounds(x, y)) return false;
  if (!player) return;
  ```
- **No try-catch in normal flow** - Let errors propagate naturally
- **Type guards for discriminated unions:**
  ```typescript
  if (entity.kind === EntityKind.MONSTER) {
    // TypeScript narrows entity to Monster type
  }
  ```

### State Management

- **Central state object:** All game state lives in `GameState` type
- **Access via Game class:** Use `Game.getState()` to read state
- **Immutability not enforced** - Direct mutation is common and acceptable
- **Commands and events:** Use command queue for scheduling actions, event queue for cascading effects

### Performance Considerations

- **Performance matters in hot paths:** Rendering loop, physics updates, collision detection
- **Avoid allocations in loops:** Reuse arrays/objects where possible
- **Prefer simple algorithms** unless profiling shows bottleneck
- **Early returns:** Exit functions early when conditions aren't met

---

## Critical Patterns and Gotchas

### Coordinate System (CRITICAL)

**NEVER set `gridX` or `gridY` directly - they are read-only getters!**

```typescript
// ❌ WRONG - gridX/gridY are derived from worldX/worldY
entity.gridX = 5;
entity.gridY = 10;

// ✅ CORRECT - Use worldX/worldY (pixels, source of truth)
entity.worldX = 5 * 32 + 16;  // Grid position * tile size + half tile
entity.worldY = 10 * 32 + 16;

// ✅ CORRECT - Use helper function
setPositionFromGrid(entity, 5, 10);

// ✅ CORRECT - For movement, set velocity
entity.velocityX = 200;  // pixels per second
entity.velocityY = 0;
```

- **`worldX`/`worldY`:** Float pixel coordinates (0-2048 for 64×32 map) - **source of truth**
- **`gridX`/`gridY`:** Integer tile coordinates (0-63 x, 0-35 y) - **computed getters**
- **Tiles are 32×32 pixels:** `CELL_CONFIG.w = 32`, `CELL_CONFIG.h = 32`
- **Movement:** Set `velocityX`/`velocityY` in pixels per second
- **Physics system** handles collision and updates `worldX`/`worldY`

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
  facingAngle: number = 0;  // Radians (0 = right, PI/2 = down, etc.)
  get gridX(): number { }   // READ-ONLY
  get gridY(): number { }   // READ-ONLY
  physicsBody?: Body;       // Set by Physics system
}
```

Entity types: `PlayerEntity`, `MonsterEntity`, `ItemEntity`, `BulletEntity`, `ExplosiveEntity`

Discriminate by `EntityKind` enum:
```typescript
if (entity.kind === EntityKind.PLAYER) {
  // TypeScript narrows to Player type
}
```

### Map Representation

- **Flat array:** `TileType[]` of size `MAP_WIDTH × MAP_HEIGHT` (64×36)
- **Index with:** `idx(x, y)` from `src/utils/helpers.ts`
- **Query tile:** `tileAt(map, x, y)`
- **Check passable:** `passable(map, x, y)`
- **Set tile:** `setTile(map, x, y, TileType.FLOOR)`

### Time Dilation (Current Implementation)

- **Simple slowdown:** Time scale interpolates between 0.05 (slow) and 1.0 (real-time)
- **Controlled by:** `state.sim.timeScale` and `state.sim.targetTimeScale`
- **Will evolve into CTDM system** (see `.github/copilot-instructions.md`)

### Command/Event Pattern

```typescript
// Schedule player action
enqueueCommand(state, {
  type: CommandType.FIRE_PROJECTILE,
  actorId: player.id,
  targetX: worldX,
  targetY: worldY,
  weaponType: WeaponType.PISTOL,
});

// Commands → Events during tick processing
// Events cascade (damage → death → loot drop → chain explosions)
```

### RNG Usage

**Always use deterministic RNG for gameplay logic:**
```typescript
import { RNG } from "../utils/RNG";

RNG.int(10);           // Random integer 0-9
RNG.choose(array);     // Random element from array
RNG.chance(0.5);       // 50% chance returns true
```

### Multiplayer Considerations

- Two modes: `offline` (default) and `online`
- In `online` mode, server is authoritative (runs Game + Physics)
- Clients send velocity updates and actions
- Per-player FOV and explored state tracked separately

---

## Project Structure

```
src/
├── core/
│   ├── Game.ts         # State manager, level transitions, FOV, serialization
│   ├── GameLoop.ts     # Fixed 60Hz timestep with accumulator
│   └── Map.ts          # BSP dungeon generation
├── entities/
│   ├── GameEntity.ts   # Base class with worldX/worldY
│   ├── PlayerEntity.ts
│   ├── MonsterEntity.ts
│   ├── ItemEntity.ts
│   ├── BulletEntity.ts
│   └── ExplosiveEntity.ts
├── systems/
│   ├── Physics.ts      # Collision detection (detect-collisions)
│   ├── Simulation.ts   # Command/event system, 20 ticks/sec
│   ├── FOV.ts          # Field of view (rot.js)
│   ├── Renderer.ts     # Pixi.js rendering with interpolation
│   ├── Input.ts        # Keyboard/mouse input
│   ├── Sound.ts        # Sound effects
│   ├── MouseTracker.ts # Mouse aiming
│   └── UI.ts           # UI updates
├── utils/
│   ├── helpers.ts      # idx(), inBounds(), passable(), dist(), setPositionFromGrid()
│   ├── walls.ts        # applyWallDamageAt() for destructible walls
│   ├── RNG.ts          # Deterministic random number generator
│   └── pathfinding.ts  # A* pathfinding
└── types/
    └── index.ts        # All TypeScript type definitions

server/
└── multiplayer-server.ts  # Authoritative WebSocket server

electron/
└── main.js            # Electron main process

app/
├── index.html         # Entry point
└── game.js            # Vite output (IIFE bundle from src/main.ts)
```

---

## Development Philosophy

From `.github/copilot-instructions.md`:

- **Major architectural changes are encouraged** when they serve the vision
- Work in **playable chunks** - each step should result in a working game
- **Never leave codebase broken or half-implemented**
- Favor **flexible, modular designs** over premature optimization
- Avoid "AI slop" - respect existing architecture, make intentional changes
- **Clarity, debuggability, extensibility** > short-term speed
- **Systems may be rewritten** as we learn what works

---

## Common Helper Functions

```typescript
// Coordinate conversion
idx(x, y)                          // Grid coords → array index
inBounds(x, y)                     // Check if within map bounds
tileAt(map, x, y)                  // Get tile type at position
setTile(map, x, y, tileType)       // Set tile type at position
passable(map, x, y)                // Check if tile is walkable

// Entity positioning
setPositionFromGrid(entity, x, y)  // Teleport entity to grid cell center

// Distance and queries
dist([x1, y1], [x2, y2])           // Manhattan distance
entityAt(entities, x, y, filter?)  // Find entity at grid position
entitiesAt(entities, x, y)         // Find all entities at position

// RNG
RNG.int(n)                         // Random integer 0 to n-1
RNG.choose(array)                  // Random element from array
RNG.chance(probability)            // Returns true with given probability

// Walls
applyWallDamageAt(state, x, y, damage)  // Damage/destroy wall tile
```

---

## Key References

- **Full vision:** `.github/copilot-instructions.md` (321 lines)
- **Architecture:** `CLAUDE.md` (this file's sibling)
- **TypeScript config:** `tsconfig.json`, `tsconfig.server.json`
- **Build pipeline:** `vite.config.ts`, `package.json`
