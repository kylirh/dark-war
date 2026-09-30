# Repository audit: 2026-09-30

## Scope

This review covered the September 1–30 development window, including 117
commits that reached `main` before this audit, 124 changed files, 175 pull
requests updated during the window, and every non-`main` remote branch. The
starting point was `246396fce8ed7d42969b1eec9381ba78d723c10c`.

The pre-cleanup repository was preserved in
`/Users/kylirhorton/Documents/Codex/repo-audits/dark-war-2026-09-29/` as a
verified Git bundle, pull-request metadata, a branch inventory, and individual
branch diffs. This is deliberately outside the repository so cleanup does not
replace stale branches with backup branches.

## Findings and corrections

### Lost changes during automated integration

Several later integration commits were built from stale branch heads and
discarded already-landed source or tests while CI remained green. The important
losses were entity-order delta handling, level-state delta handling, transition
coverage, and focus verification. The audit restored the valid parts through
normal merge commits, preserving the original pull-request ancestry:

- #285 verifies that focus restoration actually lands on a usable element and
  covers the complete deterministic command ordering contract.
- #296 pins the intentional eight-direction traversal contract, which twelve
  automated pull requests had tried to narrow to four directions.
- #304 covers the previously untested ascend and descend command path.
- #311 rejects stairs that run opposite the requested transition while keeping
  lateral cave and building portals valid.
- #323 guards every serialized state field and the state-delta round trip.
- #327 distinguishes persisted simulation values from frame-local load state.

### Network state delta regression

Entity and player spawns or removals sent a complete ID-order array even when
the receiver's natural map order already reconstructed the authoritative order.
That repeated every entity ID in ordinary deltas. The codec now sends an order
array only for a real reorder, prepend, or in-place replacement. A representative
54-entity spawn delta fell from 2,744 bytes to 583 bytes (about 79%); this is a
focused measurement, not a universal bandwidth claim. Tests cross a JSON wire
boundary and assert exact entity and player order.

The wire contract had also gained exploration, level, and ordering fields since
protocol version 14 without changing the compatibility gate. The protocol is
now version 15 so old clients cannot silently accept a partial state shape.

### Settings state corruption

The pause menu registered handlers on every `[data-zoom-value]` element in the
document, including the character menu's controls. A character-menu zoom click
therefore ran twice; the pause menu's stale preference snapshot overwrote a
sound-volume change made immediately beforehand. Selectors are now scoped to
the pause dialog, and both settings surfaces receive the current preference
snapshot after any change. The failure was reproduced in the running web build
and the corrected path preserved volume 55 while changing zoom.

### World map edge cases

The canvas-to-tile conversion treated the exclusive right and bottom edges as
inside the map, producing an out-of-range tile. Wrapped landmark placement also
selected the image nearest a chunk's left edge instead of its center, which can
hide a valid marker on large toroidal maps. Both calculations now use the
correct bounds, with pure geometry regression tests.

### Rejected changes

The discarded branches were not blindly merged. Recurring or unsound proposals
included:

- twelve variants that disabled diagonal traversal despite both pathfinders
  deliberately expanding eight neighbours;
- two rest-interruption changes based on a time-scale leak that the current
  reset path already prevents;
- speculative renderer, respawn, conversation, and callout micro-optimizations
  without representative measurements;
- brittle tests that asserted their proposed behavior instead of reproducing a
  defect, plus one branch containing a 1,918-line `.orig` merge artifact;
- proposed architecture records whose claims conflicted with current engine
  boundaries or deterministic behavior.

The daily curation routine no longer instructs agents to create throwaway remote
branches as a capability test, which accounted for 21 stale probe/test branches.
It now checks current capabilities and uses leased deletion for reviewed heads.

## Cleanup result

After the reviewed changes are pushed, every open pull request is represented in
`main`. All non-`main` remote heads are deleted only after their exact tips are
captured in the recovery bundle. Local branches, remote branches, open pull
requests, and linked worktrees are then re-enumerated to verify the result.

## Validation boundary

Automated verification covers deterministic engine behavior, persistence,
state deltas, client/server types, asset compilation, formatting, and builds.
The settings regression and ordinary game rendering were exercised in a running
browser build with no console warnings or errors. Native Electron window-state
behavior remains bounded by its automated tests; this audit does not claim a
manual desktop-platform pass.
