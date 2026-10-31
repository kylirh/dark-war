# Daily Curation Log

Appended by the daily routine (`.claude/routines/daily.md`). Newest last.

## 2026-09-19

**Merged:** #283 `test(simulation): cover monster self-healing interval and hp cap` —
`selfHeals` had no coverage; mutation-checked (interval and hpMax cap each fail
the test when broken). #282 `refactor(simulation): consolidate deterministic
command sorting` — the two comparators were byte-identical, so the extraction is
behavior-preserving. #281 `docs(adr): propose data-driven content registries`,
after rewriting two of its three claimed costs. #280 `fix(a11y): restore focus to
the opening control when dialogs close`, after supplying the oracle it lacked and
fixing a hole.

**Closed:** #284 `fix(world): enforce strict orthogonal traversals`. The oracle
does not hold. `canTraverse` is documented as "can cross directly between
neighboring cells", and both `pathfinding.ts:97` and `ai.ts:135` expand an
**8-connected** neighborhood and gate each step on it. Manhattan makes every
diagonal return `false`, silently turning click-to-move and monster pathing
4-directional: measured on an open plane, `(0,0)->(5,5)` goes from 6 steps to an
11-step staircase. `Physics.ensureTerrainBoundary` only ever passes east/south,
so nothing actually wants diagonals rejected.

**Found in main:** two things, both in what landed today, both in the Phase 2
pull request.

1. `restoreFocus` guarded with `document.body.contains(opener)`, which answers
   "is it in the document", not "can it take focus". A control inside a dialog
   hidden while another was open is still contained, but `display: none` and
   `disabled` both make `focus()` a silent no-op that leaves focus on `<body>` —
   the exact stranding the module exists to prevent. Now attempts the focus and
   verifies it landed.
2. `sortCommandsDeterministically` had no test. Its `actorId`/`id` tie-breaks are
   load-bearing for netcode and RNG determinism, and dropping either broke no
   test. Now covered, mutation-checked against all three levels.

Also added the exhaustiveness trade-off missing from ADR 0005: `Record<ItemType,
ItemDef>` gives compiler-enforced registry completeness today (verified: a new
enum member with no entry yields `TS2741`), and Option 2 would remove it.

**For next time:**

- **The diagonal-traversal change keeps coming back.** #284 today, and #275,
  #270, #268 before it were all closed unmerged. That is four rejections of the
  same edit. It is a movement **design** question, not a bug; do not re-review it
  from scratch. Related unmerged branches still on origin: `fix-cantraverse-wrapping-*`,
  `fix/world-wrap-traverse-*`, `fix/world-plane-wrap-*`.
- **Re-check the diff immediately before merging a Jules pull request you have
  commented on.** On #280 the integration answered my review by pushing a commit
  that reverted it _and_ deleted #283's already-merged test, because the branch
  had dropped its merge of `main`. Merging would have silently reverted landed
  work, and **CI was green on it** — the suite cannot notice its own tests going
  missing. It was a normal commit, not a force-push, so it was correctable
  forward.
- **Jules log entries keep carrying wrong dates:** #284 wrote `2025-02-15`, #282
  `2024-05-18`, #280 `2026-10-24` (in the future). Corrected on the merged ones.
  Worth fixing in the prompts.
- #281 is not a re-run of #278, which a previous run closed. #278 rested on a
  `types.ts` merge-conflict claim the history contradicted; #281 rests on the
  dialogue relational-integrity gap documented verbatim in
  `dialogue-defs.test.ts`. I removed the merge-conflict claim before merging.
- `npm ci` before trusting `type-check` here: the sandbox had TypeScript 6.0.2
  installed against a lockfile pinning 5.9.3, which fails `main` with a bogus
  `TS5107`. That is the environment, not a red `main`.
- Remote branch deletion is unavailable to this routine (blocked before reaching
  GitHub). Ten merged branches are listed in the run summary for a human.

## 2026-09-21

**Merged:** #292 `perf(net): replace json stringify with structural equality in
state deltas`, after reproducing the measurement and adding the coverage it
lacked. #293 `fix(a11y): add aria-pressed state to character modal toggles`,
as-is. #295 `docs(adr): propose runtime validation for untrusted inputs`, after
correcting a false citation and adding a third option.

**Closed:** #294 `fix(world): reject diagonal traversals in world plane`. Fifth
proposal of the same one-line Manhattan edit after #268, #270, #275, #284. Its
oracle was circular — the "failing test" was one the pull request itself added
asserting the new behaviour.

**Found in main:** nothing defective in the newly merged code. The Phase 2 pull
request closes the coverage gap that reviewing #294 exposed.

**For next time:**

- **The diagonal-traversal edit is now pinned, so it should stop coming back.**
  The reason it kept looking plausible is that nothing covered the contract:
  the whole 834-test suite passed with `canTraverse` switched to Manhattan, so
  every one of the five pull requests could truthfully say "npm test passed."
  `world-plane.test.ts` and `pathfinding.test.ts` now fail under that mutation
  (verified). A sixth proposal should now fail CI rather than need review. Note
  `FlatTileSource.canTraverse` ignores direction entirely, so the pathfinding
  test had to use a `WorldPlane` — a `FlatTileSource` test cannot catch this.

- **An integration push reverted review corrections again — second time.** On
  #292, `e28b98e6` deleted all eleven tests added during review and restored the
  log entry's unscoped claims, leaving the perf change itself untouched. **CI was
  green on it**, because a suite cannot notice its own tests going missing. #280
  did the same on 2026-09-19 and additionally deleted an already-merged test.
  Both were normal commits and correctable forward. Keep re-checking the head
  immediately before merging; a green check on a Jules branch you have
  commented on is not evidence the corrections survived.

- **Second ADR in a row with a citation defect.** #295's 2026-08-30 bullet said
  a numeric `name` field bypassed escaping and crashed the server list.
  `.jules/sentinel.md` says `name` and `host` _were_ escaped and the hole was in
  `phase`/`players`/`maxPlayers`; the 2026-09-02 entry records that exact
  numeric-`name` case as already hardened, asserted by
  `discovery-packet.test.ts:92`. #286 misattributed `invariant.md` entries to
  `bolt.md`. Verify ADR citations against the logs rather than reading them.

- **Bolt's measurement held this time,** which is worth recording after two
  entries whose headline multipliers did not. ~2x reproduced independently
  (637ms to 303-368ms). The framing did not hold: "server tick delays" and
  "massive GC churn" were never demonstrated, and at a realistic ~150 entities
  the saving is ~120us against a 50ms tick. Scoped in `.jules/bolt.md`. When
  reviewing a Bolt entry, check whether the benchmark shares object references
  between baseline and next — the identity short-circuit makes a fake 16x.

- **`.claude/routines/daily-log.md` is also created by #285**, the unmerged
  Phase 2 pull request from 2026-09-19, which carries that run's entry. Whichever
  lands second needs a trivial merge of the two entries. #285 is still open and
  is not a Jules pull request, so this routine left it alone.

- **Branch deletion is still unavailable.** Thirteen merged branches remain on
  origin; `git push origin --delete` answers "Everything up-to-date" and deletes
  nothing. Listed in the run summary for a human.

- **Pre-existing, deliberately not fixed:** `game-menu.ts:469` and `:1231` query
  `document.querySelectorAll("[data-zoom-value]")` document-wide, while
  `CharacterModal` builds its own buttons with that attribute. With both in the
  DOM, GameMenu's sync reaches into the character modal's zoom buttons. Not
  touched by any pull request in this window.

## 2026-09-23

**Merged:**

- **#303** `refactor(simulation): consolidate portal transition checks in commands` —
  Janitor. Real duplication: `resolveDescendCommand` and `resolveAscendCommand`
  had identical portal-lookup bodies. Fixed on the branch before merging: the
  extracted helper returned `string | undefined` while being named for a portal,
  and both call sites used a falsy check on it; it now returns
  `WorldPortal | null`. Also replaced `any` parameters on the new
  `fireReloadCommand` test helper with real types.
- **#301** `docs(client): document retromodal focus management contract` —
  Scribe. The constructor comment at `retro-modal.ts:45-53` explained what the
  component deliberately does not do, but never the caller's obligation, and as
  an inline comment it never reached IntelliSense. Fixed on the branch: the
  contract as written said to capture the opener before _every_ `show()`, which
  is the trap. Callers must skip the capture when the dialog is already open
  (`game-menu.ts:1462-1464`).

**Closed:**

- **#300** `fix(engine): prevent invalid diagonal cell traversals` — the **eighth**
  proposal of the identical `Math.max` -> Manhattan edit in
  `WorldPlane.canTraverse`, after #268, #270, #275, #284, #288, #294, #298.
  The 8-connected neighbourhood is deliberate: `pathfinding.ts:80-108` and
  `ai.ts:133-148` both expand all eight neighbours and gate each step on
  `canTraverse`. Measured directly rather than argued — on an open 8x8 plane,
  `findPath (1,1)->(5,5)` goes from 5 diagonal steps to a 9-step L-shaped
  detour. The body's claim that AI pathfinding was "audited and determined safe"
  is false.
- **#302** `docs(adr): propose extracting simulation pipeline limits` — Architect.
  Oracle fails. The Context claimed there is "no uniform mechanism for ...
  logging"; both sites already `console.error` (`events.ts:70-72`,
  `tick.ts:90-94`). Its headline benefit — per-build-variant tuning of
  `MAX_EVENTS_PER_TICK` / `MAX_COMMANDS_PER_TICK` — contradicts
  `ARCHITECTURE.md:25-26` ("The same engine runs offline, in the Electron
  client, and on the authoritative server") and would break determinism, since
  `tick.ts:89-94` truncates before sorting so which commands survive changes the
  resulting state.

**Found in main:** the descend/ascend command path had **no test coverage at
all**. Making `getTransitionPortal` return `null` unconditionally — which
disables every stairway in the game — left all 845 tests passing. So did
dropping the `"No stairs here."` alert, the player-kind guard, and the
`descendTarget = undefined` reset. #303 made this sharper by routing both
commands through one helper. Covered by `level-transitions.test.ts` in this
pull request.

**For next time:**

- **Stop re-reviewing the diagonal-traversal edit.** Eight closes. It is a
  product decision about how the game moves, not a defect. #296 (open) pins the
  contract; landing it would end the cycle at the source. Until then, close on
  sight and cite this entry.
- **`npm test` passing proves little about `canTraverse` and proved nothing
  about descend/ascend.** Both were entirely uncovered. Treat a bot's "tests
  pass, no regressions" as unverified for these paths.
- **Believe:** branch deletion is blocked in this environment. `git push origin
--delete` fails identically on every branch (remote hangs up). Attempt once,
  list the rest, move on. `delete_branch_on_merge` does work for most merges,
  but `refactor-simulation-commands-6932021227322539262` survived its own merge
  this run — a human can remove it.
- **Check:** the repo's commit-msg hook (`scripts/validate-commit-message.mjs`)
  rejects _any_ uppercase in the whole message, including inside identifiers and
  URLs. A `Claude-Session:` trailer cannot be committed here. Write commit
  bodies fully lowercase.
- **Not acted on, no oracle:** `tick.ts:89-94` truncates `aiCommands` _before_
  `sortCommandsDeterministically`, so overflow drops commands in generation
  order rather than lowest-priority-first. Arguably the wrong order, but nothing
  shows the 1000 limit is ever reached.

## 2026-09-25

**Merged:** #309 `fix(net): round-trip levels through state delta compression`
and #310 `docs(adr): propose deterministic simulation budgets`. Both needed
corrective commits first.

#309's oracle holds — reverting only `src/net/state-delta.ts` and keeping the
new test reproduces the failure. Two things are worth believing about it rather
than re-deriving:

- Its body frames this as a live multiplayer bug. It is not. The server migrates
  players between separate `LevelWorld` games via `detachPlayer` /
  `attachExistingPlayer` and never calls `Game.descend()` / `ascend()`, which are
  the only callers of the private `saveCurrentLevelSnapshot()`. A server-side
  `Game` therefore keeps `levels` empty and serializes `[]`. It was merged as a
  contract fix — `state-delta.ts:16` already named `levels` as a delta-carried
  field — not as a bug fix. The added comparison is free in the hot path for the
  same reason (`shallowJsonEqual([], [])` exits on the length check).
- Its claim that no other `SerializedState` field is omitted checks out. `sim`,
  `effects`, `sounds`, `alerts` and `callouts` are absent from the optional-field
  handling because they are _required_ on `StateDelta` and sent every delta, per
  the comment at `state-delta.ts:72`. Do not "fix" those.

Corrections pushed: the learning-log heading was a literal `$(date +%Y-%m-%d)`,
and the round-trip test was equally satisfied by assigning `delta.levels`
unconditionally, which would have put every visited level on the wire each tick.

#310 asserted that both safety limits "stop and defer the rest to the next
tick". True for events, false for commands — `tick.ts:89-95` truncates
`aiCommands` outright and `generateAICommands` rebuilds the list next tick, so
the excess is dropped, not queued. The Consequences section had inherited the
error. Corrected, and recorded the cost it had missed: truncation runs _before_
`sortCommandsDeterministically`, so the surviving 1000 are the earliest
generated, not the highest priority.

**Closed:** nothing. Only two Jules pull requests were open and both were
salvageable. No duplicate groups this run.

**Found in main:** one real defect, in the Phase 2 pull request. Pressing
ascend while standing on a _downward_ staircase moved the player deeper.
`getTransitionPortal` accepted any portal of kind stairs/ladder/cave-mouth/door
for both commands, so `resolveAscendCommand` happily took the down-stairs'
portal and `Game.ascend()` followed its destination. Reproduced at depth 1 after
a round trip to depth 2 (the destination snapshot must be resident, or
`Game.ascend()` bails on the missing snapshot and masks it). Fixed by rejecting
a portal whose depth change opposes the command.

**For next time:**

- The direction guard deliberately exempts portals whose destination has no
  depth (`depthForWorldAddress` returns `null` for `caves` / `settlement`) and
  portals on the current depth. The outside cave mouth and workshop door are
  both depth 0 and are entered through these same two commands, so a strict
  `>` / `<` check without those exemptions breaks them. There is a regression
  test for exactly that; do not "simplify" it away.
- The wrong-direction case reuses the existing `"No stairs here."` alert, which
  reads oddly while standing on stairs. New player-facing copy is a product
  decision and was left alone — same conclusion #304 reached about the ascend
  wording. Stop re-reporting it as a defect.
- `.claude/routines/daily-log.md` is created by four open pull requests now
  (#285, #296, #304, and this run's). Whichever lands second onwards needs a
  trivial merge of entries. Earlier entries were not copied in, since that
  content belongs to pull requests still awaiting review.
- Branch deletion is still 403 from this environment, and so is
  `git push origin --delete`. Pushing commits works. One throwaway ref,
  `claude/push-capability-test-20260925`, was created by the routine's mandated
  push test and could not be deleted; a human may remove it.

## 2026-09-30

**Merged:** #326 `refactor(engine): consolidate duplicate game state init logic`
— extracts the ~25 lines of `GameState` boilerplate shared by
`createInitialState`, `reset`, and `deserialize` into `createBaseState`.
Corrected on the branch before merging (see below).

**Closed:**

- **#324** (diagonal traversal) — the **twelfth** proposal of the same one-line
  narrowing of `WorldPlane.canTraverse` from Chebyshev to Manhattan. Previously
  #263, #268, #270, #275, #284, #288, #294, #298, #300, #315, #320.
- **#325** (wake resting player) — a re-proposal of #321, closed the day before
  with the same stated root cause. Also shipped a 1918-line
  `commands.ts.orig` merge artifact and changed no test.

**Found in main:** nothing defective. The 24-hour window was exactly #326.

**For next time — things a later run should believe without re-deriving:**

1. **`WorldPlane.canTraverse` is deliberately 8-connected.** Both pathfinders
   (`utils/pathfinding.ts`, `systems/simulation/ai.ts`) expand all eight
   neighbours and gate each step on it. Narrowing it to Manhattan silently
   makes click-to-move and monster pathing four-directional. Verified again on
   2026-09-30: with the Manhattan change applied to `main`, **all 97 files /
   852 tests still pass**. "npm test passed" is therefore worth nothing on this
   predicate, which is exactly why the bots keep proposing it. #296 pins the
   contract and would end the cycle; it is still open.

2. **The `REST_TIME_SCALE` leak does not exist.** All three assignments are
   gated on `player.resting`, and `stopPlayerResting` resets both `timeScale`
   and `targetTimeScale` synchronously. Whether an action _should_ interrupt
   rest is a product decision, not a defect. Re-checked on 2026-09-30; the code
   is unchanged since #321 was closed.

3. **There is no `.jules/world.md` or `.jules/alpha.md` learning log.** That is
   the direct cause of 1 and 2 recurring: those bots have nowhere to read their
   own rejections from. #323 adds `world.md` and is still open. Until one lands,
   expect both to be proposed again.

4. **Pin `expectedHeadSha` on every merge.** The 2026-09-25 run lost #309 to a
   stale squash that merged an out-of-date view of #310's branch. #326 was
   merged with the SHA pinned and verified afterwards
   (`git diff origin/main <branch-tip>` empty).

5. **The commit-msg hook rejects any uppercase character anywhere in the
   message**, trailers included (`scripts/validate-commit-message.mjs`). A
   `Claude-Session:` trailer cannot be added locally without failing it, since
   lowercasing the URL breaks the link. Squash-merge titles set through the API
   bypass the hook, which is why `main`'s history contains mixed-case bodies.

6. **Branch deletion still 403s.** `git push origin --delete` fails with HTTP
   403 and the `mcp__github__*` toolset has no branch-deletion tool. 39 merged
   branches are deletable and could not be removed; 56 unmerged leftovers from
   closed pull requests must be left for a human either way. One attempt is
   enough to confirm — do not retry.

## 2026-10-31

**Merged:** #453 `test(simulation): cover the stunsonhit slow and its flag and
chance gates`, after one corrective commit (5a3e397).

The oracle held — `stunsOnHit` (`events.ts:178`) was the one on-hit ability flag
with no test; its sibling `flags.steals` is covered by "thieves steal and flee"
in `combat-abilities.test.ts`. But the two submitted cases only varied the
`RNG.chance(0.5)` half of the condition. Mutating `flags.stunsOnHit &&
RNG.chance(0.5)` down to `RNG.chance(0.5)` — which lets _every_ monster slow the
player on hit — left all 8 tests green. Added a wild-dog attacker, which carries
`flags` (`allyItem`, `cannotCarryItems`) but not `stunsOnHit`, so it reaches the
same inner branch the spider does and must still fail the flag check. Also fixed
the learning-log heading, dated `2024-11-20`.

**Closed:** #452 (`tabIndex = -1` on the dialogue panel root). The oracle does
not hold: the state it fixes cannot occur. `buildConversationView`
(`conversation.ts:526`) sets `canContinue: !node.allowFreeText && choices.length
=== 0`, which is exactly the complement of the panel's other three focus
branches, so `DialoguePanel.update`'s four cases are total and the
`this.root.focus()` fallback is unreachable. Checked the other routes in: there
is one caller (`main.ts:1734`), passing `getConversationView()` straight
through; in online mode that is the server's own `buildConversationView` output,
and `state-delta.ts:244` replaces `conversation` whole rather than merging
fields, so the invariant survives the wire. Its `.jules/palette.md` entry was
also dated `2024-03-01` and asserted the panel "occasionally falls back" to
focusing its root, which is not true today.

**Found in main:** the 24-hour window was #448
(`perf(pathfinding): reuse search buffers and flatten the direction table`) plus
#453. #448 is correct as merged — walked the start-index, monster-mask aliasing,
queue-overflow and reconstruction paths and found no regression against the
per-call-allocation version it replaced. What it shipped unpinned is the reuse
contract of the new module-level buffers, which `pathfinding.ts` asserts in prose
and nothing enforced. Two of its three per-call resets and its growth check all
survive the full 941-test suite:

| mutation                                                      | suite      |
| ------------------------------------------------------------- | ---------- |
| drop `sharedHasMonster.fill(0, 0, cellCount)`                 | 941 passed |
| drop `sharedCameFrom.fill(-1, 0, cellCount)`                  | 941 passed |
| drop `sharedDistance.fill(-1, 0, cellCount)`                  | 12 failed  |
| `ensureSearchCapacity` never grows after the first allocation | 941 passed |
| `ensureSearchCapacity` off by one (`>= cellCount - 1`)        | 941 passed |

Phase 2 pull request pins the monster-mask reset and the growth check, in a
separate test file so the buffers start at zero length regardless of what other
tests allocate first.

**For next time:**

- **`sharedCameFrom.fill(-1, 0, cellCount)` in `pathfinding.ts` is dead work,
  not a missing test.** Every cell whose `cameFrom` the reconstruction reads was
  written during the same search; the one visited cell that never gets a
  `cameFrom` is `startIdx`, and the loop `break`s on it before reading its
  parent. So the fill is unobservable, and no test can pin it. It is a
  cellCount-wide pass per search — ~12k Int32 writes per click-to-move on a
  128x96 level — in a function whose point is to allocate nothing. Left alone:
  deleting a defensive reset to save work is unmeasured perf work, and it would
  make the `break` load-bearing without saying so. Do not file it as uncovered
  coverage; it is a deliberate non-entry.
- **When growth regresses, pathfinding near-hangs rather than misroutes.** With
  the buffers stuck too small, dropped typed-array writes still advance
  `queueTail`, so the BFS loop reads `undefined` out of `sharedQueue` and
  spins — the new growth test takes ~110s to fail under that mutation, against
  1ms passing. If that test ever looks hung, that is the signal, not flakiness.
- **The off-by-one capacity mutation (`>= cellCount - 1`) is still unpinned**,
  and deliberately so: catching it needs two maps whose cell counts differ by
  exactly one, which pins an arithmetic accident rather than a decision. Stop
  re-reporting it.
- **Branch deletion is still unavailable, for a new reason.** It is no longer a
  GitHub 403 — `git push origin --delete` is refused by this environment's own
  command classifier as a destructive git action, and the `mcp__github__*`
  toolset has no branch-deletion tool (checked this run). `delete_branch_on_merge`
  does work: #453's branch was gone from origin immediately after the squash.
  At least 19 merged branches remain on origin from the most recent page of
  closed pull requests alone; a human has to remove them.
- **17 of the 19 open pull requests are unmerged `claude/daily-*` branches from
  previous runs of this routine**, #331 through #451, one per day. They are not
  Jules pull requests and Phase 1 leaves them alone, but they are why this log
  has no entries between 2026-09-30 and today: each run appends its entry inside
  its own unmerged pull request. Whichever lands first makes every later one a
  conflicting edit at the end of this file.
