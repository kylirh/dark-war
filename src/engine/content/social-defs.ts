/**
 * Authored social identities, keyed by `SocialComponent.defId`.
 *
 * Data only — no behavior. The interaction system reads these to voice an
 * actor; the actor entity carries only the `defId`. Keeping identity here
 * (not on the entity) keeps entities small and lets many actors share a voice.
 */

export interface SocialDef {
  /** Display name shown in the log / dialogue. */
  name: string;
  /** Faction this actor belongs to. */
  faction: string;
  /**
   * Lines spoken the first time the player talks to this actor (e.g. an
   * introduction, or handing over starting gear). Optional.
   */
  firstMeet?: string[];
  /** Repeatable ambient greeting lines (deterministically chosen). */
  greeting: string[];
}

export const SOCIAL_DEFS: Record<string, SocialDef> = {
  "settler.workshop-builder": {
    name: "Marda, the Workshop Builder",
    faction: "settlers",
    firstMeet: [
      "Marda wipes her hands on her apron. “You made it. Good — the settlement can always use another pair of hands.”",
    ],
    greeting: [
      "Marda: “The garden's coming back. Slow, but it's coming.”",
      "Marda: “Mind the cliffs out east. Pretty, but they'll turn an ankle.”",
      "Marda: “Stop by anytime. There's always something to fix.”",
    ],
  },
  "wildlife.snagglepuss": {
    name: "Snagglepuss",
    faction: "wildlife",
    greeting: [
      "The Snagglepuss chirrups and shows you its empty paws — nothing up its sleeves. This time.",
      "The Snagglepuss circles you, tail flicking, and makes an almost-friendly trill.",
      "The Snagglepuss eyes your pockets out of habit, then thinks better of it.",
    ],
  },
};
