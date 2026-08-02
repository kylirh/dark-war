# Actors and Social Systems

This document is the canonical design for Dark War's actor, social, interaction,
relationship, conversation, and living-world systems. It supersedes any earlier
"NPC" or "Mind" framing. Read it with `docs/TERRAIN-AND-WORLD.md` and
`docs/ROADMAP.md`.

## Thesis

There is no `NPC` entity type and there is no monolithic "mind." **"NPC" describes
how an entity participates in the world, not what it fundamentally is.** A wild
dog, a workshop builder, a Snagglepuss, a vending machine, and a terminal are the
same kind of thing wearing different, independently-optional capabilities.

Behavior comes from small orthogonal components plus a legible decision layer, not
from a bag of traits or a type tag:

- **Capabilities are opt-in.** An entity that cannot talk carries no dialogue.
- **Occupation is authored and stable.** A builder stays a builder while fleeing.
- **Stance is derived and dynamic.** "Hostile"/"friendly"/"monster" is a
  _relationship read_, not an occupation and not an entity type.
- **Emergence is legible.** Every decision is inspectable and deterministic;
  authored pins guarantee story-critical behavior.

`EntityKind` remains a purely physical/runtime discriminator
(`PLAYER`/`MONSTER`/`ITEM`/`BULLET`/`EXPLOSIVE`). It is never used to decide
whether something is an "NPC." (`MONSTER` may later be renamed `CREATURE`; not in
scope here.)

## Composable components (all optional, all on the same entity)

Instead of one `Mind`, an entity may carry any subset of these:

| Component                   | Holds                                                       | Example carriers                     |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| `social`                    | authored identity, voice, `socialDefId`, dialogue reference | builder, Snagglepuss                 |
| `interactable`              | affordances: talk, give, trade, recruit, inspect, use       | builder, vending machine, terminal   |
| `agent`                     | perceives, selects goals, runs multi-step activities        | builder, Snagglepuss, most creatures |
| `occupation`                | authored, stable job: builder, trader, guard, resident      | builder                              |
| existing combat / inventory | health, weapons, carried items (already on `Monster`)       | Snagglepuss, monsters                |

A vending machine has `interactable` (trade) with no `agent` and no hunger. A
terminal informs without pretending to think. A mindless animal has `agent`
without `social`. This orthogonality is the whole point.

### Relationships are NOT a component on the entity

A relationship is an **edge between two actors**, not an intrinsic property of one.
It lives in a world-level store, not on the entity:

```
RelationshipGraph.get(sourceId, targetId): RelationshipState
```

Why this matters:

- In multiplayer the builder relates to each player differently.
- Some social knowledge is player-specific and private (player A's standing must
  not leak to player B).
- Relationships survive the entity changing planes.
- Faction reputation and NPC-to-NPC relationships reuse the same model.
- A relationship change must **not** resend the physical entity — entity identity
  and position are shared world state; relationship state is separate, and partly
  per-player.

`RelationshipState` v1 is a small vector: `{ affinity, fear, grievance }`. Add
`trust` when promises/information matter; add `obligation` when transactions and
favors exist. Faction reputation is stored separately from personal relationships.

## The five-layer decision model

Utility scoring selects **goals on a slow cadence**, not low-level actions every
tick. This keeps behavior coherent and intelligible instead of oscillating.

1. **Perception & beliefs** — observe nearby entities, attacks, gifts, work
   targets, sounds, remembered locations. Beliefs are distinct from world facts.
2. **Hard interrupts** — immediate danger, incapacitation, active conversation,
   scripted commitments, path failure.
3. **Goal selection** (periodic) — score goals: survive, confront, converse,
   trade, work, return home, follow owner, etc.
4. **Activity execution** — coherent multi-step activities with commitment
   ("walk to damaged wall → repair → fetch materials → resume"), with hysteresis
   so NPCs do not thrash between goals.
5. **Tactical executors** — reuse existing combat, movement, pathfinding, repair,
   pickup, and firing logic. The decision layer chooses _whether_ to fight/talk/
   flee/work; the executors are unchanged.

Integration: `generateAICommands` generalizes from "filter `MONSTER`" to "iterate
`agent`-bearing entities that can act." When the chosen action is _attack_, it
delegates to the existing archetype command builders. Non-agent entities are
untouched.

### Legibility guardrail (non-negotiable)

The decision layer exposes its scored breakdown for a dev inspector (current
goal, activity, perceptions, candidate scores). Emergent, never opaque. This is
the same lesson applied to WFC and the terrain resolver.

## Beliefs and deception

Deception is **not** a random `honesty` trait emitting falsehoods. It is authored
dialogue plus a belief model:

```
belief: { subject, claim, confidence, source }
```

