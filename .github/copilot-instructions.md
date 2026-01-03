# Dark War - AI Coding Instructions

You are assisting in the development of Dark War, a modern remake of the 1992 roguelike Mission Thunderbolt. Help write clean, performant TypeScript code that follows the established modular architecture.

---

## Current Architecture

**Project Structure:**

```
dark-war/
├─ app/
│  ├─ index.html       # HTML/CSS, loads game.js
│  └─ game.js          # Bundled TypeScript output
├─ electron/
│  ├─ main.js          # Electron window + save/load IPC
│  └─ preload.js       # Exposes window.native API
├─ src/
│  ├─ core/
│  │  ├─ Game.ts       # Game state manager & mode coordinator
│  │  └─ Map.ts        # Dungeon generation (BSP rooms + corridors)
│  ├─ entities/
│  │  ├─ Player.ts     # Player entity factory
│  │  ├─ Monster.ts    # Monster entity factory
│  │  └─ Item.ts       # Item entity factory
│  ├─ systems/
│  │  ├─ Simulation.ts # Command buffer, event queue, tick processor
│  │  ├─ FOV.ts        # Field of view (rot.js shadowcasting)
│  │  ├─ Input.ts      # Keyboard input handling
│  │  ├─ Renderer.ts   # Pixi.js sprite rendering
│  │  ├─ Sound.ts      # Sound effect manager
│  │  └─ UI.ts         # UI updates (stats, log)
│  ├─ utils/
│  │  ├─ RNG.ts        # Deterministic RNG (SFC32)
│  │  └─ helpers.ts    # Coordinate math, tile queries
│  ├─ types/
│  │  └─ index.ts      # TypeScript types, interfaces, enums
│  └─ main.ts          # Entry point, render loop
├─ tsconfig.json
├─ vite.config.ts
└─ package.json
```

**Key Implementation Details:**

- **Simulation System**: Tick-based with command buffer and event queue
- **Dual Modes**: Planning (frozen time, execute then pause) and Real-Time (continuous 5 ticks/sec)
- **Entity System**: Discriminated unions with numeric IDs, `nextActTick` cooldowns
- **Map Storage**: 1D array accessed via `idx(x,y) = x + y * MAP_WIDTH`
- **FOV**: rot.js shadowcasting algorithm for player and monster vision
- **AI**: Monsters use FOV shadowcasting with 15-tile vision, pathfinding via greedy step
- **Rendering**: Pixi.js with sprite sheet, texture caching for performance
- **Save System**: JSON serialization via Electron IPC or localStorage

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

**Critical Patterns:**

- **State Management**: `Game.getState()` returns GameState with sim, commandsByTick, eventQueue
- **Command Scheduling**: `enqueueCommand(state, {...})` → added to commandsByTick Map
- **Entity Filtering**: `entities.filter(e => e.kind === EntityKind.MONSTER)`
- **Tile Queries**: `tileAt(map, x, y)`, `passable(map, x, y)`
- **RNG Usage**: `RNG.int(n)`, `RNG.choose(array)`, `RNG.chance(probability)`
- **Message Logging**: `game.addLog(message)` → updates UI

---

## Code Style & Conventions

- **TypeScript**: Strict mode, explicit types for function signatures
- **Imports**: Named imports with relative paths
- **Organization**: One class/system per file
- **Naming**: PascalCase for classes/types, camelCase for functions/variables
- **Architecture**: Composition over inheritance, pure functions where possible

---

## Next Steps & Roadmap

**Current Priorities:**

1. **More Enemy Types**: Drones, turrets, security bots
2. **Enhanced Items**: Weapon variety, armor, consumables
3. **Level Theming**: Visual distinction between floors
4. **Terminal System**: Interactable terminals with lore

**Long-Term Vision:**

- Atmospheric retro-futuristic roguelike
- Modular, well-documented codebase
- Support for modding via data files
- Single-player offline focus
- Procedural storytelling

---

## Copilot Guidelines

- Propose changes that fit the simulation architecture
- Reference specific files/modules
- Maintain strict TypeScript compliance
- Preserve simulation tick system
- Keep save format backward compatible
- Avoid over-engineering
- Maintain performance (texture caching, command cleanup)
- Write self-documenting code

When adding features, consider:

- Which module owns this logic?
- How does this integrate with the command/event system?
- What TypeScript types need updating?
- Does this affect save/load serialization?
- Are there existing helper functions to reuse?
