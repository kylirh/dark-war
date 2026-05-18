# Dark War - AI Coding Instructions

You are assisting in the development of **Dark War**, a browser-first 2D simulation RPG that blends elements of _The Legend of Zelda: A Link to the Past_, _Stardew Valley_, _Terraria_, and classic roguelikes with a unique time-dilation combat system.

The project is a functional, playable game and will be expanded incrementally. **Architectural flexibility, experimentation, and refactoring are expected and encouraged.**

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
- Retro sci-fi aesthetic inspired by the original Mission Thunderbolt
- Top-down perspective with sprite-based rendering
- Sparse, impactful visual effects (bullet traces, explosions, hit flashes)
- Visual clarity always prioritized over realism

**2. World & Exploration**

- **Tile-based world, but entities move freely** (not grid-locked)
- **Fully mutable terrain**: build/destroy structures, plant crops, modify landscapes permanently
- **Multiple worlds/levels**: interiors, dungeons, portals, instanced areas
- Hybrid **procedural + authored content** that blends seamlessly
- **Multiple level types**: procedural dungeons (BSP), procedural outside level, future interior levels
- **Field of view system**: unexplored areas hidden, explored areas revealed and dimmed
- **Mutable terrain**: walls can be damaged and destroyed; holes can be repaired by utility bots

**3. Combat & Time Dilation (CTDM)**

- Combat is fundamentally **real-time**
- The **CTDM** is a **findable in-game device**:
  - A hard sci-fi neural interface that accelerates the user's cognition relative to time
  - When equipped and active, detects nearby threats and triggers proportional time slowdown
  - Has a **charge meter** that drains under threat and recharges when safe
  - Can be toggled off (toggle key: `C`)
  - Auto-disables when charge is exhausted
- **Without CTDM**, combat runs at near-real-time (`REAL_TIME_SCALE = 0.85`) — challenging
- **Current CTDM implementation**: Threat computed from proximity and alert level of monsters; time scale interpolates smoothly; charge drains/recharges

**4. Movement & Physics**

- Items can cluster naturally with small spacing
- All actors (player, NPCs, monsters) can pick up, equip, and use items
- Grid defines terrain constraints, not movement
- Smooth, fluid entity movement at 225 pixels/second with circle-collider physics
- Bullets, grenades, and land mines with physics and collision
- Wall sliding preserves parallel velocity on collision

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

- **LAN multiplayer**: Host a game from within the app; other players discover it via UDP broadcast
- **Online multiplayer**: Authoritative WebSocket server; clients send input, server runs simulation
- Per-player FOV and explored-state; server broadcasts full game state each tick

---

## Current Implementation

### Architecture Overview

```
src/
├── config/
│   └── sprites.ts            # Sprite sheet configuration
├── core/
│   ├── Game.ts               # State manager, level transitions, FOV, serialization
│   ├── GameLoop.ts           # Fixed 60Hz timestep with accumulator pattern
│   ├── Map.ts                # BSP dungeon generation (64×36 tiles)
│   └── OutsideLevel.ts       # Procedural exterior (128×72 tiles)
├── entities/
│   ├── GameEntity.ts         # Abstract base: worldX/Y, velocity, physics body
│   ├── PlayerEntity.ts
│   ├── MonsterEntity.ts
│   ├── ItemEntity.ts
│   ├── BulletEntity.ts
│   └── ExplosiveEntity.ts
├── net/
│   └── MultiplayerClient.ts  # WebSocket client (online mode)
├── systems/
│   ├── FOV.ts                # rot.js PreciseShadowcasting per player
│   ├── GameMenu.ts           # Main menu, pause menu, multiplayer lobby UI
│   ├── Input.ts              # Keyboard/mouse input → callbacks
│   ├── IntroStory.ts         # Pre-game lore slides
│   ├── MouseTracker.ts       # Mouse world position and aiming angle
│   ├── Music.ts              # Background music
│   ├── Physics.ts            # detect-collisions; circle/box colliders
│   ├── Preferences.ts        # Persistent settings and keybindings (localStorage)
│   ├── Renderer.ts           # Pixi.js with render interpolation
│   ├── RetroWindowChrome.ts  # Window chrome and UI shell
│   ├── Sound.ts              # Sound effects
│   ├── TitleScreen.ts        # Animated title/splash screen
│   ├── UI.ts                 # In-game HUD
│   └── simulation/
│       ├── index.ts          # stepSimulationTick, processEventQueue, re-exports
│       ├── constants.ts      # SIM_DT_MS=50, MONSTER_SPEED=225, etc.
│       ├── helpers.ts        # pushEvent, canActorAct, hasClearLineOfSight
│       ├── ai.ts             # Steering + AI command generation
│       ├── commands.ts       # enqueueCommand + all resolve*Command
│       ├── events.ts         # All process*Event handlers
│       └── explosives.ts     # Grenade/mine fuse, chain explosions
├── utils/
│   ├── helpers.ts            # Coordinate math, tile queries (two variants each)
│   ├── multiplayer.ts        # Multiplayer utilities
│   ├── pathfinding.ts        # A* for click-to-move
│   ├── repair.ts             # Wall/hole repair utilities (utility bot)
│   ├── RNG.ts                # Deterministic Mulberry32 RNG
│   └── walls.ts              # applyWallDamageAt() — destructible walls
└── types/
    └── index.ts              # All TypeScript type definitions and enums

server/
└── multiplayer-server.ts     # Authoritative WebSocket server

electron/
├── main.js                   # Electron main process + IPC
├── preload.js                # Exposes IPC bridge to renderer
└── server-manager.js         # Embedded server child process + UDP LAN discovery
```

