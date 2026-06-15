# Dark War

## What is this?

Glad you asked! This is my remake of the classic roguelike Mission Thunderbolt by Dave Scheifler, released in 1992. I loved this game as a kid. This is a love letter to my childhood.

Service with a smile, citizen!

## Setup & Installation

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/kylirh/dark-war.git
   cd dark-war
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## Running the Game

### Development Mode

To build and launch the game in Electron:

```bash
npm run dev
```

This will compile TypeScript, bundle assets, and launch the Electron application. The game opens to a main menu where you can start a new game or join/host multiplayer.

### LAN Multiplayer (built-in)

The easiest way to play multiplayer — no separate terminal needed:

1. One player clicks **Multiplayer → Host Game** in the main menu
2. Other players on the same network click **Multiplayer → Browse Games** and see the hosted game appear automatically
3. Join and play

### Online Multiplayer (manual server)

For playing across the internet or testing locally:

1. Start the server:

   ```bash
   npm run multiplayer:server
   ```

2. Launch the game in online mode:

   ```bash
   npm run dev:online
   ```

   This connects to `ws://localhost:7777`.

3. For additional clients (without rebuilding):

   ```bash
   npm run online:client
   ```

### Watch Mode

For active development with auto-rebuild on file changes:

```bash
npm run watch
```

Then in a separate terminal:

```bash
npx electron .
```

### Type Checking

To check TypeScript types without building:

```bash
npm run type-check
```

### Testing

Unit tests (Vitest) cover the game logic, networking, and map systems:

```bash
npm test            # run once
npm run test:watch  # watch mode
```

## Building Distributables

To create standalone executables for macOS, Windows, and Linux:

```bash
npm run build
```

This creates distributable packages in the `dist/` directory:

- **macOS**: `.dmg` and `.zip`
- **Windows**: `.exe` installer and `.zip`
- **Linux**: `.AppImage`

### Other build variants

One shared engine drives four variants (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

```bash
npm run build         # ① Electron desktop client (above)
npm run server:start  # ② headless dedicated server  (apps/server)
npm run build:web     # ③ static web client → apps/web/dist  (apps/web)
                      # ④ arcade cabinet — scaffolded (apps/arcade), built last
```

The web client is single-player plus join-a-server-by-address; it can't host or
auto-discover LAN games (a browser has no listening/UDP sockets).

## Project Structure

```
dark-war/
├── app/                      # Electron build output (HTML, bundled JS, assets)
├── apps/                     # Per-variant homes (electron, web, server, arcade)
├── electron/                 # Electron main process, preload, server manager
├── server/                   # Authoritative multiplayer server
├── src/                      # TypeScript source, split by package boundary:
│   ├── engine/               # Pure core — NO DOM/Pixi/Electron/ws/node
│   │                         #   (types, config, content, core, entities,
│   │                         #    systems/{simulation,physics,fov}, utils)
│   ├── client/               # Presentation — main.ts + systems/ (renderer, input, UI)
│   └── net/                  # Multiplayer client, protocol version, delta encoding
└── reference/                # Original game assets and documentation
```

## Controls

All movement and action keys are configurable in **Settings** from the pause menu.

| Key                        | Action                                                     |
| -------------------------- | ---------------------------------------------------------- |
| **WASD**                   | Move in 8 directions                                       |
| **Mouse**                  | Aim weapon                                                 |
| **Left Click**             | Use current weapon (melee / shoot / throw / place)         |
| **Right Click**            | Click-to-move (walk to tile; click stairs to use them)     |
| **Mouse Wheel** or **1–4** | Cycle weapons                                              |
| **G**                      | Pick up nearby items                                       |
| **R**                      | Reload active weapon (uses the matching ammo / power cell) |
| **O**                      | Open / close door in movement direction                    |
| **C**                      | Toggle CTDM (time dilation device)                         |
| **Escape**                 | Pause menu / cancel auto-move                              |

**Stairs**: Right-click a staircase to auto-navigate to it and descend or ascend. You can also walk directly onto a staircase tile.

**Dev tools** (enable in Settings): `V` toggles FOV visualization, `M` toggles god mode.

## Technologies

- **Electron** — Cross-platform desktop application
- **Pixi.js** — Hardware-accelerated 2D rendering with interpolation
- **rot.js** — Roguelike toolkit (PreciseShadowcasting FOV)
- **detect-collisions** — Continuous collision detection
- **TypeScript** — Type-safe game logic
- **Vite** — Fast build tooling

## Further Reading

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for the full development vision, architecture details, and roadmap.
