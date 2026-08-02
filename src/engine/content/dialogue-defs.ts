/**
 * Authored dialogue graphs, keyed by `SocialDef.dialogueId`.
 *
 * Validated TypeScript data compiled to a runtime graph (not Tiled — that is a
 * spatial tool). Choices carry stable ids (never array indices); conditions gate
 * availability; effects are applied server-authoritatively when a choice is
 * taken. Node text may contain `{name}` placeholders resolved from remembered
 * social facts.
 */

import { ItemType } from "../types";

export const DIALOGUE_FREE_TEXT_MAX_LENGTH = 32;

export type DialogueCondition =
  | { type: "hasFact"; fact: string }
  | { type: "notFact"; fact: string }
  | { type: "affinityAtLeast"; value: number }
  | { type: "hasItem"; item: ItemType }
  | { type: "speakerHasLoot" }
  | { type: "speakerHasNoLoot" }
  | { type: "speakerWonOver" }
  | { type: "speakerWonOverAndUnowned" }
  | { type: "speakerNotWonOver" }
  | { type: "speakerIsOwner" }
  | { type: "speakerUnowned" };

export type DialogueEffect =
  | { type: "giveStarterGear" }
  | { type: "adjustAffinity"; value: number }
  | {
      type: "adjustRelationship";
      affinity?: number;
      fear?: number;
      grievance?: number;
    }
  | { type: "setFact"; fact: string }
  | { type: "clearFact"; fact: string }
  | { type: "rememberNote"; note: string }
  | { type: "consumeItem"; item: ItemType; amount?: number }
  | { type: "returnSpeakerLoot" }
  | { type: "recruitSnagglepuss" }
  | { type: "releaseSnagglepuss" }
  /** Change the speaker's behavior — the conversation shapes what they do. */
  | { type: "setBehavior"; behavior: "follow" | "stay" };

export interface DialogueChoice {
  /** Stable id — referenced by DIALOGUE_CHOICE commands. */
  id: string;
  label: string;
  condition?: DialogueCondition;
  effects?: DialogueEffect[];
  /** Next node id; omit to end the conversation. */
  next?: string;
}

export interface DialogueNode {
  text: string;
  choices: DialogueChoice[];
  /** Next node for a response-free "Next" action; omit to end the dialogue. */
  next?: string;
  /** When true the node accepts a typed free-text response. */
  allowFreeText?: boolean;
  freeTextPrompt?: string;
  freeTextEffects?: DialogueEffect[];
  freeTextNext?: string;
}

export interface DialogueDef {
  entry: string;
  nodes: Record<string, DialogueNode>;
}

