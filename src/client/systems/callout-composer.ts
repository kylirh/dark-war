/**
 * Accessible, non-pausing composer for short player speech and thoughts.
 */

import { MAX_WORLD_CALLOUT_CODEPOINTS } from "../../engine/utils/world-callouts";

export type PlayerCalloutKind = "speech" | "thought";

export interface CalloutComposerOptions {
  onSubmit: (kind: PlayerCalloutKind, text: string) => void;
  onClose?: () => void;
}

/** Small DOM overlay used to enter world-bubble text without opening dialogue. */
export class CalloutComposer {
  private readonly element: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly modeLabel: HTMLElement;
  private readonly liveRegion: HTMLElement;
  private kind: PlayerCalloutKind = "speech";

  public constructor(private readonly options: CalloutComposerOptions) {
    const viewport = document.querySelector<HTMLElement>(".viewport");
    if (!viewport)
      throw new Error("Cannot create callout composer without viewport");

    this.element = document.createElement("form");
    this.element.className = "world-callout-composer";
    this.element.hidden = true;
    this.element.setAttribute("aria-label", "Short character message");

    this.modeLabel = document.createElement("span");
    this.modeLabel.className = "world-callout-composer__mode";

    this.input = document.createElement("input");
    this.input.className = "world-callout-composer__input";
    this.input.type = "text";
    this.input.autocomplete = "off";
    this.input.spellcheck = true;
    this.input.placeholder = "A short line…";
    this.input.setAttribute("aria-label", "What your character says or thinks");

    const sendButton = document.createElement("button");
    sendButton.className = "world-callout-composer__send";
    sendButton.type = "submit";
    sendButton.textContent = "Send";

    const hint = document.createElement("span");
    hint.className = "world-callout-composer__hint";
    hint.textContent = "Enter to send · Esc to cancel";

    this.liveRegion = document.createElement("span");
    this.liveRegion.className = "sr-only";
    this.liveRegion.setAttribute("aria-live", "polite");

    this.element.append(this.modeLabel, this.input, sendButton, hint);
    viewport.append(this.element, this.liveRegion);

    this.element.addEventListener("submit", (event: SubmitEvent) => {
      event.preventDefault();
      const text = this.input.value;
      if (text.trim().length === 0) return;
      this.options.onSubmit(this.kind, text);
      this.close();
    });
    this.input.addEventListener("input", () => {
      const codePoints = Array.from(this.input.value);
      if (codePoints.length > MAX_WORLD_CALLOUT_CODEPOINTS) {
        this.input.value = codePoints
          .slice(0, MAX_WORLD_CALLOUT_CODEPOINTS)
          .join("");
      }
    });
    this.element.addEventListener("keydown", (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
    this.element.addEventListener("keyup", (event: KeyboardEvent) => {
      event.stopPropagation();
    });
  }

  /** Opens the composer in speech or thought mode and focuses its input. */
  public open(kind: PlayerCalloutKind): void {
    this.kind = kind;
    this.modeLabel.textContent = kind === "thought" ? "Think" : "Say";
    this.element.dataset.kind = kind;
    this.element.hidden = false;
    document.body.classList.add("world-callout-composing");
    this.input.value = "";
    this.input.focus();
  }

  /** Closes the composer and restores keyboard control to the game. */
  public close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    document.body.classList.remove("world-callout-composing");
    this.options.onClose?.();
  }

  public isOpen(): boolean {
    return !this.element.hidden;
  }

  /** Announces the local player's accepted callout to assistive technology. */
  public announce(kind: PlayerCalloutKind, text: string): void {
    this.liveRegion.textContent = `${kind === "thought" ? "You think" : "You say"}: ${text}`;
  }
}
