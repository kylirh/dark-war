/**
 * Server-authoritative, per-player conversations.
 *
 * One session per player (`state.conversations`). Narrative memory lives in
 * per-(player,speaker) `state.playerSocialFacts` — never on the entity and never
 * inferred from relationship numbers — so multiplayer players have independent
 * histories. Choices carry stable ids + an expected revision; every command is
 * revalidated (session, speaker reachable, condition, revision) so stale or
 * duplicated commands cannot double-apply an effect.
 */

import {
  GameState,
  Entity,
  Player,
  EntityKind,
  ItemType,
  ConversationView,
  DialogueChoiceView,
  SocialFacts,
} from "../../types";
import {
  DIALOGUE_DEFS,
  DialogueDef,
  DialogueNode,
  DialogueChoice,
  DialogueCondition,
  DialogueEffect,
  DIALOGUE_FREE_TEXT_MAX_LENGTH,
} from "../../content/dialogue-defs";
import { SOCIAL_DEFS } from "../../content/social-defs";
import { grantCoreDevice } from "./events";

export const CONVERSATION_PAUSE = "conversation";
const TALK_RANGE_TILES = 2;

// ─── Facts ──────────────────────────────────────────────────────────────────

export function getSocialFacts(
  state: GameState,
  playerId: string,
  speakerId: string,
): SocialFacts {
  let byPlayer = state.playerSocialFacts.get(playerId);
  if (!byPlayer) {
    byPlayer = new Map();
    state.playerSocialFacts.set(playerId, byPlayer);
  }
  let facts = byPlayer.get(speakerId);
  if (!facts) {
    facts = {};
    byPlayer.set(speakerId, facts);
  }
  return facts;
}

function factSet(facts: SocialFacts, fact: string): boolean {
  return !!facts.flags?.[fact];
}

// ─── Dialogue lookup ─────────────────────────────────────────────────────────

function dialogueFor(target: Entity): DialogueDef | null {
  const defId = target.social?.defId;
  const dialogueId = defId ? SOCIAL_DEFS[defId]?.dialogueId : undefined;
  return dialogueId ? (DIALOGUE_DEFS[dialogueId] ?? null) : null;
}

/** Whether interacting with this actor opens the full conversation panel. */
export function hasDialogue(target: Entity): boolean {
  return dialogueFor(target) !== null;
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

export function startConversation(
  state: GameState,
  player: Player,
  target: Entity,
): boolean {
  const dialogue = dialogueFor(target);
  if (!dialogue) return false;

  const facts = getSocialFacts(state, player.id, target.id);
  (facts.flags ??= {}).met = true;

  state.conversations.set(player.id, {
    playerId: player.id,
    speakerId: target.id,
    dialogueId: SOCIAL_DEFS[target.social!.defId].dialogueId!,
    nodeId: dialogue.entry,
    revision: 1,
  });
  player.velocityX = 0;
  player.velocityY = 0;
  // Offline pause is guaranteed to clear on end/leave/speaker-loss/death.
  if (state.multiplayer.mode !== "online") {
    state.sim.pauseReasons.add(CONVERSATION_PAUSE);
  }
  return true;
}

export function endConversation(state: GameState, playerId: string): void {
  if (state.conversations.delete(playerId)) {
    // Only clear the pause once no player is still conversing (single-player:
    // always). resumeFromPause restores time when the last reason is gone.
    if (!anyOfflineConversationActive(state)) {
      state.sim.pauseReasons.delete(CONVERSATION_PAUSE);
      if (state.sim.pauseReasons.size === 0) state.sim.targetTimeScale = 1.0;
    }
  }
}

function anyOfflineConversationActive(state: GameState): boolean {
  return state.multiplayer.mode !== "online" && state.conversations.size > 0;
}

/** Speaker still present and within talking range of the player. */
function speakerReachable(
  state: GameState,
  player: Player,
  speakerId: string,
): Entity | null {
  const speaker = state.entities.find((e) => e.id === speakerId);
  if (!speaker) return null;
  if (
    Math.abs(speaker.gridX - player.gridX) > TALK_RANGE_TILES ||
    Math.abs(speaker.gridY - player.gridY) > TALK_RANGE_TILES
  ) {
    return null;
  }
  return speaker;
}

/** Close sessions whose player, speaker, or authored node is no longer valid. */
export function updateConversationSessions(state: GameState): void {
  for (const [playerId, session] of Array.from(state.conversations.entries())) {
    const player = state.entities.find(
      (entity) => entity.id === playerId && entity.kind === EntityKind.PLAYER,
    ) as Player | undefined;
    const speaker = player
      ? speakerReachable(state, player, session.speakerId)
      : null;
    const node = DIALOGUE_DEFS[session.dialogueId]?.nodes[session.nodeId];
    const speakerAlive =
      speaker &&
      (!("hp" in speaker) || typeof speaker.hp !== "number" || speaker.hp > 0);
    if (!player || player.hp <= 0 || !speakerAlive || !node) {
      endConversation(state, playerId);
    }
  }
}

// ─── Conditions & effects ────────────────────────────────────────────────────

function conditionMet(
  state: GameState,
  playerId: string,
  speakerId: string,
  facts: SocialFacts,
  condition?: DialogueCondition,
): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case "hasFact":
      return factSet(facts, condition.fact);
    case "notFact":
      return !factSet(facts, condition.fact);
    case "affinityAtLeast":
      return (
        state.relationships.get(playerId, speakerId).affinity >= condition.value
      );
  }
}