An NPC's beliefs are distinct from objective world facts. An **honest** NPC can
still be wrong (bad belief). A **dishonest** NPC knowingly substitutes an authored
false claim. That distinction is what makes deception meaningful rather than
arbitrary. (Beliefs land later; see phasing.)

## Determinism

Gameplay still has legacy sequential RNG call sites, but actor goal selection and
ambient Snagglepuss decisions now use stateless keyed rolls. Actor decisions do
not depend on rendering order or a mutable random stream.

Use **stateless keyed rolls**, not a mutable "stream":

```
deterministicRoll({ simulationSeed, actorStableId, decisionEpoch, purpose, ordinal }) -> [0,1)
```

Rules:

- `simulationSeed` is a durable value in the serialized `GameState` contract.
- `decisionEpoch` is a persisted per-actor counter, not merely the current tick.
  Persist any counter whose advancement affects future behavior.
- `purpose` is a distinct string key per decision kind, so adding a cosmetic bark
  roll cannot perturb combat decisions.
- Never consume randomness merely because rendering occurred.
- Foundation A replaced the stray `Math.random()` with a keyed roll. It did
  **not** convert every RNG call in the game.

Stateless keyed selection is order-independent and easy to debug, provided the
identity and epoch inputs are stable.

## Serialization and netcode

Entities serialize through per-player DTOs; deltas compare serialized entities by
value. The rules:

- **Explicit deep DTO boundary.** Serialized output must share **no mutable
  references** with live state. In-place mutation of nested social/component state
  must never silently alter a delta baseline. Do not use
  `JSON.parse(JSON.stringify(...))`; serialize supported fields deliberately.
