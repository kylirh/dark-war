# Jules Bots

This directory holds the standing prompts for Dark War's automated contributors.

- **`.jules/prompts/<name>.md`** — a bot's complete instruction set. Point a Jules
  bot at one of these and nothing else.
- **`.jules/<name>.md`** — that bot's learning log, appended to over time. It
  records what previous runs found, and what was tried and rejected.

**Every prompt is self-contained.** Each one restates the architecture
constraints, verification commands, commit conventions, and stop conditions, so
a bot never needs this file. This README is for humans deciding what to run and
when. If you change a shared rule, change it in all eleven prompts.

A learning log never overrides `CLAUDE.md`, `AGENTS.md`, or the design documents
in `docs/`.

## Roster

| Bot                               | Responsibility                                     | Oracle                                          | Cadence  |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------- | -------- |
| [Sentinel](prompts/sentinel.md)   | Security defects at untrusted-input boundaries     | a concrete, reachable exploit path              | daily    |
| [Invariant](prompts/invariant.md) | Determinism, serialization, and netcode properties | a failing property test                         | daily    |
| [Bug](prompts/bug.md)             | Reproduced correctness defects                     | a failing test, written first                   | daily    |
| [Bolt](prompts/bolt.md)           | Measured runtime and resource improvements         | a reproducible before/after measurement         | Mon, Thu |
| [Palette](prompts/palette.md)     | Interface operability and accessibility            | a demonstrated interaction or standards failure | Tue, Fri |
| [Janitor](prompts/janitor.md)     | Dead code, duplication, simplification, small debt | an objective deletion or duplication case       | Tue, Fri |
| [World](prompts/world.md)         | Terrain, generation, and world integrity           | a failing world property or differential check  | Wed      |
| [Test](prompts/test.md)           | Missing or weak behavioral coverage                | a named uncovered decision                      | Wed      |
| [Scribe](prompts/scribe.md)       | Incorrect or missing contract documentation        | a wrong or materially incomplete contract       | Mon      |
| [Alpha](prompts/alpha.md)         | First-session player path across supported targets | a reproducible player-facing failure            | Thu      |
| [Architect](prompts/architect.md) | Architectural decision records                     | a documented cost the design imposes today      | Fri      |

Architect writes ADRs to `docs/adr/` and never changes source. Test makes
test-only changes. Everyone else opens ordinary code pull requests.

## Schedule

Staggered so no day exceeds six bots — roughly 26 pull requests a week at
maximum, and far fewer in practice.

| Day | Bots                                                  |
| --- | ----------------------------------------------------- |
| Mon | Sentinel, Invariant, Bug, Bolt, Scribe                |
| Tue | Sentinel, Invariant, Bug, Palette, Janitor            |
| Wed | Sentinel, Invariant, Bug, World, Test                 |
| Thu | Sentinel, Invariant, Bug, Bolt, Alpha                 |
| Fri | Sentinel, Invariant, Bug, Palette, Janitor, Architect |

**Review capacity is the bottleneck in this system, not bot capacity.** A
rubber-stamped pull request is worse than no pull request. If the queue backs
up, cut cadence before cutting review depth.

## Ownership

Rough primary areas, so same-day bots stay off each other's files. Every prompt
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

**2. Opening nothing is a successful run.** Bots are not measured on output, and
an empty run is the expected outcome on a healthy codebase. An empty run ends
silently — no files, no log entry, no commit.

The failure mode these prevent is already visible in this repository. Read the
last three entries in `.jules/bolt.md`: each one ends by admitting the change was
not a measured win. That is a bot shipping because it believed it had to.

The one exception to rule 2: a bot that finds something substantive it should
_not_ implement — too large, or needing a human decision — may open a **log-only
pull request** touching nothing but its own `.jules/<name>.md`. That is for
recording real findings, never for reporting an empty run.

## Review

Merge only when the oracle is credible, the diff is inside the bot's scope, the
checks pass, and the change respects the authoritative design documents.
Otherwise request narrowly scoped changes, close the pull request, or record the
question for a human.

Never merge an architectural or product-direction change merely because it is
technically plausible.
