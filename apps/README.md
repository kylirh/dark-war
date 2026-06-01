# apps/ — build variants

The four build variants (see
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)). All share the same core under
`../src` (`engine`/`client`/`net`) plus the headless host in `../server`.

- **`electron/`** — Variant 1. **Shipping.** Installable desktop app: BrowserWindow
  shell, embedded-server child process, UDP LAN discovery. Code: `../electron` +
  `../app/index.html`; build with `npm run build`.
- **`server/`** — Variant 2. **Shipping.** Dedicated headless server. Code:
  `../server/multiplayer-server.ts`; run with `npm run server:start`. See
  [`server/README.md`](server/README.md).
- **`web/`** — Variant 3. **Shipping.** Static browser build: single-player always;
  join remote/Internet servers (ws/wss) and LAN servers given an address (no UDP
  discovery, no hosting). Build with `npm run build:web`. See
  [`web/README.md`](web/README.md).
- **`arcade/`** — Variant 4. **Scaffolded** (built last). Cabinet build:
  joystick/button input map, attract/demo mode, coin-up flow, pacing constants. See
  [`arcade/README.md`](arcade/README.md).
