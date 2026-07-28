# apps/server — headless dedicated server (variant 2)

Runs Dark War games on a box with no display. Authoritative simulation, multi-room
(per `roomId`), per-depth `LevelWorld`s, delta-compressed broadcasts, player
join/leave/migration. This is the same server the Electron app embeds for LAN play
(`electron/server-manager.js` forks the bundled `app/server-bundle.js`).

Per-depth worlds describe the current implementation. The approved terrain/world
program will generalize them into WorldSpaces and WorldPlanes; see
[`../../docs/TERRAIN-AND-WORLD.md`](../../docs/TERRAIN-AND-WORLD.md). Old protocol
versions do not require compatibility during that rewrite.

Although the server has no presentation layer, authoritative semantics should
support the rebuilding, cultivation, repair, and community focus recorded in
[`../../docs/ART-DIRECTION.md`](../../docs/ART-DIRECTION.md).

The implementation lives at **`server/multiplayer-server.ts`** (it has a CLI entry
and exports `startMultiplayerServer(port)`).

## Run it

```bash
npm run server:start                       # tsx server/multiplayer-server.ts (default port 7777)
PORT=8080 npm run server:start             # choose a port via env
tsx server/multiplayer-server.ts 8080      # or via argv

# Distributable bundle (built by `npm run build:server`):
node app/server-bundle.js 7777
```

Clients connect with `ws://<host>:<port>/?room=<roomId>` (the in-game Multiplayer
menu does this for you). Put a TLS terminator in front and use `wss://` for the web
client over HTTPS.

## Status

- Multi-room hosting and per-depth worlds already work.
- Public-service operations such as room limits, idle timeouts, and metrics are
  deferred while the authoritative world representation is being replaced. See
  [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md).
