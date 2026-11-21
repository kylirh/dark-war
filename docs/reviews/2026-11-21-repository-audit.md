# Repository audit: 2026-11-21

## Scope and recovery

Reviewed the 113 commits reachable from `main` since September 15, 2026
(105 non-merge commits), the resulting production changes, all 23 open pull
requests, all 124 non-main remote branches, the proposed ADRs, historical review
logs, and the open GitHub product backlog. Starting main: `2e4aaf7c`.

Before cleanup, all refs were preserved in a verified Git bundle at
`/Users/kylir/Code/repo-audits/dark-war-2026-11-21/before-cleanup.bundle`.
That directory also holds the exact branch heads, individual branch diffs,
PR metadata, and the branch disposition inventory. Recovery is intentionally
outside the repo rather than another set of stale remote branches.

## Corrections

- **AI overload:** sort by deterministic priority/actor/id order before dropping
  excess intents. Do not replay stale AI commands on a later tick.
- **Event budget:** process exactly 1,000 events per drain rather than 1,001.
  There are two explicit drains per tick; this is not a new shared tick budget.
  Adjusted saturated-queue tests so lethal damage remains inside the drain and
  the resulting death remains deferred.
- **Death invariants:** keep immediate invalidation at lethal producers and add
  a final tick-boundary guard for zero-HP actors. Preserve event-based loot RNG,
  explosion causes, and kill attribution rather than replacing death with a
  full synchronous teardown sweep.
- **Online hole death:** damage is applied before detaching the player. A lethal
  fall queues ordinary player-death handling on the source plane, stops movement,
  and prevents migration. Repeated checks on a corpse do not queue more deaths.
- **Loading:** the receiving Game retains its runtime multiplayer mode. Save
  metadata cannot silently flip online authority to offline behavior.
- **Failed ascent:** clear the consumed portal intent even on an early return;
  check destination residency before removing nearby utility bots or saving the
  source snapshot. A failed ascent no longer loses companions.
- **Rest pacing:** ignored offline actions no longer reset accelerated rest to
  real time. Keep explicit WAIT-to-wake, damage, full health, and death as wake
  paths; accidental tool clicks do not interrupt rest.
- **Network input:** replace the duplicate server tag allow-list with an
  exhaustive shared guard that validates each action's fields, finite numbers,
  revision integers, and enum values. Reject arrays and prototype-property tags.
- **Flaky tests:** seed Snagglepuss and tick fixtures explicitly. The mutter test
  now waits for the actual mutter, rather than ending on any unrelated sound.
- **Rendering coverage:** exercise real Pixi Sprite/Graphics recycling in Node,
  without creating WebGL. Verify reset state and cleared drawing instructions
  rather than scanning renderer source text for particular assignments.
- **World coverage:** preserve repeated-search buffer tests and correct the
  outside-level reachability test to follow wrapped traversal.

The reviewed production refactors (physics separation/clamping, BFS buffer
reuse, direction tables, serialization copying, delta equality/ordering,
settings synchronization, focus restoration, and texture pooling) remain in
place. Historical stale-branch integrations had lost changes in September;
those were restored in the September audit and remain covered. This audit does
not certify every possible gameplay path merely because the unit suite passes.

## Pull-request dispositions

Integrated these heads with normal merge ancestry, retaining contributor history
and resolving historical-log conflicts without taking stale source trees:

| PR   | Retained work                                         |
| ---- | ----------------------------------------------------- |
| #331 | Save-backed state round-trip coverage                 |
| #340 | Counted-item consumption and over-spend coverage      |
| #345 | Remaining shared eight-way direction use              |
| #352 | Authoritative stairs direction and landing coverage   |
| #367 | Explicit rest/wake contract coverage                  |
| #380 | Physics invalidation neighborhood coverage            |
| #407 | Deterministic dungeon item-spawn sequence coverage    |
| #410 | Typed, shared AI overflow test fixtures               |
| #427 | Per-kind bounded clamp and outside wrap coverage      |
| #447 | Utility-bot repeated-search buffer coverage           |
| #451 | Shared monster-cleanup test fixtures                  |
| #454 | Repeated pathfinding and buffer-growth coverage       |
| #464 | Actor occupancy semantics and corrected documentation |
| #470 | Shared occupancy predicate in spawn selection         |
| #472 | Canonical tile invalidation ownership and tests       |

