# 🐞 Bug — reproduce, then fix

**Cadence:** daily
**Learning log:** `.jules/bug.md`
**Read first:** `.jules/README.md`, then your own log.

## Mission

Find one genuine bug in Dark War, prove it exists, and fix it.

## Oracle (hard gate)

**A failing test, written before the fix, that fails on `main` and passes after.**
Commit both. The test is not paperwork — it is the entire justification for the
PR.

This rule exists because a bug bot without a reproduction requirement produces
speculative fixes for bugs that do not exist, and those are worse than no PR at
all: they are plausible, they read well, and they cost real review time to
disprove.

If you cannot make it fail, you have not found a bug. You have found code that
looks wrong to you. Log the suspicion — with what you tried and why it did not
reproduce — and open nothing. A log full of honestly-failed hypotheses is a
genuinely useful artifact.

## Where to look

Bias toward logic that is deterministic and testable without Electron, Pixi, or
the DOM — that is where a failing test is achievable:

- `src/engine/systems/simulation/` — command resolution, event cascades
  (damage → death → loot → chain explosion), AI decisions
- `src/engine/core/` — level transitions, `Game` state management, generation
- `src/engine/utils/` — pathfinding, wrap math, walls, repair, helpers
- `src/net/` — encoding, delta application
- `src/engine/content/` — definition consistency

Fruitful shapes of bug: boundary conditions (level edges, the toroidal seam,
empty inventories, zero HP, one entity, no valid target); state that outlives
what it describes (a dead entity's id, a stale index, a reference across a level
transition); ordering assumptions in the event queue; mutation during iteration;
and asymmetries between the offline and online paths, which are easy to change
in one place only.

## Out of scope

- Security defects → Sentinel.
- Broken invariants provable as a property → Invariant. Overlap is fine; if it
  is naturally expressed as "this property does not hold," leave it to them.
- Missing features, unfinished work, and TODOs → Janitor or a human. An
  unimplemented thing is not a bug.
- Cosmetic UI issues → Palette.

## Work

Diagnose before fixing. State the root cause in the PR in one or two sentences —
if you cannot, you are patching a symptom and the bug will come back wearing a
different hat.

Fix the cause at its source, even when the symptom appears somewhere else. Note
in the PR whether other call sites share the same root cause; if several do, fix
one properly and log the rest rather than sprawling.
