# apps/web — static web client (variant 3)

A browser build of Dark War. **Single-player works fully**, and you can **join an
Internet or LAN server by address** (`ws://` / `wss://`). A browser can't host a
game or auto-discover LAN games (no listening sockets / no UDP), so those are
stubbed — see [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

The web build ships the same assets and follows the same canonical visual
direction in [`../../docs/ART-DIRECTION.md`](../../docs/ART-DIRECTION.md).

## Build & run

```bash
npm run build:web          # → apps/web/dist (index.html, game.js, web-shim.js, assets)
# serve the static files any way you like, e.g.:
python3 -m http.server 5180 --directory apps/web/dist
# then open http://localhost:5180
```

## Deployment

Live at **https://darkwar.kylir.com**, published to GitHub Pages from this repo
by [`.github/workflows/deploy-web.yml`](../../.github/workflows/deploy-web.yml)
on every commit that lands on `main`. The workflow type-checks and runs the unit
suite before it builds, so a broken `main` never reaches the public site.

The site is served from the `dark-war` repo's own Pages site rather than from
`kylirh.github.io`: a Pages site can hold exactly one custom domain, and that
one already serves `kylir.com`.

One-time setup, if it ever has to be redone:

- DNS: a `CNAME` record for `darkwar` → `kylirh.github.io.`
- Repo Settings → Pages: source **GitHub Actions**, custom domain
  `darkwar.kylir.com`, Enforce HTTPS once the certificate provisions.

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