- **Relationship graph serializes separately** from entities, with per-player
  privacy scoping (A's standing is not shipped to B).
- **Consumed-marker ledger** (below) serializes with the world/plane.
- Component deltas (per-component encoding) wait for measurement; start with
  whole-entity upserts + the deep DTO boundary. Bump `PROTOCOL_VERSION` when the
  wire format changes.

## Spawn provenance and idempotence

Prefab spawn markers (e.g. the workshop's `npc.builder`) are currently parsed and
then discarded. Consuming them safely requires more than a stable id:

- **Stable marker key** = `world address + prefab instance identity + marker id`.
  Not just prefab key + marker name — the same prefab may be stamped more than
  once.
- **Serialized consumed-marker ledger**: `consumedSpawnMarkers: Set<StableMarkerId>`.
  A marker is consumed exactly once. "Does an entity with this id exist?" is the
  **wrong** idempotence test, because the spawned actor may be alive elsewhere,
  recruited, dead, or removed — none of which should re-trigger the marker unless
  an explicit respawn rule says so.

## Conversation

Conversation is a **server-authoritative, per-player session**:

```
ConversationSession { playerId, speakerId, nodeId, availableChoices, revision }
```

- Choices, purchases, gifts, recruitment, and quest acceptance are **explicit
  validated commands**, not client-side UI effects.
- **Offline** may pause the local loop and slow time; there is always a guaranteed
  close/resume path.
- **Online is real-time and shared** — conversation is non-blocking and never
  alters the shared time scale. Offline full conversations use their own
  guaranteed pause/resume reason; one-shot `NPC_TALK` lines never pause.
- Two players can converse with the same speaker independently.

Dialogue is authored as **validated TypeScript definitions compiled into a runtime
graph** (conditions, player responses, effects, relationship requirements,
remembered choices, quest/trade hooks, belief references, truth/omission/deceptive
variants). Tiled is a spatial tool and is **not** used for dialogue. Move to
JSON / Yarn Spinner / Ink only if authoring volume justifies it.

## Living-world continuity across plane sleep/wake

Inactive planes do not simulate (`docs/ARCHITECTURE.md`). Therefore:

- No detailed offscreen walking simulation.
- Advance schedules/needs **coarsely and deterministically** when a plane wakes.
- Apply only bounded authored work progress on wake.
- Never let offscreen catch-up destroy important objects or resolve major story
  events invisibly.

## Implementation program

Narrow, mergeable deliverables (per `docs/ROADMAP.md`). Each ships green
(type-check + tests) and is independently valuable.

The foundation and first three playable slices below are implemented on
`claude/npcs-living-world`. The descriptions remain as the architectural record
and acceptance criteria for future actor work.

### Foundation A — Serialization & determinism correctness (no NPC behavior)

**Status: COMPLETE**

Independently justified: it fixes real desync/nondeterminism hazards regardless
of NPCs.

- Explicit entity DTO serialization with **no shared mutable references**;
  regression test proving a nested-field change actually produces a delta and that
  serialized output does not alias live state.
- Add a durable serialized `simulationSeed` to the `GameState` contract.
- Add `deterministicRoll(...)` (stateless keyed) and replace the stray
  `Math.random()` in the AI path with it.
- Bump `PROTOCOL_VERSION`.
- No actors, no dialogue.

**Exit:** serialization/determinism are correct and tested; nothing behaves
differently in play.

### Foundation B — Authored social actor (no conversation yet)

**Status: COMPLETE**

- Stable marker-derived identity + serialized consumed-marker ledger; idempotent
  spawning (revisit/regenerate cannot duplicate; dead/recruited/migrated do not
  respawn).
- `social` + `interactable` components and static content definitions
  (`socialDefId`, interaction affordances) separate from dynamic state.
- Consume the workshop's `npc.builder` marker: spawn the **stationary builder**.
- `INTERACT` on the builder produces a simple story-log greeting or inspection.
- No conversation session yet.

**Exit:** the builder reliably exists, is spawned once, and can be inspected.

### Slice 1 — Real conversation

**Status: COMPLETE**

- Server-authoritative per-player conversation sessions.
- Dialogue graph + validated choice commands; a real client dialogue panel.
- Offline pause has a guaranteed close/resume; online is non-blocking and never
  alters shared time scale.
- Relationship graph (world-level, per-player) with v1 `{affinity}` at minimum;
  the builder remembers one social fact / choice per player.
- Two-client integration test.

**Exit:** the builder can be talked to safely offline and in two-player online, and
remembers a choice per player.

### Slice 2 — The builder as quest/utility giver (the headline goal)

**Status: COMPLETE**

- The builder **gives the player the CTDM and the Matter Manipulator** through
  conversation, encountered near game start.
- **Remove the CTDM and Matter Manipulator from world spawning** once the builder
  is the source.
- Builder gains a home/work region, a schedule, and real repair activity
  (existing repair/terrain systems), interruptible by threat response.

**Exit:** a new game begins by meeting the builder, who equips the player; those
items no longer spawn loose in the world.

### Slice 3 — Snagglepuss: hostility, conversation, bargaining, recruitment

**Status: COMPLETE**

The unified-actor proof. The same creature can threaten, converse, bargain,
betray, reconcile, and accompany the player.

- Give Snagglepuss `social` + `interactable` + `agent`, keeping its existing
  theft/flee/befriend behavior as activities.
- Route damage, gifts (cookie), theft, help, and dialogue into the relationship
  graph (`affinity`, `fear`, `grievance`).
- "Won over" is a relationship state, not a single boolean flip; once won over it
  can be **talked to and interacted with like a friendly NPC** and may transition
  into companion/guide/trader activities while retaining its species personality.
- Replace `friendly` as the ultimate authority with a derived allegiance/stance
  read from the relationship graph.

**Exit:** Snagglepuss can be won over and then talked/interacted with as a friendly
NPC, without ceasing to be a Snagglepuss.

### Later

Trade/quest contracts, beliefs & authored deception, factions & reputation,
settlement growth, schedules across sleep/wake, ambient social life, emotes.

## Completed branch outcome

1. A friendly **workshop builder** the player meets basically at game start, who
   **gives the CTDM and the Matter Manipulator** via conversation.
2. **Remove** the CTDM and Matter Manipulator from being spawned loose in the main
   world.
3. **Snagglepuss** becomes an actor that can be **won over** and then **talked to
   and interacted with like a friendly NPC**.

All three now operate through the systems above. Marda additionally performs
bounded repair work inside her authored home region, pauses for conversation,
and interrupts work when threatened. Snagglepuss theft, cookie gifts, damage,
bargaining, recruitment, release, and betrayal update the relationship graph;
its companion and hostile stances are derived from those per-player edges.

The active plane and every cached plane persist a consumed spawn-marker ledger.
Agent goal epochs, selected activities, and scored candidate breakdowns persist
with the actor. Multiplayer sends each player only their conversation view and
private social facts, and a live two-client integration test exercises concurrent
sessions with Marda.

## Locked decisions

- Relationship v1 `{affinity, fear, grievance}`, stored in a world-level graph;
  add `trust`/`obligation` when promises and transactions exist.
- Determinism: stateless keyed rolls with a serialized `simulationSeed` and
  persisted decision epochs (not a mutable "stream").
- Serialization: explicit deep DTOs + whole-entity upserts initially; deliberate
  field serialization (not `JSON.parse(JSON.stringify)`); component deltas only
  after measurement.
- Dialogue authoring: validated TypeScript definitions compiled to a runtime
  graph; not Tiled.

## Non-goals

- An `EntityKind.NPC`, a monolithic `Mind`, or a trait-only role derivation.
- Pure threshold-cascade emergence as the authority for behavior.
- Offscreen walking simulation.
- Dialogue authored in Tiled.
- Converting all RNG usage to keyed rolls in one step.

## Coordination

Player/NPC **speech bubbles** remain an ephemeral presentation channel. The
actor/social/relationship/conversation domain owns authoritative choices and
state; callouts only render speech and never become dialogue or save state.
