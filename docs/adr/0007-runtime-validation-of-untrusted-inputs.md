# 0007 - Runtime Validation of Untrusted Inputs

**Status:** Proposed
**Date:** 2026-09-21

## Context

Dark War accepts JSON payloads from multiple untrusted boundaries: the network (multiplayer server payloads), IPC (Electron UDP LAN discovery), and the local filesystem (hand-edited save files).

Currently, parsing these payloads relies on `JSON.parse()` coupled with TypeScript type assertions (`as SomeInterface`), followed by manual, ad-hoc `typeof` checks to validate the shape of the data. Because TypeScript interfaces provide no runtime guarantees, failing to correctly implement and maintain these ad-hoc checks allows malformed payloads to enter the application logic, causing crashes or vulnerabilities.

This design is under real pressure and has repeatedly failed. Our learning logs (`.jules/sentinel.md`) record four distinct instances of vulnerabilities stemming directly from this architectural seam:

- **2026-08-30:** An XSS vulnerability in `DiscoveryManager` because LAN UDP packets were read from the wire and stored verbatim, then interpolated into `innerHTML` by the server browser. `name` and `host` were escaped; `phase`, `players`, and `maxPlayers` were not, so anyone on the LAN could execute script in the renderer. The gap was in which fields a hand-written guard remembered to cover.
- **2026-09-02:** A local Denial of Service (DoS) in `parseSaveRecord` because untrusted string fields were asserted rather than validated, allowing a numeric `"characterName"` to throw an uncaught `TypeError` in the UI rendering.
- **2026-09-02:** The `lobby_update` payload in the multiplayer client checked the array structure but trusted the entries, crashing the renderer when a string was expected but a number was received.
- **2026-09-18:** A server DoS caused by an unvalidated `set_name` payload where the boundary type guard `isIncomingMessage` failed to assert the payload's `name` property was strictly a string.

Every time a new network message, IPC event, or save file structure is added, developers must perfectly hand-write defensive validation logic. The recurring bug class proves this is not scaling safely.

## Options

### 1. Do nothing (Status Quo)

Continue relying on code review and ad-hoc `typeof` checks to sanitize boundaries.

**The case for this:** We have already paid the cost of fixing the existing vulnerabilities. We add no new runtime dependencies, and developers do not need to learn a new schema declaration syntax.

### 2. Shared hand-written boundary parsers

Keep validation in-tree, but stop writing it ad hoc. Give each boundary a single
parser built from shared coercion primitives that take `unknown` and return a
value of the declared type or a fallback.

**The case for this:** This is not hypothetical — `electron/discovery-packet.js`
already does it. `toDisplayText` (`:25`) and `toBoundedInt` (`:35`) coerce every
display field, `phase` is checked against an allow-list, and
`discovery-packet.test.ts` asserts the behaviour against `123`, `null`,
`undefined`, `{}`, `[]`, and `true`. When the 2026-09-02 entry went looking for
type-confusion crashes, LAN discovery was found **already hardened** by exactly
this pattern, and the path that was actually open (`lobby_update`) was one that
had not adopted it. No new dependency, no second parse pass, and it composes with
the existing `isIncomingMessage` guards rather than replacing them.

**The case against:** the primitives are still code someone must remember to
call. It removes the per-field improvisation but not the discipline, so a new
message type can still be added without a parser.

### 3. Introduce a Runtime Schema Validation Library

Adopt a schema-driven validation library (such as `zod` or `TypeBox`). All inbound payloads (IPC, WebSocket messages, File I/O) are routed through these parsers, which simultaneously infer the TypeScript types and guarantee the runtime structure before the data reaches application logic.

**The case for this:** It structurally eliminates the entire bug class. By defining the schema once, we get both compile-time types and bulletproof runtime boundary guards. If a client sends `{"name": 123}` instead of a string, the library throws a predictable error at the network boundary, ensuring bad data never reaches business logic or the renderer.

## Decision

We recommend **Option 3: Introduce a Runtime Schema Validation Library**.

The repeated local and remote DoS issues recorded in the learning logs demonstrate that manual validation is a porous defense. A schema library directly addresses the root cause of these bugs by enforcing the invariants at the boundary, replacing error-prone manual type guards with declarative rules.

This recommendation is genuinely contestable, and Option 2 is the reason why. The
one boundary that adopted shared parsers has not produced a vulnerability since,
which is real evidence that the cheaper path works. The case for Option 3 is that
it makes validation unskippable rather than merely easy: with schemas, a new
message type cannot reach handler logic without one. Whether that guarantee is
worth a dependency and a second parse pass is a judgement call for a human, not
something this document settles.

## Consequences

- **What gets better:** We gain definitive, structural protection against payload type confusion. We can remove ad-hoc `typeof` checks scattered across parsers like `parseSaveRecord` or `isIncomingMessage`. The schemas serve as a single source of truth.
- **What gets worse:** We take on a new external dependency and a slight performance penalty from parsing data twice (once via `JSON.parse`, once via the schema validator).
- **What becomes harder to change:** Any modification to a network message or save format requires updating the schema rather than just the TypeScript interface, but this is a desired property to ensure runtime safety.
- **Migration cost:** Medium. We must introduce the dependency, write schemas for all existing `MultiplayerMessage`, IPC payloads, and save formats, and replace the existing hand-rolled type guards (`isIncomingMessage`, etc.) with the schema parsers.
