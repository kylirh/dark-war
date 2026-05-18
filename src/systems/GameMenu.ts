/**
 * Reusable retro system modal components for game menu dialogs.
 */
import { Music } from "./Music";
import { Sound } from "./Sound";

type ThemeMode = "dark" | "light";
type PauseMenuAction =
  | "new-game"
  | "continue"
  | "multiplayer"
  | "settings"
  | "quit";

interface PauseMenuItem {
  action: PauseMenuAction;
  label: string;
}

interface GameMenuOptions {
  pausesGame: boolean;
  onModalStateChange?: (hasOpenModal: boolean) => void;
  onNewGame?: () => void;
  onQuit?: () => void;
}

export interface RetroModalOptions {
  id: string;
  title: string;
  body: string;
  initialPosition: {
    top: number;
    left: number;
  };
  className?: string;
  centerOnOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export class RetroModal {
  public readonly element: HTMLElement;
  private readonly titlebar: HTMLElement;
  private readonly onClose: () => void;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private isDragging: boolean = false;
  private readonly onMouseMove = (event: MouseEvent): void =>
    this.handleMouseMove(event);
  private readonly onMouseUp = (): void => this.stopDrag();

  constructor(options: RetroModalOptions) {
    this.onClose = options.onClose ?? (() => {});
    this.element = document.createElement("div");
    this.element.id = options.id;
    this.element.className =
      `imb-dialog hidden ${options.className ?? ""}`.trim();
    this.element.dataset.centerOnOpen = String(options.centerOnOpen ?? false);
    this.element.style.top = `${options.initialPosition.top}px`;
    this.element.style.left = `${options.initialPosition.left}px`;
    this.element.innerHTML = `
      <div class="imb-dialog-titlebar" data-drag-handle="true">
        <button
          class="imb-dialog-close retro-window-button retro-window-button-close"
          data-close="${options.id}"
          type="button"
          title="Close"
          aria-label="Close ${options.title}"
        >
          <span>X</span>
        </button>
        <div class="imb-dialog-stripes"></div>
        <span class="imb-dialog-title">${options.title}</span>
        <div class="imb-dialog-stripes"></div>
      </div>
      <div class="imb-dialog-body">${options.body}</div>
    `;

    this.titlebar = this.element.querySelector(".imb-dialog-titlebar")!;
    this.titlebar.addEventListener("mousedown", (event) =>
      this.startDrag(event),
    );
    this.element
      .querySelector("[data-close]")
      ?.addEventListener("click", () => this.hide());
    this.element.addEventListener("mousedown", () => this.bringToFront());

    if (options.onOpen) {
      this.element.addEventListener("retro-modal-open", options.onOpen);
    }
  }

  public show(): void {
    this.element.classList.remove("hidden");
    if (this.element.dataset.centerOnOpen === "true") {
      this.centerInViewport();
    }
    this.clampToViewport();
    this.bringToFront();
    this.element.dispatchEvent(new CustomEvent("retro-modal-open"));
  }

  public hide(): void {
    if (this.element.classList.contains("hidden")) {
      return;
    }
    this.element.classList.add("hidden");
    this.stopDrag();
    this.onClose();
  }

  public isOpen(): boolean {
    return !this.element.classList.contains("hidden");
  }

  public dispose(): void {
    this.stopDrag();
    this.element.remove();
  }

  private bringToFront(): void {
    RetroModalZIndex.current += 1;
    this.element.style.zIndex = String(RetroModalZIndex.current);
  }

  private startDrag(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    const rect = this.element.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.isDragging = true;
    this.bringToFront();
    this.element.classList.add("dragging");
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
    event.preventDefault();
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isDragging) {
      return;
    }

    const maxLeft = window.innerWidth - this.element.offsetWidth - 8;
    const maxTop = window.innerHeight - this.element.offsetHeight - 8;
    const nextLeft = Math.min(
      Math.max(8, event.clientX - this.dragOffsetX),
      Math.max(8, maxLeft),
    );
    const nextTop = Math.min(
      Math.max(8, event.clientY - this.dragOffsetY),
      Math.max(8, maxTop),
    );

    this.element.style.left = `${nextLeft}px`;
    this.element.style.top = `${nextTop}px`;
  }

  private stopDrag(): void {
    if (!this.isDragging) {
      return;
    }

    this.isDragging = false;
    this.element.classList.remove("dragging");
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  }

