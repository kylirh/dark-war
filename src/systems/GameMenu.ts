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
import { LobbyPlayer } from "../net/MultiplayerClient";

// ─── Types ──────────────────────────────────────────────────────────────────────

type ThemeMode = "dark" | "light";
type PauseMenuAction = "new-game" | "continue" | "multiplayer" | "settings" | "quit";
type PauseMenuView =
  | "main"
  | "settings"
  | "keybindings"
  | "multiplayer"
  | "host-game"
  | "browse-games"
  | "join-ip"
  | "lobby";

interface PauseMenuItem {
  action: PauseMenuAction;
  label: string;
}

export interface DiscoveredServer {
  ip: string;
  port: number;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  phase: "lobby" | "playing";
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
  // Multiplayer
  onMultiplayerHost?: (gameName: string, playerName: string) => void;
  onMultiplayerJoin?: (ip: string, port: number, playerName: string) => void;
  onMultiplayerStartGame?: () => void;
  onMultiplayerLeaveLobby?: () => void;
  onMultiplayerGetServers?: () => Promise<DiscoveredServer[]>;
  onMultiplayerStartDiscovery?: () => void;
  onMultiplayerStopDiscovery?: () => void;
}

export interface RetroModalOptions {
  id: string;
  title: string;
  body: string;
  initialPosition: { top: number; left: number };
  className?: string;
  centerOnOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

// ─── RetroModal ──────────────────────────────────────────────────────────────────

export class RetroModal {
  public readonly element: HTMLElement;
  private readonly titlebar: HTMLElement;
  private readonly onClose: () => void;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isDragging = false;
  private readonly onMouseMove = (event: MouseEvent): void => this.handleMouseMove(event);
  private readonly onMouseUp = (): void => this.stopDrag();

  constructor(options: RetroModalOptions) {
    this.onClose = options.onClose ?? (() => {});
    this.element = document.createElement("div");
    this.element.id = options.id;
    this.element.className = `imb-dialog hidden ${options.className ?? ""}`.trim();
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
    this.titlebar.addEventListener("mousedown", (event) => this.startDrag(event));
    this.element.querySelector("[data-close]")?.addEventListener("click", () => this.hide());
    this.element.addEventListener("mousedown", () => this.bringToFront());

    if (options.onOpen) {
      this.element.addEventListener("retro-modal-open", options.onOpen);
    }
  }

  public show(): void {
    this.element.classList.remove("hidden");
    if (this.element.dataset.centerOnOpen === "true") this.centerInViewport();
    this.clampToViewport();
    this.bringToFront();
    this.element.dispatchEvent(new CustomEvent("retro-modal-open"));
  }

  public hide(): void {
    if (this.element.classList.contains("hidden")) return;
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
    if ((event.target as HTMLElement).closest("button")) return;
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
    if (!this.isDragging) return;
    const maxLeft = window.innerWidth - this.element.offsetWidth - 8;
    const maxTop = window.innerHeight - this.element.offsetHeight - 8;
    this.element.style.left = `${Math.min(Math.max(8, event.clientX - this.dragOffsetX), Math.max(8, maxLeft))}px`;
    this.element.style.top = `${Math.min(Math.max(8, event.clientY - this.dragOffsetY), Math.max(8, maxTop))}px`;
  }

  private stopDrag(): void {
    if (!this.isDragging) return;
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
    this.element.style.left = `${Math.max(8, (window.innerWidth - rect.width) / 2)}px`;
    this.element.style.top = `${Math.max(8, (window.innerHeight - rect.height) / 2)}px`;
  }
}

class RetroModalZIndex {
  public static current = 10000;
}

// ─── GameMenu ────────────────────────────────────────────────────────────────────

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
  private pauseMenuSelection = 1;
  private pauseMenuMessage: string | null = null;
  private listeningForKey: KeyBindingAction | null = null;
  private canContinue: boolean;

  // Multiplayer state
  private mpPlayerName = "Player";
  private mpGameName = "Dark War";
  private mpJoinIp = "";
  private mpJoinPort = "7777";
  private mpLobbyPlayers: LobbyPlayer[] = [];
  private mpIsHost = false;
  private mpPhase: "lobby" | "playing" = "lobby";
  private mpConnectionState: "disconnected" | "connecting" | "lobby" | "playing" = "disconnected";
  private mpDiscoveredServers: DiscoveredServer[] = [];
  private mpRefreshTimer: number | null = null;
  private mpStatusMessage = "";

  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

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

  // ── HTML injection ──────────────────────────────────────────────────────────────

