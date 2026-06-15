# Dark War — Target Architecture (4 Variants)

This document describes Dark War's architecture: **one shared game engine** consumed
by **distinct build variants**. The shared core and its platform boundaries are
**realized today in the `src/` tree** (`src/engine` / `src/client` / `src/net`,
with the headless host under `server/`), enforced by `src/engine-purity.test.ts`.
Lifting those directories into formal npm-**workspaces** packages (the layout
sketched below) is an optional, mechanical follow-up — the hard part, clean
separation, is done.

**Variant status:** ① Electron client — shipping (`npm run build`). ② Headless
server — shipping (`server/multiplayer-server.ts`, `npm run server:start`,
`apps/server/`). ③ Web client — shipping (`npm run build:web`, `apps/web/`,
verified in a browser). ④ Arcade cabinet — scaffolded (`apps/arcade/`), built last.

## The four variants

| #   | Variant             | What it is                                                                   | Can host?                           | Can join?                                                                           |
| --- | ------------------- | ---------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **Electron client** | Installable desktop app (mac/win/linux)                                      | LAN (embedded server child process) | LAN games, Internet/dedicated servers                                               |
| 2   | **Headless server** | Node process you run on a box; hosts game(s)                                 | yes (authoritative)                 | n/a                                                                                 |
| 3   | **Web client**      | Static files served over HTTP, played in any modern browser                  | no                                  | single-player always; Internet servers (ws/wss); LAN servers _if given the address_ |
| 4   | **Arcade cabinet**  | Tailored build for a stand-up cabinet (joystick + buttons), different pacing | TBD                                 | TBD (likely single-player/attract first)                                            |

### Can the web client join LAN / Internet multiplayer? (answering the brief)

- **Internet / dedicated server: yes.** A browser can open a `WebSocket` to any
  reachable server. Use `wss://` (TLS) for public servers; browsers block mixed
  content, so a page served over `https://` must talk to a `wss://` server.
- **LAN: yes, with a caveat.** A browser _can_ connect to `ws://192.168.x.x:7777`
  on the LAN — WebSocket is just TCP. What it **cannot** do is **auto-discover**
  LAN games: our discovery uses **UDP broadcast** (`DiscoveryManager`), and
  browsers have no UDP API. So a web player must **type the host:port** (or scan a
  QR code / click a link the host shares). Plain `ws://` (no TLS) works only if the
  page itself is served over `http://` (or `file://`), otherwise mixed-content
  rules block it — fine for a hobby LAN setup.
- **Hosting from a browser: no.** Browsers cannot open listening TCP/UDP sockets,
  so the web client can never host. That is correct as you suspected. Hosting is
  always the Electron embedded server (variant 1) or the headless server (variant 2).

## Engine purity rule (the linchpin)

The shared engine MUST be platform-agnostic: **no `import` of Pixi, the DOM,
Electron, `ws`, `node:*`, or browser/Node globals** inside engine code. It deals in
plain data (`GameState`, commands, events) and deterministic logic. This is what
lets the _same_ simulation run in the browser, in Electron, and on the headless
server, and is already mostly true today (the `core` / `systems/simulation` /
`physics` / `fov` / `entities` / `utils` code is pure; `renderer`, `sound`,
`mouse-tracker`, `game-menu`, etc. are presentation).

## Target folder layout (optional workspaces lift)

The boundaries below are **already realized** in `src/engine`, `src/client`,
`src/net`, and `server/`. This is the npm-**workspaces** shape they would lift into
if/when packaging benefits (independent versioning, stable `@dark-war/*` import
targets) outweigh the build complexity. It is not a prerequisite for any variant —
all four already share the same `src/` core.

