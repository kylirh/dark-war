/**
 * Reusable retro system modal components for game menu dialogs.
 */
import { Music } from "./Music";
import {
  DEFAULT_KEY_BINDINGS,
  KEY_BINDING_DEFINITIONS,
  KeyBindingAction,
  UserPreferences,
  keyCodeToLabel,
} from "./Preferences";
import { Sound } from "./Sound";

type ThemeMode = "dark" | "light";
type PauseMenuAction =
  | "new-game"
  | "continue"
  | "multiplayer"
  | "settings"
  | "quit";
type PauseMenuView = "main" | "settings" | "keybindings";

interface PauseMenuItem {
  action: PauseMenuAction;
  label: string;
}

interface GameMenuOptions {
  pausesGame: boolean;
  preferences: UserPreferences;
  allowPauseMenuClose?: boolean;
  canContinue?: boolean;
  onModalStateChange?: (hasOpenModal: boolean) => void;
  onPreferencesChange?: (preferences: UserPreferences) => void;
  onNewGame?: () => void;
  onContinue?: () => void;
  onQuit?: () => void;
  onToggleFOV?: () => void;
  onToggleGodMode?: () => void;
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
  private preferences: UserPreferences;
  private pauseMenuView: PauseMenuView = "main";
  private pauseMenuSelection: number = 1;
  private pauseMenuMessage: string | null = null;
  private listeningForKey: KeyBindingAction | null = null;
  private canContinue: boolean;
  private readonly onKeyDown = (event: KeyboardEvent): void =>
    this.handleKeyDown(event);

  constructor(options: GameMenuOptions) {
    this.options = options;
    this.canContinue = options.canContinue ?? true;
    this.preferences = {
      ...options.preferences,
      keyBindings: { ...options.preferences.keyBindings },
    };
    this.applyTheme(this.preferences.theme);
    this.scrim = document.createElement("div");
    this.scrim.className = "imb-modal-scrim hidden";
    document.body.appendChild(this.scrim);
    this.injectHTML();
    this.attachListeners();
  }

