# Dark War - AI Coding Instructions

You are assisting in the development of **Dark War**, a browser-first 2D simulation RPG that blends elements of *The Legend of Zelda: A Link to the Past*, *Stardew Valley*, *Terraria*, and classic roguelikes with a unique time-dilation combat system.

The project currently exists as a functional roguelike prototype with continuous movement and will be expanded incrementally. **Architectural flexibility, experimentation, and refactoring are expected and encouraged.**

---

## Project Vision

### Core Experience

A top-down 2D world where players explore, build, fight, and form relationships in a living, mutable world. Combat uses a **Cognitive Time Dilation Module (CTDM)** that slows time when danger appears, allowing strategic decision-making in real-time combat.

### Key Design Pillars

**1. Presentation & Feel**
- Cute, family-friendly retro sprites (SNES Zelda / Stardew Valley aesthetic)
- Top-down perspective with pseudo-3D depth via:
  - Sprite layering and Y-sorting
  - Partial transparency when player walks behind tall objects
- Sparse, impactful visual effects (sword hits, bullet traces, explosions)
- Visual clarity always prioritized over realism

**2. World & Exploration**
- **Tile-based world, but entities move freely** (not grid-locked)
- **Fully mutable terrain**: build/destroy structures, plant crops, modify landscapes permanently
- **Multiple worlds/levels**: interiors, dungeons, portals, instanced areas
- **Field of view system**: unexplored areas hidden, explored areas revealed and dimmed when out of sight
- Hybrid **procedural + authored content** that blends seamlessly

**3. Combat & Time Dilation (CTDM)**
- Combat is fundamentally **real-time** - always happening at normal speed
- The **Cognitive Time Dilation Module (CTDM)** is an **in-game device** the player can find:
  - A hard sci-fi piece of equipment (like a DARPA research prototype)
  - Think: neural interface that accelerates cognition relative to time
  - When equipped and active, it detects danger and triggers time slowdown
- **When CTDM is active and danger detected**:
  - Time slows to near-standstill (Superhot-style)
  - Player can think, aim, equip items, commit actions
  - On action commit: simulation returns to real-time, action resolves, then slows again
- **CTDM is optional/fallible**:
  - Must be found/acquired (not available from start)
  - Can be deactivated by player choice
  - May drain power, break, or malfunction
  - **Without it, combat is fully real-time and much more challenging**
- **Current implementation**: Simple auto-pause when movement stops (will evolve into full CTDM system)

**4. Movement & Physics**
- Grid defines terrain, not movement constraints
- Smooth, fluid entity movement with sub-tile precision
- Items can cluster naturally with small spacing
- All actors (player, NPCs, monsters) can pick up, equip, and use items

**5. Sleep, Time & Simulation**
- Actions and combat consume energy and health
- **Sleeping restores stats and advances time**
- Sleep triggers **world simulation updates**: crop growth, NPC schedules, relationships, construction, ecosystem changes
- Simulation layer will grow in complexity (SimCity/SimLife inspired)

**6. Stats, Growth & Trade-offs**
- All entities use **shared stat system with meaningful trade-offs**
- Becoming stronger in one area weakens another
- Growth driven by actions, choices, long-term behavior
- Permanent stat changes typically resolve during sleep
- **Intentionally experimental - expected to evolve**

**7. AI, Memory & Relationships**
- NPCs and monsters feel intentional and reactive
- Support for relationships (trust, fear, hostility, cooperation)
- Memory of past events and player actions
- Relationship updates may occur during sleep
- **Start simple, expand over time** - future AI integration possible

**8. Mini-Games**
- Support many optional mini-games (fishing, arcade games, etc.)
- Mechanically distinct but reuse core systems when possible

**9. Platform & Distribution**
- **Primary target**: Web browser (instant play, minimal friction)
- Secondary: Electron, installable apps (future)
- Codebase should remain platform-agnostic

**10. Multiplayer (Secondary)**
- Not a primary focus, but avoid hard architectural blockers
- Consider determinism, chunking, simulation boundaries

---

## Current Implementation

The game currently exists as a roguelike prototype with these systems in place:

### Architecture Overview

```
src/
├─ core/
│  ├─ Game.ts         # Game state manager
│  ├─ GameLoop.ts     # 60Hz fixed timestep loop
│  └─ Map.ts          # Dungeon generation (BSP)
├─ entities/
│  ├─ ContinuousEntity.ts  # Base class with worldX/worldY
│  ├─ Player.ts       # Player entity
│  ├─ Monster.ts      # Monster entities  
│  ├─ Item.ts         # Item entities
│  └─ Bullet.ts       # Bullet projectiles
├─ systems/
│  ├─ Physics.ts      # Collision & movement (detect-collisions)
│  ├─ Simulation.ts   # Command buffer, event queue, ticks
│  ├─ FOV.ts          # Field of view (rot.js)
│  ├─ Input.ts        # Keyboard/mouse input
│  ├─ Renderer.ts     # Pixi.js rendering with interpolation
│  ├─ Sound.ts        # Sound effects
│  ├─ MouseTracker.ts # Mouse aiming
│  └─ UI.ts           # UI updates
├─ utils/
│  ├─ RNG.ts          # Deterministic RNG
│  ├─ helpers.ts      # Coordinate math, tile queries
│  └─ pathfinding.ts  # A* pathfinding
└─ types/
   └─ index.ts        # TypeScript types
```