  private injectHTML(): void {
    const aboutDialog = new RetroModal({
      id: "about-dialog",
      title: "About Dark War",
      initialPosition: { top: 132, left: 156 },
      onClose: () => this.handleModalClosed(),
      body: `
        <div class="imb-about-layout">
          <img src="assets/img/app-icon.png" class="imb-about-icon" alt="Dark War thunderbolt shield" />
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
      body: this.buildPauseDialogBody(),
    });
    this.registerModal(pauseDialog);
  }

  private buildPauseDialogBody(): string {
    return `
      <div class="imb-pause-menu">

        <!-- ── Main view ── -->
        <div class="imb-pause-view" data-pause-view="main">
          <img src="assets/img/logo.png" class="imb-pause-logo" alt="Dark War" />
          <div class="imb-pause-message hidden" id="pause-menu-message"></div>
          <div class="imb-pause-options" role="menu" aria-label="Pause menu">
            ${this.pauseItems.map((item, index) => `
              <button
                class="imb-pause-option"
                data-pause-action="${item.action}"
                data-pause-index="${index}"
                type="button"
                role="menuitem"
              >${item.label}</button>
            `).join("")}
          </div>
        </div>

        <!-- ── Settings view ── -->
        <div class="imb-pause-view hidden" data-pause-view="settings">
          <div class="imb-settings-header">
            <button class="imb-btn imb-back-btn" data-settings-back type="button">Back</button>
            <h3>Settings</h3>
          </div>
          <div class="imb-settings-stack">
            <div class="imb-slider-row">
              <label for="pause-sfx-volume">Sound Effects</label>
              <input type="range" id="pause-sfx-volume" min="0" max="100" value="50" />
              <span class="imb-slider-val" id="pause-sfx-vol-label">50%</span>
            </div>
            <div class="imb-slider-row">
              <label for="pause-music-volume">Music</label>
              <input type="range" id="pause-music-volume" min="0" max="100" value="30" />
              <span class="imb-slider-val" id="pause-music-vol-label">30%</span>
            </div>
            <div class="imb-theme-row">
              <span class="imb-theme-label">Appearance</span>
              <div class="imb-theme-toggle" role="group" aria-label="Appearance mode">
                <button class="imb-theme-option" data-settings-theme-value="dark" type="button">Dark</button>
                <button class="imb-theme-option" data-settings-theme-value="light" type="button">Light</button>
              </div>
            </div>
            <div class="imb-theme-row">
              <span class="imb-theme-label">Zoom</span>
              <div class="imb-theme-toggle" role="group" aria-label="Zoom level">
                <button class="imb-theme-option" data-zoom-value="1" type="button">1X</button>
                <button class="imb-theme-option" data-zoom-value="2" type="button">2X</button>
                <button class="imb-theme-option" data-zoom-value="3" type="button">3X</button>
              </div>
            </div>
            <label class="imb-checkbox-row">
              <input id="dev-tools-toggle" type="checkbox" />
              <span>Dev Tools</span>
            </label>
            <div class="imb-dev-tools-panel hidden" data-dev-tools-panel>
              <button class="imb-btn" data-dev-action="god-mode" type="button">Toggle God Mode</button>
              <button class="imb-btn" data-dev-action="fov" type="button">Toggle FOV</button>
            </div>
            <button class="imb-btn" data-open-keybindings type="button">Keyboard Bindings</button>
          </div>
        </div>

        <!-- ── Keybindings view ── -->
        <div class="imb-pause-view hidden" data-pause-view="keybindings">
          <div class="imb-settings-header">
            <button class="imb-btn imb-back-btn" data-keybindings-back type="button">Back</button>
            <h3>Keyboard Bindings</h3>
          </div>
          <div class="imb-keybinding-list">
            ${KEY_BINDING_DEFINITIONS.map((definition) => `
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
            `).join("")}
          </div>
          <button class="imb-btn" data-reset-keybindings type="button">Restore Defaults</button>
        </div>

        <!-- ── Multiplayer main view ── -->
        <div class="imb-pause-view hidden" data-pause-view="multiplayer">
          <div class="imb-settings-header">
            <button class="imb-btn imb-back-btn" data-mp-back="main" type="button">Back</button>
            <h3>Multiplayer</h3>
          </div>
          <div class="imb-mp-options">
            <button class="imb-pause-option" data-mp-action="host" type="button">Host a Game</button>
            <button class="imb-pause-option" data-mp-action="browse" type="button">Find Games on LAN</button>
            <button class="imb-pause-option" data-mp-action="join-ip" type="button">Join by IP Address</button>
          </div>
          <p class="imb-mp-hint">Play with others on your local network — no internet required.</p>
        </div>

        <!-- ── Host game view ── -->
        <div class="imb-pause-view hidden" data-pause-view="host-game">
          <div class="imb-settings-header">
            <button class="imb-btn imb-back-btn" data-mp-back="multiplayer" type="button">Back</button>
            <h3>Host a Game</h3>
          </div>
          <div class="imb-settings-stack">
            <div class="imb-input-row">
              <label for="mp-game-name">Game Name</label>
              <input class="imb-text-input" id="mp-game-name" type="text" maxlength="32" placeholder="Dark War" />
            </div>
            <div class="imb-input-row">
              <label for="mp-host-name">Your Name</label>
              <input class="imb-text-input" id="mp-host-name" type="text" maxlength="24" placeholder="Player" />
            </div>
            <div id="mp-host-status" class="imb-mp-status hidden"></div>
            <button class="imb-pause-option" id="mp-host-btn" type="button">Start Hosting</button>
          </div>
        </div>

        <!-- ── Browse games view ── -->
        <div class="imb-pause-view hidden" data-pause-view="browse-games">
          <div class="imb-settings-header">
            <button class="imb-btn imb-back-btn" data-mp-back="multiplayer" type="button">Back</button>
            <h3>Find Games on LAN</h3>
          </div>
          <div class="imb-input-row">
            <label for="mp-browse-name">Your Name</label>
            <input class="imb-text-input" id="mp-browse-name" type="text" maxlength="24" placeholder="Player" />
          </div>
          <div id="mp-server-list" class="imb-server-list">
            <div class="imb-server-searching">Searching for games...</div>
          </div>
          <div id="mp-browse-status" class="imb-mp-status hidden"></div>
          <button class="imb-btn" id="mp-refresh-btn" type="button">Refresh</button>
        </div>

        <!-- ── Join by IP view ── -->
        <div class="imb-pause-view hidden" data-pause-view="join-ip">
          <div class="imb-settings-header">
            <button class="imb-btn imb-back-btn" data-mp-back="multiplayer" type="button">Back</button>
            <h3>Join by IP Address</h3>
          </div>
          <div class="imb-settings-stack">
            <div class="imb-input-row">
              <label for="mp-join-name">Your Name</label>
              <input class="imb-text-input" id="mp-join-name" type="text" maxlength="24" placeholder="Player" />
            </div>
            <div class="imb-input-row">
              <label for="mp-join-ip">Host IP Address</label>
              <input class="imb-text-input" id="mp-join-ip" type="text" maxlength="64" placeholder="192.168.1.x" />
            </div>
            <div class="imb-input-row">
              <label for="mp-join-port">Port</label>
              <input class="imb-text-input" id="mp-join-port" type="text" maxlength="6" placeholder="7777" />
            </div>
            <div id="mp-join-status" class="imb-mp-status hidden"></div>
            <button class="imb-pause-option" id="mp-join-btn" type="button">Join Game</button>
          </div>
        </div>

        <!-- ── Lobby view ── -->
        <div class="imb-pause-view hidden" data-pause-view="lobby">
          <div class="imb-settings-header">
            <button class="imb-btn" id="mp-leave-btn" type="button">Leave</button>
            <h3 id="mp-lobby-title">Lobby</h3>
          </div>
          <div id="mp-lobby-status" class="imb-mp-lobby-status">Waiting for players...</div>
          <div id="mp-lobby-players" class="imb-lobby-players"></div>
          <div class="imb-lobby-actions">
            <button class="imb-pause-option" id="mp-start-btn" type="button" style="display:none">Start Game</button>
          </div>
          <div id="mp-lobby-hint" class="imb-mp-hint"></div>
        </div>

      </div>
    `;
  }

  // ── Listener attachment ─────────────────────────────────────────────────────────

  private attachListeners(): void {
    this.attachCloseButtons();
    this.attachSoundControls();
    this.attachThemeControls();
    this.attachZoomControls();
    this.attachDevToolsControls();
    this.attachKeybindingControls();
    this.attachPauseMenuControls();
    this.attachMultiplayerControls();
    window.addEventListener("keydown", this.onKeyDown);
  }

  private attachCloseButtons(): void {
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.close;
        if (id) this.modals.get(id)?.hide();
      });
    });
  }

  private attachSoundControls(): void {
    const sfxSlider = document.getElementById("pause-sfx-volume") as HTMLInputElement | null;
    const musicSlider = document.getElementById("pause-music-volume") as HTMLInputElement | null;

    sfxSlider?.addEventListener("input", () => {
      const volume = Number.parseInt(sfxSlider.value, 10) / 100;
      Sound.setVolume(volume);
      this.updatePreferences({ sfxVolume: volume });
      this.syncSoundControls();
    });

    musicSlider?.addEventListener("input", () => {
      const volume = Number.parseInt(musicSlider.value, 10) / 100;
      Music.setVolume(volume);
      this.updatePreferences({ musicVolume: volume });
      this.syncSoundControls();
    });
  }

  private attachThemeControls(): void {
    document.querySelectorAll("[data-settings-theme-value]").forEach((button) => {
      button.addEventListener("click", () => {
        const theme = (button as HTMLElement).dataset.settingsThemeValue;
        if (theme === "dark" || theme === "light") this.setTheme(theme);
      });
    });
  }

  private attachZoomControls(): void {
    document.querySelectorAll("[data-zoom-value]").forEach((button) => {
      button.addEventListener("click", () => {
        const zoom = Number.parseInt((button as HTMLElement).dataset.zoomValue ?? "1", 10);
        if (zoom === 1 || zoom === 2 || zoom === 3) {
          this.updatePreferences({ zoom });
          this.syncSettingsControls();
        }
      });
    });
  }

  private attachDevToolsControls(): void {
    document.getElementById("dev-tools-toggle")?.addEventListener("change", (event) => {
      this.updatePreferences({ devTools: (event.target as HTMLInputElement).checked });
      this.syncSettingsControls();
    });

    document.querySelector("[data-open-keybindings]")?.addEventListener("click", () => {
      this.setPauseMenuView("keybindings");
    });

    document.querySelector("[data-settings-back]")?.addEventListener("click", () => {
      this.setPauseMenuView("main");
    });

    document.querySelector("[data-dev-action='god-mode']")?.addEventListener("click", () => {
      this.options.onToggleGodMode?.();
    });

    document.querySelector("[data-dev-action='fov']")?.addEventListener("click", () => {
      this.options.onToggleFOV?.();
    });
  }

  private attachKeybindingControls(): void {
    document.querySelector("[data-keybindings-back]")?.addEventListener("click", () => {
      this.setPauseMenuView("settings");
    });

    document.querySelector("[data-reset-keybindings]")?.addEventListener("click", () => {
      this.updatePreferences({ keyBindings: { ...DEFAULT_KEY_BINDINGS } });
      this.syncKeybindingControls();
    });

    document.querySelectorAll("[data-keybinding-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = (button as HTMLElement).dataset.keybindingAction;
        if (this.isKeyBindingAction(action)) {
          this.listeningForKey = action;
          this.syncKeybindingControls();
        }
      });
    });
  }

  private attachPauseMenuControls(): void {
    document.querySelectorAll("[data-pause-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = (button as HTMLElement).dataset.pauseAction;
        const index = Number.parseInt((button as HTMLElement).dataset.pauseIndex ?? "0", 10);
        if (this.isPauseMenuAction(action)) {
          this.pauseMenuSelection = index;
          this.activatePauseMenuSelection();
        }
      });
      button.addEventListener("mouseenter", () => {
        const index = Number.parseInt((button as HTMLElement).dataset.pauseIndex ?? "0", 10);
        this.pauseMenuSelection = index;
        this.syncPauseMenu();
      });
    });
  }

  private attachMultiplayerControls(): void {
    // Back buttons for MP views
    document.querySelectorAll("[data-mp-back]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = (btn as HTMLElement).dataset.mpBack as PauseMenuView;
        this.setPauseMenuView(target);
      });
    });

    // MP main menu buttons
    document.querySelectorAll("[data-mp-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = (btn as HTMLElement).dataset.mpAction;
        if (action === "host") this.setPauseMenuView("host-game");
        else if (action === "browse") this.openBrowseView();
        else if (action === "join-ip") this.setPauseMenuView("join-ip");
      });
    });

    // Host game
    document.getElementById("mp-host-btn")?.addEventListener("click", () => {
      this.handleHostGame();
    });

    // Browse
    document.getElementById("mp-refresh-btn")?.addEventListener("click", () => {
      this.refreshServerList();
    });

    // Join by IP
    document.getElementById("mp-join-btn")?.addEventListener("click", () => {
      this.handleJoinByIp();
    });

    // Lobby actions
    document.getElementById("mp-leave-btn")?.addEventListener("click", () => {
      this.handleLeaveLobby();
    });

    document.getElementById("mp-start-btn")?.addEventListener("click", () => {
      this.options.onMultiplayerStartGame?.();
    });
  }

  // ── Multiplayer action handlers ─────────────────────────────────────────────────

  private openBrowseView(): void {
    this.options.onMultiplayerStartDiscovery?.();
    this.setPauseMenuView("browse-games");
    this.refreshServerList();
    // Auto-refresh every 3 seconds
    if (this.mpRefreshTimer !== null) window.clearInterval(this.mpRefreshTimer);
    this.mpRefreshTimer = window.setInterval(() => this.refreshServerList(), 3000);
  }

  private async refreshServerList(): Promise<void> {
    const list = document.getElementById("mp-server-list");
    if (!list) return;

    try {
      const servers = await (this.options.onMultiplayerGetServers?.() ?? Promise.resolve([]));
      this.mpDiscoveredServers = servers;
      this.renderServerList(list, servers);
    } catch {
      list.innerHTML = '<div class="imb-server-searching">Error scanning network.</div>';
    }
  }

  private renderServerList(container: HTMLElement, servers: DiscoveredServer[]): void {
    if (servers.length === 0) {
      container.innerHTML = '<div class="imb-server-searching">No games found — make sure your host is running.</div>';
      return;
    }

    container.innerHTML = servers.map((s, i) => `
      <div class="imb-server-entry">
        <div class="imb-server-info">
          <span class="imb-server-name">${escapeHtml(s.name)}</span>
          <span class="imb-server-meta">${escapeHtml(s.host)} · ${s.players}/${s.maxPlayers} players · ${s.phase}</span>
        </div>
        <button class="imb-btn imb-server-join-btn" data-server-index="${i}" type="button">Join</button>
      </div>
    `).join("");

    container.querySelectorAll("[data-server-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number.parseInt((btn as HTMLElement).dataset.serverIndex ?? "0", 10);
        const server = servers[idx];
        if (!server) return;
        const nameInput = document.getElementById("mp-browse-name") as HTMLInputElement | null;
        const playerName = sanitizeName(nameInput?.value ?? "Player");
        this.mpPlayerName = playerName;
        this.setMpStatus("browse", "Connecting...");
        this.options.onMultiplayerJoin?.(server.ip, server.port, playerName);
      });
    });
  }

  private handleHostGame(): void {
    const gameNameInput = document.getElementById("mp-game-name") as HTMLInputElement | null;
    const playerNameInput = document.getElementById("mp-host-name") as HTMLInputElement | null;

    const gameName = sanitizeName(gameNameInput?.value ?? "") || "Dark War";
    const playerName = sanitizeName(playerNameInput?.value ?? "") || "Player";

    this.mpGameName = gameName;
    this.mpPlayerName = playerName;

    this.setMpStatus("host", "Starting server...");
    this.options.onMultiplayerHost?.(gameName, playerName);
  }

  private handleJoinByIp(): void {
    const nameInput = document.getElementById("mp-join-name") as HTMLInputElement | null;
    const ipInput = document.getElementById("mp-join-ip") as HTMLInputElement | null;
    const portInput = document.getElementById("mp-join-port") as HTMLInputElement | null;

    const playerName = sanitizeName(nameInput?.value ?? "") || "Player";
    const ip = ipInput?.value.trim() ?? "";
    const port = Number.parseInt(portInput?.value ?? "7777", 10);

    if (!ip) {
      this.setMpStatus("join", "Please enter a host IP address.");
      return;
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      this.setMpStatus("join", "Invalid port number.");
      return;
    }

    this.mpPlayerName = playerName;
    this.setMpStatus("join", "Connecting...");
    this.options.onMultiplayerJoin?.(ip, port, playerName);
  }

  private handleLeaveLobby(): void {
    if (this.mpRefreshTimer !== null) {
      window.clearInterval(this.mpRefreshTimer);
      this.mpRefreshTimer = null;
    }
    this.options.onMultiplayerStopDiscovery?.();
    this.options.onMultiplayerLeaveLobby?.();
    this.mpConnectionState = "disconnected";
    this.mpLobbyPlayers = [];
    this.setPauseMenuView("multiplayer");
  }

  private setMpStatus(view: "host" | "browse" | "join", message: string): void {
    const id = view === "host" ? "mp-host-status" : view === "browse" ? "mp-browse-status" : "mp-join-status";
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("hidden", !message);
  }

  // ── Public API for multiplayer state updates ────────────────────────────────────

  public setMultiplayerConnectionState(state: "disconnected" | "connecting" | "lobby" | "playing"): void {
    this.mpConnectionState = state;

    if (state === "connecting") {
      this.setMpStatus("host", "Connecting...");
      this.setMpStatus("browse", "Connecting...");
      this.setMpStatus("join", "Connecting...");
    } else if (state === "lobby") {
      // Transition to lobby view
      if (this.mpRefreshTimer !== null) {
        window.clearInterval(this.mpRefreshTimer);
        this.mpRefreshTimer = null;
      }
      this.setPauseMenuView("lobby");
      this.syncLobbyView();
    } else if (state === "playing") {
      // Game is starting — close the menu
      this.closePauseMenu(true);
    } else if (state === "disconnected") {
      this.setMpStatus("host", "");
      this.setMpStatus("browse", "");
      this.setMpStatus("join", "");
    }
  }

  public updateLobbyState(players: LobbyPlayer[], isHost: boolean, phase: "lobby" | "playing"): void {
    this.mpLobbyPlayers = players;
    this.mpIsHost = isHost;
    this.mpPhase = phase;

    if (phase === "playing" && this.mpConnectionState !== "playing") {
      this.mpConnectionState = "playing";
      this.closePauseMenu(true);
      return;
    }

    if (this.pauseMenuView === "lobby") {
      this.syncLobbyView();
    }
  }

  public setMultiplayerStatusMessage(message: string): void {
    this.mpStatusMessage = message;
    // Show in current MP view if applicable
    const view = this.pauseMenuView;
    if (view === "host-game") this.setMpStatus("host", message);
    else if (view === "browse-games") this.setMpStatus("browse", message);
    else if (view === "join-ip") this.setMpStatus("join", message);
  }

  public openMultiplayerMenu(): void {
    if (this.mpConnectionState === "lobby") {
      this.openPauseMenu("lobby");
    } else {
      this.openPauseMenu("multiplayer");
    }
  }

  // ── Lobby sync ──────────────────────────────────────────────────────────────────

  private syncLobbyView(): void {
    const lobbyTitle = document.getElementById("mp-lobby-title");
    const lobbyStatus = document.getElementById("mp-lobby-status");
    const lobbyPlayers = document.getElementById("mp-lobby-players");
    const startBtn = document.getElementById("mp-start-btn") as HTMLButtonElement | null;
    const lobbyHint = document.getElementById("mp-lobby-hint");

    if (lobbyTitle) {
      lobbyTitle.textContent = this.mpIsHost ? `${this.mpGameName} — Lobby` : "Lobby";
    }

    if (lobbyStatus) {
      if (this.mpIsHost) {
        lobbyStatus.textContent = this.mpLobbyPlayers.length === 1
          ? "Waiting for others to join..."
          : `${this.mpLobbyPlayers.length} players connected`;
      } else {
        lobbyStatus.textContent = "Waiting for host to start...";
      }
    }

    if (lobbyPlayers) {
      lobbyPlayers.innerHTML = this.mpLobbyPlayers.map((p) => `
        <div class="imb-lobby-player ${p.isHost ? "is-host" : ""}">
          <span class="imb-lobby-player-name">${escapeHtml(p.name)}</span>
          ${p.isHost ? '<span class="imb-lobby-host-badge">HOST</span>' : ""}
        </div>
      `).join("");
    }

    if (startBtn) {
      startBtn.style.display = this.mpIsHost ? "" : "none";
      startBtn.disabled = this.mpLobbyPlayers.length < 1;
    }

    if (lobbyHint) {
      if (this.mpIsHost) {
        const localIpsPromise = (window as Window & { native?: { serverGetLocalIps?: () => Promise<string[]> } }).native?.serverGetLocalIps?.();
        if (localIpsPromise) {
          localIpsPromise.then((ips) => {
            if (lobbyHint && ips && ips.length > 0) {
              lobbyHint.textContent = `Others can find your game on the LAN, or join at: ${ips[0]}:7777`;
            }
          }).catch(() => {});
        }
      } else {
        lobbyHint.textContent = "";
      }
    }
  }

  // ── Key handling ─────────────────────────────────────────────────────────────────

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isPauseMenuOpen()) {
      if (this.handlePauseMenuKeyDown(event)) return;
    }

    if (event.key !== "Escape") return;

    const openModals = Array.from(this.modals.values()).filter((m) => m.isOpen());
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
    const isMultiplayerView = (
      this.pauseMenuView === "multiplayer" ||
      this.pauseMenuView === "host-game" ||
      this.pauseMenuView === "browse-games" ||
      this.pauseMenuView === "join-ip" ||
      this.pauseMenuView === "lobby"
    );

    if (this.pauseMenuView !== "main") {
      if (key === "escape") {
        event.preventDefault();
        if (this.pauseMenuView === "keybindings") this.setPauseMenuView("settings");
        else if (this.pauseMenuView === "settings") this.setPauseMenuView("main");
        else if (isMultiplayerView) {
          if (this.pauseMenuView === "lobby") {
            // Don't navigate away from lobby with Escape
          } else if (this.pauseMenuView === "host-game" || this.pauseMenuView === "browse-games" || this.pauseMenuView === "join-ip") {
            this.setPauseMenuView("multiplayer");
          } else {
            this.setPauseMenuView("main");
          }
        } else {
          this.setPauseMenuView("main");
        }
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
      if (this.options.allowPauseMenuClose === false) return true;
      this.closePauseMenu();
      return true;
    }

    return false;
  }

  // ── Pause menu logic ─────────────────────────────────────────────────────────────

  private movePauseSelection(delta: number): void {
    this.pauseMenuMessage = null;
    let nextSelection = this.pauseMenuSelection;
    for (let i = 0; i < this.pauseItems.length; i++) {
      nextSelection = (nextSelection + delta + this.pauseItems.length) % this.pauseItems.length;
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
        if (this.mpConnectionState === "lobby") {
          this.setPauseMenuView("lobby");
          this.syncLobbyView();
        } else {
          this.setPauseMenuView("multiplayer");
        }
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
      view.classList.toggle("hidden", view.dataset.pauseView !== this.pauseMenuView);
    });

    document.querySelectorAll<HTMLElement>("[data-pause-index]").forEach((button) => {
      const index = Number.parseInt(button.dataset.pauseIndex ?? "0", 10);
      const item = this.pauseItems[index];
      const isSelected = index === this.pauseMenuSelection;
      const isEnabled = item ? this.isPauseItemEnabled(item) : true;
      button.classList.toggle("selected", isSelected);
      button.classList.toggle("disabled", !isEnabled);
      button.setAttribute("aria-selected", String(isSelected));
      button.setAttribute("aria-disabled", String(!isEnabled));
      if (button instanceof HTMLButtonElement) button.disabled = !isEnabled;
    });

    const message = document.getElementById("pause-menu-message");
    if (message) {
      message.textContent = this.pauseMenuMessage ?? "";
      message.classList.toggle("hidden", !this.pauseMenuMessage);
    }

    this.syncSettingsControls();
    this.syncKeybindingControls();
    if (this.pauseMenuView === "lobby") this.syncLobbyView();
    if (this.pauseMenuView === "browse-games") {
      // Populate name input from stored player name
      const nameInput = document.getElementById("mp-browse-name") as HTMLInputElement | null;
      if (nameInput && !nameInput.value) nameInput.value = this.mpPlayerName;
    }
    if (this.pauseMenuView === "host-game") {
      const gameNameInput = document.getElementById("mp-game-name") as HTMLInputElement | null;
      const hostNameInput = document.getElementById("mp-host-name") as HTMLInputElement | null;
      if (gameNameInput && !gameNameInput.value) gameNameInput.value = this.mpGameName;
      if (hostNameInput && !hostNameInput.value) hostNameInput.value = this.mpPlayerName;
    }
    if (this.pauseMenuView === "join-ip") {
      const nameInput = document.getElementById("mp-join-name") as HTMLInputElement | null;
      const portInput = document.getElementById("mp-join-port") as HTMLInputElement | null;
      if (nameInput && !nameInput.value) nameInput.value = this.mpPlayerName;
      if (portInput && !portInput.value) portInput.value = "7777";
    }
  }

  // ── Settings sync ──────────────────────────────────────────────────────────────

  private syncSoundControls(): void {
    const sfxSlider = document.getElementById("pause-sfx-volume") as HTMLInputElement | null;
    const musicSlider = document.getElementById("pause-music-volume") as HTMLInputElement | null;
    const sfxLabel = document.getElementById("pause-sfx-vol-label");
    const musicLabel = document.getElementById("pause-music-vol-label");

    if (sfxSlider) {
      const volume = Math.round(this.preferences.sfxVolume * 100);
      sfxSlider.value = String(volume);
      if (sfxLabel) sfxLabel.textContent = `${volume}%`;
    }
    if (musicSlider) {
      const volume = Math.round(this.preferences.musicVolume * 100);
      musicSlider.value = String(volume);
      if (musicLabel) musicLabel.textContent = `${volume}%`;
    }
    this.syncThemeButtons();
  }

  private syncThemeButtons(): void {
    const currentTheme = this.preferences.theme;
    document.querySelectorAll("[data-settings-theme-value]").forEach((button) => {
      const isSelected = (button as HTMLElement).dataset.settingsThemeValue === currentTheme;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  private syncSettingsControls(): void {
    this.syncSoundControls();
    document.querySelectorAll("[data-zoom-value]").forEach((button) => {
      const zoom = Number.parseInt((button as HTMLElement).dataset.zoomValue ?? "1", 10);
      const isSelected = zoom === this.preferences.zoom;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });

    const devToolsToggle = document.getElementById("dev-tools-toggle") as HTMLInputElement | null;
    if (devToolsToggle) devToolsToggle.checked = this.preferences.devTools;

    document.querySelectorAll<HTMLElement>(".dev-only").forEach((el) => {
      el.classList.toggle("hidden", !this.preferences.devTools);
    });
    document.querySelectorAll<HTMLElement>("[data-dev-tools-panel]").forEach((el) => {
      el.classList.toggle("hidden", !this.preferences.devTools);
    });
  }

  private syncKeybindingControls(): void {
    document.querySelectorAll<HTMLElement>("[data-keybinding-row]").forEach((row) => {
      const action = row.dataset.keybindingRow;
      const definition = KEY_BINDING_DEFINITIONS.find((c) => c.action === action);
      row.classList.toggle("hidden", Boolean(definition?.devOnly && !this.preferences.devTools));
    });

    document.querySelectorAll<HTMLButtonElement>("[data-keybinding-action]").forEach((button) => {
      const action = button.dataset.keybindingAction;
      if (!this.isKeyBindingAction(action)) return;
      button.textContent =
        this.listeningForKey === action ? "Press a key..." : keyCodeToLabel(this.preferences.keyBindings[action]);
      button.classList.toggle("listening", this.listeningForKey === action);
    });
  }

  // ── Preferences ────────────────────────────────────────────────────────────────

  private updatePreferences(next: Partial<UserPreferences>): void {
    this.preferences = {
      ...this.preferences,
      ...next,
      keyBindings: next.keyBindings ? { ...next.keyBindings } : { ...this.preferences.keyBindings },
    };
    Sound.setVolume(this.preferences.sfxVolume);
    Music.setVolume(this.preferences.musicVolume);
    this.applyTheme(this.preferences.theme);
    this.options.onPreferencesChange?.({ ...this.preferences, keyBindings: { ...this.preferences.keyBindings } });
  }

  private applyTheme(theme: ThemeMode): void {
    document.documentElement.dataset.theme = theme;
  }

  private setTheme(theme: ThemeMode): void {
    this.updatePreferences({ theme });
    this.syncThemeButtons();
  }

  // ── View switching ─────────────────────────────────────────────────────────────

  private setPauseMenuView(view: PauseMenuView): void {
    this.pauseMenuView = view;
    this.pauseMenuMessage = null;
    this.listeningForKey = null;
    this.syncPauseMenu();
  }

  // ── Key binding assignment ─────────────────────────────────────────────────────

  private assignKeyBinding(action: KeyBindingAction, code: string): void {
    const keyBindings = { ...this.preferences.keyBindings };
    for (const definition of KEY_BINDING_DEFINITIONS) {
      if (definition.action !== action && keyBindings[definition.action] === code) {
        keyBindings[definition.action] = this.preferences.keyBindings[action];
      }
    }
    keyBindings[action] = code;
    this.updatePreferences({ keyBindings });
  }

  // ── Type guards ────────────────────────────────────────────────────────────────

  private isPauseMenuAction(action: string | undefined): action is PauseMenuAction {
    return this.pauseItems.some((item) => item.action === action);
  }

  private isPauseItemEnabled(item: PauseMenuItem): boolean {
    return item.action !== "continue" || this.canContinue;
  }

  private isKeyBindingAction(action: string | undefined): action is KeyBindingAction {
    return KEY_BINDING_DEFINITIONS.some((definition) => definition.action === action);
  }

  // ── Modal management ──────────────────────────────────────────────────────────

  private registerModal(modal: RetroModal): void {
    document.body.appendChild(modal.element);
    this.modals.set(modal.element.id, modal);
  }

  private isPauseMenuOpen(): boolean {
    return this.modals.get("pause-dialog")?.isOpen() ?? false;
  }

  private showModal(id: string): void {
    this.modals.get(id)?.show();
    this.syncModalState();
  }

  private handleModalClosed(): void {
    if (this.pauseMenuView === "browse-games") {
      if (this.mpRefreshTimer !== null) {
        window.clearInterval(this.mpRefreshTimer);
        this.mpRefreshTimer = null;
      }
      this.options.onMultiplayerStopDiscovery?.();
    }
    this.syncModalState();
  }

  private syncModalState(): void {
    const hasOpenModal = Array.from(this.modals.values()).some((m) => m.isOpen());
    this.scrim.classList.toggle("hidden", !hasOpenModal);
    document.body.classList.toggle("imb-modal-open", hasOpenModal);
    if (this.options.pausesGame) {
      this.options.onModalStateChange?.(hasOpenModal);
    }
  }

  private getInitialPauseSelection(): number {
    const continueIndex = this.pauseItems.findIndex(
      (item) => item.action === "continue" && this.isPauseItemEnabled(item),
    );
    if (continueIndex >= 0) return continueIndex;
    return Math.max(0, this.pauseItems.findIndex((item) => this.isPauseItemEnabled(item)));
  }

  // ── Public API ─────────────────────────────────────────────────────────────────

  public openSoundDialog(): void {
    this.openPauseMenu("settings");
  }

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

  public closePauseMenu(force = false): void {
    if (!force && this.options.allowPauseMenuClose === false) return;
    this.modals.get("pause-dialog")?.hide();
  }

  public setContinueEnabled(enabled: boolean): void {
    this.canContinue = enabled;
    if (!this.isPauseItemEnabled(this.pauseItems[this.pauseMenuSelection])) {
      this.pauseMenuSelection = this.getInitialPauseSelection();
    }
    this.syncPauseMenu();
  }

  public setPlayerName(name: string): void {
    this.mpPlayerName = name;
  }

  public dispose(): void {
    if (this.mpRefreshTimer !== null) {
      window.clearInterval(this.mpRefreshTimer);
      this.mpRefreshTimer = null;
    }
    window.removeEventListener("keydown", this.onKeyDown);
    for (const modal of this.modals.values()) modal.dispose();
    this.modals.clear();
    this.scrim.remove();
    document.body.classList.remove("imb-modal-open");
    this.options.onModalStateChange?.(false);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeName(name: string): string {
  return name.trim().slice(0, 24);
}