  private injectHTML(): void {
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
          <div class="imb-pause-view" data-pause-view="main">
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
          <div class="imb-pause-view hidden" data-pause-view="settings">
            <div class="imb-settings-header">
              <button class="imb-btn imb-back-btn" data-settings-back type="button">
                Back
              </button>
              <h3>Settings</h3>
            </div>
            <div class="imb-settings-stack">
              <div class="imb-slider-row">
                <label for="pause-sfx-volume">Sound Effects</label>
                <input
                  type="range"
                  id="pause-sfx-volume"
                  min="0"
                  max="100"
                  value="50"
                />
                <span class="imb-slider-val" id="pause-sfx-vol-label">50%</span>
              </div>
              <div class="imb-slider-row">
                <label for="pause-music-volume">Music</label>
                <input
                  type="range"
                  id="pause-music-volume"
                  min="0"
                  max="100"
                  value="30"
                />
                <span class="imb-slider-val" id="pause-music-vol-label">30%</span>
              </div>
              <div class="imb-theme-row">
                <span class="imb-theme-label">Appearance</span>
                <div class="imb-theme-toggle" role="group" aria-label="Appearance mode">
                  <button
                    class="imb-theme-option"
                    data-settings-theme-value="dark"
                    type="button"
                  >
                    Dark
                  </button>
                  <button
                    class="imb-theme-option"
                    data-settings-theme-value="light"
                    type="button"
                  >
                    Light
                  </button>
                </div>
              </div>
              <div class="imb-theme-row">
                <span class="imb-theme-label">Zoom</span>
                <div class="imb-theme-toggle" role="group" aria-label="Zoom level">
                  <button class="imb-theme-option" data-zoom-value="1" type="button">
                    1X
                  </button>
                  <button class="imb-theme-option" data-zoom-value="2" type="button">
                    2X
                  </button>
                  <button class="imb-theme-option" data-zoom-value="3" type="button">
                    3X
                  </button>
                </div>
              </div>
              <label class="imb-checkbox-row">
                <input id="dev-tools-toggle" type="checkbox" />
                <span>Dev Tools</span>
              </label>
              <div class="imb-dev-tools-panel hidden" data-dev-tools-panel>
                <button class="imb-btn" data-dev-action="god-mode" type="button">
                  Toggle God Mode
                </button>
                <button class="imb-btn" data-dev-action="fov" type="button">
                  Toggle FOV
                </button>
              </div>
              <button class="imb-btn" data-open-keybindings type="button">
                Keyboard Bindings
              </button>
            </div>
          </div>
          <div class="imb-pause-view hidden" data-pause-view="keybindings">
            <div class="imb-settings-header">
              <button class="imb-btn imb-back-btn" data-keybindings-back type="button">
                Back
              </button>
              <h3>Keyboard Bindings</h3>
            </div>
            <div class="imb-keybinding-list">
              ${KEY_BINDING_DEFINITIONS.map(
                (definition) => `
                  <div
                    class="imb-keybinding-row${definition.devOnly ? " dev-only" : ""}"
                    data-keybinding-row="${definition.action}"
                  >
                    <span>${definition.label}</span>
                    <button
                      class="imb-keybinding-button"
                      data-keybinding-action="${definition.action}"
                      type="button"
                    ></button>
                  </div>
                `,
              ).join("")}
            </div>
            <button class="imb-btn" data-reset-keybindings type="button">
              Restore Defaults
            </button>
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

    const pauseSfxSlider = document.getElementById(
      "pause-sfx-volume",
    ) as HTMLInputElement | null;
    const pauseMusicSlider = document.getElementById(
      "pause-music-volume",
    ) as HTMLInputElement | null;

    if (pauseSfxSlider) {
      pauseSfxSlider.addEventListener("input", () => {
        const volume = Number.parseInt(pauseSfxSlider.value, 10) / 100;
        Sound.setVolume(volume);
        this.updatePreferences({ sfxVolume: volume });
        this.syncSoundControls();
      });
    }

    if (pauseMusicSlider) {
      pauseMusicSlider.addEventListener("input", () => {
        const volume = Number.parseInt(pauseMusicSlider.value, 10) / 100;
        Music.setVolume(volume);
        this.updatePreferences({ musicVolume: volume });
        this.syncSoundControls();
      });
    }

    document.querySelectorAll("[data-settings-theme-value]").forEach((button) => {
      button.addEventListener("click", () => {
        const theme = (button as HTMLElement).dataset.settingsThemeValue;
        if (theme === "dark" || theme === "light") {
          this.setTheme(theme);
        }
      });
    });

    document.querySelectorAll("[data-zoom-value]").forEach((button) => {
      button.addEventListener("click", () => {
        const zoom = Number.parseInt(
          (button as HTMLElement).dataset.zoomValue ?? "1",
          10,
        );
        if (zoom === 1 || zoom === 2 || zoom === 3) {
          this.updatePreferences({ zoom });
          this.syncSettingsControls();
        }
      });
    });

    document.getElementById("dev-tools-toggle")?.addEventListener("change", (event) => {
      const enabled = (event.target as HTMLInputElement).checked;
      this.updatePreferences({ devTools: enabled });
      this.syncSettingsControls();
    });

    document.querySelector("[data-open-keybindings]")?.addEventListener("click", () => {
      this.setPauseMenuView("keybindings");
    });

    document.querySelector("[data-settings-back]")?.addEventListener("click", () => {
      this.setPauseMenuView("main");
    });

    document.querySelector("[data-keybindings-back]")?.addEventListener("click", () => {
      this.setPauseMenuView("settings");
    });

    document.querySelector("[data-reset-keybindings]")?.addEventListener("click", () => {
      this.updatePreferences({ keyBindings: { ...DEFAULT_KEY_BINDINGS } });
      this.syncKeybindingControls();
    });

    document.querySelector("[data-dev-action='god-mode']")?.addEventListener(
      "click",
      () => this.options.onToggleGodMode?.(),
    );
    document.querySelector("[data-dev-action='fov']")?.addEventListener(
      "click",
      () => this.options.onToggleFOV?.(),
    );

    document.querySelectorAll("[data-keybinding-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = (button as HTMLElement).dataset.keybindingAction;
        if (this.isKeyBindingAction(action)) {
          this.listeningForKey = action;
          this.syncKeybindingControls();
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
    if (this.listeningForKey) {
      event.preventDefault();
      if (event.key === "Escape") {
        this.listeningForKey = null;
        this.syncKeybindingControls();
        return true;
      }
      this.assignKeyBinding(this.listeningForKey, event.code);
      this.listeningForKey = null;
      this.syncKeybindingControls();
      return true;
    }

    const key = event.key.toLowerCase();

    if (this.pauseMenuView !== "main") {
      if (key === "escape") {
        event.preventDefault();
        this.setPauseMenuView(
          this.pauseMenuView === "keybindings" ? "settings" : "main",
        );
        return true;
      }
      return false;
    }

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
      if (this.options.allowPauseMenuClose === false) {
        return true;
      }
      this.closePauseMenu();
      return true;
    }

    return false;
  }

  private movePauseSelection(delta: number): void {
    this.pauseMenuMessage = null;
    let nextSelection = this.pauseMenuSelection;
    for (let i = 0; i < this.pauseItems.length; i += 1) {
      nextSelection =
        (nextSelection + delta + this.pauseItems.length) %
        this.pauseItems.length;
      if (this.isPauseItemEnabled(this.pauseItems[nextSelection])) {
        this.pauseMenuSelection = nextSelection;
        break;
      }
    }
    this.syncPauseMenu();
  }

  private activatePauseMenuSelection(): void {
    const selectedItem = this.pauseItems[this.pauseMenuSelection];
    if (!this.isPauseItemEnabled(selectedItem)) {
      this.showPauseMessage("No game in progress");
      return;
    }

    switch (selectedItem.action) {
      case "new-game":
        this.closePauseMenu(true);
        this.options.onNewGame?.();
        return;
      case "continue":
        this.closePauseMenu(true);
        this.options.onContinue?.();
        return;
      case "multiplayer":
        this.showPauseMessage("Coming Soon");
        return;
      case "settings":
        this.setPauseMenuView("settings");
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
    document.querySelectorAll<HTMLElement>("[data-pause-view]").forEach((view) => {
      view.classList.toggle(
        "hidden",
        view.dataset.pauseView !== this.pauseMenuView,
      );
    });

    const buttons = document.querySelectorAll<HTMLElement>("[data-pause-index]");
    buttons.forEach((button) => {
      const index = Number.parseInt(button.dataset.pauseIndex ?? "0", 10);
      const item = this.pauseItems[index];
      const isSelected = index === this.pauseMenuSelection;
      const isEnabled = item ? this.isPauseItemEnabled(item) : true;
      button.classList.toggle("selected", isSelected);
      button.classList.toggle("disabled", !isEnabled);
      button.setAttribute("aria-selected", String(isSelected));
      button.setAttribute("aria-disabled", String(!isEnabled));
      if (button instanceof HTMLButtonElement) {
        button.disabled = !isEnabled;
      }
    });

    const message = document.getElementById("pause-menu-message");
    if (!message) {
      return;
    }
    message.textContent = this.pauseMenuMessage ?? "";
    message.classList.toggle("hidden", !this.pauseMenuMessage);
    this.syncSettingsControls();
    this.syncKeybindingControls();
  }

  private isPauseMenuAction(
    action: string | undefined,
  ): action is PauseMenuAction {
    return this.pauseItems.some((item) => item.action === action);
  }

  private isPauseItemEnabled(item: PauseMenuItem): boolean {
    return item.action !== "continue" || this.canContinue;
  }

  private getInitialPauseSelection(): number {
    const continueIndex = this.pauseItems.findIndex(
      (item) => item.action === "continue" && this.isPauseItemEnabled(item),
    );
    if (continueIndex >= 0) {
      return continueIndex;
    }

    return Math.max(
      0,
      this.pauseItems.findIndex((item) => this.isPauseItemEnabled(item)),
    );
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
    const pauseSfxSlider = document.getElementById(
      "pause-sfx-volume",
    ) as HTMLInputElement | null;
    const pauseMusicSlider = document.getElementById(
      "pause-music-volume",
    ) as HTMLInputElement | null;
    const pauseSfxLabel = document.getElementById("pause-sfx-vol-label");
    const pauseMusicLabel = document.getElementById("pause-music-vol-label");

    if (pauseSfxSlider) {
      const volume = Math.round(this.preferences.sfxVolume * 100);
      pauseSfxSlider.value = String(volume);
      if (pauseSfxLabel) pauseSfxLabel.textContent = `${volume}%`;
    }

    if (pauseMusicSlider) {
      const volume = Math.round(this.preferences.musicVolume * 100);
      pauseMusicSlider.value = String(volume);
      if (pauseMusicLabel) pauseMusicLabel.textContent = `${volume}%`;
    }

    this.syncThemeButtons();
  }

  private updatePreferences(next: Partial<UserPreferences>): void {
    this.preferences = {
      ...this.preferences,
      ...next,
      keyBindings: next.keyBindings
        ? { ...next.keyBindings }
        : { ...this.preferences.keyBindings },
    };
    Sound.setVolume(this.preferences.sfxVolume);
    Music.setVolume(this.preferences.musicVolume);
    this.applyTheme(this.preferences.theme);
    this.options.onPreferencesChange?.({
      ...this.preferences,
      keyBindings: { ...this.preferences.keyBindings },
    });
  }

  private applyTheme(theme: ThemeMode): void {
    document.documentElement.dataset.theme = theme;
  }

  private setTheme(theme: ThemeMode): void {
    this.updatePreferences({ theme });
    this.syncThemeButtons();
  }

  private syncThemeButtons(): void {
    const currentTheme = this.preferences.theme;
    document.querySelectorAll("[data-settings-theme-value]").forEach((button) => {
      const isSelected =
        (button as HTMLElement).dataset.settingsThemeValue === currentTheme;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  private syncSettingsControls(): void {
    this.syncSoundControls();
    document.querySelectorAll("[data-zoom-value]").forEach((button) => {
      const zoom = Number.parseInt(
        (button as HTMLElement).dataset.zoomValue ?? "1",
        10,
      );
      const isSelected = zoom === this.preferences.zoom;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });

    const devToolsToggle = document.getElementById(
      "dev-tools-toggle",
    ) as HTMLInputElement | null;
    if (devToolsToggle) {
      devToolsToggle.checked = this.preferences.devTools;
    }

    document.querySelectorAll<HTMLElement>(".dev-only").forEach((element) => {
      element.classList.toggle("hidden", !this.preferences.devTools);
    });
    document.querySelectorAll<HTMLElement>("[data-dev-tools-panel]").forEach(
      (element) => {
        element.classList.toggle("hidden", !this.preferences.devTools);
      },
    );
  }

  private setPauseMenuView(view: PauseMenuView): void {
    this.pauseMenuView = view;
    this.pauseMenuMessage = null;
    this.listeningForKey = null;
    this.syncPauseMenu();
  }

  private assignKeyBinding(action: KeyBindingAction, code: string): void {
    const keyBindings = { ...this.preferences.keyBindings };
    for (const definition of KEY_BINDING_DEFINITIONS) {
      if (
        definition.action !== action &&
        keyBindings[definition.action] === code
      ) {
        keyBindings[definition.action] = this.preferences.keyBindings[action];
      }
    }
    keyBindings[action] = code;
    this.updatePreferences({ keyBindings });
  }

  private syncKeybindingControls(): void {
    document
      .querySelectorAll<HTMLElement>("[data-keybinding-row]")
      .forEach((row) => {
        const action = row.dataset.keybindingRow;
        const definition = KEY_BINDING_DEFINITIONS.find(
          (candidate) => candidate.action === action,
        );
        row.classList.toggle(
          "hidden",
          Boolean(definition?.devOnly && !this.preferences.devTools),
        );
      });

    document
      .querySelectorAll<HTMLButtonElement>("[data-keybinding-action]")
      .forEach((button) => {
        const action = button.dataset.keybindingAction;
        if (!this.isKeyBindingAction(action)) {
          return;
        }
        button.textContent =
          this.listeningForKey === action
            ? "Press a key..."
            : keyCodeToLabel(this.preferences.keyBindings[action]);
        button.classList.toggle("listening", this.listeningForKey === action);
      });
  }

  private isKeyBindingAction(
    action: string | undefined,
  ): action is KeyBindingAction {
    return KEY_BINDING_DEFINITIONS.some(
      (definition) => definition.action === action,
    );
  }

  /**
   * Open the sound settings dialog.
   */
  public openSoundDialog(): void {
    this.openPauseMenu("settings");
  }

  /**
   * Open the About dialog.
   */
  public openAboutDialog(): void {
    this.showModal("about-dialog");
  }

  public openPauseMenu(view: PauseMenuView = "main"): void {
    this.pauseMenuView = view;
    this.pauseMenuSelection = this.getInitialPauseSelection();
    this.pauseMenuMessage = null;
    this.listeningForKey = null;
    this.showModal("pause-dialog");
  }

  public closePauseMenu(force: boolean = false): void {
    if (!force && this.options.allowPauseMenuClose === false) {
      return;
    }
    this.modals.get("pause-dialog")?.hide();
  }

  public setContinueEnabled(enabled: boolean): void {
    this.canContinue = enabled;
    if (!this.isPauseItemEnabled(this.pauseItems[this.pauseMenuSelection])) {
      this.pauseMenuSelection = this.getInitialPauseSelection();
    }
    this.syncPauseMenu();
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
