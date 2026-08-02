/**
 * Authored social identities, keyed by `SocialComponent.defId`.
 *
 * Data only — no behavior. The interaction system reads these to voice an
 * actor; the actor entity carries only the `defId`. Keeping identity here
 * (not on the entity) keeps entities small and lets many actors share a voice.
 */

import { ItemType, MonsterType } from "../types";

export interface SocialDef {
  /** Display name shown in the log / dialogue. */
  name: string;
  /** Faction this actor belongs to. */
  faction: string;
  /** SPRITE_COORDS key for the dialogue portrait (defaults handled by the UI). */
  portraitKey?: string;
  /**
   * Key into `DIALOGUE_DEFS`. Actors with a dialogue open the full conversation
   * panel on interaction; actors without one just emit a short speech bubble.
   */
  dialogueId?: string;
  /**
   * Lines spoken the first time the player talks to this actor (e.g. an
   * introduction, or handing over starting gear). Optional.
   */
  firstMeet?: string[];
  /**
   * Core devices handed to the player the first time they talk. Applied once
   * (idempotent — already-owned devices are skipped).
   */
  gifts?: ItemType[];
  /** Repeatable ambient greeting lines (deterministically chosen). */
  greeting: string[];
}

export const SOCIAL_DEFS: Record<string, SocialDef> = {
  "settler.workshop-builder": {
    name: "Marda",
    faction: "settlers",
    portraitKey: "workshop-builder",
    dialogueId: "settler.workshop-builder",
    firstMeet: [
      "Marda wipes her hands on her apron. “You made it. Good — the settlement can always use another pair of hands.”",
    ],
    gifts: [ItemType.CTDM, ItemType.MATTER_MANIPULATOR],
    greeting: [
      "Marda: “The garden's coming back. Slow, but it's coming.”",
      "Marda: “Mind the cliffs out east. Pretty, but they'll turn an ankle.”",
      "Marda: “Stop by anytime. There's always something to fix.”",
    ],
  },
  "settler.park-builder": {
    name: "Bram, tending the Park Workshop",
    faction: "settlers",
    firstMeet: [
      "Bram looks up from a half-mended fence. “Marda send you? Good. There's more to rebuild out here than two hands can manage.”",
    ],
    greeting: [
      "Bram: “The pond's clean enough to drink from now. Small victories.”",
      "Bram: “Give me a season and this whole park will be gardens.”",
      "Bram: “If you find scrap out there, bring it back. Nothing's waste anymore.”",
    ],
  },
  "wildlife.snagglepuss": {
    name: "Snagglepuss",
    faction: "wildlife",
    portraitKey: MonsterType.SNAGGLEPUSS,
    dialogueId: "wildlife.snagglepuss",
    greeting: [
      "The Snagglepuss chirrups and shows you its empty paws — nothing up its sleeves. This time.",
      "The Snagglepuss circles you, tail flicking, and makes an almost-friendly trill.",
      "The Snagglepuss eyes your pockets out of habit, then thinks better of it.",
    ],
  },
};