export const DIALOGUE_DEFS: Record<string, DialogueDef> = {
  "settler.workshop-builder": {
    entry: "greeting",
    nodes: {
      greeting: {
        text: "Marda wipes her hands on her apron. “Settlement can always use another pair of hands. What do you need?”",
        choices: [
          {
            id: "gear",
            label: "Do you have any gear I can use?",
            condition: { type: "notFact", fact: "receivedGear" },
            effects: [
              { type: "giveStarterGear" },
              { type: "setFact", fact: "receivedGear" },
            ],
            next: "gaveGear",
          },
          { id: "name", label: "I'm new around here.", next: "askName" },
          {
            id: "help",
            label: "Need a hand with anything?",
            next: "askFollow",
          },
          { id: "leave", label: "I'll be going." },
        ],
      },
      gaveGear: {
        text: "“Here — you'll want these.” She presses a Cognitive Time Dilation Module and a Matter Manipulator into your hands. “The CTDM slows time when things get hairy. The Manipulator mines and builds. Go on, get the feel of them.”",
        choices: [],
        next: "greeting",
      },
      askName: {
        text: "“New, huh. What do they call you?”",
        allowFreeText: true,
        freeTextPrompt: "Tell Marda your name",
        freeTextEffects: [{ type: "rememberNote", note: "name" }],
        freeTextNext: "nameAck",
        choices: [{ id: "skip", label: "Rather not say.", next: "greeting" }],
      },
      nameAck: {
        text: "“Good to meet you, {name}. Stick around — we're building something here.”",
        choices: [],
        next: "greeting",
      },
      askFollow: {
        text: "“Depends. Want me at your side, or holding the workshop?”",
        choices: [
          {
            id: "follow",
            label: "Walk with me.",
            effects: [
              { type: "setBehavior", behavior: "follow" },
              { type: "adjustAffinity", value: 10 },
            ],
            next: "nowFollowing",
          },
          {
            id: "stay",
            label: "Hold the workshop.",
            effects: [{ type: "setBehavior", behavior: "stay" }],
            next: "nowStaying",
          },
          { id: "never", label: "Never mind.", next: "greeting" },
        ],
      },
      nowFollowing: {
        text: "“Right behind you, then.” Marda shoulders her tools and falls into step.",
        choices: [],
      },
      nowStaying: {
        text: "“I'll be here. Come find me when you need me.” She turns back to her work.",
        choices: [],
      },
    },
  },
  "wildlife.snagglepuss": {
    entry: "approach",
    nodes: {
      approach: {
        text: "The Snagglepuss sits back on its haunches, watching your hands and your pockets with equal interest.",
        choices: [
          {
            id: "stolen",
            label: "You took something from me.",
            condition: { type: "speakerHasLoot" },
            next: "denyLoot",
          },
          {
            id: "offerCookie",
            label: "Want a cookie?",
            condition: { type: "hasItem", item: ItemType.COOKIE },
            effects: [
              { type: "consumeItem", item: ItemType.COOKIE },
              {
                type: "adjustRelationship",
                affinity: 45,
                fear: -20,
                grievance: -15,
              },
              { type: "setFact", fact: "sharedCookie" },
            ],
            next: "cookieAccepted",
          },
          {
            id: "join",
            label: "Come with me. We'll find shinier things together.",
            condition: { type: "speakerWonOverAndUnowned" },
            effects: [{ type: "recruitSnagglepuss" }],
            next: "joined",
          },
          {
            id: "release",
            label: "You can wander on your own again.",
            condition: { type: "speakerIsOwner" },
            effects: [{ type: "releaseSnagglepuss" }],
            next: "released",
          },
          {
            id: "chat",
            label: "How are we doing?",
            condition: { type: "speakerIsOwner" },
            next: "companionChat",
          },
          { id: "leave", label: "Never mind." },
        ],
      },
      denyLoot: {
        text: "“Stolen?” The Snagglepuss presses both paws to its chest. “No stolen. Found. Entirely different.” The familiar shape tucked behind its tail suggests otherwise.",
        choices: [
          {
            id: "tradeCookie",
            label: "One cookie, and you return everything.",
            condition: { type: "hasItem", item: ItemType.COOKIE },
            effects: [
              { type: "consumeItem", item: ItemType.COOKIE },
              { type: "returnSpeakerLoot" },
              {
                type: "adjustRelationship",
                affinity: 30,
                grievance: -25,
              },
              { type: "setFact", fact: "caughtLying" },
              { type: "setFact", fact: "bargainedForLoot" },
            ],
            next: "tradeComplete",
          },
          {
            id: "callLie",
            label: "I can see it behind your tail.",
            effects: [
              { type: "setFact", fact: "caughtLying" },
              { type: "adjustRelationship", grievance: 10 },
            ],
            next: "caught",
          },
          { id: "leave", label: "Keep it, then." },
        ],
      },
      caught: {
        text: "The Snagglepuss looks at its tail, looks at you, and quietly moves the loot behind its other tail. “Coincidence.”",
        choices: [],
        next: "approach",
      },
      tradeComplete: {
        text: "The cookie vanishes in one bite. Your belongings are returned with great ceremony and only a little drool. “Trade. Honest trade.”",
        choices: [],
        next: "approach",
      },
      cookieAccepted: {
        text: "The Snagglepuss accepts the cookie delicately. Its suspicious squint softens into something almost companionable.",
        choices: [],
        next: "approach",
      },
      joined: {
        text: "It chirrups, pats your pocket as if checking the travel provisions, and falls into step beside you.",
        choices: [],
      },
      released: {
        text: "The Snagglepuss bumps its forehead against your hand, then settles nearby. Friendly, but free to choose its own path.",
        choices: [],
      },
      companionChat: {
        text: "“Good team,” it says solemnly. “You carry snacks. I inspect shinies.”",
        choices: [],
        next: "approach",
      },
    },
  },
};
