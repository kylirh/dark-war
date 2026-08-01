# World Callouts

World callouts are short, ephemeral expressions anchored to a character or a
world position. They cover three presentation forms:

- `speech`: a compact warm speech bubble;
- `thought`: a lavender cloud bubble;
- `reaction`: client-owned artwork and lettering selected by a semantic ID.

They are deliberately separate from dialogue. A callout carries no choices,
conversation session, quest state, or simulation pause. Longer or consequential
conversations belong in the dedicated dialogue UI.

## Runtime contract

`WorldCallout` is a discriminated union in `src/engine/types.ts`. A callout has a
stable event ID, optional `speakerId`, fallback world coordinates, and priority.
Text callouts carry at most 96 normalized Unicode code points. Reactions carry a
semantic `WorldReactionId`, never a sprite coordinate or presentation string.

Simulation code emits through `src/engine/utils/world-callouts.ts`:

```ts
emitWorldTextCallout(state, {
  kind: "speech",
  text: "The bridge is open!",
  speakerId: builder.id,
  priority: "normal",
});

emitWorldReaction(state, {
  reactionId: "gasp",
  speakerId: witness.id,
});
```

Always use these helpers. They sanitize text, resolve the speaker's current
position, copy audience lists, generate event identity, and bound the transient
queue. Do not add bubble state to an entity and do not write bubble text into
the story log unless the line is independently important enough to remain
there.

## Client behavior

The client deduplicates snapshot retransmissions, queues at most two waiting
callouts per speaker, and displays at most six concurrently. Durations use wall
clock time, so CTDM and pauses cannot make a short line unreadably brief or
indefinitely persistent. One speaker cannot stack several bubbles on top of
itself.

The Pixi layer follows moving entities, handles the outside world's wrapped
images, respects FOV, clamps to viewport edges, and shifts overlapping callouts.
It renders above characters but below DOM menus. Speech, thoughts, and reactions
share lifecycle and placement while retaining distinct visual treatments.

Player input uses `T` for speech and `Shift+T` for thoughts by default. The
small DOM composer does not pause offline or online simulation. Enter or the
Send button submits; Escape cancels. The binding is remappable as
`Speak / Think` in preferences.

## Multiplayer and persistence

Online player text is a `SPEAK` network action. The authoritative server:

1. verifies the action belongs to the connected player;
2. validates kind and text;
3. applies the shared sanitizer and length cap;
4. rate-limits accepted lines;
5. anchors the callout to the authoritative player entity; and
6. broadcasts it to players on that world plane.

Callouts ride both keyframes and deltas, then the server clears the per-world
queue after every client has been serialized. Client event-ID deduplication
prevents a keyframe or repeated state from replaying a bubble.

Callouts are intentionally absent from save-slot records and ignored by game
deserialization. They are presentation events, not world facts. An authored
relationship change or remembered conversation choice must live in the NPC
system instead.

## Content discipline

Use callouts for flavor, readable tactical intent, acknowledgements, and rare
emotional punctuation. Do not translate every damage event into `POW!`; frequent
automatic reactions become noise and obscure more meaningful character beats.
Add new semantic reaction IDs only when their treatment will be reused. Resolve
all wording, color, shape, and animation for that ID in the client layer.

The initial production examples are intentionally restrained: Snagglepuss
occasionally mutters a short authored line, and a content utility bot shows a
heart when it nuzzles. NPC dialogue systems can emit through the same helpers
without depending on the player composer or duplicating renderer logic.

Player weapon flavor lives in `content/player-weapon-callouts.ts`. Successful
ballistic reloads and laser recharges combine shared lines with weapon-family
lines. Empty reload attempts and dry-fire/depleted-laser attempts use the
depleted pool; its two introspective lines explicitly render as thoughts. A
stateless command-ID hash gives each eligible action a 50% chance without
consuming gameplay RNG or changing combat, loot, or AI outcomes.