  private clampToViewport(): void {
    const rect = this.element.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const currentLeft = Number.parseFloat(this.element.style.left) || rect.left;
    const currentTop = Number.parseFloat(this.element.style.top) || rect.top;
    this.element.style.left = `${Math.min(Math.max(8, currentLeft), maxLeft)}px`;
    this.element.style.top = `${Math.min(Math.max(8, currentTop), maxTop)}px`;
  }

  private centerInViewport(): void {
    const rect = this.element.getBoundingClientRect();
    this.element.style.left = `${
      Math.max(8, (window.innerWidth - rect.width) / 2)
    }px`;
    this.element.style.top = `${
      Math.max(8, (window.innerHeight - rect.height) / 2)
    }px`;
  }
}

class RetroModalZIndex {
  public static current: number = 10000;
}

export class GameMenu {
  private readonly pauseItems: PauseMenuItem[] = [
    { action: "new-game", label: "New Game" },
    { action: "continue", label: "Continue Game" },
    { action: "multiplayer", label: "Multiplayer" },
    { action: "settings", label: "Settings" },
    { action: "quit", label: "Quit" },
  ];
  private readonly options: GameMenuOptions;
  private readonly modals: Map<string, RetroModal> = new Map();
  private readonly scrim: HTMLElement;
  private pauseMenuSelection: number = 1;
  private pauseMenuMessage: string | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void =>
    this.handleKeyDown(event);

  constructor(options: GameMenuOptions) {
    this.options = options;
    this.applySavedTheme();
    this.scrim = document.createElement("div");
    this.scrim.className = "imb-modal-scrim hidden";
    document.body.appendChild(this.scrim);
    this.injectHTML();
    this.attachListeners();
  }

