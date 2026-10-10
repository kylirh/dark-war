## 2026-10-09 - A non-WAIT command does not interrupt rest; stop proposing that it should

**What was found:** The guard at
`src/engine/systems/simulation/commands.ts:229` discards any non-`WAIT` player
command issued while `player.resting`, without ending the rest:

```ts
if (player?.resting && cmd.type !== CommandType.WAIT) return;
```

This has been reported as a bug — a missing `stopPlayerResting(state, player)`
call before the `return` — in thirteen separate pull requests: #321, #325,
#328, #335, #344, #346, #350, #353, #354, #357, #360, #361 and #366. All
thirteen were closed. Several were character-for-character identical.

The guard is the contract, not a bug. `docs/HEALTH-AND-REST.md` names exactly
what ends a rest:

> Rest restores one HP every 30 simulation ticks (1.5 seconds of simulated
> time), players take double incoming damage while resting, and any damage or
> wake command interrupts it.

Two interrupters: damage, and the wake command. The wake command is `WAIT`
itself — `resolveWaitCommand` calls `stopPlayerResting` when the player is
already resting (`commands.ts:304-307`). A `MOVE` is neither of those, so
having it swallowed is the documented behaviour rather than a violation of it.

Both supporting claims these pull requests make are also false:

- **There is no `REST_TIME_SCALE` leak.** All three assignments are gated on
  `player.resting` (`commands.ts:324` and `:326` inside `resolveWaitCommand`
  after `resting = true`, and `main.ts:1664` inside an `else if
(player.resting)` branch), and `stopPlayerResting` (`sim-helpers.ts:88-97`)
  resets both `state.sim.timeScale` and `state.sim.targetTimeScale`
  synchronously. No path leaves the 8x scale set with `resting` false, which is
  exactly the document's "Waking immediately returns the simulation to its
  normal time scale".
- **The regression test each one ships is circular.** It asserts
  `expect(player.resting).toBe(false)` after an ignored command — the behaviour
  the change itself introduces. It fails without the change for that reason
  alone, and nothing independent of the pull request says `resting` should be
  false there.

Whether a direction press _should_ wake the player is a real question, but it
is a pacing decision for a human: it trades a silently swallowed input against
accidental rest cancellation, and `docs/HEALTH-AND-REST.md` answers it the
other way today.

**Action:** None to the resting code. Covered instead — `resting.test.ts` now
pins the discard-and-keep-resting decision, mutation-checked against the exact
edit all thirteen proposed. A fourteenth attempt fails CI rather than needing
review.

Two things are worth knowing about that coverage. The reason the edit kept
looking correct is that until now nothing covered this decision, so every one
of the thirteen could report `npm test` passing and be telling the truth.
And velocity cannot serve as the observable: `processRestingPlayers` zeroes a
resting player's velocity every tick, immediately after commands resolve, so
`velocityX === 0` holds whether or not the command was discarded. The new test
uses `facingAngle`, which a resolved `MOVE` sets and the rest path never
touches.

**Prevention:** Before reporting a guard clause as a missing cleanup call, find
the document that defines the state it guards and read what that document says
ends the state. A test asserting your own new behaviour is not an oracle. And a
green suite is evidence only where coverage exists — check that the behaviour
you are changing is actually tested before treating "all tests pass" as proof
the change is safe.
