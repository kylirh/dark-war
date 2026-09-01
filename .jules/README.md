# Jules Bots

This directory holds the standing prompts for Dark War's automated contributors.

- **`.jules/prompts/<name>.md`** — a bot's complete instruction set. Point a Jules
  bot at one of these and nothing else.
- **`.jules/<name>.md`** — that bot's learning log, appended to over time. It
  records what previous runs found, and what was tried and rejected.

**Every prompt is self-contained.** Each one restates the architecture
constraints, verification commands, commit conventions, and stop conditions, so
a bot never needs this file. This README is for humans choosing a bot. If you
change a shared rule, change it in all eleven prompts.

A learning log never overrides `CLAUDE.md`, `AGENTS.md`, or the design documents
in `docs/`.

## Roster

| Bot                               | Responsibility                                     | Oracle                                          |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| [Sentinel](prompts/sentinel.md)   | Security defects at untrusted-input boundaries     | a concrete, reachable exploit path              |
| [Invariant](prompts/invariant.md) | Determinism, serialization, and netcode properties | a failing property test                         |
| [Bug](prompts/bug.md)             | Reproduced correctness defects                     | a failing test, written first                   |
| [Bolt](prompts/bolt.md)           | Measured runtime and resource improvements         | a reproducible before/after measurement         |
| [Palette](prompts/palette.md)     | Interface operability and accessibility            | a demonstrated interaction or standards failure |
| [Janitor](prompts/janitor.md)     | Dead code, duplication, simplification, small debt | an objective deletion or duplication case       |
| [World](prompts/world.md)         | Terrain, generation, and world integrity           | a failing world property or differential check  |
| [Test](prompts/test.md)           | Missing or weak behavioral coverage                | a named uncovered decision                      |
| [Scribe](prompts/scribe.md)       | Incorrect or missing contract documentation        | a wrong or materially incomplete contract       |
| [Alpha](prompts/alpha.md)         | First-session player path across supported targets | a reproducible player-facing failure            |
| [Architect](prompts/architect.md) | Architectural decision records                     | a documented current design cost                |

Architect writes ADRs to `docs/adr/` and never changes source. Test makes
test-only changes. Everyone else opens ordinary code pull requests.

## Ownership

Rough primary areas, so bots stay off each other's files. Every prompt
also instructs the bot to check `gh pr list --state open` and avoid files an open
bot pull request already touches.

| Area                                                                  | Primary   |
| --------------------------------------------------------------------- | --------- |
| `electron/`, `src/net/` boundaries, DOM sinks                         | Sentinel  |
| `src/engine/systems/simulation/`, `src/net/state-delta.ts`, RNG       | Invariant |
| `src/engine/core/` generation, `WorldPlane`, tiles, portals, wrapping | World     |
| `src/client/systems/` UI modules, `app/index.html`, `index.html`      | Palette   |
| `src/client/systems/renderer.ts`, physics, server tick                | Bolt      |
| `*.test.ts`                                                           | Test      |
| `docs/`, TSDoc across the tree                                        | Scribe    |
| `docs/adr/`                                                           | Architect |

Bug, Janitor, and Alpha range across the tree, which makes collision checking
their responsibility more than anyone's.

## The Two Rules That Matter Most

Everything else in the prompts serves these.

**1. No oracle, no pull request.** Every bot has a specific, falsifiable thing
that proves the work was worth doing — a failing test, a measurement, an exploit
path. It is a gate, not a preference. A bot that may open a pull request without
one will eventually manufacture work, because it can always find _something_ to
change.

**2. A no-change result is successful.** If the oracle is absent, stop silently:
do not modify files, write a log entry, commit, or open a pull request.

Do not create a pull request solely to update a learning log. A log entry belongs
only in the same substantive pull request as the implementation or
documentation change.

## Review

Merge only when the oracle is credible, the diff is inside the bot's scope, the
checks pass, and the change respects the authoritative design documents.
Otherwise request narrowly scoped changes, close the pull request, or record the
question for a human.

Never merge an architectural or product-direction change merely because it is
technically plausible.
