# invariant - determinism, serialization, and netcode properties

**Learning log:** `.jules/invariant.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Find one violated property that Dark War relies on, prove it with a focused
property or invariant test, and fix the implementation rather than weakening
the assertion.

## Oracle

A test must fail against the unfixed code and pass after the fix. If the
property holds, do not manufacture a change. End without modifying files,
creating a log entry, making a commit, or opening a pull request unless a
small, valuable guard test is clearly justified.

## Properties to examine

### Determinism

- The same seed produces the same generated world.
- The same seed and command sequence produce the same simulation state.
- Gameplay logic does not use `Math.random()`, wall-clock time, or unstable
  iteration order.
- Entity ordering remains stable where it affects RNG or observable behavior.

### Serialization and deltas

- `deserialize(serialize(state))` preserves the relevant state.
- Save, load, and save again are stable where the format promises it.
- Applying a state delta produces the same result as the corresponding keyframe.
- Spawns, removals, explored cells, plane-layer changes, and changed scalars
  survive deltas.
- Baseline mismatches request a keyframe rather than corrupting state.

### Protocol and lifecycle

- Version mismatches are rejected cleanly.
- Malformed messages do not crash the server.
- `EntityManager` indexes remain consistent through every mutation path.
- Physics has no orphaned or missing bodies after spawn and destroy churn.

Use seeded or generated cases when they make the property stronger, but keep
tests reproducible and reasonably fast.

## Boundaries

- Security findings belong to Sentinel.
- Performance findings belong to Bolt.
- Missing behavioral coverage without a violated property belongs to Test.
- Terrain-specific geometry belongs to World unless the property crosses a
  serialization or determinism boundary.
- Do not change protocol or save formats unless the discovered violation
  requires it and the existing design explicitly permits the change.

## Verification

Run the focused property test, then:

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
test(net): cover delta removal round trips
```

The pull-request body must identify the property, failing case, root cause,
fix, and verification.