```
dark-war/
├─ packages/
│  ├─ engine/          # PURE game core — no DOM/Pixi/Electron/ws/node
│  │  └─ src/
│  │     ├─ types.ts
│  │     ├─ entities/          # GameEntity + subclasses
│  │     ├─ systems/
│  │     │  ├─ simulation/     # commands, ai, events, tick, explosives
│  │     │  ├─ physics.ts
│  │     │  └─ fov.ts
│  │     ├─ world/             # dungeon-generator, outside-level, tile-source, game, game-loop
│  │     ├─ content/           # DATA: item registry, monster registry, weapon defs, loot tables
│  │     └─ utils/             # rng, helpers, wrap, pathfinding, walls, repair
│  ├─ net/             # protocol, state-delta, multiplayer-client (browser+node WebSocket)
│  ├─ server-core/     # headless hosting library: Room/LevelWorld mgmt, tick loop, (multi-game)
│  └─ client/          # browser-capable PRESENTATION: pixi renderer, input, sound,
│                      #   mouse-tracker, UI (menus, modals, inventory bar, story log)
├─ apps/
│  ├─ electron/        # variant 1: main/preload/server-manager + window shell + boot
│  ├─ web/             # variant 3: index.html + Vite entry; single-player + join remote
│  ├─ server/          # variant 2: dedicated headless executable wrapping server-core
│  └─ arcade/          # variant 4: cabinet input map, attract mode, pacing tweaks (future)
├─ assets/             # shared art/sound/fonts/css (referenced by client builds)
├─ tools/              # build + asset-generation scripts (spritesheet, sound synth)
└─ docs/
```

### Folder roles

- **`packages/engine`** — the brain. Deterministic, headless, unit-tested. Every
  variant depends on it. No rendering, no I/O.
- **`packages/net`** — wire format + client transport. Pure enough to run in browser
  and Node (uses the standard `WebSocket`; on Node, server-core supplies `ws`).
- **`packages/server-core`** — turns the engine into a host: rooms (one or many
  games), per-depth `LevelWorld`s, authoritative tick, delta broadcast, player
  join/leave/migration. Used by **both** the Electron embedded server and the
  dedicated server, so hosting logic lives in exactly one place.
- **`packages/client`** — everything you see/hear/touch, browser-first. Pixi
  renderer, sound, input, all the UI. No Electron APIs directly — those are
  injected by the host app via a thin `PlatformBridge` interface (e.g. `quit()`,
  `discoverLanGames()`, `hostLanGame()`); on web the bridge is a no-op/limited impl.
- **`apps/electron`** — variant 1. Owns the BrowserWindow, the embedded-server child
  process, UDP LAN discovery, and provides the Electron `PlatformBridge`.
- **`apps/web`** — variant 3. Static Vite build. Provides a web `PlatformBridge`
  (single-player + manual server-join; no host, no discovery).
- **`apps/server`** — variant 2. CLI/daemon around `server-core`; config for
  port, rooms, max games, etc.
- **`apps/arcade`** — variant 4. Likely an Electron or web build with a cabinet
  input map (joystick/buttons → actions), attract/demo mode, coin-up flow, and its
  own pacing constants. Built last.
- **`tools`** — deterministic asset generation so art/sound are reproducible and
  reviewable in code (no opaque binaries authored by hand): `gen-spritesheet.mjs`
  extends `sprites.png`; `gen-sounds.mjs` synthesizes effect WAVs.

## How today maps onto the optional packages

The split is already realized in `src/`. This is where each directory would move if
the workspaces lift (above) is ever done — a mechanical relocation, not a redesign.

| Today (realized)                                                                                                                       | Would lift into                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/engine/*` — `types.ts`, `core/`, `entities/`, `systems/{simulation,physics.ts,fov.ts}`, `content/`, `utils/`, `config/sprites.ts` | `packages/engine` (the sprite PNG stays in `assets/`)                                              |
| `src/net/*`                                                                                                                            | `packages/net`                                                                                     |
| `src/client/*` — `main.ts` + `systems/{renderer,sound,mouse-tracker,input,*-modal,*-menu,inventory-bar,intro-story,title-screen,…}`    | `packages/client` (+ `apps/*` entry points)                                                        |
| `server/multiplayer-server.ts`                                                                                                         | hosting lib → `packages/server-core`; executable → `apps/server`; Electron embed → `apps/electron` |
| `electron/*`                                                                                                                           | `apps/electron`                                                                                    |
| `app/` (built output + index.html + assets)                                                                                            | `apps/electron` shell + `apps/web`; assets → top-level `assets/`                                   |

## How the boundary is held

The split was done in verifiable stages (each keeping `type-check`, `test`, and the
Electron `build` green) rather than one big-bang move, and the result is enforced
continuously: `src/engine-purity.test.ts` scans `src/engine` and fails the suite on
any import of Pixi, the DOM, Electron, `ws`, or `node:*`. New engine code must
respect that boundary, which keeps the optional workspaces lift above mechanical.
