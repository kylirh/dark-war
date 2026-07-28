# apps/server — headless dedicated server (variant 2)

Runs Dark War games on a box with no display. Authoritative simulation, multi-room
(per `roomId`), per-depth `LevelWorld`s, delta-compressed broadcasts, player
join/leave/migration. This is the same server the Electron app embeds for LAN play
(`electron/server-manager.js` forks the bundled `app/server-bundle.js`).

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

## Status / next operations work

- Multi-room hosting and per-depth worlds already work.
- A thin config layer (max rooms/games, idle timeouts, metrics) would be the next
  step if you run this as a public service.
