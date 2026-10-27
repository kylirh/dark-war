/**
 * Accessible conversation panel for server-authoritative dialogue views.
 *
 * The panel owns focus and dialogue navigation while visible. It never mutates
 * game state; response and leave actions are dispatched through its handlers.
 */

import { ConversationView } from "../../engine/types";
import {
  SPRITE_COORDS,
  SPRITE_SIZE,
  SPRITE_SHEET_PATH,
} from "../../engine/config/sprites";
import { DIALOGUE_FREE_TEXT_MAX_LENGTH } from "../../engine/content/dialogue-defs";

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
  private readonly nextButton: HTMLButtonElement;
  private readonly sheet: HTMLImageElement;
  private readonly onWindowKeyDown = (event: KeyboardEvent): void =>
    this.handleKeyDown(event);
  private sheetReady = false;
  private choiceButtons: HTMLButtonElement[] = [];
  private selectedChoiceIndex = -1;
  private renderedRevision = -1;
  private renderedSpeaker = "";
  private renderedAllowsFreeText = false;
  private renderedCanContinue = false;
  private handlers?: DialoguePanelHandlers;

  constructor() {
    this.sheet = new Image();
    this.sheet.onload = () => {
      this.sheetReady = true;
      this.renderedRevision = -1;
    };
    this.sheet.src = SPRITE_SHEET_PATH;

    this.root = document.createElement("div");
    this.root.className = "dialogue-panel";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "dialogue-speaker");
    this.root.setAttribute("aria-describedby", "dialogue-text");
    this.root.hidden = true;

    this.portrait = document.createElement("canvas");
    this.portrait.width = PORTRAIT_PX;
    this.portrait.height = PORTRAIT_PX;
    this.portrait.className = "dialogue-portrait";
    this.portrait.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "dialogue-body";

    this.nameEl = document.createElement("div");
    this.nameEl.id = "dialogue-speaker";
    this.nameEl.className = "dialogue-name";
    this.textEl = document.createElement("div");
    this.textEl.id = "dialogue-text";
    this.textEl.className = "dialogue-text";
    this.choicesEl = document.createElement("div");
    this.choicesEl.className = "dialogue-choices";
    this.choicesEl.setAttribute("role", "group");
    this.choicesEl.setAttribute("aria-label", "Responses");

    this.inputRow = document.createElement("form");
    this.inputRow.className = "dialogue-input-row";
    this.inputRow.hidden = true;
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "dialogue-input";
    this.input.maxLength = DIALOGUE_FREE_TEXT_MAX_LENGTH;
    this.input.autocomplete = "off";
    this.input.setAttribute("aria-label", "Your response");
    this.nextButton = document.createElement("button");
    this.nextButton.type = "submit";
    this.nextButton.className = "dialogue-input-submit";
    this.nextButton.textContent = "Next";
    this.inputRow.appendChild(this.input);
    this.inputRow.appendChild(this.nextButton);
    this.inputRow.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.renderedAllowsFreeText) {
        const response = this.input.value.trim();
        if (response.length === 0) return;
        this.handlers?.onFreeText(response, this.renderedRevision);
        this.input.value = "";
      } else if (this.renderedCanContinue) {
        this.handlers?.onChoice("__continue", this.renderedRevision);
      }
    });

    body.appendChild(this.nameEl);
    body.appendChild(this.textEl);
    body.appendChild(this.choicesEl);
    body.appendChild(this.inputRow);
    this.root.appendChild(this.portrait);
    this.root.appendChild(body);
    document.body.appendChild(this.root);

    // Capture before the global game input listener so dialogue owns every key
    // while it is visible. Text-input defaults still run because we only stop
    // propagation, not the browser's default editing behavior.
    window.addEventListener("keydown", this.onWindowKeyDown, true);
  }

  /** True while the panel is visible. */
  isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Show/update from the current view, or hide when there is no session. */
  update(
    view: ConversationView | undefined,
    handlers: DialoguePanelHandlers,
  ): void {
    this.handlers = handlers;
    if (!view) {
      this.hide();
      return;
    }

    this.root.hidden = false;
    if (
      view.revision === this.renderedRevision &&
      view.speakerId === this.renderedSpeaker
    ) {
      return;
    }

    this.renderedRevision = view.revision;
    this.renderedSpeaker = view.speakerId;
    this.renderedAllowsFreeText = view.allowFreeText;
    this.renderedCanContinue = view.canContinue;
    this.selectedChoiceIndex = -1;

    this.nameEl.textContent = view.speakerName;
    this.textEl.textContent = view.text;
    this.drawPortrait(view.portraitKey);

    this.choiceButtons = view.choices.map((choice, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialogue-choice";
      button.textContent = `${index + 1}. ${choice.label}`;
      button.addEventListener("click", () =>
        this.handlers?.onChoice(choice.id, this.renderedRevision),
      );
      button.addEventListener("pointerenter", () => {
        this.selectedChoiceIndex = index;
      });
      return button;
    });
    this.choicesEl.replaceChildren(...this.choiceButtons);

    const showNext = view.allowFreeText || view.canContinue;
    this.inputRow.hidden = !showNext;
    this.input.hidden = !view.allowFreeText;
    if (view.allowFreeText) {
      this.input.placeholder = view.freeTextPrompt ?? "Type a reply…";
      this.input.value = "";
      this.input.focus();
    } else if (this.choiceButtons.length > 0) {
      this.focusChoice(0);
    } else if (view.canContinue) {
      this.nextButton.focus();
    } else {
      this.root.focus();
    }
  }

  /** Remove global listeners and the panel DOM. */
  dispose(): void {
    window.removeEventListener("keydown", this.onWindowKeyDown, true);
    this.root.remove();
  }

  private hide(): void {
    if (this.root.hidden) return;
    const ownedFocus = this.root.contains(document.activeElement);
    this.root.hidden = true;
    this.renderedRevision = -1;
    this.renderedSpeaker = "";
    this.renderedAllowsFreeText = false;
    this.renderedCanContinue = false;
    this.choiceButtons = [];
    this.selectedChoiceIndex = -1;
    if (ownedFocus) {
      document.getElementById("game")?.focus();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.root.hidden) return;

    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.handlers?.onLeave(this.renderedRevision);
      return;
    }

    if (event.target === this.input) {
      return;
    }

    const key = event.key.toLowerCase();
    const previous =
      key === "arrowup" || key === "arrowleft" || key === "w" || key === "a";
    const next =
      key === "arrowdown" || key === "arrowright" || key === "s" || key === "d";
    if ((previous || next) && this.choiceButtons.length > 0) {
      event.preventDefault();
      const delta = previous ? -1 : 1;
      const start = this.selectedChoiceIndex < 0 ? 0 : this.selectedChoiceIndex;
      this.focusChoice(
        (start + delta + this.choiceButtons.length) % this.choiceButtons.length,
      );
      return;
    }

    if (/^[1-9]$/.test(key)) {
      const index = Number(key) - 1;
      const button = this.choiceButtons[index];
      if (button) {
        event.preventDefault();
        button.click();
      }
      return;
    }

    if (key === "enter" || key === " ") {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && this.root.contains(active)) {
        event.preventDefault();
        active.click();
      } else if (this.choiceButtons.length > 0) {
        event.preventDefault();
        this.choiceButtons[Math.max(0, this.selectedChoiceIndex)].click();
      } else if (!this.inputRow.hidden) {
        event.preventDefault();
        this.nextButton.click();
      }
    }
  }

  private focusChoice(index: number): void {
    this.selectedChoiceIndex = index;
    this.choiceButtons[index]?.focus();
  }

  private drawPortrait(portraitKey: string): void {
    const context = this.portrait.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
    const coord = SPRITE_COORDS[portraitKey];
    if (this.sheetReady && coord) {
      context.drawImage(
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
