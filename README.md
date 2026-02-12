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

This will:

1. Generate sprite assets
2. Compile TypeScript to JavaScript
3. Launch the Electron application

### Multiplayer (Authoritative Server)

1. Start the multiplayer server:

```bash
npm run multiplayer:server
```

2. Start each game client in online mode:

```bash
npm run dev:online
```

By default this connects to `ws://localhost:7777` in room `default`.

For additional clients (without rebuilding each time), run:

```bash
npm run online:client -- --name=Alice --room=default
npm run online:client -- --name=Bob --room=default
```

You can also pass custom launch args directly:

```bash
electron . --mode=online --server=ws://localhost:7777 --room=my-room --name=Alice
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

## Building Distributables

To create standalone executables for macOS, Windows, and Linux:

```bash
npm run build
```

This will create distributable packages in the `dist/` directory:

- **macOS**: `.dmg` and `.zip`
- **Windows**: `.exe` installer and `.zip`
- **Linux**: `.AppImage` and `.deb`

## Project Structure

```
dark-war/
├── app/                 # Build output (HTML, bundled JS, assets)
├── electron/            # Electron main process and preload scripts
├── src/                 # TypeScript source code
│   ├── core/           # Game engine (Game, Map)
│   ├── entities/       # Entity factories (Player, Monster, Item)
│   ├── systems/        # Game systems (AI, Combat, FOV, Renderer, UI)
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Helper functions and RNG
├── scripts/            # Build scripts (sprite generation)
└── reference/          # Original game assets and documentation
```

## Controls

- **WASD** - Move continuously in 8 directions
- **Mouse** - Aim weapon
- **Left Click** - Use current weapon (melee/shot/throw/place)
- **Right Click** - Click-to-move (offline only)
- **Mouse Wheel** or **1-4** - Cycle weapons (1 melee, 2 pistol, 3 grenade, 4 land mine)
- **G** - Pick up items
- **R** - Reload pistol
- **O** - Open/close door in your current movement direction
- **V** - Toggle field of view visualization
- **<** - Descend stairs to next level

## Future Development

See [copilot-instructions.md](.github/copilot-instructions.md) for the full vision and technical details.

## Technologies

- **Electron** - Cross-platform desktop application
- **Pixi.js** - Hardware-accelerated 2D rendering with texture caching
- **rot.js** - Roguelike toolkit (shadowcasting FOV)
- **TypeScript** - Type-safe game logic
- **Vite** - Fast build tooling
