# Dark War - AI Coding Instructions

You are assisting with **Dark War**, a playable roguelike remake of
_Mission Thunderbolt_ (1992). The game is built with TypeScript, Pixi.js,
Electron, rot.js, detect-collisions, Vite, and a headless WebSocket server.

The current codebase is organized around a platform-agnostic engine under
`src/engine`, a presentation/client layer under `src/client`, shared networking
code under `src/net`, and the authoritative server under `server`. The same core
simulation is used by the Electron desktop app, the static web client, and the
headless multiplayer server.

The project is functional and playable. Future work should be delivered in
playable chunks that preserve type-checks, tests, and the current build variants.

## Product and visual direction

Dark War is centered on cheerful reconstruction after the apocalypse.
Exploration, repair, gardening, building, friendship, and community should
occupy more of the player's emotional life than fighting and destruction. The
visual target is outline-free modern pixel art with painterly clusters, a
limited vibrant palette, deep colored contrast, and atmospheric lighting—not a
grim, heavy military aesthetic. `docs/ART-DIRECTION.md` is authoritative for all
art, UI, effects, animation, and visual content decisions.

---

## Current Product

### Playable Experience

- Top-down roguelike exploration inspired by _Mission Thunderbolt_.
- Continuous, free-moving actors on a tile-constrained world; entities are not
  grid-locked.
- Mouse aiming, click-to-move, configurable keyboard controls, hotbar inventory,
  pause menu, character/settings modal, save slots, intro story, title screen,
  procedural music, and sound effects.
- Outside surface level at depth 0 plus bounded dungeon levels below.
- Field of view: unseen tiles hidden, explored tiles dimmed, per-player FOV in
  multiplayer.
- Destructible terrain: walls can be damaged, destroyed into rubble, and
  sometimes opened into holes. Items can fall through holes to deeper levels.
- Utility bots can repair damaged tiles and holes.
- Doors, locked doors, stairs, deliberate hole descent, and level persistence
  across visited depths.

### Combat And CTDM

- Combat is real-time and uses continuous physics.
- Weapons and gear include melee weapons, gyrojet pistol, laser pistol, SMG,
  shotgun, grenades, land mines, thrown rocks/bones, armor, medkits, power cells,
  panic button, holowalls, keycards, cookies, coins, junk, and vending machines.
- The CTDM is a findable item in offline play. Before finding it, the game runs
  near real time. When installed and enabled, nearby alert threats slow time
  proportionally, drain charge under danger, recharge when safe, and auto-disable
  when depleted.
- Online multiplayer intentionally runs in real time; CTDM/time dilation is not
  part of the authoritative online simulation.

### Content

- Data-driven item metadata lives in `src/engine/content/item-defs.ts`.
- Data-driven monster definitions live in `src/engine/content/monster-defs.ts`.
- Current monsters include mutants, rats, skulkers, utility bots, giant spiders,
  wild dogs, icky lumps, snagglepuss, flutterbangs, moppets, cybercops, zyths,
  tentacular horrors, terrorist collaborators, and dreadnaughts.
- Monster behavior is built from reusable archetypes (`melee`, `ranged`, `bot`)
  plus flags for breeding, explosions, venom slow, invisibility, theft, teleport,
  far sight, self-healing, wall destruction, friendship, multi-hit attacks, and
  item-carry restrictions.
- Friendly pet behavior exists for wild dogs and snagglepuss-style companions.

### Multiplayer And Variants

- Electron app: shipping desktop variant. Can host an embedded LAN server, browse
  LAN games through UDP discovery, and join manual WebSocket servers.
- Headless server: shipping authoritative WebSocket host with rooms,
  per-`WorldAddress` planes, authoritative simulation, independent portal
  migration, respawn handling, and delta-compressed broadcasts.
- Web client: shipping static browser build. Single-player works; browser clients
  can join `ws://` / `wss://` servers by address but cannot host or UDP-discover
  LAN games.
