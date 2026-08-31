## 2026-08-30 - XSS from unauthenticated LAN discovery packets

**Vulnerability:** `DiscoveryManager` took UDP broadcasts straight off the wire,
`JSON.parse`d them, and stored the fields verbatim. Those fields crossed IPC
into the renderer, where the server browser interpolated them into
`innerHTML`. `name` and `host` were escaped, but `phase`, `players`, and
`maxPlayers` were not — so anyone on the LAN could broadcast
`{"app":"dark-war-v1","wsPort":7777,"phase":"<img src=x onerror=...>"}` and run
script in the Electron renderer as soon as a player opened the server list.
`contextIsolation` and `sandbox` are on, which contains the blast radius, but
the injected script still reaches everything `window.native` exposes.

**Second bug in the same place:** the `DiscoveredServer` TypeScript interface
declares `name: string`, and `escapeHtml` trusted it. A packet with
`"name": 123` made `escapeHtml` call `.replace` on a number, which threw and
blanked the entire server list. A type annotation is not a runtime guarantee on
data that arrived over a socket.

**Action:** Moved parsing into `electron/discovery-packet.js` — a pure,
unit-tested module that rejects malformed packets and undialable ports, bounds
and de-controls the display strings, coerces the counts to integers in range,
and whitelists `phase` to `lobby`/`playing`. The renderer additionally escapes
every string and coerces every number, because the template is what actually
writes to the DOM.

**Prevention:** Validate untrusted input at the boundary it enters, not at the
point it is used, and keep the render-side escaping anyway. Treat an IPC or
`JSON.parse` result as `unknown` no matter what interface it is annotated with.
Escaping stays the template's job — sanitizing markup at ingest would corrupt
legitimate names and double-escape once `escapeHtml` runs.