Closed the remaining proposals for these specific reasons:

| PR   | Reason                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| #337 | Stale consolidation deletes newer saturated-queue and death regressions; retain current suites                |
| #362 | Would document failed-ascent stale intent as permanent behavior; fixed the underlying early return instead    |
| #377 | Duplicates existing tooltip coverage and would replace escaping tests; retain current tests                   |
| #396 | Tag-only type guard claims a validated action with missing fields; replaced with full shared field validation |
| #403 | Predates eager black-pill invalidation and asserts the opposite of the corrected behavior                     |
| #412 | Source-string matching cannot prove focus behavior or stacking; retain behavioral focus tests                 |
| #459 | Same black-pill fix already landed in #466                                                                    |
| #482 | Replaced source scanning with actual Pixi recycling tests                                                     |

## Decisions and remaining product work

Every ADR 0001–0014 now has an explicit dated resolution. Keep eight-way
movement, deterministic budgets, helper-owned counted-item deduction, typed
content, the specialized delta codec, source-root package boundaries, and
caller-owned modal stacking. Reject speculative repository/manager/schema
rewrites. Prefer real client behavior tests; opt into a DOM environment only
when a concrete regression needs it. Choose dependency-free shared boundary
guards. Historical proposals remain as rationale, with the resolution clearly
superseding their recommendations and open questions.

The prototype's unchecked visual judgments belong to production art QA (#44,
#50, #61), rather than reopening completed M0–M8. The WOFF-to-TTF TODO is
resolved by retaining the supported bundled format.

Open issues #18–#107 contain substantial future product work, including farming,
construction, autobiographical worlds, final art/audio, Alpha hosting, and
performance profiling. Those are a backlog, not evidence that a small cleanup
PR is broken. They remain open. In particular, this audit does not claim to
have fixed the measured idle-CPU issue (#23), completed art QA, or built the
Alpha. Hole destination policy and comprehensive authored transition coverage
remain tracked in #22/#21; the lethal online fall defect is fixed here.

## Branch disposition policy

No stale source branch is merged wholesale merely because its PR once merged.
Several bot heads revert review corrections or include scratch scripts. Useful
work is either integrated above, already present in main, or superseded by the
explicit decisions and fixes in this audit. Empty/log-only heads, repeated
undefined-priority guards for an unreachable typed state, rest-policy inversions,
redundant ADRs, speculative visual-neighborhood changes, and stale pre-review
performance branches are retired. The exact heads and patches are recoverable
from the external archive. Deletion uses expected-SHA leases, so a concurrent
push causes refusal rather than loss of unreviewed work.

## Validation

- `npm test`: 107 Vitest files, 1,012 tests; 12 Node tests passed.
- `npm run type-check`: client and server passed.
- `npm run format:check` and `git diff --check`: passed.
- `npm run build:ts` and `npm run build:web`: passed.
- Browser smoke: the web game loaded, accepted movement input, and rendered the
  player, terrain, HUD, inventory, and map. This is a smoke test, not full visual
  or Electron performance QA.
- The real-Pixi test import exposes an upstream `check2d` missing-source-map
  warning in Vite. Tests pass; no production dependency files were patched to
  conceal it.

## Final repository state

The reviewed integration landed at `d7b121ce`. GitHub confirmed all 15 retained
PRs as merged and the other eight as closed. Fifteen source branches were
removed automatically on merge; 109 remaining reviewed heads were deleted in
one atomic push with exact-SHA leases. Only `main` remains locally and remotely,
with one worktree, a clean working tree, and no stashes.

[CI](https://github.com/kylirh/dark-war/actions/runs/44940255551) and
[web deployment](https://github.com/kylirh/dark-war/actions/runs/44940255629)
both completed successfully for the integration commit. The external archive
records every retired branch and its disposition.