- Arcade variant: scaffolded only, intentionally left for later.

---

## Architecture Overview

```
src/
├── engine/                    # Pure shared core: no DOM/Pixi/Electron/ws/node
│   ├── config/
│   │   └── sprites.ts         # Sprite-sheet coordinates and sprite metadata
│   ├── content/
│   │   ├── item-defs.ts       # Item names, categories, behavior flags
│   │   ├── monster-defs.ts    # Monster stats, AI archetypes, spawn data
│   │   └── sound-effects.ts   # Pure sound effect IDs
│   ├── core/
│   │   ├── game.ts            # State manager, levels, FOV, serialization
│   │   ├── game-loop.ts       # Fixed 60Hz timestep
│   │   ├── entity-manager.ts  # Entity add/remove lifecycle tracking
│   │   ├── dungeon-generator.ts
│   │   ├── outside-level.ts
│   │   └── tile-source.ts
│   ├── entities/
│   ├── systems/
│   │   ├── fov.ts
│   │   ├── physics.ts
│   │   └── simulation/
│   │       ├── tick.ts
│   │       ├── constants.ts
│   │       ├── sim-helpers.ts
│   │       ├── ai.ts
│   │       ├── commands.ts
│   │       ├── events.ts
│   │       └── explosives.ts
│   ├── utils/
│   └── types.ts
├── client/                    # Pixi/DOM/UI/input/sound presentation layer
│   ├── main.ts
│   └── systems/
└── net/                       # Wire protocol, WebSocket client, delta codec

server/
└── multiplayer-server.ts      # Authoritative multiplayer server

electron/
├── main.js
├── preload.js
└── server-manager.js

apps/
├── server/
├── web/
└── arcade/
```

See `docs/ARCHITECTURE.md` for the variant matrix and the optional future
workspace/package layout.

---

## Build, Run, And Validation

```bash
# Development
npm run dev                    # Build TypeScript + Vite, then launch Electron
npm run dev:online             # Build and launch connected to localhost:7777
npm run watch                  # Vite watch mode; run `npx electron .` separately

# Multiplayer
npm run multiplayer:server     # Start authoritative WebSocket server
npm run online:client          # Launch an extra client without rebuilding
npm run server:start           # Alias for the headless server

# Type checking
npm run type-check             # Client + server
npm run type-check:client
npm run type-check:server

# Tests
npm test                       # Vitest unit suite once
npm run test:watch

# Builds
npm run build:ts               # Build server bundle, tsc, and web/electron bundle
npm run build:web              # Static browser client
npm run build                  # Electron distributables

# Formatting
npm run format                 # Prettier write
npm run format:check           # Prettier check
```

Vitest coverage focuses on deterministic logic: simulation, abilities, item
mechanics, physics helpers, map generation, tile systems, entity lifecycle,
network deltas, multiplayer server behavior, and engine purity.

---

## Critical Patterns

### Coordinate System

`worldX` and `worldY` are the source of truth. `gridX` and `gridY` are read-only
getters derived from world coordinates.

```typescript
// Correct: place by world coordinates or helper.
entity.worldX = 5 * 32 + 16;
entity.worldY = 10 * 32 + 16;
setPositionFromGrid(entity, 5, 10);

// Correct: move by velocity.
entity.velocityX = 225;
entity.velocityY = 0;
```

Never assign `gridX` or `gridY` directly.

### Tile Access

- Use `state.tiles` (`TileSource`) for canonical tile reads/writes when possible.
- Flat-array code must use explicit-dimension helpers:
  `idxFor`, `inBoundsFor`, `tileAtFor`, `setTileFor`, `passableFor`.
- Dungeon levels are bounded `128x96` maps generated up front.
- The outside level is `128x72` and wraps toroidally.

### Entity Lifecycle

