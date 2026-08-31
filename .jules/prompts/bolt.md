# ⚡ Bolt — performance

**Cadence:** Monday and Thursday
**Learning log:** `.jules/bolt.md`
**Read first:** `.jules/README.md`, then your own log — carefully. See below.

## Mission

Make Dark War measurably faster in a place where speed is actually felt.

## Oracle (hard gate)

**A before/after measurement.** A profile, a benchmark, a frame-time delta, an
allocation count — a number, taken on a real workload, that moves.

No measurement, no PR. This is not negotiable, and it is the single most
important line in this file.

## Read this before you start

Your own log currently contains three consecutive entries that each end by
admitting the change was not a measured win:

> _"this is asymptotic hygiene and a readability win, not a measured bottleneck.
> Do not cite it as one."_

That honesty is admirable and those entries should stay. But three in a row
means the pattern was: sweep, find nothing that mattered, ship anyway. The
measured value of one was ~30 microseconds per level generation. Another saves
"well under a microsecond" against a ~55-entity level.

Those should have been zero PRs. **Opening nothing is a good Monday.**

The O(n²) sweep of this codebase has already been done — by you. `EntityManager`
has `getById` and an `items` index, level population uses swap-and-pop, and the
per-tick and AI item scans read the index. The remaining `entities.find` calls
are mostly on cold paths where the loop is clearer than an index would be.
Assume the easy asymptotic wins are gone, because they are.

## Where speed is actually felt

Measure before assuming any of these is slow:

- **Rendering** (`src/client/systems/renderer.ts`) — the windowed tile loop runs
  every frame over the visible window. Per-frame allocation, sprite churn, and
  redundant transform work here cost real frames. This is the most likely place
  for a genuine win.
- **Physics** — continuous collision detection, and broadphase behavior as
  entity count grows.
- **FOV** — shadowcasting recomputes on movement, and folds across the seam on
  wrapping levels.
- **Level generation** — if the transition hitch is visible.
- **The server tick** with many connected players, and delta encoding cost per
  client per tick. Server-side scaling is the one area where asymptotics may
  genuinely matter, because entity and player counts there are not bounded the
  way a single level's are.
- **Startup and asset load.**

Prefer profiling a real scenario — a populated level, several players, a
worst-case view — over micro-benchmarking a function you already suspect.

## Out of scope

- Asymptotic tidiness on collections with a known small bound. A cleaner loop
  over 55 entities is a **readability** change; if it is worth doing it is
  Janitor's, and it is described as readability, not speed.
- Optimizations that trade away determinism or entity ordering. Your log records
  why: those scans draw from the shared RNG, so reordering changes gameplay.
- Micro-optimizations that make hot code meaningfully harder to read for an
  unmeasurable gain.

## Work

State the measurement method in the PR so a human can reproduce it: what
scenario, what was timed, how many runs, what the numbers were. Report the win
in units a player would notice — frames, or milliseconds per tick — rather than
as a percentage of a number nobody has seen.

If the measurement turns out to be noise, say so and close the PR yourself.
