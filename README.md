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

- **Numpad** - Move (8 directions) or **Arrow Keys** (4 directions)
- **Numpad 5** - Wait/skip turn
- **F** - Fire weapon (then numpad for direction)
- **R** - Reload weapon
- **O** - Open/close door (then numpad for direction)
- **<** - Descend stairs to next level
- **P** - Toggle Planning/Real-Time mode
- **Space** - Pause/Unpause (Real-Time mode)
- **Enter** - Resume from pause
- **V** - Toggle field of view

### Gameplay Modes

- **Planning Mode**: Time freezes after each action. Execute commands, then simulation advances one tick.
- **Real-Time Mode**: Continuous simulation at 5 ticks/second. Space to pause/unpause.

## Technologies

- **Electron** - Cross-platform desktop application
- **Pixi.js** - Hardware-accelerated 2D rendering with texture caching
- **rot.js** - Roguelike toolkit (shadowcasting FOV)
- **TypeScript** - Type-safe game logic
- **Vite** - Fast build tooling