All runtime entities live in `state.entities`, but add/remove operations must go
through `state.entityManager`. Direct `state.entities.push(...)` or whole-array
replacement can desync physics bodies and network deltas.

Use:

- `state.entityManager.spawn(entity)`
- `state.entityManager.destroy(entityOrId)`
- `state.entityManager.destroyWhere(predicate)`
- `state.entityManager.destroyByIds(ids)`
- `state.entityManager.replaceAll(entities)` only when the caller rebuilds
  physics wholesale.

### Simulation

Player input becomes commands. Commands resolve into events. Events mutate state
and may cascade.

```typescript
enqueueCommand(state, {
  type: CommandType.FIRE,
  actorId: player.id,
  tick: state.sim.nowTick,
  data: {
    type: "FIRE",
    dx: 1,
    dy: 0,
    weapon: WeaponType.PISTOL,
  },
  priority: 1,
  source: "PLAYER",
});
```

Simulation modules live under `src/engine/systems/simulation/`. Import the
specific file; do not add a barrel.

### Engine Purity

`src/engine` must not import Pixi, DOM APIs, Electron, `ws`, Node APIs, or
browser/Node globals. `src/engine-purity.test.ts` enforces this boundary.

Sound effect names are pure data in `src/engine/content/sound-effects.ts`; DOM
audio playback belongs in `src/client/systems/sound.ts`.

### Multiplayer

- Server is authoritative in online mode.
- One `LevelWorld` is simulated per depth and shared by players on that depth.
- Players migrate individually between depths by stairs or hole falls.
- Wire format is versioned in `src/net/protocol.ts`; bump `PROTOCOL_VERSION`
  whenever serialized network shape changes.
- Clients send monotonic input `seq`; snapshots echo `ackSeq`.
- Movement-only client prediction lives in `src/client/main.ts` and
  `Physics.predictLocalMovement`.
- State broadcasts use `state_full` keyframes and `state_delta` updates from
  `src/net/state-delta.ts`.

---

## Code Style

- TypeScript strict mode.
- Named exports only; no default exports.
- Named imports with relative paths.
- One class/system per file.
- Kebab-case filenames.
- Two-space indentation, semicolons, double quotes preferred.
- Use deterministic `RNG` for gameplay logic. Use `Math.random()` only for
  non-deterministic presentation choices.
- Keep engine changes deterministic and serializable when they affect gameplay.

---

## Active Roadmap

The active program replaces the scalar tile model with compositional semantic
layers, signed discrete elevation, static water, deterministic visual resolution,
portal-linked WorldSpaces, and compiled Aseprite/Tiled authoring sources.

Read these canonical documents before planning or changing world code:

1. `docs/TERRAIN-AND-WORLD.md` — accepted architecture, prototype, constraints,
   and non-goals.
2. `docs/ROADMAP.md` — ordered milestones and cross-branch handoff ledger.
3. `docs/ARCHITECTURE.md` — current runtime boundaries and future world shape.

Dark War is unreleased. Old saves, generated worlds, and network clients do not
require migration or compatibility. It is valid to replace formats and bump the
protocol. Keep each branch playable and tested, but delete superseded paths once
the replacement works rather than accumulating compatibility scaffolding.

---

## Guidance For Future Changes

When proposing or implementing a change:

- Prefer the existing engine/client/net/server boundaries.
- Preserve a playable state after each chunk.
- Update serialization and authoritative multiplayer in the same milestone as
  new gameplay state; do not write legacy migrations.
- Add tests when touching deterministic logic, network encoding, map generation,
  entity lifecycle, or progression state.
- Use stable semantic authoring keys and compact generated runtime IDs. Never use
  atlas positions or editor tile IDs as gameplay identity.
- Coordinate branch ownership through `docs/ROADMAP.md` and update its handoff
  ledger when work is transferred or merged.
- Update canonical documentation in the same branch as behavior changes; avoid
  copying a second roadmap into provider-specific instruction files.
