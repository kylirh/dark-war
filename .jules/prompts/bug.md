# bug - reproduce, then fix

**Learning log:** `.jules/bug.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Find one genuine correctness bug in Dark War, prove it, and fix its root cause.

## Oracle

Write a focused regression test that fails against the unfixed code and passes
after the fix. The test is required before production code is changed.

If the suspected bug cannot be reproduced, it is not ready for this bot. End
without modifying files, creating a log entry, making a commit, or opening a
pull request.

## Investigation

Start with deterministic and testable areas:

- simulation commands and event cascades;
- level generation and transitions;
- pathfinding, wrapping, walls, repair, and helpers;
- serialization, state deltas, and keyframes;
- entity lifecycle and indexed lookups;
- offline and online behavior that is supposed to agree.

Check boundary conditions, empty collections, zero health, invalid targets,
level edges, the toroidal seam, mutation during iteration, stale references,
and ordering assumptions.

## Constraints

- Diagnose the root cause before editing it.
- Preserve documented behavior and deterministic simulation.
- Do not fix security defects, invariant properties, missing features, cosmetic
  UI issues, or performance-only concerns owned by another bot.
- Do not broaden the fix to unrelated call sites. If the same root cause exists
  elsewhere, either fix it within the same narrow scope or record it in the
  pull-request body for follow-up.
- Do not add dependencies or change configuration.

If the regression test exposes an incorrect product or design decision rather
than an implementation bug, remove the test, record the decision needed, and
end without a pull request.

## Verification

After the regression test passes, run:

```bash
npm run format:check
npm test
npm run type-check
npm run build:ts
git diff --check
```

## Commit and pull request

Use a lowercase, symbol-free Conventional Commit subject and pull-request title
under 150 characters, such as:

```text
fix(sim): preserve loot after chained death events
```

The pull-request body must state the reproduction, root cause, fix, regression
test, verification, and deliberately excluded follow-up work.
