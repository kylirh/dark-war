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

## 2026-08-31 - Unescaped RetroModal title and id

**Vulnerability:** The `RetroModal` component (`src/client/systems/retro-modal.ts`) interpolated unescaped properties like `options.title` and `options.id` directly into the DOM via `innerHTML`.
**Learning:** Reusable UI components that build DOM strings using template literals and `innerHTML` are easy sinks for XSS, even if the current callers use safe hardcoded strings. Future usages with dynamic data (like server names or usernames) could trigger XSS.

**Prevention:** Escape variable insertions inside `innerHTML` template literals with `escapeHtml()` at the component level, even when every current caller passes a literal. Where a component genuinely needs raw markup — `RetroModalOptions.body` — say so in the type, so the one unescaped sink is documented rather than assumed.

## 2026-09-02 - Local Denial of Service via Type Confusion in Untrusted Save Files

**What was found:** The `parseSaveRecord` function (`src/client/systems/save-slots.ts`) read `characterName`, `region`, and `savedAt` from `JSON.parse` output and implicitly trusted them to be strings via type assertion (`as Partial<SaveSlotRecord>`). The `?? default` fallbacks only replace `null`/`undefined`, so any other type passed straight through. A hand-edited save file with `"characterName": 123` reaches `escapeHtml()` in `renderOccupiedSlot`, which calls `.replace()` on it and throws a `TypeError`. That throw escapes the `this.slots.map(...)` that builds `grid.innerHTML`, so the whole save-slot grid fails to render — a local Denial of Service.

`characterName` and `region` are the two live crash vectors; both are escaped directly. `savedAt` is not — it goes through `formatSavedAt`, where `Date.parse` of a non-string yields `NaN` and the function returns `"Unknown date"`. It is coerced here anyway so the parsed record actually matches its declared `string` type, not because it crashes today.

**Action:** Updated `parseSaveRecord` to coerce `characterName`, `region`, and `savedAt` with `typeof` checks before returning them, falling back to the existing defaults. Added a regression test that feeds a non-string value for each of the three fields and asserts the defaults come back.

**Prevention:** TypeScript interfaces provide no runtime guarantees at system boundaries (IPC, network sockets, or files from disk). All values from `JSON.parse` must be defensively validated (e.g., checking `typeof === "string"`) before assignment, rather than blindly asserted `as SomeType`.

## 2026-09-02 - Unvalidated lobby roster reaches an innerHTML sink

**What was found:** `escapeHtml` (`src/client/systems/html-escape.ts`) called
`.replace()` straight on its argument, so a non-string reaching it throws
`TypeError: value.replace is not a function` and blanks the panel being
rendered.

The two sources originally blamed for this — LAN discovery packets and
hand-edited save files — turned out to be **already hardened**, and checking
them was the useful half of the work:

- `electron/discovery-packet.js` runs every display field through
  `toDisplayText`, and `discovery-packet.test.ts` asserts `typeof === "string"`
  for `name`/`host` against `123`, `null`, `undefined`, `{}`, `[]`, `true`. The
  two call sites additionally wrap with `String(...)`.
- `parseSaveRecord` in `save-slots.ts` guards `characterName`, `savedAt`, and
  `region` with `typeof === "string"` — closed by the entry directly above this
  one.

The path that was actually open was `lobby_update` in
`src/net/multiplayer-client.ts`. It checked `Array.isArray(message.players)`
and the `roomId` type but never the entries, while every sibling case in the
same handler (`welcome`, `error`, `state_full`) drops a payload whose fields
are the wrong type. `game-menu.ts:859` interpolates `escapeHtml(p.name)` into
`innerHTML`, and the client can be pointed at an arbitrary address, so a server
sending `{"name": 1337}` breaks the lobby render.

**Action:** Added an `isLobbyPlayer` runtime shape check and rejected any
`lobby_update` whose entries fail it, matching the sibling cases — this is the
root cause. Kept `String(value)` in `escapeHtml` as defense in depth so the
shared sink is total, with tests for both.

**Prevention:** A DoS-through-a-sink finding is only real once you name the
boundary the bad value crosses. Trace it to a specific unvalidated payload and
fix it there; hardening the sink alone leaves the malformed data flowing and
turns a crash into silently rendering `[object Object]`. Before writing up a
boundary as unguarded, read it — and read this log, which had already recorded
the save-file half as closed.
