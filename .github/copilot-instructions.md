# Dark War - AI Coding Instructions

You are assisting in the development of Dark War, a modern remake of the 1992 roguelike Mission Thunderbolt. Help write clean, performant TypeScript code that follows the established modular architecture.

---

## Current Architecture

**Project Structure:**

```
dark-war/
├─ app/
│  ├─ index.html       # Clean HTML/CSS, loads game.js
│  └─ game.js          # Bundled TypeScript output (build artifact)
├─ electron/
│  ├─ main.js          # Electron window + save/load IPC handlers
│  └─ preload.js       # Exposes window.native.saveWrite/saveRead API
├─ src/                # TypeScript source code
│  ├─ core/
│  │  ├─ Game.ts       # Central game state manager & coordinator
│  │  └─ Map.ts        # Dungeon generation (BSP rooms + corridors)
│  ├─ entities/
│  │  ├─ Player.ts     # Player entity factory
│  │  ├─ Monster.ts    # Monster entity factory
│  │  └─ Item.ts       # Item entity factory
│  ├─ systems/
│  │  ├─ FOV.ts        # Field of view via ray casting
│  │  ├─ Combat.ts     # Melee, ranged combat, reload mechanics
│  │  ├─ AI.ts         # Monster AI with greedy + BFS pathfinding
│  │  ├─ Input.ts      # Keyboard input handling
│  │  ├─ Renderer.ts   # Canvas rendering system
│  │  └─ UI.ts         # UI updates (stats, log, inventory)
│  ├─ utils/
│  │  ├─ RNG.ts        # Deterministic RNG (SFC32 algorithm)
│  │  └─ helpers.ts    # Coordinate math, tile queries, entity lookups
│  ├─ types/
│  │  └─ index.ts      # All TypeScript types, interfaces, enums
│  └─ main.ts          # Entry point, bootstraps game
├─ tsconfig.json       # TypeScript compiler config
├─ vite.config.ts      # Vite bundler config
└─ package.json        # Dependencies and build scripts
```

**Key Implementation Details:**

- **Game Loop**: `Game.ts` orchestrates turn-based flow via `endTurn()` → monster AI → FOV update
- **Entity System**: Discriminated union types with `EntityKind` enum (Player | Monster | Item)
- **Map Storage**: 1D array accessed via `idx(x,y) = x + y * MAP_WIDTH` helper
- **FOV**: Ray casting from player position using Bresenham line algorithm
- **AI**: Monsters chase player using greedy step with BFS fallback for pathfinding
- **Rendering**: Canvas-based with ASCII characters, prepared for sprite upgrade
- **Save System**: Serializes to JSON, supports both Electron IPC and localStorage

---

## Development Workflows

**Build Commands:**

```bash
npm run dev          # Build TypeScript and launch Electron app
npm run build        # Build distributables (macOS/Windows/Linux)
npm run build:ts     # Compile TypeScript and bundle with Vite
npm run type-check   # Type check without building
npm run watch        # Watch mode for development
```

**Save System API:**

```typescript
// Electron (persistent)
await window.native.saveWrite(JSON.stringify(gameState));
const result = await window.native.saveRead();

// Browser fallback (localStorage)
localStorage.setItem("darkwar-save", JSON.stringify(gameState));
localStorage.getItem("darkwar-save");
```

**Critical Patterns:**

- **State Management**: `Game.getState()` returns immutable GameState interface
- **Entity Filtering**: Use `entities.filter(e => e.kind === EntityKind.MONSTER)` pattern
- **Tile Queries**: Use `tileAt(map, x, y)`, `passable(map, x, y)`, `isWalkable()` helpers
- **RNG Usage**: `RNG.int(n)`, `RNG.choose(array)`, `RNG.chance(probability)`
- **Message Logging**: `game.addLog(message)` → automatically updates UI

---

## Code Style & Conventions

- **TypeScript**: Strict mode enabled, use explicit types for function signatures
- **Imports**: Always use named imports with full relative paths
- **Organization**: One class/system per file, grouped by logical domain
- **Naming**: PascalCase for classes/types, camelCase for functions/variables
- **Architecture**: Favor composition over inheritance, pure functions where possible

### Example Patterns

**Adding a New System:**

```typescript
// src/systems/NewSystem.ts
import { GameState, Player } from "../types";

export function processNewSystem(state: GameState): void {
  // System logic here
}
```

**Creating New Entity Type:**

```typescript
// Update src/types/index.ts
export enum EntityKind {
  PLAYER = "player",
  DRONE = "drone", // Add new type
  // ...
}

export interface Drone extends BaseEntity {
  kind: EntityKind.DRONE;
  // Drone-specific properties
}

// Create factory in src/entities/Drone.ts
export function createDrone(x: number, y: number): Drone {
  return {
    kind: EntityKind.DRONE,
    x,
    y,
    ch: "D",
    color: "#5ad1ff",
    // ...
  };
}
```

**Integrating with Game Loop:**

```typescript
// In src/core/Game.ts
import { createDrone } from "../entities/Drone";

// Add to entity spawning in reset()
for (let i = 0; i < 5; i++) {
  const [x, y] = RNG.choose(freeTiles);
  this.state.entities.push(createDrone(x, y));
}
```

---

## Next Steps & Roadmap

**Current Priorities:**

1. **Sprite Rendering**: Replace ASCII with pixel art sprites (keep existing Canvas system)
2. **More Enemy Types**: Drones, turrets, security bots with varied behaviors
3. **Enhanced Items**: Weapon variety (SMG, shotgun), armor, consumables
4. **Level Theming**: Visual distinction between lab, storage, reactor floors
5. **Terminal System**: Interactable computer terminals with lore and unlock mechanics

**Long-Term Vision:**

- Atmospheric retro-futuristic roguelike set in underground research facility
- Modular, well-documented codebase easy to extend
- Support for modding via data files
- Maintain single-player offline focus
- Procedural storytelling through terminals and environmental details

---

## Copilot Guidelines

- Propose changes that fit cleanly into existing architecture
- Reference specific files/modules when suggesting modifications
- Consider type safety and maintain strict TypeScript compliance
- Preserve the turn-based game loop structure
- Keep save format backward compatible when possible
- Suggest appropriate abstractions without over-engineering
- Maintain performance on low-powered systems
- Write self-documenting code with clear naming

When adding features, always consider:

- Which module should own this logic?
- How does this integrate with the turn-based loop?
- What TypeScript types need updating?
- Does this affect save/load serialization?
- Are there existing helper functions to reuse?
