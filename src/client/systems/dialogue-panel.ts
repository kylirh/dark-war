/**
 * The conversation dialogue box: an NPC portrait on the left, the speaker's
 * name and line on the right, selectable response buttons, and — when the node
 * allows it — a free-text input. Pure presentation: it renders a
 * `ConversationView` and calls back into the client to dispatch the
 * server-authoritative choice/leave commands. It never mutates game state.
 */

import { ConversationView } from "../../engine/types";
import {
  SPRITE_COORDS,
  SPRITE_SIZE,
  SPRITE_SHEET_PATH,
} from "../../engine/config/sprites";

export interface DialoguePanelHandlers {
  onChoice(choiceId: string, expectedRevision: number): void;
  onFreeText(text: string, expectedRevision: number): void;
  onLeave(expectedRevision: number): void;
}

const PORTRAIT_PX = 112;

export class DialoguePanel {
  private readonly root: HTMLDivElement;
  private readonly portrait: HTMLCanvasElement;
  private readonly nameEl: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly choicesEl: HTMLDivElement;
  private readonly inputRow: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly sheet: HTMLImageElement;
  private sheetReady = false;

  /** Which revision the DOM currently reflects (avoids rebuilding every frame). */
  private renderedRevision = -1;
  private renderedSpeaker = "";
  private handlers?: DialoguePanelHandlers;

  constructor() {
    this.sheet = new Image();
    this.sheet.onload = () => {
      this.sheetReady = true;
      this.renderedRevision = -1; // force a redraw once art is available
    };
    this.sheet.src = SPRITE_SHEET_PATH;

    this.root = document.createElement("div");
    this.root.className = "dialogue-panel";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "Conversation");
    this.root.hidden = true;

    this.portrait = document.createElement("canvas");
    this.portrait.width = PORTRAIT_PX;
    this.portrait.height = PORTRAIT_PX;
    this.portrait.className = "dialogue-portrait";

    const body = document.createElement("div");
    body.className = "dialogue-body";

    this.nameEl = document.createElement("div");
    this.nameEl.className = "dialogue-name";
    this.textEl = document.createElement("div");
    this.textEl.className = "dialogue-text";
    this.choicesEl = document.createElement("div");
    this.choicesEl.className = "dialogue-choices";

    this.inputRow = document.createElement("form");
    this.inputRow.className = "dialogue-input-row";
    this.inputRow.hidden = true;
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "dialogue-input";
    this.input.maxLength = 32;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "dialogue-input-submit";
    submit.textContent = "Say";
    this.inputRow.appendChild(this.input);
    this.inputRow.appendChild(submit);
    this.inputRow.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (text.length > 0) {
        this.handlers?.onFreeText(text, this.renderedRevision);
        this.input.value = "";
      }
    });

    body.appendChild(this.nameEl);
    body.appendChild(this.textEl);
    body.appendChild(this.choicesEl);
    body.appendChild(this.inputRow);
    this.root.appendChild(this.portrait);
    this.root.appendChild(body);
    document.body.appendChild(this.root);

    // Escape leaves the conversation.
    document.addEventListener("keydown", (e) => {
      if (!this.root.hidden && e.key === "Escape") {
        e.preventDefault();
        this.handlers?.onLeave(this.renderedRevision);
      }
    });
  }

  /** True while the panel is visible (so callers can suppress world input). */
  isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Show/update from the current view, or hide when there is none. */
  update(
    view: ConversationView | undefined,
    handlers: DialoguePanelHandlers,
  ): void {
    this.handlers = handlers;
    if (!view) {
      if (!this.root.hidden) {
        this.root.hidden = true;
        this.renderedRevision = -1;
        this.renderedSpeaker = "";
      }
      return;
    }

    this.root.hidden = false;
    // Only rebuild when the node actually changed — keeps button focus/typing
    // stable and avoids per-frame DOM churn.
    if (
      view.revision === this.renderedRevision &&
      view.speakerId === this.renderedSpeaker
    ) {
      return;
    }
    this.renderedRevision = view.revision;
    this.renderedSpeaker = view.speakerId;

    this.nameEl.textContent = view.speakerName;
    this.textEl.textContent = view.text;
    this.drawPortrait(view.portraitKey);

    this.choicesEl.replaceChildren();
    view.choices.forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dialogue-choice";
      btn.textContent = `${i + 1}. ${choice.label}`;
      btn.addEventListener("click", () =>
        this.handlers?.onChoice(choice.id, this.renderedRevision),
      );
      this.choicesEl.appendChild(btn);
    });

    this.inputRow.hidden = !view.allowFreeText;
    if (view.allowFreeText) {
      this.input.placeholder = view.freeTextPrompt ?? "Type a reply…";
      this.input.value = "";
      this.input.focus();
    }
  }

  private drawPortrait(portraitKey: string): void {
    const ctx = this.portrait.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
    const coord = SPRITE_COORDS[portraitKey];
    if (this.sheetReady && coord) {
      ctx.drawImage(
        this.sheet,
        coord.x * SPRITE_SIZE,
        coord.y * SPRITE_SIZE,
        SPRITE_SIZE,
        SPRITE_SIZE,
        0,
        0,
        PORTRAIT_PX,
        PORTRAIT_PX,
      );
    }
  }
}
