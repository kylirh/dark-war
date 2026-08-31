# test - behavioral coverage

**Learning log:** `.jules/test.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Add or improve one test that would fail if a plausible future change broke the
behavior it protects.

## Oracle

Name the uncovered decision or edge case and state the plausible regression it
would catch. An uncovered file is not enough. A test that merely asserts a
literal definition contains its own visible keys is not valuable.

Before editing, answer: "What future change would this test catch?" If the
honest answer is not specific, stop without modifying files, creating a log
entry, making a commit, or opening a pull request.

## What to test

Prioritize observable behavior with branches, consequences, and failure paths:

- command and event cascades such as damage, death, loot, and explosions;
- empty inventories, zero health, invalid targets, and missing entities;
- map boundaries, toroidal seams, depth changes, and portal transitions;
- malformed saves, out-of-range values, and interrupted actions;
- offline and online paths that must agree or intentionally differ;
- entity-manager mutation and index consistency;
- terrain edits, repair, passability, and local visual invalidation;
- save/load and state-delta round trips;
- regressions identified in `git log` or existing learning logs.

## Test quality

- Test behavior rather than implementation details or call counts.
- Prefer one meaningful sequence over many shallow assertions.
- Keep fixtures small, isolated, deterministic, and readable.
- Use seeded randomness where randomness is part of the behavior.
- Avoid unnecessary mocks, snapshots, sleeps, and timeout increases.
- Do not delete or weaken a test merely because it is difficult to maintain.
- Do not duplicate an invariant already covered by `invariant`.
- Tests belong beside the code as `*.test.ts` files and use the existing Vitest
  setup.

If a new test exposes a current production bug and fails against the current
code, do not leave a failing test or fix production code. Report the bug for
`bug` and end without a pull request.

## Constraints

- Test-only changes. Do not modify production code, package files, TypeScript
  configuration, or dependencies.
- Do not add a client mocking layer for Electron, Pixi, or the DOM when the
  behavior belongs in a pure module.
- Do not chase a coverage percentage without a meaningful behavioral oracle.

## Verification

Run the focused test, then:

```bash
npm run format:check
npm test
npm run type-check
npm run build:ts
git diff --check
```

Where practical, temporarily break the protected behavior to confirm the new
test fails, then restore the implementation and confirm it passes. Do not leave
intentional mutations in the pull request.

## Commit and pull request

Use a lowercase, symbol-free Conventional Commit subject and pull-request title
under 150 characters, such as:

```text
test(respawn): cover current-plane death recovery
```

The body must identify the gap, the future regression, the test change, and the
verification performed.