### Key Technical Details (Current State - Subject to Change)

**Movement System** (foundation for full vision):
- Continuous movement at 200px/s with physics collision
- Circle colliders: 8px player, 7px monster, 4px bullet
- Wall boxes use 16px half-extents (32px tiles)
- Wall sliding preserves parallel velocity

**Coordinate System** (CRITICAL):
- `worldX/worldY`: Float pixel coordinates (source of truth)
- `gridX/gridY`: Derived grid coordinates (READ-ONLY getters)
- **NEVER set `entity.x` or `entity.y` directly** - use `worldX/worldY`
- Tiles are 32x32 pixels

**Current "Time Dilation"**:
- Simple auto-pause when all entities stop moving
- Will evolve into sophisticated CTDM system

**Rendering**:
- Pixi.js with sprite sheet
- Sprite anchoring to center for proper positioning
- Texture caching for performance
- **Will need Y-sorting and transparency for vision**

---

## Development Workflows

```bash
npm run dev          # Build TypeScript and launch Electron
npm run build        # Build distributables (macOS/Windows/Linux)
npm run build:ts     # Compile TypeScript and bundle with Vite
npm run type-check   # Type check without building
npm run watch        # Watch mode for development
```

---

## Critical Patterns

**Coordinates**:
- Always use `worldX/worldY` for entity position
- Never set `x/y` directly (they're read-only getters)
- Movement: Set `velocityX/velocityY` and `targetWorldX/targetWorldY`

**State Management**:
- `Game.getState()` returns GameState
- Command scheduling: `enqueueCommand(state, {...})`

**Entity Queries**:
- `entities.filter(e => e.kind === EntityKind.MONSTER)`
- `tileAt(map, x, y)`, `passable(map, x, y)`

**RNG Usage**:
- `RNG.int(n)`, `RNG.choose(array)`, `RNG.chance(probability)`

---

## Code Philosophy & Style

**Development Approach**:
- **Major architectural changes are encouraged** when they serve the vision
- Work in **playable chunks** - each step should result in a working, fun game
- **Never leave the codebase in a broken or half-implemented state**
- Favor **flexible, modular designs** over premature optimization
- Avoid "AI slop" - respect the existing architecture and make intentional changes
- Clarity, debuggability, and extensibility > short-term speed
- **Systems may be rewritten, replaced, or discarded** as we learn what works

**TypeScript**:
- Strict mode, explicit types for function signatures
- Named imports with relative paths
- One class/system per file
- PascalCase for classes/types, camelCase for functions/variables

**Documentation**:
- Clear file headers explaining purpose and context
- JSDoc comments for public methods
- Self-documenting code with meaningful names

---

## Evolution Roadmap

**Development Philosophy**: Make major architectural changes in chunks that keep the game playable and fun at each step. Significant refactoring is encouraged, but avoid broken/incomplete states. Each phase should result in a working game with new capabilities.

### Phase 1: Foundation (Current)
- ✅ Continuous movement with physics
- ✅ Basic roguelike gameplay
- ✅ FOV system
- ✅ Simple time mechanics (auto-pause on stop)

### Phase 2: CTDM & Combat Evolution
- [ ] CTDM as findable in-game device
- [ ] Danger detection system (enemies in range/attacking)
- [ ] Time scaling on demand (vs. current auto-pause)
- [ ] Action commitment and execution flow
- [ ] CTDM device mechanics (power, durability, breaking)
- [ ] Real-time combat without CTDM as high-difficulty mode

### Phase 3: World Mutability
- [ ] Terrain modification system (build/break tiles)
- [ ] Persistent world state across sessions
- [ ] Structure placement and destruction
- [ ] Crop/tree planting and growth
- [ ] Item crafting from materials

### Phase 4: Living World
- [ ] Sleep system with time advancement
- [ ] World simulation updates during sleep
- [ ] NPC schedules and daily routines
- [ ] Relationship and memory systems
- [ ] Dynamic world events

### Phase 5: Depth & Content
- [ ] Stat system with meaningful trade-offs
- [ ] Multiple worlds/levels/portals/interiors
- [ ] Procedural + authored content pipeline
- [ ] Quest system and objectives
- [ ] Mini-games framework

### Phase 6: Visual Upgrade
- [ ] Y-sorting for sprite layering
- [ ] Transparency system for occlusion
- [ ] Sprite variety and animation states
- [ ] Visual effects (sword slashes, projectile trails, particles)
- [ ] Environmental art polish

### Future Exploration
- AI integration for dynamic NPCs
- Multiplayer architecture
- Mobile/installable versions
- Advanced simulation systems (economy, ecology)

---

## Guidelines for Copilot

**When proposing changes**:
- Consider how it fits the long-term vision
- Reference specific files/modules
- Maintain TypeScript compliance
- Preserve save format compatibility when possible
- Think about extensibility for future features

**Coordinate system**:
- **CRITICAL**: Never set `entity.x` or `entity.y` (read-only getters)
- Use `entity.worldX` and `entity.worldY`

**Architecture questions to ask**:
- Which module owns this logic?
- Does this integrate with continuous movement?
- What types need updating?
- Does this affect serialization?
- Are there existing helpers to reuse?
- How will this work with future CTDM mechanics?
- Is this flexible enough for the vision?

**Prefer**:
- Small, focused changes over large rewrites
- Composition over inheritance
- Pure functions where possible
- Performance where it matters (rendering, physics)
- Clarity over cleverness
