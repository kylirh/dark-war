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

## 2026-10-01

**Merged:** #330 `perf(net): replace object.keys traversal in state delta equality`
and #329 `refactor(test): consolidate duplicate monster pickup and vending setup`.
Both were corrected on their branches first.

**Closed:** #328 (interrupt rest on non-WAIT command) — the **third** proposal of
this change after #321 and #325, and the premise is false, not merely
re-litigated. `REST_TIME_SCALE` is assigned in exactly one place, on the branch
that sets `player.resting = true`, and every wake path runs `stopPlayerResting`,
which resets both `timeScale` and `targetTimeScale` synchronously. It cannot leak
into movement either: `src/client/main.ts:1072` (`predictLocalPlayer`) and
`src/client/main.ts:1809` (`handleUpdateVelocity`) both zero velocity while
resting, so no frame applies an 8x scale to a non-zero velocity. Its oracle was
circular, and the same diff rewrote `commands.test.ts`'s
`ignores non-WAIT commands when resting` into its own negation — the clearest
evidence the behaviour is deliberate. Whether an action should cancel rest is a
product decision.

**Found in main:** no correctness defect. The whole 24-hour window — #326's
`createBaseState` extraction, `004a188`'s compact entity ordering, `d26f8f3`'s
world-map and settings fixes, and both of today's merges — checks out. The Phase 2
pull request is coverage only.

**For next time — things to believe without re-deriving:**

1. **`diffById`'s order check is correct; do not "simplify" it.** It verifies
   `next == survivors(in base order) ++ new(in next order)`, which is exactly
   what `applyById` reconstructs when `order` is omitted — surviving keys keep
   their Map position and new ids append in `upserted` order, which is `next`
   order. The shared `naturalOrderIndex` across the two loops is load-bearing,
   and the `&&` short-circuit in the second loop is what keeps the index
   advancing only for new entities. Seven `it.each` cases cover it.

2. **`nearestDisplayedTile` returns integers despite the fractional
   `windowCenter`.** For odd `windowSpan` the centre is `x.5`, but the expression
   reduces to `tile - mapSpan * floor(v / mapSpan)`, so the halves cancel exactly.
   Do not "fix" it with a `Math.round`.

3. **`#pause-dialog [data-zoom-value]` is deliberately scoped.** `CharacterModal`
   builds its own zoom buttons with the same `data-zoom-value` attribute and
   attaches its own click handler (`character-modal.ts:434`), scoping its sync to
   `this.window`. The unscoped `document.querySelectorAll` that `d26f8f3` replaced
   made `GameMenu` attach a second handler to the modal's buttons. Widening it
   back re-introduces double handling.

4. **`for...in` beat `Object.keys` in `shallowJsonEqual` (-38% to -42%), but that
   is not a general rule** and the result does not transfer. More importantly,
   **cross-process A/B benchmarking is worthless on this hardware** — single-run
   `computeStateDelta` medians swing about ±30%, and a naive branch-vs-branch
   comparison of #330 came out backwards. Put both variants in one process with
   interleaved rounds.

5. **A merge of `main` into a bot branch needs a hand-written commit message.**
   `scripts/validate-commit-message.mjs` rejects git's default
   `Merge remote-tracking branch ...` subject, so `git merge origin/main` fails
   at the hook and leaves the merge staged but uncommitted. The same hook rejects
   any uppercase character, so a `Claude-Session:` trailer still cannot be added
   locally without breaking the URL.

