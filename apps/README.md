# apps/ — build variants (planned monorepo)

Target homes for the four build variants (see
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)). Code lives under `../src`,
`../server`, and `../electron` today; migration is staged
([`../docs/ROADMAP.md`](../docs/ROADMAP.md) → Phase R).

- **`electron/`** — Variant 1. Installable desktop app: BrowserWindow shell,
  embedded-server child process, UDP LAN discovery, Electron `PlatformBridge`.
  Today: `../electron` + `../app/index.html`.
- **`server/`** — Variant 2. Dedicated headless server executable wrapping
  `packages/server-core` (port/rooms/max-games config). Today: `../server`.
- **`web/`** — Variant 3. Static Vite build for the browser: single-player always;
  join remote/Internet servers (ws/wss) and LAN servers given an address (no UDP
  discovery, no hosting). Provides a limited web `PlatformBridge`.
- **`arcade/`** — Variant 4 (last). Cabinet build: joystick/button input map,
  attract/demo mode, coin-up flow, and its own pacing constants.
