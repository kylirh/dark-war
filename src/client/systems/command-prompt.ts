/** Focus-owning development command prompt with feedback, help, and history. */
import { DevelopmentCommands } from "./development-commands";
import { captureFocusOpener, restoreFocus } from "./focus-restore";
import { matchesBinding } from "./preferences";

export class CommandPrompt {
  private readonly root = document.createElement("div");
  private readonly input = document.createElement("input");
  private readonly output = document.createElement("pre");
  private readonly history: string[] = [];
  private historyIndex = 0;
  private draft = "";
  private opener: HTMLElement | null = null;
  private busy = false;

  public constructor(
    private readonly commands: DevelopmentCommands,
    private readonly onClose: () => void,
  ) {
    this.root.className = "development-command-prompt";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Development commands");
    const title = document.createElement("h2");
    title.textContent = "Development commands";
    const help = document.createElement("p");
    help.textContent =
      "Try /help. Submit to run; Back / Cancel to close. Menu Up / Down recalls commands. Complete Command Name completes names. You can also use the buttons below.";
    this.output.setAttribute("role", "log");
    this.output.setAttribute("aria-live", "polite");
    this.input.setAttribute("aria-label", "Command");
    this.input.placeholder = "/help";
    this.input.autocomplete = "off";
    this.input.maxLength = 512;
    this.input.spellcheck = false;
    const run = document.createElement("button");
    run.textContent = "Run";
    run.onclick = () => void this.submit();
    const close = document.createElement("button");
    close.textContent = "Close";
    close.onclick = () => this.close();
    this.root.append(title, help, this.output, this.input, run, close);
    document.body.append(this.root);
    window.addEventListener("keydown", this.onKeyDown, true);
    this.root.addEventListener("keyup", (event) => event.stopPropagation());
    this.root.addEventListener("pointerdown", (event) =>
      event.stopPropagation(),
    );
  }

  /** Open with a slash ready for typing. */
  public open(): void {
    this.opener = captureFocusOpener();
    this.root.hidden = false;
    this.input.value = "/";
    this.historyIndex = this.history.length;
    this.input.focus();
  }

  /** Whether this prompt owns world input. */
  public isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Close and release focus without replaying any typed movement keys. */
  public close(): void {
    this.root.hidden = true;
    this.onClose();
    restoreFocus(this.opener);
  }

  /** Remove listeners and DOM when the game is replaced. */
  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown, true);
    this.root.remove();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen()) return;
    event.stopImmediatePropagation();
    if (event.isComposing) return;
    if (matchesBinding(event, "gameMenu")) {
      event.preventDefault();
      this.close();
    } else if (matchesBinding(event, "confirm")) {
      event.preventDefault();
      void this.submit();
    } else if (
      event.target === this.input &&
      (matchesBinding(event, "menuUp") || matchesBinding(event, "menuDown"))
    ) {
      event.preventDefault();
      if (this.historyIndex === this.history.length)
        this.draft = this.input.value;
      this.historyIndex = Math.max(
        0,
        Math.min(
          this.history.length,
          this.historyIndex + (matchesBinding(event, "menuUp") ? -1 : 1),
        ),
      );
      this.input.value = this.history[this.historyIndex] ?? this.draft;
    } else if (
      matchesBinding(event, "completeCommand") &&
      event.target === this.input &&
      /^\/[a-z]+$/i.test(this.input.value)
    ) {
      const choices = this.commands.complete(this.input.value.slice(1));
      if (choices.length === 1) {
        event.preventDefault();
        this.input.value = `/${choices[0]} `;
      }
    } else if (event.key === "Tab") {
      const focusable = Array.from(
        this.root.querySelectorAll<HTMLElement>("input, button"),
      );
      const next =
        (focusable.indexOf(document.activeElement as HTMLElement) +
          (event.shiftKey ? -1 : 1) +
          focusable.length) %
        focusable.length;
      event.preventDefault();
      focusable[next].focus();
    }
  };

  private async submit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const line = this.input.value;
    if (line.trim()) {
      this.history.push(line);
      if (this.history.length > 100) this.history.shift();
    }
    this.historyIndex = this.history.length;
    this.input.value = "/";
    try {
      const result = await this.commands.execute(line);
      this.output.textContent =
        `${this.output.textContent}\n${line}\n${result}`.slice(-20000);
    } catch (error) {
      this.output.textContent += `\nCommand failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.busy = false;
      this.output.scrollTop = this.output.scrollHeight;
      if (this.isOpen()) this.input.focus();
    }
  }
}