6. **Branch deletion still 403s, and Jules pushes to branches after they
   close.** One deletion was attempted this run, with a lease, and failed the
   same way as every previous run: `git push origin --delete` returns HTTP 403.
   Pushing commits works fine; it is deletion specifically. One attempt is
   enough — do not retry.

   More useful than the 403: **both bot branches moved after their pull request
   closed.** `janitor/test-setup-consolidation-...` was merged at 07:21:14 and
   Jules pushed `f665559` onto it at 07:22:17, which is simply the branch's
   pre-review state — it would restore the mid-file `Player` import, drop the
   delegation to `interact`, and drop the return types.
   `fix-resting-interruption-15824223162374495795` (#328, closed unmerged) got
   `4f317a9 Revert changes as PR was closed`. Both branches therefore carry
   commits not in `main` and are **not** deletable under the routine's own
   fully-merged rule, 403 or no 403. This is the 2026-09-19 hazard again — a bot
   answering review by pushing over it — and the reason to re-check the diff
   immediately before merging and to pin the head sha at merge time.

7. **`deserialize`'s field order is load-bearing and was almost untested.** It
   spreads `createBaseState()` and then overrides the five fields a save carries.
   Moving that spread below the overrides leaves all 890 tests green while
   `story`, `effects`, `godMode` and `multiplayer.mode` silently revert to a fresh
   level's defaults on every load. `sim` was already pinned by `33d61b5`; the
   Phase 2 pull request pins the first three. `multiplayer.mode` is still
   uncovered on purpose — see below.

**Needs a human:** `deserialize` takes `multiplayer.mode` from the save
(`data.multiplayer.mode`), not from the `Game` it is loading into, so an offline
save loaded into an online `Game` leaves `state.multiplayer.mode === "offline"`
while `this.multiplayerMode` is `"online"`. That is pre-existing and untouched by
this window. It is the one remaining field exposed to the spread-ordering hazard,
and it was left uncovered deliberately: a test pinning it would cement a
semantic that may well be wrong.

## 2026-10-03

**Merged:** both open Jules pull requests, each after corrective commits.

- **#338** `test(simulation): cover both arms of the explosion chain`. The oracle
  held — chain explosions were genuinely uncovered. Confirmed by deleting each
  arm of `processExplosionEvent` on `main` in turn, which left **100 files / 895
  tests passing** both times. But the submitted test covered only one of the two
  arms, and its log entry claimed chain explosions as a whole. Three other
  corrections: the test replaced `state.eventQueue.push` and never restored it;
  the two grenades were built in mismatched units (see below); and the learning
  log entry was appended twice, verbatim, dated `2025-02-18`.
- **#339** `refactor(simulation): consolidate the five counted-item consume
sites`. The duplication was real — `consumeOne` in `commands.ts` and
  `takePlayerItem` in `events.ts` were byte-identical. But the block existed
  **five** times, not two, and the first pass took only the two that were
  identical _functions_.

**Closed:** nothing. Both open Jules pull requests were salvageable, and there
were no duplicate groups this run — the two addressed unrelated problems.

**Found in main:** no correctness defect. The 24-hour window was three commits:
`a47770d` (yesterday's matter-manipulator test-setup consolidation) and the two
merged above. The Phase 2 pull request is coverage for a contract this run's own
merge introduced — `consumeItem`'s over-spend branch, see below.

**For next time — things a later run should believe without re-deriving:**

1. **`ExplosiveEntity`'s constructor takes world pixels; `ItemEntity`'s takes
   grid coordinates.** `explosive-entity.ts:43-56` assigns `worldX`/`worldY`
   directly after calling `super(0, 0)`; `item-entity.ts:28` passes its
   arguments through to `GameEntity`, which multiplies by `CELL_CONFIG.w`. #338
   placed both at `(100, 100)` and the two landed ~4400px apart — grid row 100
   is off the bottom of a 96-row dungeon — then reassigned the item's world
   coordinates two lines later. The test passed, but not for the reason it read
   as. Check which space an entity constructor takes before trusting a
   co-location in a test.

2. **`processExplosionEvent` chains into two separate entity kinds**, and a test
   covering one says nothing about the other: `explosivesToTrigger` for armed
   `ExplosiveEntity`s, `itemsToTrigger` for dropped `ItemEntity`s whose type is
   `GRENADE` or `LAND_MINE`. Both are now pinned, plus the item-type filter.

3. **The counted-item consume block had five copies, three of which no name
   search would find.** Two were identical functions (`consumeOne`,
   `takePlayerItem`), one was the same block already carrying an `amount`
   parameter (`conversation.ts` `consumeCountedItem`), and two were inline with
   no name at all (`buyFromVending`, the money arm of `stealFromPlayer`). All
   five now call `consumeItem(player, itemType, amount = 1)` in `inventory.ts`.
   This is the **second** janitor run in a row to stop early on the same
   consolidation; its log already said "finish the sweep". Grep for the body,
   not the helper name.

4. **`consumeItem`'s `remaining <= 0` branch is about over-spend, not just
   exact depletion, and nothing exercised it.** Narrowing it to `=== 0` on
   `main` left all 898 tests passing, because every one of the five callers
   bounds-checks before calling. The Phase 2 pull request pins it. It matters
   now in a way it did not when the logic was three private copies: the helper
   is exported, shared, and documented as tolerating an unchecked amount, so the
   sixth caller is the one that will rely on it.

5. **Branch deletion still 403s**, and `git push origin --delete` fails
   identically with a lease. Confirmed again on four branches this run. The
   `mcp__github__*` toolset has no branch-deletion tool. One attempt is enough —
   do not retry.

6. **The remote branch list is down to ten.** A human appears to have cleared
   the ~95-branch backlog the 2026-09-30 entry recorded. What is left is four
   deletable merged branches, three unmerged leftovers from closed pull
   requests, `main`, and two open `claude/daily-*` heads. Do not go looking for
   more.

7. **`delete_branch_on_merge` worked for both merges this run.** The four
   merged branches that survived are the three the 2026-10-02 entry recorded as
   force-pushed back to their pre-review state after merging, plus #329's. Their
   tips are not what landed, which is why GitHub did not remove them.

8. **`.claude/routines/daily-log.md` is still written by two other open pull
   requests**, #331 (2026-10-01) and #337 (2026-10-02). This entry was appended
   to `main`'s copy, which has neither. Whichever lands last needs a trivial
   merge of the entries; earlier entries were not copied in, since that content
   belongs to pull requests still awaiting review.

## 2026-10-04

**Merged:**

- **#341** `test(simulation): cover hole and occupancy guards on block placement` —
  Test, as-is. Both guards in `resolvePlaceBlockCommand` were entirely
  uncovered: on `main`, dropping `existing !== TileType.HOLE` from the
  `buildable` check left all 898 tests passing, and so did removing the `return`
  from the `occupied` guard. `HOLE` is `block: false`, so the first mutation
  really does make holes buildable. Each new case fails exactly its own mutation.
- **#342** `docs(terrain): document cantraverse diagonal movement contract` —
  Scribe, as-is. Documents the single most-misread predicate in the tree on both
  the interface and the implementation. Claims checked rather than taken:
  `Math.max(abs(dx), abs(dy)) !== 1` is Chebyshev-1, `pathfinding.ts:108` and
  `ai.ts:149` expand all eight neighbours, and "combat steering" is accurate —
  `ai.ts:1845` chases with both `moveX` and `moveY` non-zero.
- **#343** `refactor(utils): consolidate the duplicate eight-way directions array`
  — Janitor, after two rounds of corrections. See below; this one is the story of
  the run.

**Closed:**

- **#344** `fix(simulation): interrupt resting on non-wait commands` — Bug. The
  **fifth** proposal of this edit after #321, #325, #328 and #335. Circular
  oracle: `main` has a test that pins the current behaviour by name,
  `"ignores non-WAIT commands when resting"` (`commands.test.ts:335`, issues
  `RELOAD` while resting and asserts `nextActTick` stays `0`), and the PR renames
  it and inverts its assertion. Nothing failed first. Measured the design rather
  than arguing it: rest ends by four deliberate paths — the wait toggle
  (`commands.ts:305`), full HP (`tick.ts:151`), death (`tick.ts:139`) and
  **taking damage** (`events.ts:152`). The guard is the complement of that list.
  The client also suppresses movement independently: `handleUpdateVelocity` zeroes
  velocity and returns while resting (`main.ts:1809-1815`), so a `MOVE` the engine
  now honoured would arrive from a layer refusing to move the player.

**Found in main:** the eight-way sweep in #343 was still incomplete after the
corrections. `ai.ts:134-143` (`botNextStep`) and the tail of `allDirs` at
`ai.ts:1870-1877` are both byte-identical to `EIGHT_WAY_DIRECTIONS` in values
_and_ order — compared mechanically, not by eye. Consolidated in this run's
pull request; behaviour-preserving by construction, and the suite stays at 903.

**For next time:**

1. **An integration push reverted review corrections for the third time, and the
   title lied about it.** `a48fa0c` on #343 was titled "acknowledge corrective
   commit for array ordering" and was a _complete revert_ of that commit:
   angular order restored, all three order tests deleted, `ANGULAR_DIRECTIONS`
   deleted, the dead alias and unused import restored, the log entry reverted to
   its wrong `2025-02-27` date. **CI would have been green on it**, because the
   only tests that detect the reorder were the three it deleted. #280 and #292
   did this before. What made it safe was pinning `expectedHeadSha` on the merge:
   the branch moved between my first push and the merge, and re-reading
   `git ls-remote` immediately before merging is what caught it. Do both, every
   time — the re-check is not optional and a green check is not evidence.

2. **Stop believing the 2026-09-30 note that the Manhattan mutation leaves the
   suite green.** It is stale. Measured today on current `main`: switching
   `canTraverse` to Manhattan fails **3 tests** —
   `world-plane.test.ts > allows all four diagonal neighbours on level ground`
   and two cases in `pathfinding.test.ts > findPath diagonal movement`. #296
   landed and did its job. A thirteenth diagonal proposal should now fail CI
   rather than need review, so close it on sight.

3. **Two arrays with the same values are only duplicates if the order is dead.**
   `EIGHT_WAY_DIRECTIONS` is sampled by index with `RNG` in
   `chooseIdleWanderDirection` and iterated for equal-cost tie-breaks in
   `findPathToClosestReachable`; `directionFromAngle`'s array is indexed by
   `angle / 45 degrees`. Merging them forced angular order on the first two:
   `findPath(1, 1) -> (1, 6)` across open floor returned `(2, 2), (3, 3)` and
   back instead of walking straight down. Now pinned by `helpers.test.ts` and
   `pathfinding.test.ts`; before that the whole 898-test suite passed under the
   reorder. The tell was in the PR body — it reported "resolving one temporary
   test failure due to altered order definition", which was the one _covered_
   site of the three. A red test that moves depending on which copy wins means
   the copies are not interchangeable.

4. **Do not probe RNG trajectories through `new Game()` — it is not
   deterministic run to run here.** A `game.reset(1)` + `RNG.reseed(k)` probe of
   `chooseIdleWanderDirection` gave different sequences on two runs of identical
   code, which briefly made a behaviour-preserving change look like a regression.
   Measure order contracts at the `FlatTileSource` level instead, the way
   `pathfinding.test.ts` does: no level generation, no RNG, fully repeatable.

5. **The repo has a `pre-commit` hook, not just `commit-msg`.**
   `.githooks/pre-commit` runs `prettier --write` over staged `.ts/.js/.mjs/.json/.css/.md`
   files and re-stages them. That is why a local commit can pick up a one-line
   reformat of a `.jules/*.md` file it never meant to touch: `main`'s copy came
   in through a GitHub squash, which bypasses hooks. Harmless, but do not chase
   it. `commit-msg` still rejects any uppercase anywhere in the message.

6. **Branch deletion: `delete_branch_on_merge` now works, direct deletion still
   does not.** All three branches merged today were removed automatically.
   For the five older merged branches still on origin,
   `git push --force-with-lease ... :refs/heads/<branch>` fails with "the remote
   end hung up unexpectedly" on every one, and the `mcp__github__*` toolset has
   no branch-deletion tool — re-checked at runtime, not carried forward. One
   attempt is enough. Note those five tips have moved _since_ their merge
   (e.g. #333 merged `b7cdc82`, the branch now points at `26ee1c3`), so they are
   no longer at the state that landed.

## 2026-10-05

**Merged:** three of six Jules pull requests.

- **#347** `refactor(server): consolidate multiplayer world transition logic` —
  Janitor, merged as-is. `tryDescend` and `tryAscend` had identical bodies apart
  from the expected tile and the direction string. Verified mechanically rather
  than by eye: substituting both into one body makes the two functions
  byte-identical except for Prettier's line wrapping (`STAIRS_DOWN` is longer
  than `STAIRS_UP`), so the extraction is behaviour-preserving by construction.
  903 tests before and after.
- **#348** `fix(a11y): restore focus when the intro story is dismissed` —
  Palette, corrected first. The oracle holds: `dispose()` removes the overlay
  while one of its own buttons has focus and restores nothing. But the diff
  hand-rolled the capture as a bare `document.activeElement`, which is `<body>`
  whenever nothing specific is focused — and `document.body.contains(body)` is
  true while `body.focus()` is a no-op, so the `#game` fallback was unreachable
  in exactly the case the change existed to fix. Rewired to
  `captureFocusOpener` / `restoreFocus`, which already handle both that and the
  contained-but-unfocusable case, and which own the canvas id.
- **#349** `docs(adr): propose removing transition flags from gamestate` —
  Architect, corrected first. See below; the corrections were substantive.

**Closed:** three.

- **#346** and **#350**, the same change twice (byte-identical production
  diffs), both on the oracle rather than on duplication. See below.
- **#351** `fix(world): wrap absolute pathing coordinates over the toroidal
seam`. The body claims "Added a failing unit test explicitly confirming
  `canTraverse(4, 4, 5, 4, true)`"; the diff is `world-plane.ts` and
  `.jules/world.md` and contains no test at all. The branch it adds is also
  unreachable: of eleven `canTraverse` call sites exactly one passes `wraps`
  (`pathfinding.ts:97`), and it normalizes both coordinates with `wrapValue`
  and bounds-checks them before calling, while `currentX`/`currentY` come from
  a BFS tile index and are in range by construction.

**Found in main:** one uncovered decision, in the Phase 2 pull request.

#347 turned the stairs tile and the migration direction into **call-site
arguments** of a shared `tryTransition`. That pairing is the only thing stopping
a player on a down-stair from ascending, and nothing touched it: inverting both
pairings left all 100 files / 903 tests passing. The server had no transition
coverage whatsoever. Now covered end-to-end over the websocket harness —
descend, the wrong-direction refusal, and the return trip — mutation-checked
four ways.

**For next time:**

- **The `REST_TIME_SCALE` leak still does not exist, and this is now the fifth
  and sixth proposal** (#321, #325, #335, then #346 and #350 on the same day).
  Measured this run rather than argued: a discarded non-WAIT command leaves the
  player **still resting**, so `REST_TIME_SCALE` is the correct scale for the
  state the game is in. Every `player.resting = false` in
  `src/engine/systems/simulation/` is inside `stopPlayerResting`, which resets
  both scales together, and all four callers route through it (`commands.ts:305`,
  `events.ts:152`, `tick.ts:139`, `:151`). Both pull requests' oracles were
  circular — #350's test assigns `REST_TIME_SCALE` to both scales by hand and
  then asserts they changed. Close on sight and cite this entry. The real
  content of the diff is a pacing decision: a stray keypress would silently
  cancel rest instead of being ignored.
- **`.jules/alpha.md` still does not exist on `main`**, which remains the direct
  cause of the above. #350 would have created it (dated `2024-10-05`, eighteen
  months off) but was closed. Alpha has nowhere to read its own rejections from.
- **A branch was force-pushed back to its pre-review state again — third time**
  (#280, #292, now #348). `fix-introstory-focus-…` was reset to Jules' original
  within minutes of the merge, discarding the corrective commit. `main` is
  correct: it was merged with `expectedHeadSha` pinned to the corrected commit
  and re-verified immediately before merging (remote head equalled my SHA, and
  no `body.contains` remained). **The SHA pin is what makes this safe** — keep
  doing it, and keep re-reading the head rather than trusting a green check.
- **Third ADR in a row with a claim the code contradicts.** #349 promised that
  moving the transition flags would stop them "polluting the serialized state".
  None of `shouldDescend` / `shouldAscend` / `descendTarget` / `pendingPortalId`
  is in `SerializedState` — the 2026-10-02 entry had already established this.
  It also missed the cost that matters most to its own recommendation:
  `processHoleFalls` reads `shouldDescend` **inside** the tick (`tick.ts:462`),
  so an end-of-tick `HostIntent` cannot serve that read and Option 2 keeps a
  private per-tick marker rather than removing the flag. And the offline host
  consumes the flags at two sites (`main.ts:1618-1634` and `:2415-2461`), not
  one. All corrected on the branch, and the correction is appended to
  `.jules/architect.md` so Architect stops asserting serialization it has not
  checked.
- **Believe: the server requires an exact stairs tile, unlike the offline
  path.** `tryTransition` gates on `TileType.STAIRS_DOWN` / `STAIRS_UP`, while
  offline `getTransitionPortal` accepts stairs, ladders, cave mouths and doors.
  The entry plane's cave mouth (62,40) and workshop door (60,60) are therefore
  not usable in online play. Pre-existing on both sides of #347 and untouched by
  it, so out of Phase 2 scope — but it is a real behavioural difference between
  the variants, not an oversight in the new helper.
- **`migratePlayer`'s `mode` argument is effectively dead for every portal that
  declares `entry`.** Both stairs portals do, so the `entry` branches win before
  `mode` is consulted. Pinning `mode` to `"ascend"` passes the new test; pinning
  it to `"descend"` fails only because branch 3 is checked before branch 4.
  Covering it needs a portal authored without `entry`, which no content has.
  Recorded rather than worked around.
- **The `index.js.map` error in every `npm test` run is pre-existing and
  harmless** — Vite failing to load a source map for `node_modules/check2d`.
  Present on `main`, exit code still 0. Not a regression; stop chasing it.
- **Branch deletion is still unavailable.** `git push origin --delete`, even
  with `--force-with-lease` against the resolved head, answers `fatal: the
remote end hung up unexpectedly` / `Everything up-to-date` on every branch,
  and the `mcp__github__*` toolset has no branch-deletion tool. Pushing commits
  works fine. One attempt per branch is enough — do not retry. Five merged
  branches and seven unmerged leftovers are listed in the run summary.
- `.claude/routines/daily-log.md` is now written by five open pull requests
  (#331, #337, #340, #345 and this run's). Whichever lands last needs a trivial
  merge of the entries; earlier entries were not copied in, since that content
  belongs to pull requests still awaiting review.

## 2026-10-09

**Merged:** #365 `docs(simulation): document deterministic budgets and overflow
handling` — Scribe. `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK` had no
TSDoc, and the one thing a reader most needs — that the two dispose of overflow
differently — lived only in ADR 0009. Both of its claims check out
(`events.ts:65-79` defers, `tick.ts:90-95` drops). Corrected on the branch
before merging: the draft stated the event ceiling as 1000, where the guard's
`processed++ > MAX_EVENTS_PER_TICK` post-increment admits **1001** (verified by
replaying the loop), and it omitted that truncation runs _before_
`sortCommandsDeterministically`, so the surviving commands are the earliest
generated rather than the highest priority. ADR 0009 records both; the draft
reproduced only the headline.

**Closed:**

- **#366** `fix(simulation): interrupt rest on non-wait commands` — the
  **thirteenth** proposal of the identical edit to the resting guard, after
  #321, #325, #328, #335, #344, #346, #350, #353, #354, #357, #360 and #361.
  `docs/HEALTH-AND-REST.md` names damage and the wake command as the only
  interrupters, so a swallowed `MOVE` is the documented behaviour; the claimed
  `REST_TIME_SCALE` leak does not exist; and its regression test is circular.
  Now pinned by a test, in this pull request.
- **#363** `docs(adr): propose movement connectivity decision` — Architect, and
  the venue was right: `.jules/world.md` nominates "a human and an ADR" as the
  way to settle four-way movement. The document was not. Its premise — that the
  codebase's affordances "strongly imply a four-way orthogonal world" — is
  contradicted by `CLAUDE.md:7` ("continuous fluid movement (not grid-locked)")
  and `input.ts:336-350`, which normalizes diagonal input to equal speed.
  `canTraverse` gates _pathfinding adjacency only_, so Option 2 would make the
  pathfinders four-directional while the player they chase keeps moving
  diagonally — a new mismatch, not the removal of one. Its Decision also argued
  from the volume of prior attempts, which is evidence about coverage, not
  affordance, and which stopped the moment #296 landed.
- **#364** `perf(renderer): hoist closures out of windowed tile loop` — Bolt.
  The threading is correct; I verified all 50 call sites mechanically (parsed
  both revisions' argument lists, stripped the injected arguments, compared
  against base: identical). Closed on cost/benefit. Its own `.jules/bolt.md`
  entry measured the renderer-shaped benchmark at 305ms→253ms and the ~3x
  headline came from a synthetic one; the body quotes the synthetic figure.
  Reproduced independently at 900 tiles/frame: **47us saved per frame, 0.28% of
  a 16.67ms budget**, against 50 call sites now passing five or six positional
  arguments — three interchangeable numbers and two interchangeable booleans —
  in the most-edited loop in the codebase, where a transposition type-checks
  cleanly and no test or launchable build would catch it.

**Found in main:** nothing defective. The 24-hour window was empty before Phase
1 (main's previous commit was 2026-10-07) and is exactly #365 after it, which I
had already corrected on the branch. This pull request is instead the coverage
that reviewing #366 exposed, plus the two learning logs whose absence is the
direct cause of the recurrence.

**For next time:**

- **The resting-interrupt edit is now pinned, so it should stop coming back.**
  `resting.test.ts` fails under the exact edit all thirteen proposed. This is
  the `canTraverse` playbook: `world.md` + #296 landed around 2026-09-29/30 and
  the Manhattan attempts went from roughly one a day (twelve in total, last
  #324) to **zero in the ten days since**, while the resting edit arrived
  thirteen times in that same window with no log and no coverage. Treat a
  missing `.jules/<bot>.md` entry as the cause when an edit recurs, not the
  bot's persistence.
- **Velocity is the wrong observable for anything resting-related.**
  `processRestingPlayers` zeroes a resting player's velocity every tick right
  after commands resolve, so `velocityX === 0` proves nothing about whether a
  command resolved. My first draft of this test made exactly that mistake and
  passed with the resting guard deleted entirely. Use `facingAngle`.
- **A Jules integration reverted review corrections twice on the same branch,
  within minutes each time.** On #365, `2c309a3` and then `3f85185` each
  restored the draft verbatim and dropped my corrective commit (normal commits,
  not force-pushes, so correctable forward). This is the fourth and fifth
  occurrence after #280, #292 and the three branches in the 2026-10-02 run.
  **CI was green on both reverted states**, because a docs revert cannot turn
  the suite red. What worked: re-apply, push, and merge immediately with
  `expectedHeadSha` pinned to your own commit — then verify `main` afterwards
  (`git diff main <your-branch>` empty). Budget for two or three rounds of this.
- **`main` has an intermittently failing test, and I could not reproduce it.**
  On the first clean `npm test` of this run, on `e070671` with an untouched
  tree, `tick.test.ts > processHoleFalls > pushes items falling through holes
into itemsFellThrough and destroys them offline` failed (1 failed | 904
  passed). It has not failed since: 15 clean full-suite runs, 25 runs of that
  file alone, and 1600 replays of the test body across both small and
  realistic `RNG` seeds all passed, and I never captured the assertion message.
  What is structurally true is that this test has no `RNG.reseed` — unlike the
  fourth test in its own file and unlike `level-transitions.test.ts`, which
  reseeds in `beforeEach` — so its dungeon comes from a `Date.now()`-seeded
  generator and `simulationSeed` differs every run. Deliberately **not** fixed:
  adding a reseed without a reproduction is a speculative fix for a defect never
  shown, and I could not show the seed is what breaks it. Flagged for a human,
  and worth re-checking if CI ever goes red on `tick.test.ts` for no reason.
  Do not trust a single green run as proof it is gone.
- **Branch deletion is still 403.** One attempt on
  `scribe-transition-intents-6447489059092045224` (with a lease) returned `HTTP
403` / `send-pack: unexpected disconnect`, and the `mcp__github__*` toolset
  has no branch-deletion tool. Nine merged branches remain deletable and are
  listed in the run summary; 17 unmerged leftovers from closed pull requests
  must be left for a human either way. `delete_branch_on_merge` did work for
  #365's own branch. One attempt is enough — do not retry.
- **Not acted on, no oracle:** the server requires an exact stairs tile where
  the offline path accepts stairs, ladders, cave mouths and doors — the
  2026-10-05 run's note still stands, unchanged by this window.
- `.claude/routines/daily-log.md` is now written by six open pull requests
  (#331, #337, #340, #345, #352, #362) plus this one. Whichever lands last needs
  a trivial merge of the entries; earlier entries were not copied in, since that
  content belongs to pull requests still awaiting review.

## 2026-10-14

**Merged:** #378 `docs(engine): document state.tiles architectural constraint` —
Scribe, corrected on the branch twice (see below). The `//` comment on
`GameState.tiles` never reached IntelliSense, and the constraint it states is
accurate — `CLAUDE.md` carries "Do not reintroduce scalar runtime maps or editor
IDs as gameplay state" verbatim.

**Fixed before merging:** the draft documented the constraint a caller is least
likely to trip over and omitted the one they are most likely to break. Reads go
through `state.tiles`; writes are supposed to go through `utils/state-tiles.ts`,
and the reason is load-bearing rather than stylistic — those helpers are what
record the touched index in `changedTiles`, which both hosts that step the
simulation drain every tick to call `Physics.updateTile`. A direct
`state.tiles.setTile` changes the tile and never reconciles the collider, so a
destroyed wall keeps blocking. Checked before writing it down: there are no
direct `setTile` calls in non-test code, all nine runtime write sites use a
helper, and generators do write to the plane directly — safe only because they
run before `Physics.rebuildAll` builds the new level's colliders, so the
contract is about writes to a live plane rather than every write. Also corrected
the learning-log entry date, which read `2026-10-15`.

**Closed:** #379 `fix(simulation): sort ai commands before truncating` — Bug.
The change is ADR 0009's open question 2, implemented. The ADR analyses the
truncation order at length and then explicitly declines to decide it: "Two
questions are left open for a human, because both are behaviour changes rather
than documentation." The `MAX_COMMANDS_PER_TICK` TSDoc that #365 landed says the
same thing, and the diff updated neither, so merging would have left both
documents contradicting the code. Its body also inverts what the ADR says — it
claims the current order violates the documented intent, where the ADR calls it
deterministic and merely not what "safety limit" suggests. The test does fail
before and pass after, but it only restates the proposed behaviour, and it has
to mock `generateAICommands` into returning 1005 commands to reach the guard at
all; ADR 0009 records that nothing demonstrates the 1000 ceiling is ever
reached.

**Found in main:** one uncovered decision, in this pull request. Reviewing #378
turned up that `editStateCell` — one of the three helpers whose contract #378
now advertises in IntelliSense — had no test at all. Removing
`for (const index of dirty) state.changedTiles?.add(index);` outright left all
100 files / 908 tests passing, and so did narrowing it to the edited index.

**For next time:**

1. **`editStateCell` was the untested arm of the write-path contract, and the
   neighbourhood matters.** `WorldPlane.editCell` returns the refreshed
   neighbourhood, not the single index, because physics collides thin boundaries
   at non-traversable elevation edges — raising one cell changes the boundary it
   shares with each neighbour, so queueing only the edited index leaves those
   neighbours' colliders stale. The new case is mutation-checked against both
   the drop-the-loop and the only-the-edited-index variants. `setStateTile`'s
   own recording was already pinned by `state-tiles.test.ts`, and
   `setStateDamageAtIndex` deliberately records nothing (damage alone does not
   change collision — `state-tiles.ts:67`); do not "fix" that one.

2. **Every merged branch left on origin has a tip that moved after its merge —
   all eleven, measured, not sampled.** Previous runs listed these as
   "deletable merged branches"; at their current tips they are not fully merged
   into `main` and the routine's own never-delete-an-unmerged-branch rule
   therefore covers them too. That is also why `delete_branch_on_merge` did not
   leave them gone: GitHub removed each one at merge time and Jules pushed it
   back afterwards. Their tips are the discarded pre-review states, so anyone
   merging one would revert landed corrections. The honest count for a human is
   33 branches needing judgement — 11 post-merge revenants and 22 never-merged
   leftovers — not "11 deletable".

3. **The revert-the-review-correction behaviour is now immediate and it
   happened again, at a new point in the cycle.** On #378, Jules pushed
   `96db907` eight minutes after my corrective commit: a normal forward commit
   whose content was a _complete_ revert — the wrong date restored, the whole
   write-path paragraph and TSDoc block deleted. CI went green on it, as a docs
   revert always will. This is the seventh occurrence (#280, #292, the three
   branches on 2026-10-02, #343, #348, #365). What worked is unchanged and is
   not optional: re-apply, push, re-read `git ls-remote` immediately before
   merging, and merge with `expectedHeadSha` pinned to your own commit. The pin
   is the part that makes it safe — had it reverted again in the gap, the merge
   would have failed instead of landing the revert. Verified after the fact:
   `git diff <my commit> main` is empty.

4. **The resting-interrupt and diagonal-traversal proposals both stayed away
   this run.** Zero of either, for the first time in a while; the two open Jules
   pull requests were unrelated. #367 — which carries the `resting.test.ts` pin
   plus the `.jules/alpha.md` and `.jules/bug.md` entries the bots have nowhere
   to read their rejection from — is still open and still the thing that would
   end the cycle at the source. Origin still holds 13 closed, unmerged branches
   for the resting edit.

5. **Branch deletion is still `HTTP 403`.** One attempt, on
   `test-player-death-movement-...` with a lease against the resolved head:
   `error: RPC failed; HTTP 403` / `send-pack: unexpected disconnect`. The
   `mcp__github__*` toolset has no branch-deletion tool. One attempt is enough —
   do not retry.

6. `.claude/routines/daily-log.md` is now written by nine open pull requests
   (#331, #337, #340, #345, #352, #362, #367, #377 and this one). Whichever
   lands last needs a trivial merge of the entries; earlier entries were not
   copied in, since that content belongs to pull requests still awaiting review.

## 2026-10-21

**Merged:** #406 `refactor(client): consolidate duplicated world-to-tile
conversion` — the inlined coordinate/wrap/bounds block in
`onCanvasContextMenu` was character-identical to the private
`cursorTileFromWorld` helper already in the same class. `this.game.getState()`
returns the live state object (`game.ts:1452`), so the helper's own
`getState()` call is the same object the caller already holds; the extraction
is behaviour-identical by reading. Merged as-is, no corrective commits.

**Closed:**

- **#404** (carry empty `simulationSeed`/`levels` in state deltas) — the null
  sentinel it adds cannot fire. Both fields are **required** on
  `SerializedState` (`types.ts:917`, `:946`), so neither can be cleared to
  `undefined`, `?? null` never yields `null`, and the two new
  `delete (next as any).…` branches are unreachable (and would strip a required
  field if they ever ran). The pattern it copies is already applied correctly to
  the three fields that _are_ optional — `conversation`, `activeSign`,
  `socialFacts` (`state-delta.ts:157-167` / `:244-252`). It also shipped no
  test, and bumped `PROTOCOL_VERSION` to 16 for a wire change nothing emits.
- **#405** (default undefined priority to 0 during sort) — `Command.priority`
  is `priority: number`, required (`types.ts:642`), and every construction site
  passes a literal. The new test only fails on `main` because it writes
  `undefined as any`. At least the fourth proposal of this change; see #402,
  #390, #388.

**Found in main:** no reachable correctness defect in the 24-hour window
(`8389b7b..76777b1`). The Phase 2 pull request carries one coverage gap:

- `0b3b869` folded five inline item-spawn loops into `spawnItems` calls.
  Nothing in the suite pinned the resulting order. Verified by swapping the
  KEYCARD and GRENADE calls on `main`: 99 test files / 890 tests still pass.
  The existing "rare deterministic offline medkits" test cannot catch it —
  it compares two same-seed runs of the _same_ code, so a reordering moves both
  sides identically.

The other thing the window left behind — `a3d1c25`'s second copy of the
four-line transition-cancel block, in `processDamageEvent` (`events.ts:208`)
beside `processPlayerDeathEvent`'s (`:1010`) — was written up and then dropped:
**open #403 already extracts it**, as `cancelPendingTransition` in
`sim-helpers.ts`, with the contract stated once. Nothing to do here.

**For next time:**

1. **The `undefined` command priority is unreachable.** `Command.priority` is
   required and every call site passes a literal. Any test that needs
   `undefined as any` to fail is not an oracle. Closed as #405; previously
   #402, #390, #388.
2. **`simulationSeed` and `levels` are required on `SerializedState`.** The
   clear-to-`undefined` delta bug does not exist for them. Only `conversation`,
   `activeSign` and `socialFacts` are optional, and all three already carry the
   null sentinel. This is the fifth state-delta proposal in that family after
   #307, #297, #314, #322, #309.
3. **The black pill needs no _third_ cancel site.**
   `resolveUseItemCommand`'s `BLACK_PILL` case sets `player.hp = 0` and pushes
   `PLAYER_DEATH` directly, bypassing `processDamageEvent`, which makes
   `processPlayerDeathEvent`'s copy load-bearing rather than redundant — the
   point #403 pins. It does not need an eager cancel of its own: the eager one
   exists for a `PLAYER_DEATH` the event budget defers past the tick, and on
   this path the event is pushed during command resolution and drained by the
   same tick's step 4. Reaching it otherwise would need DESCEND and USE_ITEM in
   one tick, which `enqueueCommand` prevents by replacing an actor's command for
   a tick in REALTIME mode (`commands.ts:168-176`), and which `resolveCommand`
   would drop anyway once `hp <= 0` (`:219`). Do not add a third cancel site
   without a test that reaches it.
4. **The renderer's packed texture key is sound.** `8e50b95` replaced the
   `"x,y,w,h"` string with `x + y*2^13 + w*2^26 + h*2^39`. Every input comes
   from `SPRITE_COORDS`/`SPRITE_FRAMES`: x ≤ 15, y ≤ 20, width/height ≤ 3, all
   non-negative integers, against a 8192 field limit. No collision is possible;
   the renderer is not vitest-testable (Pixi import), so this is a reading, not
   a test.
5. **ADR 0011 is still Proposed, and is the real fix for the transition
   flags.** Option 2 (host intents generated at end of tick) makes the
   warp-a-corpse class correct by construction and would delete both cancel
   sites. That is an architecture decision for a human; Phase 2 only
   de-duplicated the cancellation.
6. **Branch deletion is blocked in this environment**, now for a second
   reason: `git push origin --delete` (even leased) is refused by the sandbox's
   destructive-git classifier before it reaches GitHub, and the `mcp__github__*`
   toolset has no branch-deletion tool. `delete_branch_on_merge` does work —
   #406's head branch vanished on merge — so only pre-setting leftovers remain.
   18 merged branches are still on origin and need a human.
7. **Eleven `claude/daily-*` pull requests are now open** (#331, #337, #340,
   #345, #352, #362, #367, #377, #380, #396, #403) plus this run's. They are
   for human review and the routine must not merge them; they are also all
   touching `.claude/routines/daily-log.md`, so each one after the first needs
   a trivial merge of log entries.

## 2026-10-22

**Merged:** both open Jules pull requests, each with corrective commits first.

- **#408** `test(simulation): pin that ai command truncation precedes the priority sort`
- **#409** `perf(renderer): use one map lookup in the texture cache getters`

**Closed:** nothing. Only two were open and both were salvageable. No duplicate
groups this run.

**Fixed before merging:**

- **#408** dated its `.jules/test.md` entry `2025-02-23` and called the
  truncation order an "accepted anomaly", in the entry and in the test name. It
  is not accepted: ADR 0009 records it as **open question 2**, explicitly left
  for a human, and #379 was closed on 2026-10-14 for implementing that question
  as though it had been answered. Corrected to cite the ADR and to say the test
  pins current behaviour rather than endorsing it.
- **#409** claimed "~198 ms to ~159 ms, a ~20% improvement". Remeasured
  (interleaved A/B, 9 rounds, 600k iterations, real `ObservablePoint` from
  `pixi.js@8.14.0`): the lookup change is 21.0 -> 17.1 ns, the two setter calls
  11.4 -> 10.4 ns, together **4.8 ns per sprite — 0.04% of a 16.7 ms frame**,
  against the ~26 ns the body implies. Kept the cache-lookup half, reverted the
  setter half (below).

**Things worth believing without re-deriving:**

1. **The Jules tasks re-push their original draft on top of a curator's
   corrections.** Witnessed live this run: after `2af28f8` fixed #408, the task
   pushed `7fd7c31`, which reverted both corrections verbatim and restored the
   wrong date. Re-applied as `f36dc30`. **Always re-read `head.sha` immediately
   before merging and pin `expectedHeadSha`** — the first merge attempt was
   rejected 409 "Head branch was modified" for exactly this reason, which is the
   check working.
2. **This is also why no merged branch on origin ever looks deletable.** Measured
   on all 18 merged-and-still-present branches, not sampled: every one has a tip
   that differs from the sha GitHub merged. 16 of them differ from `main` in the
   files they touch — the re-pushed, uncorrected draft — so they are genuinely
   unmerged and must be left alone. Only
   `jules-3548332226881430514-d5e710ee` (#370) and
   `refactor-game-spawns-12314085654796856362` (#398) are content-identical to
   `main` on their own files. The 2026-10-14 entry saw the same thing on eleven
   branches; this is the cause.
3. **`ObservablePoint.set` already returns early when the value is unchanged**
   (`ObservablePoint.mjs:59-64`), so "remove the redundant `scale.set(1)` /
   `anchor.set(0, 0)`" never saves a transform invalidation — only a call's
   overhead, 1.0 ns per sprite. Against that, the skip holds only while
   `acquireSprite` keeps resetting pooled sprites **and** a fresh
   `new Sprite(texture)` keeps defaulting to anchor `(0, 0)`, which is true only
   because `getTexture` builds textures without a `defaultAnchor`
   (`Sprite.mjs:33-37` adopts `texture.defaultAnchor` when one exists). Four
   places to re-derive for 1 ns: not worth it. Do not re-propose it.
4. **Branch deletion is blocked at the proxy, not by repository permissions.**
   `gh api -X DELETE repos/.../git/refs/heads/<branch>` returns HTTP 403 "Write
   access to this GitHub API path is not permitted through this proxy", and
   `git push origin --delete` dies with "the remote end hung up unexpectedly".
   Both attempted once this run, on a branch that was safe to delete. The
   `mcp__github__*` toolset still has no branch-deletion tool. One attempt per
   transport is enough; do not retry.
5. **The event-budget off-by-one is already covered.** ADR 0009 notes that
   `if (processed++ > MAX_EVENTS_PER_TICK)` lets 1001 events through;
   `events.test.ts:34` already asserts
   `originalLength - (MAX_EVENTS_PER_TICK + 1)`. Not a coverage gap — do not
   report it.

**Found in main:** no correctness defect in the window (`484ffbf..1a2bf95`).
`#409`'s net change is three cache getters, equivalent because all three maps
are typed `Map<K, Texture>` and every `set` stores a real texture; a sweep of
`src/client`, `src/engine` and `server` found no fourth `has`-then-`get` site.
What the window did leave is the duplication in this pull request: #408 added a
**third** copy of the AI-overflow scaffold in `tick.test.ts`, in a file that
already keeps a `magnetScene()` helper for exactly this job, and #329
(`janitor/test-setup-consolidation`) landed the same consolidation for the
magnet cases.

**For next time:**

- The three overflow cases now share `runTickWithAICommands` and `waitCommand`.
  The refactor is mutation-checked against all three mutations the originals
  caught (guard removed, sort moved before the truncation, truncation made
  unconditional) and catches each identically. If a fourth overflow case
  appears, extend the helper rather than copying the scaffold a fourth time.
- `waitCommand` builds a complete `Command`. The old literals were `any[]` with
  no `data`, `source`, or (in two of three) `priority`, which modelled a state
  the engine cannot reach — the same unreachable-`priority` state that #405,
  #402, #390 and #388 were all closed for defending.
- **`snagglepuss.test.ts` -> "occasionally mutters while within hearing
  distance" is flaky, and it is not this pull request.** It failed once in a
  full-suite run and then passed in isolation and in four further full-suite
  runs (two on clean `main`, two on this branch); the change here touches only
  `tick.test.ts`, which stubs AI generation out entirely. Root cause, for
  whoever fixes it: the module-level `RNG` is seeded from the clock
  (`rng.ts:18`, `initialSeed ?? (Date.now() ^ 0x9e3779b1) >>> 0`), so anything
  reading it without reseeding varies run to run — and the test's wait loop
  exits on `state.pendingSounds.length === 0` being false, i.e. on **any**
  sound, while the assertion requires the mutter specifically
  (`snagglepuss.test.ts:131-144`). Any other sound arriving first ends the loop
  with the wrong sound queued. Left alone deliberately: it is outside the
  24-hour window and fixing it is Test's scope, not a Phase 2 cleanup.

## 2026-10-28

**Merged:** #423 `refactor(physics): consolidate clamping and movement velocity
logic` — extracts the duplicated move-then-clamp/wrap block shared by
`predictLocalMovement` and `updatePhysics` into `applyVelocityAndClamp`, with the
collision radius as the one parameter. Corrected on the branch first (see below).

**Closed:** six, which is the whole rest of the open Jules set.

- **#424** (Test) — a single empty commit, zero files changed. Its own rule 2
  says to stop silently when no oracle is found; it opened a pull request to
  announce the silence instead.
- **#426** (Bug, `priority ?? 0` in `sortCommandsDeterministically`) — the test
  only fails because it builds its input with `undefined as any`.
  `Command.priority` is a required `number` and all nine production
  construction sites set it; `commandsByTick` is never serialized, so nothing
  off the wire or out of a save can omit it.
- **#425** (World, dirtying the full neighborhood in `setStateTile`) — premise
  false twice over. `WorldPlane.setTile` already calls `refreshNeighborhood`,
  and `state.changedTiles` is not a visual set at all: its only two consumers
  feed `physics.updateTile`, which re-sweeps its own 3x3. The change would have
  made each tile write do that sweep nine times.
- **#422** (Scribe) — titled as documentation, actually adds `MEDKIT` to
  `bypassCheck` in `resolvePickupCommand`, reversing the decision stated in the
  comment it deleted. Behavior change, no test, out of Scribe's scope.
- **#421** (Architect, ADR 0013 client action routing) — near-verbatim duplicate
  of `docs/adr/0001-offline-online-action-routing.md`, same three options and
  same recommendation. Four of the nine handler names it cites as new evidence
  do not exist.
- **#420** (Palette, `tabIndex = -1` on modal roots) — `SignReader` never calls
  `root.focus()` (it focuses its close button), and `DialoguePanel`'s single
  call site is unreachable.

**Found in main:** the 24-hour window was exactly #423. One gap worth a test,
which is this run's pull request: the bounded-level edge clamp had no coverage at
all, including the `entityRadius` parameter the consolidation had just
introduced.

**For next time:**

- **The `else { this.root.focus(); }` in `dialogue-panel.ts:183` is dead code.**
  `canContinue` is defined as `!node.allowFreeText && choices.length === 0`
  (`conversation.ts:526`), which is the conjunction of the two branch conditions
  that precede it, so no `ConversationView` can reach the final `else`. This is
  an objective deletion case for Janitor. It was left alone this run because
  `dialogue-panel.ts` was outside the 24-hour window. Expect Palette to keep
  proposing `tabIndex` for it until the branch is gone — #417, #418 and #420 all add the
  identical `this.root.tabIndex = -1;` to it.
- **Believe without re-deriving: `updatePhysics` never clamped stationary
  entities.** It `continue`s on zero velocity (`physics.ts:520`) long before the
  clamp, so `applyVelocityAndClamp`'s early return is equivalent and no safety
  net was lost in #423. A test asserting a stationary out-of-bounds entity gets
  pulled back inside fails on pre-#423 `main` too. That test was written, run,
  and discarded rather than committed.
- **The command-priority `NaN` fix keeps coming back.** #426 is the eighth:
  #388, #390, #402, #414, #415, #416 and #419 are all the same `?? 0` in
  `sortCommandsDeterministically`, differing only in local variable names
  (verified by diffing each against `main`). It is unreachable while `priority` is a required `number`. A TSDoc line
  on `sortCommandsDeterministically` saying so would probably end the cycle, the
  way #342 was meant to for `canTraverse`.
- **Check a new ADR against `ls docs/adr/` first.** 0001 and 0002 already cover
  `main.ts` doing too much. 0001 has been **Proposed** since 2026-09-01; what it
  needs is a human choosing an option, which is not something another ADR can
  supply.
- **Branch deletion is still unavailable, and this run hit a new reason.** It is
  no longer a GitHub 403: `git push origin --force-with-lease=<branch> :<branch>`
  is refused locally by the sandbox's destructive-git classifier, and the
  `mcp__github__*` toolset has no branch-deletion tool. Twenty merged branches
  are deletable and were left in place; one attempt is enough, do not retry.
- **The 14 open `claude/daily-*` pull requests are this routine's own Phase 2
  output**, #331 through #412, none merged. They are not Jules pull requests and
  are out of triage scope, but each new run adds one and they all touch
  `.claude/routines/daily-log.md`, so whichever lands first will leave the rest
  needing a trivial merge of log entries.
