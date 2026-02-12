# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Dark War?

A roguelike remake of Mission Thunderbolt (1992) built with TypeScript, Pixi.js, and Electron. Features continuous fluid movement (not grid-locked), Superhot-style time mechanics (time slows when player stops), mouse-aiming combat, destructible walls, and an authoritative multiplayer server. See `.github/copilot-instructions.md` for the full long-term vision.

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
```

There are no tests or linting configured in this project.

## Architecture

### Build Pipeline

Vite bundles `src/main.ts` into `app/game.js` (IIFE format). Electron loads `app/index.html` which references this bundle. The server (`server/multiplayer-server.ts`) runs directly via `tsx` and is not bundled.

### Core Loop

`DarkWar` class in `src/main.ts` orchestrates everything:
- **GameLoop** (`src/core/GameLoop.ts`): Fixed 60Hz timestep with accumulator pattern. Calls `update(dt)` at fixed rate and `render(alpha)` at variable framerate with interpolation.
- **Simulation** (`src/systems/Simulation.ts`): Tick-based command/event system running at 20 ticks/sec (`SIM_DT_MS = 50`). Player actions become Commands, resolved into Events (damage, death, pickup, etc.). AI commands generated after player commands each tick.
- **Physics** (`src/systems/Physics.ts`): Uses `detect-collisions` library for continuous collision detection. Wall sliding, bullet movement, explosive physics.
- **Game** (`src/core/Game.ts`): Central state manager. Holds all `GameState`, handles level transitions (descend/ascend), serialization, FOV updates, and multiplayer player management.

### Coordinate System (Critical)

- **`worldX`/`worldY`**: Float pixel coordinates — the source of truth for all entity positions
- **`gridX`/`gridY`**: Read-only getters on `GameEntity`, derived as `Math.floor(worldX / 32)`
- **Never set `gridX`/`gridY` directly** — they are computed properties
- Tiles are 32×32 pixels. Use `entity.worldX`/`entity.worldY` to position entities
- Movement: set `entity.velocityX`/`entity.velocityY` (pixels per second)

### Entity System

All entities extend `GameEntity` (`src/entities/GameEntity.ts`) which provides `worldX`/`worldY`, velocity, facing angle, and physics body. Entity types: `PlayerEntity`, `MonsterEntity`, `ItemEntity`, `BulletEntity`, `ExplosiveEntity`. Discriminated by `EntityKind` enum.

### Time Dilation

Time scale smoothly interpolates between `SLOWMO_SCALE` (0.05) and real-time (1.0). When the player stops moving, time slows down. Actions resume time. The `sim.timeScale` and `sim.targetTimeScale` fields on `GameState` control this.

### Multiplayer

Two modes: `offline` (default) and `online`. In online mode, an authoritative WebSocket server (`server/multiplayer-server.ts`) runs the Game and Physics simulation, broadcasting state to clients. Clients send velocity updates and actions. The server uses per-player FOV and explored state.

### Map Generation

`src/core/Map.ts` generates dungeons using BSP (Binary Space Partitioning). Maps are flat `TileType[]` arrays of size `MAP_WIDTH × MAP_HEIGHT` (64×36). Index with `idx(x, y)` from `src/utils/helpers.ts`.

### Key Utilities

- `src/utils/helpers.ts`: `idx()`, `inBounds()`, `passable()`, `tileAt()`, `dist()`, `setPositionFromGrid()`
- `src/utils/walls.ts`: `applyWallDamageAt()` for destructible walls
- `src/utils/RNG.ts`: Deterministic RNG — `RNG.int(n)`, `RNG.choose(arr)`, `RNG.chance(p)`
- `src/utils/pathfinding.ts`: A* pathfinding for click-to-move

### State & Commands Pattern

Player input → `enqueueCommand(state, {...})` → `stepSimulationTick(state)` resolves commands → pushes events → `processEventQueue()` handles cascading effects (damage → death → loot drop → chain explosions). Access game state via `Game.getState()`.

## Code Style

- TypeScript strict mode. PascalCase for classes/types, camelCase for functions/variables.
- One class/system per file. Named imports with relative paths.
- Composition over inheritance. Pure functions where possible.
- Performance matters in rendering and physics paths.