  private injectHTML(): void {
    const soundDialog = new RetroModal({
      id: "sound-dialog",
      title: "Sound Settings",
      initialPosition: { top: 112, left: 118 },
      onOpen: () => this.syncSoundControls(),
      onClose: () => this.handleModalClosed(),
      body: `
        <div class="imb-settings-stack">
          <div class="imb-slider-row">
            <label for="sfx-volume">Sound Effects</label>
            <input type="range" id="sfx-volume" min="0" max="100" value="50" />
            <span class="imb-slider-val" id="sfx-vol-label">50%</span>
          </div>
          <div class="imb-slider-row">
            <label for="music-volume">Music</label>
            <input type="range" id="music-volume" min="0" max="100" value="30" />
            <span class="imb-slider-val" id="music-vol-label">30%</span>
          </div>
          <div class="imb-theme-row">
            <span class="imb-theme-label">Appearance</span>
            <div class="imb-theme-toggle" role="group" aria-label="Appearance mode">
              <button class="imb-theme-option" data-theme-value="dark" type="button">
                Dark
              </button>
              <button class="imb-theme-option" data-theme-value="light" type="button">
                Light
              </button>
            </div>
          </div>
        </div>
        <div class="imb-dialog-footer">
          <button class="imb-btn" data-close="sound-dialog" type="button">OK</button>
        </div>
      `,
    });
    this.registerModal(soundDialog);

    const aboutDialog = new RetroModal({
      id: "about-dialog",
      title: "About Dark War",
      initialPosition: { top: 132, left: 156 },
      onClose: () => this.handleModalClosed(),
      body: `
        <div class="imb-about-layout">
          <img
            src="assets/img/app-icon.png"
            class="imb-about-icon"
            alt="Dark War thunderbolt shield"
          />
          <div class="imb-about-text">
            <h2 class="imb-about-title">DARK WAR</h2>
            <p class="imb-about-version">Version 0.1.0 - 2026</p>
            <div class="imb-about-sep"></div>
            <p>A roguelike remake of <em>Mission Thunderbolt</em> (1992).</p>
            <p>Fluid movement, Superhot-style time mechanics, mouse-aimed combat,
            and destructible environments.</p>
            <div class="imb-about-sep"></div>
            <p class="imb-about-credit">Designed &amp; developed by<br>
            <strong>Kyle Horton</strong></p>
            <p class="imb-about-small">Built with TypeScript, Pixi.js &amp; Electron.</p>
          </div>
        </div>
        <div class="imb-dialog-footer">
          <button class="imb-btn" data-close="about-dialog" type="button">Close</button>
        </div>
      `,
    });
    this.registerModal(aboutDialog);

    const pauseDialog = new RetroModal({
      id: "pause-dialog",
      title: "Dark War",
      className: "imb-pause-dialog",
      centerOnOpen: true,
      initialPosition: { top: 96, left: 96 },
      onOpen: () => this.syncPauseMenu(),
      onClose: () => this.handleModalClosed(),
      body: `
        <div class="imb-pause-menu">
          <img
            src="assets/img/logo.png"
            class="imb-pause-logo"
            alt="Dark War"
          />
          <div class="imb-pause-message hidden" id="pause-menu-message"></div>
          <div class="imb-pause-options" role="menu" aria-label="Pause menu">
            ${this.pauseItems
              .map(
                (item, index) => `
                  <button
                    class="imb-pause-option"
                    data-pause-action="${item.action}"
                    data-pause-index="${index}"
                    type="button"
                    role="menuitem"
                  >
                    ${item.label}
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
      `,
    });
    this.registerModal(pauseDialog);
  }

  private registerModal(modal: RetroModal): void {
    document.body.appendChild(modal.element);
    this.modals.set(modal.element.id, modal);
  }

  private attachListeners(): void {
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.close;
        if (!id) return;
        this.modals.get(id)?.hide();
      });
    });

    const sfxSlider = document.getElementById(
      "sfx-volume",
    ) as HTMLInputElement | null;
    const musicSlider = document.getElementById(
      "music-volume",
    ) as HTMLInputElement | null;

    if (sfxSlider) {
      sfxSlider.addEventListener("input", () => {
        const volume = Number.parseInt(sfxSlider.value, 10) / 100;
        Sound.setVolume(volume);
        const label = document.getElementById("sfx-vol-label");
        if (label) label.textContent = `${sfxSlider.value}%`;
      });
    }

    if (musicSlider) {
      musicSlider.addEventListener("input", () => {
        const volume = Number.parseInt(musicSlider.value, 10) / 100;
        Music.setVolume(volume);
        const label = document.getElementById("music-vol-label");
        if (label) label.textContent = `${musicSlider.value}%`;
      });
    }

    document.querySelectorAll("[data-theme-value]").forEach((button) => {
      button.addEventListener("click", () => {
        const theme = (button as HTMLElement).dataset.themeValue;
        if (theme === "dark" || theme === "light") {
          this.setTheme(theme);
        }
      });
    });

    document.querySelectorAll("[data-pause-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = (button as HTMLElement).dataset.pauseAction;
        const index = Number.parseInt(
          (button as HTMLElement).dataset.pauseIndex ?? "0",
          10,
        );
        if (this.isPauseMenuAction(action)) {
          this.pauseMenuSelection = index;
          this.activatePauseMenuSelection();
        }
      });
      button.addEventListener("mouseenter", () => {
        const index = Number.parseInt(
          (button as HTMLElement).dataset.pauseIndex ?? "0",
          10,
        );
        this.pauseMenuSelection = index;
        this.syncPauseMenu();
      });
    });

    window.addEventListener("keydown", this.onKeyDown);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isPauseMenuOpen()) {
      if (this.handlePauseMenuKeyDown(event)) {
        return;
      }
    }

    if (event.key !== "Escape") {
      return;
    }

    const openModals = Array.from(this.modals.values()).filter((modal) =>
      modal.isOpen(),
    );
    const activeModal = openModals[openModals.length - 1];
    if (!activeModal) {
      if (this.options.pausesGame) {
        event.preventDefault();
        this.openPauseMenu();
      }
      return;
    }

    event.preventDefault();
    activeModal.hide();
  }

  private handlePauseMenuKeyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    const isPreviousKey = key === "arrowup" || key === "w" || key === "a";
    const isNextKey = key === "arrowdown" || key === "s" || key === "d";

    if (isPreviousKey || isNextKey) {
      event.preventDefault();
      this.movePauseSelection(isPreviousKey ? -1 : 1);
      return true;
    }

    if (key === "enter") {
      event.preventDefault();
      this.activatePauseMenuSelection();
      return true;
    }

    if (key === "escape") {
      event.preventDefault();
      if (this.pauseMenuMessage) {
        this.pauseMenuMessage = null;
        this.syncPauseMenu();
        return true;
      }
      this.closePauseMenu();
      return true;
    }

    return false;
  }

  private movePauseSelection(delta: number): void {
    this.pauseMenuMessage = null;
    this.pauseMenuSelection =
      (this.pauseMenuSelection + delta + this.pauseItems.length) %
      this.pauseItems.length;
    this.syncPauseMenu();
  }

  private activatePauseMenuSelection(): void {
    const selectedItem = this.pauseItems[this.pauseMenuSelection];
    switch (selectedItem.action) {
      case "new-game":
        this.closePauseMenu();
        this.options.onNewGame?.();
        return;
      case "continue":
        this.closePauseMenu();
        return;
      case "multiplayer":
        this.showPauseMessage("Coming Soon");
        return;
      case "settings":
        this.showPauseMessage("Settings are moving here soon.");
        return;
      case "quit":
        this.options.onQuit?.();
        return;
    }
  }

  private showPauseMessage(message: string): void {
    this.pauseMenuMessage = message;
    this.syncPauseMenu();
  }

  private syncPauseMenu(): void {
    const buttons = document.querySelectorAll<HTMLElement>("[data-pause-index]");
    buttons.forEach((button) => {
      const index = Number.parseInt(button.dataset.pauseIndex ?? "0", 10);
      const isSelected = index === this.pauseMenuSelection;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-selected", String(isSelected));
    });

    const message = document.getElementById("pause-menu-message");
    if (!message) {
      return;
    }
    message.textContent = this.pauseMenuMessage ?? "";
    message.classList.toggle("hidden", !this.pauseMenuMessage);
  }

  private isPauseMenuAction(
    action: string | undefined,
  ): action is PauseMenuAction {
    return this.pauseItems.some((item) => item.action === action);
  }

  private isPauseMenuOpen(): boolean {
    return this.modals.get("pause-dialog")?.isOpen() ?? false;
  }

  private showModal(id: string): void {
    const modal = this.modals.get(id);
    if (!modal) {
      return;
    }

    modal.show();
    this.syncModalState();
  }

  private handleModalClosed(): void {
    this.syncModalState();
  }

  private syncModalState(): void {
    const hasOpenModal = Array.from(this.modals.values()).some((modal) =>
      modal.isOpen(),
    );
    this.scrim.classList.toggle("hidden", !hasOpenModal);
    document.body.classList.toggle("imb-modal-open", hasOpenModal);
    if (this.options.pausesGame) {
      this.options.onModalStateChange?.(hasOpenModal);
    }
  }

  private syncSoundControls(): void {
    const sfxSlider = document.getElementById(
      "sfx-volume",
    ) as HTMLInputElement | null;
    const musicSlider = document.getElementById(
      "music-volume",
    ) as HTMLInputElement | null;
    const sfxLabel = document.getElementById("sfx-vol-label");
    const musicLabel = document.getElementById("music-vol-label");

    if (sfxSlider) {
      const volume = Math.round(Sound.getVolume() * 100);
      sfxSlider.value = String(volume);
      if (sfxLabel) sfxLabel.textContent = `${volume}%`;
    }

    if (musicSlider) {
      const volume = Math.round(Music.getVolume() * 100);
      musicSlider.value = String(volume);
      if (musicLabel) musicLabel.textContent = `${volume}%`;
    }

    this.syncThemeButtons();
  }

  private applySavedTheme(): void {
    const savedTheme = localStorage.getItem("darkwar-ui-theme");
    this.setTheme(savedTheme === "light" ? "light" : "dark", false);
  }

  private setTheme(theme: ThemeMode, persist: boolean = true): void {
    document.documentElement.dataset.theme = theme;
    if (persist) {
      localStorage.setItem("darkwar-ui-theme", theme);
    }
    this.syncThemeButtons();
  }

  private syncThemeButtons(): void {
    const currentTheme =
      document.documentElement.dataset.theme === "light" ? "light" : "dark";
    document.querySelectorAll("[data-theme-value]").forEach((button) => {
      const isSelected =
        (button as HTMLElement).dataset.themeValue === currentTheme;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  /**
   * Open the sound settings dialog.
   */
  public openSoundDialog(): void {
    this.showModal("sound-dialog");
  }

  /**
   * Open the About dialog.
   */
  public openAboutDialog(): void {
    this.showModal("about-dialog");
  }

  public openPauseMenu(): void {
    if (!this.options.pausesGame) {
      return;
    }
    this.pauseMenuSelection = 1;
    this.pauseMenuMessage = null;
    this.showModal("pause-dialog");
  }

  public closePauseMenu(): void {
    this.modals.get("pause-dialog")?.hide();
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    for (const modal of this.modals.values()) {
      modal.dispose();
    }
    this.modals.clear();
    this.scrim.remove();
    document.body.classList.remove("imb-modal-open");
    this.options.onModalStateChange?.(false);
  }
}
