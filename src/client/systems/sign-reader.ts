/** Accessible reader panel for server-authoritative environmental signs. */

import { SignView } from "../../engine/types";

export interface SignReaderHandlers {
  onClose(): void;
}

export class SignReader {
  private readonly root: HTMLDivElement;
  private readonly art: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly text: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly onWindowKeyDown = (event: KeyboardEvent): void =>
    this.handleKeyDown(event);
  private renderedId = "";
  private handlers?: SignReaderHandlers;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "sign-reader";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "sign-reader-title");
    this.root.setAttribute("aria-describedby", "sign-reader-text");
    this.root.hidden = true;

    this.art = document.createElement("div");
    this.art.className = "sign-reader-art";
    this.art.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "sign-reader-body";

    this.title = document.createElement("h2");
    this.title.id = "sign-reader-title";
    this.title.className = "sign-reader-title";

    this.text = document.createElement("div");
    this.text.id = "sign-reader-text";
    this.text.className = "sign-reader-text";

    const hint = document.createElement("p");
    hint.className = "sign-reader-hint";
    hint.textContent = "Press Escape or close to continue";

    this.closeButton = document.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "sign-reader-close";
    this.closeButton.textContent = "Close";
    this.closeButton.addEventListener("click", () => this.handlers?.onClose());

    body.append(this.title, this.text, hint, this.closeButton);
    this.root.append(this.art, body);
    document.body.appendChild(this.root);

    // Capture before the global input listener so reading a sign owns keyboard
    // focus and cannot accidentally fire, mine, or move the player.
    window.addEventListener("keydown", this.onWindowKeyDown, true);
  }

  /** True while the reader is visible. */
  isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Show/update from the current view, or hide when the view is cleared. */
  update(view: SignView | undefined, handlers: SignReaderHandlers): void {
    this.handlers = handlers;
    if (!view) {
      this.hide();
      return;
    }

    this.root.hidden = false;
    if (view.id === this.renderedId) return;

    this.renderedId = view.id;
    this.title.textContent = view.title;
    this.text.textContent = view.text;
    this.art.dataset.artKey = view.artKey;
    this.closeButton.focus();
  }

  /** Remove global listeners and the reader DOM. */
  dispose(): void {
    window.removeEventListener("keydown", this.onWindowKeyDown, true);
    this.root.remove();
  }

  private hide(): void {
    if (this.root.hidden) return;
    const ownedFocus = this.root.contains(document.activeElement);
    this.root.hidden = true;
    this.renderedId = "";
    if (ownedFocus) document.getElementById("game")?.focus();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.root.hidden) return;

    event.stopImmediatePropagation();
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (
        event.key === "Escape" ||
        document.activeElement !== this.closeButton
      ) {
        this.handlers?.onClose();
      } else {
        this.closeButton.click();
      }
    }
  }
}