### Key Technical Details

**Simulation** (20 ticks/sec, `SIM_DT_MS = 50ms`):
- Command/event pipeline: player input → `enqueueCommand` → `stepSimulationTick` → `processEventQueue`
- Events cascade: DAMAGE → DEATH → loot drop → chain EXPLOSION
- AI updates steering velocities every 5 ticks; each monster decides one command per turn

**Physics** (60Hz):
- Circle colliders: ~12px player, ~10px monster, ~4px bullet
- Wall boxes: 16px half-extents (32px tiles)
- Per-frame entity Map for O(1) body→entity lookup in collision callbacks

**Coordinate System (CRITICAL)**:
- `worldX/worldY`: Float pixel coordinates (source of truth)
- `gridX/gridY`: Read-only getters — `Math.floor(worldX / 32)`
- **Never set `gridX`/`gridY` directly**

**Helper function variants**:
- `idx/inBounds/tileAt/passable/setTile` — use global dungeon dimensions (MAP_WIDTH=64, MAP_HEIGHT=36)
- `idxFor/inBoundsFor/tileAtFor/passableFor/setTileFor` — take explicit width/height; required for outside levels

**CTDM** (`REAL_TIME_SCALE = 0.85`, `SLOWMO_SCALE = 0.05`):
- Threat = max(visible alert monster proximity factors)
- Time scale → SLOWMO_SCALE when threat > 0 and CTDM active
- Charge drains at up to `CTDM_DRAIN_MAX = 8.0` charge/sec at full threat
- Recharges at `CTDM_RECHARGE_RATE = 3.0` charge/sec when no threat

**LAN Multiplayer**:
- `electron/server-manager.js`: Forks `app/server-bundle.js` as child process; manages lifecycle
- `DiscoveryManager` sends UDP broadcast on port 7779 every 2s; clients listen and display available games
- All discovery IPC: `discovery:start-broadcast`, `discovery:start-listen`, `discovery:get-servers`

---

## Development Workflows

```bash
npm run dev          # Build TypeScript and launch Electron (offline)
npm run dev:online   # Build and launch, connects to localhost:7777
npm run build        # Build distributables (macOS/Windows/Linux)
npm run build:ts     # Compile TypeScript and bundle with Vite
npm run type-check   # Type check without building
npm run watch        # Watch mode for development
```

---

## Critical Patterns

**Coordinates**:
- Always use `worldX/worldY` for entity position
- Never set `gridX/gridY` directly (computed getters)
- Movement: Set `velocityX/velocityY` in pixels/second

**State Management**:
- `Game.getState()` returns `GameState`
- Enqueue commands: `enqueueCommand(state, { type, actorId, tick, data, priority, source })`

**Entity Queries**:
- `entities.filter(e => e.kind === EntityKind.MONSTER)`
- `tileAtFor(map, x, y, mapWidth, mapHeight)`, `passableFor(map, x, y, mapWidth, mapHeight)`

**RNG**:
- `RNG.int(n)`, `RNG.choose(array)`, `RNG.chance(probability)`
- Use `Math.random()` only for non-deterministic cosmetic choices (e.g., which hit sound to play)

**Pushig events**:
- `pushEvent(state, { type: EventType.DAMAGE, data: { ... } })`
- Child events set `cause: parentEvent.id` for depth tracking

---

## Code Philosophy & Style

- **Major architectural changes are encouraged** when they serve the vision
- Work in **playable chunks** — each step should result in a working, fun game
- **Never leave the codebase in a broken or half-implemented state**
- Favor **flexible, modular designs** over premature optimization
- **Clarity, debuggability, extensibility** > short-term speed
- **TypeScript strict mode** — explicit types, no implicit any
- **Named imports with relative paths** — no default exports
- **Composition over inheritance** — pure functions where possible
- **Performance matters** in rendering and physics paths

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
- Mod support

---

## Guidelines for Copilot

**When proposing changes**:
- Consider how it fits the vision and the current playable game
- Reference specific files/modules with line numbers when relevant
- Maintain TypeScript strict-mode compliance
- Think about the command/event pipeline — player action → command → event → state change
- Consider multiplayer: does this work with the authoritative server model?

**Architecture questions to ask**:
- Which module owns this logic? (simulation domain modules, Game.ts, Physics.ts?)
- Does this integrate with continuous movement and physics?
- What types need updating in `src/types/index.ts`?
- Does this affect serialization (`Game.serialize`/`deserialize`)?
- Are there existing helpers to reuse?
- How will this work with per-player FOV in multiplayer?

**Prefer**:
- Small, focused changes over large rewrites
- Composition over inheritance
- Pure functions where possible
- Performance where it matters (rendering, physics, simulation hot path)
- Clarity over cleverness