function applyEffect(
  state: GameState,
  player: Player,
  speaker: Entity,
  facts: SocialFacts,
  effect: DialogueEffect,
  freeText?: string,
): void {
  switch (effect.type) {
    case "giveStarterGear": {
      grantCoreDevice(player, ItemType.MATTER_MANIPULATOR);
      // The CTDM is inert online (real-time) — only gift it offline.
      if (state.multiplayer.mode !== "online") {
        grantCoreDevice(player, ItemType.CTDM);
      }
      break;
    }
    case "adjustAffinity":
      state.relationships.adjust(player.id, speaker.id, {
        affinity: effect.value,
      });
      break;
    case "setFact":
      (facts.flags ??= {})[effect.fact] = true;
      break;
    case "clearFact":
      (facts.flags ??= {})[effect.fact] = false;
      break;
    case "rememberNote":
      if (freeText) (facts.notes ??= {})[effect.note] = freeText;
      break;
    case "setBehavior":
      applyBehavior(speaker, player, effect.behavior);
      break;
  }
}

/** A conversation choice changing what the speaker does next. */
function applyBehavior(
  speaker: Entity,
  player: Player,
  behavior: "follow" | "stay",
): void {
  if (speaker.kind !== EntityKind.MONSTER) return;
  const monster = speaker as Entity & {
    friendly?: boolean;
    ownerId?: string;
    peaceful?: boolean;
  };
  const isBuilder = speaker.occupation?.type === "builder";
  if (behavior === "follow") {
    monster.ownerId = player.id;
    if (isBuilder) {
      monster.friendly = false;
      monster.peaceful = true;
      if (speaker.agent) {
        speaker.agent.currentGoal = "follow";
        speaker.agent.nextDecisionTick = 0;
      }
    } else {
      monster.friendly = true;
      monster.peaceful = false;
    }
  } else {
    monster.friendly = false;
    monster.ownerId = undefined;
    monster.peaceful = true;
    if (speaker.agent) {
      speaker.agent.currentGoal = "idle";
      speaker.agent.nextDecisionTick = 0;
    }
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

export function applyDialogueChoice(
  state: GameState,
  player: Player,
  choiceId: string,
  expectedRevision: number,
  freeText?: string,
): void {
  const session = state.conversations.get(player.id);
  if (!session || session.revision !== expectedRevision) return; // stale/duplicate

  const speaker = speakerReachable(state, player, session.speakerId);
  if (!speaker) {
    endConversation(state, player.id);
    return;
  }

  const dialogue = DIALOGUE_DEFS[session.dialogueId];
  const node = dialogue?.nodes[session.nodeId];
  if (!node) {
    endConversation(state, player.id);
    return;
  }

  const facts = getSocialFacts(state, player.id, session.speakerId);

  // Free-text submission (choiceId === "__freeText").
  if (freeText !== undefined && node.allowFreeText) {
    const sanitizedText = freeText
      .trim()
      .slice(0, DIALOGUE_FREE_TEXT_MAX_LENGTH);
    if (sanitizedText.length === 0) return;
    for (const effect of node.freeTextEffects ?? []) {
      applyEffect(state, player, speaker, facts, effect, sanitizedText);
    }
    advanceOrEnd(state, player, session, node.freeTextNext);
    return;
  }

  const availableChoices = node.choices.filter((choice) =>
    conditionMet(state, player.id, session.speakerId, facts, choice.condition),
  );
  if (
    choiceId === "__continue" &&
    !node.allowFreeText &&
    availableChoices.length === 0
  ) {
    advanceOrEnd(state, player, session, node.next);
    return;
  }

  const choice = availableChoices.find(
    (candidate) => candidate.id === choiceId,
  );
  if (!choice) {
    return; // unknown or unavailable choice
  }

  (facts.choices ??= {})[session.nodeId] = choice.id;
  for (const effect of choice.effects ?? []) {
    applyEffect(state, player, speaker, facts, effect);
  }
  advanceOrEnd(state, player, session, choice.next);
}

function advanceOrEnd(
  state: GameState,
  player: Player,
  session: { nodeId: string; revision: number },
  next?: string,
): void {
  if (
    next &&
    DIALOGUE_DEFS[state.conversations.get(player.id)!.dialogueId].nodes[next]
  ) {
    session.nodeId = next;
    session.revision += 1;
  } else {
    endConversation(state, player.id);
  }
}

export function leaveConversation(
  state: GameState,
  player: Player,
  expectedRevision: number,
): void {
  const session = state.conversations.get(player.id);
  if (session && session.revision === expectedRevision) {
    endConversation(state, player.id);
  }
}

// ─── View (for the dialogue UI) ──────────────────────────────────────────────

function resolveText(text: string, facts: SocialFacts): string {
  return text.replace(/\{(\w+)\}/g, (_m, key: string) => {
    return facts.notes?.[key] ?? "friend";
  });
}

/** Build the local player's conversation view, or undefined if none is active. */
export function buildConversationView(
  state: GameState,
  playerId: string,
): ConversationView | undefined {
  const session = state.conversations.get(playerId);
  if (!session) return undefined;
  const dialogue = DIALOGUE_DEFS[session.dialogueId];
  const node: DialogueNode | undefined = dialogue?.nodes[session.nodeId];
  const speaker = state.entities.find((e) => e.id === session.speakerId);
  if (!node || !speaker || !speaker.social) return undefined;

  const def = SOCIAL_DEFS[speaker.social.defId];
  const facts = getSocialFacts(state, playerId, session.speakerId);

  const choices: DialogueChoiceView[] = node.choices
    .filter((c: DialogueChoice) =>
      conditionMet(state, playerId, session.speakerId, facts, c.condition),
    )
    .map((c) => ({ id: c.id, label: c.label }));

  return {
    speakerId: session.speakerId,
    speakerName: def?.name ?? "Someone",
    portraitKey: def?.portraitKey ?? speaker.social.defId,
    text: resolveText(node.text, facts),
    choices,
    canContinue: !node.allowFreeText && choices.length === 0,
    allowFreeText: !!node.allowFreeText,
    freeTextPrompt: node.freeTextPrompt,
    revision: session.revision,
  };
}

// ─── Serialization of per-player facts ───────────────────────────────────────

export function serializeSocialFactsFor(
  state: GameState,
  playerId: string,
): Record<string, SocialFacts> | undefined {
  const byPlayer = state.playerSocialFacts.get(playerId);
  if (!byPlayer || byPlayer.size === 0) return undefined;
  const out: Record<string, SocialFacts> = {};
  for (const [speakerId, facts] of byPlayer.entries()) {
    out[speakerId] = cloneSocialFacts(facts);
  }
  return out;
}

function cloneSocialFacts(facts: SocialFacts): SocialFacts {
  return {
    flags: facts.flags ? { ...facts.flags } : undefined,
    choices: facts.choices ? { ...facts.choices } : undefined,
    notes: facts.notes ? { ...facts.notes } : undefined,
  };
}

export function loadSocialFacts(
  serialized: Record<string, Record<string, SocialFacts>> | undefined,
): Map<string, Map<string, SocialFacts>> {
  const out = new Map<string, Map<string, SocialFacts>>();
  for (const [playerId, bySpeaker] of Object.entries(serialized ?? {})) {
    const inner = new Map<string, SocialFacts>();
    for (const [speakerId, facts] of Object.entries(bySpeaker)) {
      inner.set(speakerId, cloneSocialFacts(facts));
    }
    out.set(playerId, inner);
  }
  return out;
}
