# apps/web — static web client (variant 3)

A browser build of Dark War. **Single-player works fully**, and you can **join an
Internet or LAN server by address** (`ws://` / `wss://`). A browser can't host a
game or auto-discover LAN games (no listening sockets / no UDP), so those are
stubbed — see `docs/ARCHITECTURE.md`.

## Build & run

```bash
npm run build:web          # → apps/web/dist (index.html, game.js, web-shim.js, assets)
# serve the static files any way you like, e.g.:
python3 -m http.server 5180 --directory apps/web/dist
# then open http://localhost:5180
```

## How it works

- Reuses the **same client bundle** the Electron app ships (`app/game.js`) — the
  client already guards every Electron call with `window.native?.`, so it runs
  fine without a preload.
- `web-shim.js` provides a browser `window.native`: saves go to **localStorage**;
  window controls use the **Fullscreen API**; hosting/LAN-discovery are no-ops.
- `scripts/build-web-static.mjs` builds the bundle and assembles the static site.

## Notes

- For a public deployment, serve over **HTTPS** and point multiplayer at a
  **`wss://`** server (browsers block mixed `ws://` content on `https://` pages).
- Verified loading + starting a new game in a headless browser.
