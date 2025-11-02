# Dark War - System Instructions

You are assisting in the ongoing development of Dark War, a modern remake and spiritual successor to the 1992 roguelike Mission Thunderbolt. Your task is to help the developer write clean, consistent, performant code that expands the game with well-structured, modular architecture and modern development practices.

---

## Project Overview

Dark War is a modernized roguelike built as an Electron application that runs fully offline. It features retro 1990s-style sprite rendering, procedural dungeons, and turn-based combat with a modular, well-organized codebase.

### Stack

- TypeScript (transitioning from vanilla JavaScript)
- HTML5 Canvas for sprite-based rendering
- Electron shell for desktop deployment (macOS, Windows, Linux)
- Modern ES modules with proper import/export
- Build tooling for development and distribution
- Persistent saves via JSON file or localStorage

### Key Design Goals

- Well-structured, modular architecture prioritizing developer readability
- Retro 1990s aesthetic with sprite-based graphics
- Modern TypeScript development with proper module organization
- Playable both in a web browser and within Electron
- Deterministic gameplay and procedural consistency
- Embrace modern frameworks and tools when beneficial

---

## Architecture

### Core Structure

```
dark-war/
├─ electron/
│  ├─ main.js          # App window + persistent save API
│  └─ preload.js       # Exposes window.native.saveWrite/saveRead
├─ src/                # Main game source code
│  ├─ core/            # Core game systems
│  ├─ entities/        # Player, enemies, items
│  ├─ rendering/       # Sprite rendering and graphics
│  ├─ ui/              # User interface components
│  ├─ utils/           # Utility functions and helpers
│  └─ main.ts          # Main game entry point
├─ assets/             # Sprites, sounds, data files
│  ├─ sprites/         # 1990s-style sprite graphics
│  ├─ audio/           # Sound effects and music
│  └─ data/            # Game data and configuration
├─ .github/
│  └─ copilot-instructions.md
├─ package.json
└─ tsconfig.json
```

### Components

**Game Architecture**

- Modular TypeScript architecture with clear separation of concerns
- ES modules with proper import/export statements
- Sprite-based rendering system using Canvas
- Component-based entities and systems
- Turn-based game loop with clean state management
- Save/load system integrated with Electron IPC

**Electron Wrapper**

- `main.js`: sets up BrowserWindow and IPC handlers for persistent save
- `preload.js`: bridges save API into renderer via contextBridge
- Saves stored as JSON at `app.getPath('userData')/darkwar-save.json`

### Persistence

```javascript
await window.native.saveWrite(JSON.stringify(gameState)); // Save
const data = await window.native.saveRead(); // Load
```

- Save format must remain backward compatible
- Missing or corrupt files → graceful new-game fallback

---

## Development Workflows

### Run / Build

```bash
npm run dev    # Launch Electron app for testing
npm run build  # Build distributables for mac/win/linux
npm run type-check  # TypeScript type checking
npm run lint   # Code linting and formatting
```

### Conventions

- **TypeScript**: Modern ES modules with proper import/export
- **Architecture**: Modular design with clear separation of concerns
- **Naming**: Keep consistent naming: "Dark War", not "Mission Thunderbolt"
- **Code Organization**: Group related functionality into logical modules

### Debugging

- Use Chrome DevTools (F12) inside Electron for live inspection
- TypeScript source maps for debugging compiled code
- Test packaged builds across OS targets: DMG, NSIS, AppImage

---

## Vision for Dark War

### Short-Term Goals

- Transition from single-file to modular TypeScript architecture
- Implement sprite-based rendering system with 1990s aesthetic
- Expand combat: melee, ranged, and reloading systems
- Add new enemies (drones, mutants, turrets, security bots)
- Introduce procedural loot and more meaningful inventory
- Implement locked doors, terminals, and environmental hazards
- Themed dungeon floors with improved FOV and AI

### Long-Term Vision

- A rich, atmospheric, retro-futuristic roguelike exploring the aftermath of a failed military experiment beneath a research facility
- Maintain single-player, offline focus
- Support modding, procedural storytelling, and multiple endings
- Preserve a feeling of claustrophobic tension and emergent narrative
- Deliver authentic 1990s pixel art aesthetic with atmospheric sound design
- Well-organized, readable codebase that's easy to extend and modify

---

## Code & Style Guidelines

- Write readable, modular code — clarity over cleverness
- Embrace modern TypeScript features and proper typing
- Use appropriate frameworks and tools when they improve development experience
- Keep deterministic random generation (use a consistent RNG module)
- Ensure performance on low-power systems
- Respect the turn-based loop; avoid real-time animation unless specifically needed
- When adding features, always maintain save compatibility
- Document new systems with clear TypeScript interfaces and JSDoc comments
- Use modern ES module imports/exports throughout the codebase

### Example Patterns

**Module Structure**

```typescript
import { Entity } from "./Entity";
import { Vector2 } from "../utils/Vector2";

export class Player extends Entity {
  constructor(position: Vector2) {
    super(position);
  }
}
```

**State Management**

```typescript
export interface GameState {
  player: Player;
  floor: Floor;
  entities: Entity[];
  items: Item[];
  log: string[];
  depth: number;
}
```

**Electron Bridge**

```javascript
contextBridge.exposeInMainWorld("native", {
  saveWrite: (data) => ipcRenderer.invoke("save:write", data),
  saveRead: () => ipcRenderer.invoke("save:read"),
});
```

---

## Copilot Behavior Guidelines

- Act as a collaborative teammate, not a tutor
- Propose changes that integrate cleanly with the current architecture
- Embrace modular design and suggest proper TypeScript module organization
- Recommend appropriate frameworks, tools, or libraries when they improve the codebase
- Default to modern TypeScript patterns with proper ES module imports/exports
- Maintain tone and atmosphere consistent with Dark War's retro-futuristic setting
- Prioritize code readability and maintainability over brevity

---

## Example Prompts Copilot Should Handle Well

- "Add a new enemy type called Drone that patrols corridors and attacks from range"
- "Refactor the rendering system to use sprite-based graphics with 1990s aesthetic"
- "Create a modular inventory system with TypeScript interfaces"
- "Implement a terminal interface that displays procedural lore entries"
- "Set up a build system for TypeScript compilation and asset bundling"

---

## Metadata

**Language**: TypeScript (transitioning from JavaScript)  
**Frameworks**: Open to modern frameworks and game engines  
**Distribution**: macOS (.dmg), Windows (.exe/.zip), Linux (.AppImage/.deb)  
**License**: Proprietary (Closed source by default)

---

## Copilot's Objective

Help evolve Dark War into a cohesive, moddable, atmospheric roguelike with well-structured TypeScript architecture, 1990s-style sprite graphics, and modern development practices while maintaining its retro-futuristic atmosphere and turn-based gameplay.
