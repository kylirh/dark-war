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

## 2026-08-31 - One escaper in four copies, and the one that diverged

**What was found:** `escapeHtml` existed as four byte-identical private copies
(`game-menu`, `character-modal`, `save-slots`, `intro-story`). None escaped
`'`, so any value placed in a single-quoted attribute could break out. All ten
call sites happened to be text nodes, so nothing was exploitable through them
— but it is a loaded gun sitting in four places at once.

**The tell:** `save-slots.ts` had a fifth function, `escapeAttribute`, that
added the `'` escaping. Somebody hit the gap, fixed it where they hit it, and
the other three files kept the weaker version. That divergence is the real
argument against copy-pasted helpers: the copies do not stay identical, and the
one that gets fixed is not the one the next person reads.

**The live bug underneath it:** `escapeAttribute` was used on a save preview
interpolated into `style="--save-preview: url('...')"`. HTML escaping is the
wrong tool in that position, and does nothing. The HTML parser decodes `&#39;`
back to `'` _before_ the CSS parser sees the value, so the escaped payload
still closes the CSS string. Verified in a real browser: the old output parsed
to **two** declarations, the second being
`background-image: url("http://evil.test/x")`. There is no CSP in this app, so
rendering that slot would have fired the request. Save records are read off
disk and can be hand-edited.

**Action:** One `escapeHtml` in `src/client/systems/html-escape.ts`, escaping
`& < > " '` so it is correct for text and both quoted attribute forms.
`escapeAttribute` is gone. The preview is now checked against
`isSafeImageDataUrl` — base64 has no quotes or parens, so a matching value is
inherently safe inside `url()` — and a non-matching one renders no preview.

**Prevention:** Escaping is per-context, not per-value. HTML escaping stops
protecting the moment the value crosses into a nested language — CSS in
`style`, JS in `on*`, a URL in `href`. Validate those against an allowlist or
set them through the DOM. And when a helper has been copied, assume the copies
have drifted and check all of them before trusting any of them.

## 2024-05-27 - [XSS] Unescaped RetroModal Options
**Vulnerability:** The `RetroModal` component (`src/client/systems/retro-modal.ts`) interpolated unescaped properties like `options.title` and `options.id` directly into the DOM via `innerHTML`.
**Learning:** Reusable UI components that build DOM strings using template literals and `innerHTML` are easy sinks for XSS, even if the current callers use safe hardcoded strings. Future usages with dynamic data (like server names or usernames) could trigger XSS.
**Prevention:** Always sanitize/escape variable insertions inside `innerHTML` template literals using `escapeHtml()` at the component level, even if the data seems safe initially. Treat component boundaries as security boundaries.
