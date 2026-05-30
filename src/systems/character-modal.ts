import {
  INVENTORY_BAR_SIZE,
  INVENTORY_TOTAL_SLOTS,
  ItemType,
  Player,
} from "../types";
import { SPRITE_COORDS, SPRITE_SIZE } from "../config/sprites";
import {
  getSlotActions,
  getSlotDisplayCount,
  getSlotKeyLabel,
  getSlotLabel,
  swapInventorySlots,
} from "../utils/inventory";
import { getWeaponForSlot } from "../utils/inventory";
import {
  DEFAULT_KEY_BINDINGS,
  KEY_BINDING_DEFINITIONS,
  KeyBindingAction,
  UserPreferences,
  keyCodeToLabel,
} from "./preferences";
import { Music } from "./music";
import { Sound } from "./sound";
import { DiscoveredServer } from "./game-menu";

export type ModalTab = "inventory" | "settings" | "game";

type SettingsView = "main" | "keybindings";
type GameView = "main" | "multiplayer" | "host" | "browse" | "join" | "lobby";

export interface CharacterModalOptions {
  preferences: UserPreferences;
  onPreferencesChange: (prefs: UserPreferences) => void;
  onToggleGodMode?: () => void;
  onToggleFOV?: () => void;
  onMultiplayerHost?: (gameName: string, playerName: string) => void;
  onMultiplayerJoin?: (ip: string, port: number, playerName: string) => void;
  onMultiplayerStartGame?: () => void;
  onMultiplayerLeaveLobby?: () => void;
  onMultiplayerGetServers?: () => Promise<DiscoveredServer[]>;
  onMultiplayerStartDiscovery?: () => void;
  onMultiplayerStopDiscovery?: () => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export class CharacterModal {
  private scrim: HTMLElement;
  private window: HTMLElement;
  private tabButtons: Map<ModalTab, HTMLElement> = new Map();
  private tabPanels: Map<ModalTab, HTMLElement> = new Map();
  private invSlotEls: HTMLElement[] = [];
  private spriteSheet: HTMLImageElement | null = null;
  private _player: Player | null = null;
  private _isOpen = false;
  private _currentTab: ModalTab = "inventory";

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private readonly onDragMove = (e: MouseEvent) => this.handleDragMove(e);
  private readonly onDragEnd = () => this.stopDrag();

  // Inventory drag/grab
  private _grabbedIndex: number | null = null;
  private _grabbedItemType: ItemType | null = null;
  private _cursorGhost: HTMLElement | null = null;

  private tooltipEl: HTMLElement;

  // Settings sub-view
  private settingsView: SettingsView = "main";
  private settingsViewEls: Map<SettingsView, HTMLElement> = new Map();

  // Game sub-view
  private gameView: GameView = "main";
  private gameViewEls: Map<GameView, HTMLElement> = new Map();
  private mpRefreshTimer: number | null = null;
  private mpLastServerKey = "";
  private mpPlayerName = "Player";
  private mpGameName = "Dark War";

  // Preferences / settings
  private preferences: UserPreferences;
  private readonly _onPreferencesChange: (prefs: UserPreferences) => void;
  private readonly _opts: CharacterModalOptions;
  private listeningForKey: KeyBindingAction | null = null;

  // Settings DOM refs
  private _sfxSlider: HTMLInputElement | null = null;
  private _sfxLabel: HTMLElement | null = null;
  private _musicSlider: HTMLInputElement | null = null;
  private _musicLabel: HTMLElement | null = null;

  public onClose: (() => void) | null = null;
  public onWeaponChanged: ((slot: number) => void) | null = null;
  public onInventorySwap: ((from: number, to: number) => void) | null = null;
  public onNewGame: (() => void) | null = null;
  public onSave: (() => void) | null = null;
  public onLoad: (() => void) | null = null;
  public onQuit: (() => void) | null = null;

  constructor(options: CharacterModalOptions) {
    this._opts = options;
    this.preferences = {
      ...options.preferences,
      keyBindings: { ...options.preferences.keyBindings },
    };
    this._onPreferencesChange = options.onPreferencesChange;

    // Scrim (full-screen background)
    this.scrim = document.createElement("div");
    this.scrim.className = "char-modal-scrim";
    this.scrim.style.display = "none";
    this.scrim.addEventListener("click", () => this.close());
    document.body.appendChild(this.scrim);

    // Tooltip
    this.tooltipEl = this.buildTooltip();
    document.body.appendChild(this.tooltipEl);

    // Window (position: fixed, centered by JS)
    this.window = document.createElement("div");
    this.window.className = "imb-dialog char-modal-window";
    this.window.style.display = "none";

    this.window.appendChild(this.buildTitlebar());
    this.window.appendChild(this.buildTabBar());
    this.window.appendChild(this.buildTabPanels());

    document.body.appendChild(this.window);

    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);

    this.loadSpriteSheet();
  }

  // ── DOM builders ─────────────────────────────────────────────────────────────

  private buildTooltip(): HTMLElement {
    const tip = document.createElement("div");
    tip.id = "char-modal-tooltip";
    tip.className = "inv-tooltip char-modal-tooltip";
    tip.style.display = "none";
    return tip;
  }

  private buildTitlebar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "imb-dialog-titlebar char-modal-titlebar-drag";

    const closeBtn = document.createElement("button");
    closeBtn.className = "imb-dialog-close retro-window-button retro-window-button-close";
    closeBtn.type = "button";
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = "<span>✕</span>";
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); this.close(); });

    const stripes1 = document.createElement("div");
    stripes1.className = "imb-dialog-stripes";

    const title = document.createElement("span");
    title.className = "imb-dialog-title";
    title.textContent = "Character";

    const stripes2 = document.createElement("div");
    stripes2.className = "imb-dialog-stripes";

    bar.appendChild(closeBtn);
    bar.appendChild(stripes1);
    bar.appendChild(title);
    bar.appendChild(stripes2);

    bar.addEventListener("mousedown", (e) => this.startDrag(e));
    return bar;
  }

  private buildTabBar(): HTMLElement {
    const tabBar = document.createElement("div");
    tabBar.className = "char-modal-tabs";

    const tabs: { id: ModalTab; label: string }[] = [
      { id: "inventory", label: "Inventory" },
      { id: "settings", label: "Settings" },
      { id: "game", label: "Game" },
    ];

    for (const tab of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-modal-tab-btn";
      btn.textContent = tab.label;
      btn.dataset.tab = tab.id;
      btn.addEventListener("click", () => this.switchTab(tab.id));
      this.tabButtons.set(tab.id, btn);
      tabBar.appendChild(btn);
    }

    return tabBar;
  }

  private buildTabPanels(): HTMLElement {
    const panels = document.createElement("div");
    panels.className = "char-modal-panels";

    const invPanel = this.buildInventoryPanel();
    invPanel.className = "char-modal-panel char-inv-panel";
    invPanel.dataset.panel = "inventory";
    this.tabPanels.set("inventory", invPanel);
    panels.appendChild(invPanel);

    const settingsPanel = this.buildSettingsPanel();
    settingsPanel.className = "char-modal-panel char-settings-panel";
    settingsPanel.dataset.panel = "settings";
    this.tabPanels.set("settings", settingsPanel);
    panels.appendChild(settingsPanel);

    const gamePanel = this.buildGamePanel();
    gamePanel.className = "char-modal-panel char-game-panel-wrap";
    gamePanel.dataset.panel = "game";
    this.tabPanels.set("game", gamePanel);
    panels.appendChild(gamePanel);

    return panels;
  }

  // ── Inventory panel ──────────────────────────────────────────────────────────

  private buildInventoryPanel(): HTMLElement {
    const panel = document.createElement("div");

    const grid = document.createElement("div");
    grid.className = "char-modal-inv-grid";

    for (let i = 0; i < INVENTORY_TOTAL_SLOTS; i++) {
      const slot = this.buildInvSlot(i);
      this.invSlotEls.push(slot);
      grid.appendChild(slot);
    }

    panel.appendChild(grid);
    return panel;
  }

  private buildInvSlot(index: number): HTMLElement {
    const slot = document.createElement("div");
    slot.className = "char-inv-slot";
    if (index < INVENTORY_BAR_SIZE) slot.classList.add("bar-slot");
    slot.dataset.index = String(index);

    const keyLabel = document.createElement("span");
    keyLabel.className = "char-inv-key";
    keyLabel.textContent = index < INVENTORY_BAR_SIZE ? getSlotKeyLabel(index) : "";

    const icon = document.createElement("canvas");
    icon.className = "char-inv-icon";
    icon.width = 32;
    icon.height = 32;

    const count = document.createElement("span");
    count.className = "char-inv-count";

    const bar = document.createElement("div");
    bar.className = "char-inv-bar";
    const fill = document.createElement("div");
    fill.className = "char-inv-bar-fill";
    bar.appendChild(fill);

    slot.appendChild(keyLabel);
    slot.appendChild(icon);
    slot.appendChild(count);
    slot.appendChild(bar);

    slot.addEventListener("mousedown", (e) => { e.preventDefault(); this.handleSlotMouseDown(index, e); });
    slot.addEventListener("mouseenter", (e) => this.showSlotTooltip(slot, index, e));
    slot.addEventListener("mouseleave", () => this.hideSlotTooltip());

    return slot;
  }

  // ── Settings panel ───────────────────────────────────────────────────────────

  private buildSettingsPanel(): HTMLElement {
    const panel = document.createElement("div");

    // Main settings view
    const mainView = document.createElement("div");
    mainView.className = "char-settings-view";

    // ── Sound ──────────────────────────────────────────────────────────────────
    mainView.appendChild(this.buildSectionHeading("Sound"));
    const soundStack = document.createElement("div");
    soundStack.className = "imb-settings-stack";

    const sfxRow = document.createElement("div");
    sfxRow.className = "imb-slider-row";
    const sfxLabel = document.createElement("label");
    sfxLabel.htmlFor = "char-sfx-volume";
    sfxLabel.textContent = "Sound Effects";
    this._sfxSlider = document.createElement("input");
    this._sfxSlider.type = "range";
    this._sfxSlider.id = "char-sfx-volume";
    this._sfxSlider.min = "0";
    this._sfxSlider.max = "100";
    this._sfxSlider.addEventListener("input", () => {
      const vol = Number.parseInt(this._sfxSlider!.value, 10) / 100;
      Sound.setVolume(vol);
      this.updatePreferences({ sfxVolume: vol });
      this.syncSoundLabels();
    });
    this._sfxLabel = document.createElement("span");
    this._sfxLabel.className = "imb-slider-val";
    sfxRow.appendChild(sfxLabel);
    sfxRow.appendChild(this._sfxSlider);
    sfxRow.appendChild(this._sfxLabel);

    const musicRow = document.createElement("div");
    musicRow.className = "imb-slider-row";
    const musicLabel = document.createElement("label");
    musicLabel.htmlFor = "char-music-volume";
    musicLabel.textContent = "Music";
    this._musicSlider = document.createElement("input");
    this._musicSlider.type = "range";
    this._musicSlider.id = "char-music-volume";
    this._musicSlider.min = "0";
    this._musicSlider.max = "100";
    this._musicSlider.addEventListener("input", () => {
      const vol = Number.parseInt(this._musicSlider!.value, 10) / 100;
      Music.setVolume(vol);
      this.updatePreferences({ musicVolume: vol });
      this.syncSoundLabels();
    });
    this._musicLabel = document.createElement("span");
    this._musicLabel.className = "imb-slider-val";
    musicRow.appendChild(musicLabel);
    musicRow.appendChild(this._musicSlider);
    musicRow.appendChild(this._musicLabel);

    soundStack.appendChild(sfxRow);
    soundStack.appendChild(musicRow);
    mainView.appendChild(soundStack);

    // ── Appearance ─────────────────────────────────────────────────────────────
    mainView.appendChild(this.buildSectionHeading("Appearance"));
    const appearStack = document.createElement("div");
    appearStack.className = "imb-settings-stack";

    const themeRow = document.createElement("div");
    themeRow.className = "imb-theme-row";
    const themeLabel = document.createElement("span");
    themeLabel.className = "imb-theme-label";
    themeLabel.textContent = "Theme";
    const themeToggle = document.createElement("div");
    themeToggle.className = "imb-theme-toggle";
    themeToggle.setAttribute("role", "group");
    for (const [value, text] of [["dark", "Dark"], ["light", "Light"]] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "imb-theme-option";
      btn.dataset.themeValue = value;
      btn.textContent = text;
      btn.addEventListener("click", () => {
        this.updatePreferences({ theme: value });
        document.documentElement.dataset.theme = value;
        this.syncAppearanceControls();
      });
      themeToggle.appendChild(btn);
    }
    themeRow.appendChild(themeLabel);
    themeRow.appendChild(themeToggle);

    const zoomRow = document.createElement("div");
    zoomRow.className = "imb-theme-row";
    const zoomLabel = document.createElement("span");
    zoomLabel.className = "imb-theme-label";
    zoomLabel.textContent = "Zoom";
    const zoomToggle = document.createElement("div");
    zoomToggle.className = "imb-theme-toggle";
    zoomToggle.setAttribute("role", "group");
    for (const v of [1, 2, 3] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "imb-theme-option";
      btn.dataset.zoomValue = String(v);
      btn.textContent = `${v}X`;
      btn.addEventListener("click", () => {
        this.updatePreferences({ zoom: v });
        this.syncAppearanceControls();
      });
      zoomToggle.appendChild(btn);
    }
    zoomRow.appendChild(zoomLabel);
    zoomRow.appendChild(zoomToggle);

    appearStack.appendChild(themeRow);
    appearStack.appendChild(zoomRow);
    mainView.appendChild(appearStack);

    // ── Dev Tools ──────────────────────────────────────────────────────────────
    mainView.appendChild(this.buildSectionHeading("Developer"));
    const devCheckRow = document.createElement("label");
    devCheckRow.className = "imb-checkbox-row";
    const devCheckInput = document.createElement("input");
    devCheckInput.type = "checkbox";
    devCheckInput.className = "imb-checkbox-input";
    devCheckInput.id = "char-dev-tools-toggle";
    devCheckInput.addEventListener("change", () => {
      this.updatePreferences({ devTools: devCheckInput.checked });
      this.syncDevToolsControls();
    });
    const devCheckBox = document.createElement("span");
    devCheckBox.className = "imb-checkbox-box";
    devCheckBox.setAttribute("aria-hidden", "true");
    const devCheckLabel = document.createElement("span");
    devCheckLabel.textContent = "Dev Tools";
    devCheckRow.appendChild(devCheckInput);
    devCheckRow.appendChild(devCheckBox);
    devCheckRow.appendChild(devCheckLabel);

    const devPanel = document.createElement("div");
    devPanel.className = "char-dev-tools-panel";
    devPanel.dataset.devPanel = "true";
    const godModeBtn = document.createElement("button");
    godModeBtn.type = "button";
    godModeBtn.className = "imb-btn";
    godModeBtn.textContent = "Toggle God Mode";
    godModeBtn.addEventListener("click", () => this._opts.onToggleGodMode?.());
    const fovBtn = document.createElement("button");
    fovBtn.type = "button";
    fovBtn.className = "imb-btn";
    fovBtn.textContent = "Toggle FOV";
    fovBtn.addEventListener("click", () => this._opts.onToggleFOV?.());
    devPanel.appendChild(godModeBtn);
    devPanel.appendChild(fovBtn);

    mainView.appendChild(devCheckRow);
    mainView.appendChild(devPanel);

    // ── Keybindings button ─────────────────────────────────────────────────────
    mainView.appendChild(this.buildSectionHeading("Controls"));
    const kbBtn = document.createElement("button");
    kbBtn.type = "button";
    kbBtn.className = "char-nav-btn";
    kbBtn.textContent = "Keyboard Bindings →";
    kbBtn.addEventListener("click", () => this.setSettingsView("keybindings"));
    mainView.appendChild(kbBtn);

    this.settingsViewEls.set("main", mainView);
    panel.appendChild(mainView);

    // ── Keybindings sub-view ───────────────────────────────────────────────────
    const kbView = document.createElement("div");
    kbView.className = "char-settings-view";
    kbView.style.display = "none";

    const kbHeader = document.createElement("div");
    kbHeader.className = "char-sub-header";
    const kbBackBtn = document.createElement("button");
    kbBackBtn.type = "button";
    kbBackBtn.className = "imb-btn imb-back-btn";
    kbBackBtn.textContent = "← Back";
    kbBackBtn.addEventListener("click", () => this.setSettingsView("main"));
    const kbTitle = document.createElement("h3");
    kbTitle.className = "char-sub-title";
    kbTitle.textContent = "Keyboard Bindings";
    kbHeader.appendChild(kbBackBtn);
    kbHeader.appendChild(kbTitle);
    kbView.appendChild(kbHeader);

    const kbList = document.createElement("div");
    kbList.className = "imb-keybinding-list char-keybinding-list";
    for (const def of KEY_BINDING_DEFINITIONS) {
      const row = document.createElement("div");
      row.className = "imb-keybinding-row";
      if (def.devOnly) row.classList.add("dev-only");
      row.dataset.keybindingRow = def.action;
      const actionLabel = document.createElement("span");
      actionLabel.textContent = def.label;
      const keyBtn = document.createElement("button");
      keyBtn.type = "button";
      keyBtn.className = "imb-keybinding-button";
      keyBtn.dataset.keybindingAction = def.action;
      keyBtn.addEventListener("click", () => {
        this.listeningForKey = def.action;
        this.syncKeybindingControls();
      });
      row.appendChild(actionLabel);
      row.appendChild(keyBtn);
      kbList.appendChild(row);
    }
    kbView.appendChild(kbList);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "imb-btn";
    resetBtn.style.marginTop = "12px";
    resetBtn.textContent = "Restore Defaults";
    resetBtn.addEventListener("click", () => {
      this.updatePreferences({ keyBindings: { ...DEFAULT_KEY_BINDINGS } });
      this.syncKeybindingControls();
    });
    kbView.appendChild(resetBtn);

    this.settingsViewEls.set("keybindings", kbView);
    panel.appendChild(kbView);

    return panel;
  }

  private buildSectionHeading(text: string): HTMLElement {
    const h = document.createElement("h4");
    h.className = "char-settings-heading";
    h.textContent = text;
    return h;
  }

  // ── Game panel ───────────────────────────────────────────────────────────────

  private buildGamePanel(): HTMLElement {
    const wrap = document.createElement("div");

    // ── Main game view ─────────────────────────────────────────────────────────
    const mainView = document.createElement("div");
    mainView.className = "char-game-view";

    const logo = document.createElement("img");
    logo.src = "assets/img/logo.png";
    logo.alt = "Dark War";
    logo.className = "char-game-logo";
    mainView.appendChild(logo);

    const btnGroup = document.createElement("div");
    btnGroup.className = "char-game-buttons";

    const makeBtn = (label: string, handler: () => void): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-modal-game-btn";
      btn.textContent = label;
      btn.addEventListener("click", handler);
      return btn;
    };

    btnGroup.appendChild(makeBtn("Resume Game", () => this.close()));
    btnGroup.appendChild(makeBtn("Save Game", () => this.onSave?.()));
    btnGroup.appendChild(makeBtn("Load Game", () => this.onLoad?.()));
    btnGroup.appendChild(makeBtn("New Game", () => { this.close(); this.onNewGame?.(); }));
    btnGroup.appendChild(makeBtn("Multiplayer", () => this.setGameView("multiplayer")));
    btnGroup.appendChild(makeBtn("Quit", () => this.onQuit?.()));

    mainView.appendChild(btnGroup);
    this.gameViewEls.set("main", mainView);
    wrap.appendChild(mainView);

    // ── Multiplayer view ───────────────────────────────────────────────────────
    const mpView = document.createElement("div");
    mpView.className = "char-game-view";
    mpView.style.display = "none";
    mpView.appendChild(this.buildGameSubHeader("Multiplayer", () => this.setGameView("main")));
    const mpBtns = document.createElement("div");
    mpBtns.className = "char-game-buttons";
    mpBtns.appendChild(makeBtn("Host a Game", () => this.setGameView("host")));
    mpBtns.appendChild(makeBtn("Find Games on LAN", () => this.openBrowseGames()));
    mpBtns.appendChild(makeBtn("Join by IP Address", () => this.setGameView("join")));
    mpView.appendChild(mpBtns);
    const mpHint = document.createElement("p");
    mpHint.className = "char-mp-hint";
    mpHint.textContent = "Play with others on your local network — no internet required.";
    mpView.appendChild(mpHint);
    this.gameViewEls.set("multiplayer", mpView);
    wrap.appendChild(mpView);

    // ── Host view ──────────────────────────────────────────────────────────────
    const hostView = document.createElement("div");
    hostView.className = "char-game-view";
    hostView.style.display = "none";
    hostView.appendChild(this.buildGameSubHeader("Host a Game", () => this.setGameView("multiplayer")));
    const hostForm = this.buildInputStack([
      { id: "char-mp-game-name", label: "Game Name", placeholder: "Dark War", maxlength: 32 },
      { id: "char-mp-host-name", label: "Your Name", placeholder: "Player", maxlength: 24 },
    ]);
    const hostStatus = document.createElement("div");
    hostStatus.id = "char-mp-host-status";
    hostStatus.className = "char-mp-status hidden";
    const hostBtn = document.createElement("button");
    hostBtn.type = "button";
    hostBtn.className = "char-modal-game-btn";
    hostBtn.textContent = "Start Hosting";
    hostBtn.addEventListener("click", () => this.doHost());
    hostForm.appendChild(hostStatus);
    hostForm.appendChild(hostBtn);
    hostView.appendChild(hostForm);
    this.gameViewEls.set("host", hostView);
    wrap.appendChild(hostView);

    // ── Browse view ────────────────────────────────────────────────────────────
    const browseView = document.createElement("div");
    browseView.className = "char-game-view";
    browseView.style.display = "none";
    browseView.appendChild(this.buildGameSubHeader("Find Games on LAN", () => this.closeBrowseGames()));
    const browseForm = this.buildInputStack([
      { id: "char-mp-browse-name", label: "Your Name", placeholder: "Player", maxlength: 24 },
    ]);
    const serverList = document.createElement("div");
    serverList.id = "char-mp-server-list";
    serverList.className = "char-mp-server-list";
    serverList.innerHTML = '<div class="char-mp-searching">Searching for games…</div>';
    const browseStatus = document.createElement("div");
    browseStatus.id = "char-mp-browse-status";
    browseStatus.className = "char-mp-status hidden";
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "imb-btn";
    refreshBtn.textContent = "Refresh";
    refreshBtn.addEventListener("click", () => this.refreshServerList());
    browseForm.appendChild(serverList);
    browseForm.appendChild(browseStatus);
    browseForm.appendChild(refreshBtn);
    browseView.appendChild(browseForm);
    this.gameViewEls.set("browse", browseView);
    wrap.appendChild(browseView);

    // ── Join by IP view ────────────────────────────────────────────────────────
    const joinView = document.createElement("div");
    joinView.className = "char-game-view";
    joinView.style.display = "none";
    joinView.appendChild(this.buildGameSubHeader("Join by IP Address", () => this.setGameView("multiplayer")));
    const joinForm = this.buildInputStack([
      { id: "char-mp-join-name", label: "Your Name", placeholder: "Player", maxlength: 24 },
      { id: "char-mp-join-ip", label: "Host IP", placeholder: "192.168.1.x", maxlength: 64 },
      { id: "char-mp-join-port", label: "Port", placeholder: "7777", maxlength: 6 },
    ]);
    const joinStatus = document.createElement("div");
    joinStatus.id = "char-mp-join-status";
    joinStatus.className = "char-mp-status hidden";
    const joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "char-modal-game-btn";
    joinBtn.textContent = "Join Game";
    joinBtn.addEventListener("click", () => this.doJoin());
    joinForm.appendChild(joinStatus);
    joinForm.appendChild(joinBtn);
    joinView.appendChild(joinForm);
    this.gameViewEls.set("join", joinView);
    wrap.appendChild(joinView);

    // ── Lobby view ─────────────────────────────────────────────────────────────
    const lobbyView = document.createElement("div");
    lobbyView.className = "char-game-view";
    lobbyView.style.display = "none";
    const lobbyHeader = this.buildGameSubHeader("Lobby", () => this.doLeaveLobby());
    const lobbyTitle = lobbyHeader.querySelector(".char-sub-title") as HTMLElement;
    if (lobbyTitle) lobbyTitle.id = "char-mp-lobby-title";
    const leaveBtn = lobbyHeader.querySelector("button") as HTMLButtonElement;
    if (leaveBtn) leaveBtn.textContent = "Leave";
    lobbyView.appendChild(lobbyHeader);
    const lobbyStatus = document.createElement("div");
    lobbyStatus.id = "char-mp-lobby-status";
    lobbyStatus.className = "char-mp-lobby-status";
    lobbyStatus.textContent = "Waiting for players…";
    const lobbyPlayers = document.createElement("div");
    lobbyPlayers.id = "char-mp-lobby-players";
    lobbyPlayers.className = "char-mp-lobby-players";
    const lobbyActions = document.createElement("div");
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.id = "char-mp-start-btn";
    startBtn.className = "char-modal-game-btn";
    startBtn.textContent = "Start Game";
    startBtn.style.display = "none";
    startBtn.addEventListener("click", () => this._opts.onMultiplayerStartGame?.());
    lobbyActions.appendChild(startBtn);
    const lobbyHint = document.createElement("p");
    lobbyHint.id = "char-mp-lobby-hint";
    lobbyHint.className = "char-mp-hint";
    lobbyView.appendChild(lobbyStatus);
    lobbyView.appendChild(lobbyPlayers);
    lobbyView.appendChild(lobbyActions);
    lobbyView.appendChild(lobbyHint);
    this.gameViewEls.set("lobby", lobbyView);
    wrap.appendChild(lobbyView);

    return wrap;
  }

  private buildGameSubHeader(title: string, onBack: () => void): HTMLElement {
    const header = document.createElement("div");
    header.className = "char-sub-header";
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "imb-btn imb-back-btn";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", onBack);
    const titleEl = document.createElement("h3");
    titleEl.className = "char-sub-title";
    titleEl.textContent = title;
    header.appendChild(backBtn);
    header.appendChild(titleEl);
    return header;
  }

  private buildInputStack(
    fields: { id: string; label: string; placeholder: string; maxlength: number }[],
  ): HTMLElement {
    const stack = document.createElement("div");
    stack.className = "char-mp-form";
    for (const f of fields) {
      const row = document.createElement("div");
      row.className = "imb-input-row";
      const label = document.createElement("label");
      label.htmlFor = f.id;
      label.textContent = f.label;
      const input = document.createElement("input");
      input.className = "imb-text-input";
      input.id = f.id;
      input.type = "text";
      input.maxLength = f.maxlength;
      input.placeholder = f.placeholder;
      row.appendChild(label);
      row.appendChild(input);
      stack.appendChild(row);
    }
    return stack;
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────

  private startDrag(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = this.window.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    this.isDragging = true;
    this.window.classList.add("dragging");
    document.addEventListener("mousemove", this.onDragMove);
    document.addEventListener("mouseup", this.onDragEnd);
    e.preventDefault();
  }

  private handleDragMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const maxLeft = Math.max(8, window.innerWidth - this.window.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - this.window.offsetHeight - 8);
    this.window.style.left = `${Math.min(Math.max(8, e.clientX - this.dragOffsetX), maxLeft)}px`;
    this.window.style.top = `${Math.min(Math.max(8, e.clientY - this.dragOffsetY), maxTop)}px`;
    this.window.style.transform = "none";
  }

  private stopDrag(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.window.classList.remove("dragging");
    document.removeEventListener("mousemove", this.onDragMove);
    document.removeEventListener("mouseup", this.onDragEnd);
  }

  private centerWindow(): void {
    this.window.style.transform = "";
    this.window.style.left = "";
    this.window.style.top = "";
  }

  // ── Multiplayer actions ───────────────────────────────────────────────────────

  private setSettingsView(view: SettingsView): void {
    this.settingsView = view;
    for (const [id, el] of this.settingsViewEls) {
      el.style.display = id === view ? "" : "none";
    }
    if (view === "main") this.syncSettingsControls();
    if (view === "keybindings") this.syncKeybindingControls();
  }

  private setGameView(view: GameView): void {
    if (this.gameView === "browse" && view !== "browse") {
      this.stopBrowse();
    }
    this.gameView = view;
    for (const [id, el] of this.gameViewEls) {
      el.style.display = id === view ? "" : "none";
    }
    if (view === "lobby") this.syncLobbyView();
  }

  private openBrowseGames(): void {
    this.mpLastServerKey = "";
    this._opts.onMultiplayerStartDiscovery?.();
    this.setGameView("browse");
    this.refreshServerList();
    if (this.mpRefreshTimer !== null) clearInterval(this.mpRefreshTimer);
    this.mpRefreshTimer = window.setInterval(() => this.refreshServerList(), 3000);
  }

  private closeBrowseGames(): void {
    this.stopBrowse();
    this.setGameView("multiplayer");
  }

  private stopBrowse(): void {
    if (this.mpRefreshTimer !== null) {
      clearInterval(this.mpRefreshTimer);
      this.mpRefreshTimer = null;
    }
    this._opts.onMultiplayerStopDiscovery?.();
  }

  private async refreshServerList(): Promise<void> {
    const list = this.window.querySelector("#char-mp-server-list");
    if (!list) return;
    try {
      const servers = await (this._opts.onMultiplayerGetServers?.() ?? Promise.resolve([]));
      const key = servers.map((s) => `${s.ip}:${s.port}:${s.players}:${s.phase}`).join("|");
      if (key === this.mpLastServerKey) return;
      this.mpLastServerKey = key;
      if (!servers.length) {
        list.innerHTML = '<div class="char-mp-searching">No games found — make sure your host is running.</div>';
        return;
      }
      list.innerHTML = servers.map((s, i) => `
        <div class="char-mp-server-entry">
          <div class="char-mp-server-info">
            <span class="char-mp-server-name">${escapeHtml(s.name)}</span>
            <span class="char-mp-server-meta">${escapeHtml(s.host)} · ${s.players}/${s.maxPlayers} · ${s.phase}</span>
          </div>
          <button class="imb-btn" data-char-server-index="${i}" type="button">Join</button>
        </div>`).join("");
      list.querySelectorAll<HTMLElement>("[data-char-server-index]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number.parseInt(btn.dataset.charServerIndex ?? "0", 10);
          const server = servers[idx];
          if (!server) return;
          const nameInput = this.window.querySelector<HTMLInputElement>("#char-mp-browse-name");
          const name = (nameInput?.value.trim() || "Player").slice(0, 24);
          this.mpPlayerName = name;
          this.setMpStatus("browse", "Connecting…");
          this._opts.onMultiplayerJoin?.(server.ip, server.port, name);
        });
      });
    } catch {
      list.innerHTML = '<div class="char-mp-searching">Error scanning network.</div>';
    }
  }

  private doHost(): void {
    const gameName = (this.window.querySelector<HTMLInputElement>("#char-mp-game-name")?.value.trim() || "Dark War").slice(0, 32);
    const playerName = (this.window.querySelector<HTMLInputElement>("#char-mp-host-name")?.value.trim() || "Player").slice(0, 24);
    this.mpGameName = gameName;
    this.mpPlayerName = playerName;
    this.setMpStatus("host", "Starting server…");
    this._opts.onMultiplayerHost?.(gameName, playerName);
  }

  private doJoin(): void {
    const playerName = (this.window.querySelector<HTMLInputElement>("#char-mp-join-name")?.value.trim() || "Player").slice(0, 24);
    const ip = this.window.querySelector<HTMLInputElement>("#char-mp-join-ip")?.value.trim() ?? "";
    const portStr = this.window.querySelector<HTMLInputElement>("#char-mp-join-port")?.value.trim() ?? "7777";
    const port = Number.parseInt(portStr, 10);
    if (!ip) { this.setMpStatus("join", "Please enter a host IP address."); return; }
    if (!Number.isFinite(port) || port < 1 || port > 65535) { this.setMpStatus("join", "Invalid port."); return; }
    this.mpPlayerName = playerName;
    this.setMpStatus("join", "Connecting…");
    this._opts.onMultiplayerJoin?.(ip, port, playerName);
  }

  private doLeaveLobby(): void {
    this.stopBrowse();
    this._opts.onMultiplayerLeaveLobby?.();
    this.setGameView("multiplayer");
  }

  private setMpStatus(which: "host" | "browse" | "join", msg: string): void {
    const id = which === "host" ? "char-mp-host-status" : which === "browse" ? "char-mp-browse-status" : "char-mp-join-status";
    const el = this.window.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("hidden", !msg);
  }

  private syncLobbyView(players?: { name: string; isHost: boolean }[], isHost?: boolean): void {
    const title = this.window.querySelector<HTMLElement>("#char-mp-lobby-title");
    const status = this.window.querySelector<HTMLElement>("#char-mp-lobby-status");
    const playersEl = this.window.querySelector<HTMLElement>("#char-mp-lobby-players");
    const startBtn = this.window.querySelector<HTMLButtonElement>("#char-mp-start-btn");
    const hint = this.window.querySelector<HTMLElement>("#char-mp-lobby-hint");

    if (players !== undefined && isHost !== undefined) {
      if (title) title.textContent = isHost ? `${this.mpGameName} — Lobby` : "Lobby";
      if (status) status.textContent = isHost ? (players.length === 1 ? "Waiting for others…" : `${players.length} players connected`) : "Waiting for host to start…";
      if (playersEl) {
        playersEl.innerHTML = players.map((p) =>
          `<div class="char-mp-lobby-player${p.isHost ? " is-host" : ""}">
            <span>${escapeHtml(p.name)}</span>
            ${p.isHost ? '<span class="char-mp-host-badge">HOST</span>' : ""}
          </div>`).join("");
      }
      if (startBtn) { startBtn.style.display = isHost ? "" : "none"; }
    }
    void hint; // populated by DarkWarApp
  }

  // ── Multiplayer public API (called by DarkWarApp) ─────────────────────────────

  public setMultiplayerConnectionState(state: "disconnected" | "connecting" | "lobby" | "playing"): void {
    if (state === "lobby") {
      if (this.mpRefreshTimer !== null) { clearInterval(this.mpRefreshTimer); this.mpRefreshTimer = null; }
      if (this._currentTab === "game") this.setGameView("lobby");
    } else if (state === "playing") {
      this.close();
    } else if (state === "disconnected") {
      this.setMpStatus("host", "");
      this.setMpStatus("browse", "");
      this.setMpStatus("join", "");
    }
  }

  public updateLobbyState(players: { name: string; isHost: boolean }[], isHost: boolean, phase: "lobby" | "playing"): void {
    if (phase === "playing") { this.close(); return; }
    if (this.gameView === "lobby") this.syncLobbyView(players, isHost);
  }

  public setMultiplayerStatusMessage(message: string): void {
    if (this.gameView === "host") this.setMpStatus("host", message);
    else if (this.gameView === "browse") this.setMpStatus("browse", message);
    else if (this.gameView === "join") this.setMpStatus("join", message);
  }

  // ── Sprite sheet ─────────────────────────────────────────────────────────────

  private loadSpriteSheet(): void {
    const img = new Image();
    img.src = "assets/img/sprites.png";
    img.onload = () => {
      this.spriteSheet = img;
      if (this._player && this._isOpen) this.renderInventory(this._player);
    };
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this._isOpen) return;

    // Keybinding capture
    if (this.listeningForKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key !== "Escape") this.assignKeyBinding(this.listeningForKey, e.code);
      this.listeningForKey = null;
      this.syncKeybindingControls();
      return;
    }

    // Escape navigation
    if (e.key === "Escape") {
      e.preventDefault();
      if (this._grabbedItemType !== null) { this.cancelGrab(); return; }
      if (this._currentTab === "settings" && this.settingsView === "keybindings") { this.setSettingsView("main"); return; }
      if (this._currentTab === "game" && this.gameView !== "main") {
        if (this.gameView === "multiplayer") this.setGameView("main");
        else if (this.gameView === "browse") this.closeBrowseGames();
        else if (this.gameView === "lobby") this.doLeaveLobby();
        else this.setGameView("multiplayer");
        return;
      }
      this.close();
      return;
    }

    // Tab switching
    if (e.key === "1" && e.altKey) { this.switchTab("inventory"); return; }
    if (e.key === "2" && e.altKey) { this.switchTab("settings"); return; }
    if (e.key === "3" && e.altKey) { this.switchTab("game"); return; }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this._cursorGhost) {
      this._cursorGhost.style.left = `${e.clientX + 12}px`;
      this._cursorGhost.style.top = `${e.clientY + 12}px`;
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (this._grabbedIndex === null) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetSlotEl = target?.closest("[data-index]") as HTMLElement | null;
    if (targetSlotEl && this._player) {
      const toIndex = parseInt(targetSlotEl.dataset.index ?? "-1", 10);
      if (toIndex >= 0 && toIndex < INVENTORY_TOTAL_SLOTS && toIndex !== this._grabbedIndex) {
        const fromIndex = this._grabbedIndex;
        swapInventorySlots(this._player, fromIndex, toIndex);
        const selSlot = this._player.selectedBarSlot;
        this._player.weapon = getWeaponForSlot(this._player.inventorySlots[selSlot]);
        this.onWeaponChanged?.(selSlot);
        this.onInventorySwap?.(fromIndex, toIndex);
        this.renderInventory(this._player);
      }
    }
    this.cancelGrab();
  };

  // ── Inventory interaction ────────────────────────────────────────────────────

  private handleSlotMouseDown(index: number, e: MouseEvent): void {
    if (!this._player) return;
    const slot = this._player.inventorySlots[index];
    if (!slot?.type) return;
    this._grabbedIndex = index;
    this._grabbedItemType = slot.type;
    this._cursorGhost = document.createElement("div");
    this._cursorGhost.className = "inv-cursor-ghost";
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 32;
    this.drawSpriteOnCanvas(canvas, slot.type, this._player);
    this._cursorGhost.appendChild(canvas);
    this._cursorGhost.style.left = `${e.clientX + 12}px`;
    this._cursorGhost.style.top = `${e.clientY + 12}px`;
    document.body.appendChild(this._cursorGhost);
  }

  private cancelGrab(): void {
    this._grabbedIndex = null;
    this._grabbedItemType = null;
    if (this._cursorGhost) { this._cursorGhost.remove(); this._cursorGhost = null; }
  }

  private showSlotTooltip(slotEl: HTMLElement, index: number, _e: MouseEvent): void {
    if (!this._player) return;
    const slot = this._player.inventorySlots[index];
    if (!slot?.type) return;
    const label = getSlotLabel(slot.type);
    const actions = getSlotActions(slot.type);
    const count = getSlotDisplayCount(this._player, index);
    let html = `<div class="inv-tip-name">${label}</div>`;
    if (count !== null && count !== undefined) html += `<div class="inv-tip-count">Count: ${count}</div>`;
    if (slot.type === ItemType.CTDM) {
      const pct = Math.round((this._player.ctdmCharge / this._player.ctdmChargeMax) * 100);
      html += `<div class="inv-tip-count">Charge: ${pct}% (${this._player.ctdmEnabled ? "ON" : "OFF"})</div>`;
    }
    if (actions.length > 0) html += `<div class="inv-tip-actions">${actions.join("<br>")}</div>`;
    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = "";
    const rect = slotEl.getBoundingClientRect();
    const tipW = 180;
    let left = rect.right + 8;
    if (left + tipW > window.innerWidth - 4) left = rect.left - tipW - 8;
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${Math.min(rect.top, window.innerHeight - 120)}px`;
    this.tooltipEl.style.width = `${tipW}px`;
  }

  private hideSlotTooltip(): void {
    this.tooltipEl.style.display = "none";
  }

  // ── Settings sync ────────────────────────────────────────────────────────────

  private syncSettingsControls(): void {
    this.syncSoundLabels();
    this.syncAppearanceControls();
    this.syncDevToolsControls();
  }

  private syncSoundLabels(): void {
    if (this._sfxSlider) this._sfxSlider.value = String(Math.round(this.preferences.sfxVolume * 100));
    if (this._sfxLabel) this._sfxLabel.textContent = `${Math.round(this.preferences.sfxVolume * 100)}%`;
    if (this._musicSlider) this._musicSlider.value = String(Math.round(this.preferences.musicVolume * 100));
    if (this._musicLabel) this._musicLabel.textContent = `${Math.round(this.preferences.musicVolume * 100)}%`;
  }

  private syncAppearanceControls(): void {
    this.window.querySelectorAll<HTMLElement>("[data-theme-value]").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.themeValue === this.preferences.theme);
    });
    this.window.querySelectorAll<HTMLElement>("[data-zoom-value]").forEach((btn) => {
      btn.classList.toggle("selected", Number.parseInt(btn.dataset.zoomValue ?? "1") === this.preferences.zoom);
    });
  }

  private syncDevToolsControls(): void {
    const toggle = this.window.querySelector<HTMLInputElement>("#char-dev-tools-toggle");
    if (toggle) toggle.checked = this.preferences.devTools;
    this.window.querySelectorAll<HTMLElement>("[data-dev-panel]").forEach((el) => el.classList.toggle("hidden", !this.preferences.devTools));
    this.window.querySelectorAll<HTMLElement>(".dev-only").forEach((el) => el.classList.toggle("hidden", !this.preferences.devTools));
  }

  private syncKeybindingControls(): void {
    this.window.querySelectorAll<HTMLElement>(".imb-keybinding-row").forEach((row) => {
      const action = row.dataset.keybindingRow as KeyBindingAction | undefined;
      if (!action) return;
      const def = KEY_BINDING_DEFINITIONS.find((d) => d.action === action);
      row.classList.toggle("hidden", Boolean(def?.devOnly && !this.preferences.devTools));
    });
    this.window.querySelectorAll<HTMLButtonElement>("[data-keybinding-action]").forEach((btn) => {
      const action = btn.dataset.keybindingAction as KeyBindingAction | undefined;
      if (!action) return;
      btn.textContent = this.listeningForKey === action ? "Press a key…" : keyCodeToLabel(this.preferences.keyBindings[action] ?? "");
      btn.classList.toggle("listening", this.listeningForKey === action);
    });
  }

  // ── Preferences management ───────────────────────────────────────────────────

  private updatePreferences(next: Partial<UserPreferences>): void {
    this.preferences = {
      ...this.preferences,
      ...next,
      keyBindings: next.keyBindings ? { ...next.keyBindings } : { ...this.preferences.keyBindings },
    };
    this._onPreferencesChange({ ...this.preferences, keyBindings: { ...this.preferences.keyBindings } });
  }

  private assignKeyBinding(action: KeyBindingAction, code: string): void {
    const keyBindings = { ...this.preferences.keyBindings };
    for (const def of KEY_BINDING_DEFINITIONS) {
      if (def.action !== action && keyBindings[def.action] === code) {
        keyBindings[def.action] = this.preferences.keyBindings[action];
      }
    }
    keyBindings[action] = code;
    this.updatePreferences({ keyBindings });
  }

  public setPreferences(prefs: UserPreferences): void {
    this.preferences = { ...prefs, keyBindings: { ...prefs.keyBindings } };
    if (this._isOpen && this._currentTab === "settings") this.syncSettingsControls();
    if (this._isOpen && this._currentTab === "settings" && this.settingsView === "keybindings") this.syncKeybindingControls();
  }

  // ── Tab management ───────────────────────────────────────────────────────────

  public get currentTab(): ModalTab { return this._currentTab; }

  public switchTab(tab: ModalTab): void {
    this._currentTab = tab;
    this.listeningForKey = null;

    for (const [id, btn] of this.tabButtons) btn.classList.toggle("active", id === tab);
    for (const [id, panel] of this.tabPanels) panel.style.display = id === tab ? "" : "none";

    if (tab === "settings") {
      this.setSettingsView(this.settingsView);
      this.syncSettingsControls();
    }
    if (tab === "game") {
      this.setGameView(this.gameView);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  public open(tab: ModalTab = "inventory", player: Player): void {
    if (this._isOpen) {
      if (this._currentTab !== tab) this.switchTab(tab);
      return;
    }
    this._player = player;
    this._isOpen = true;
    this.scrim.style.display = "";
    this.window.style.display = "";
    this.centerWindow();
    document.body.classList.add("imb-modal-open");
    this.switchTab(tab);
    this.renderInventory(player);
  }

  public close(): void {
    if (!this._isOpen) return;
    this.cancelGrab();
    this.hideSlotTooltip();
    this.listeningForKey = null;
    this.stopDrag();
    this._isOpen = false;
    this.scrim.style.display = "none";
    this.window.style.display = "none";
    document.body.classList.remove("imb-modal-open");
    this.onClose?.();
  }

  public isOpen(): boolean { return this._isOpen; }

  public renderInventory(player: Player): void {
    this._player = player;
    if (!this._isOpen) return;
    for (let i = 0; i < INVENTORY_TOTAL_SLOTS; i++) this.renderInvSlot(player, i);
  }

  private renderInvSlot(player: Player, index: number): void {
    const slotEl = this.invSlotEls[index];
    if (!slotEl) return;
    const slot = player.inventorySlots[index];
    const isSelected = index < INVENTORY_BAR_SIZE && player.selectedBarSlot === index;
    slotEl.classList.toggle("selected", isSelected);
    slotEl.classList.toggle("empty", !slot?.type);
    const icon = slotEl.querySelector(".char-inv-icon") as HTMLCanvasElement;
    const ctx = icon.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 32, 32);
    if (slot?.type) this.drawSpriteOnCanvas(icon, slot.type, player);
    const countEl = slotEl.querySelector(".char-inv-count") as HTMLElement;
    const count = slot?.type ? getSlotDisplayCount(player, index) : null;
    if (count !== null && count !== undefined) { countEl.textContent = String(count); countEl.style.display = ""; }
    else countEl.style.display = "none";
    const fill = slotEl.querySelector(".char-inv-bar-fill") as HTMLElement;
    if (slot?.type === ItemType.CTDM && player.hasCTDM) {
      const pct = Math.max(0, Math.min(1, player.ctdmCharge / player.ctdmChargeMax));
      fill.style.width = `${pct * 100}%`;
      fill.style.setProperty("--bar-color", pct > 0.5 ? "#44ff88" : pct > 0.2 ? "#ffcc00" : "#ff4422");
      fill.parentElement!.style.display = "";
    } else if (slot?.type === ItemType.PISTOL) {
      const pct = Math.max(0, Math.min(1, player.ammo / 12));
      fill.style.width = `${pct * 100}%`;
      fill.style.setProperty("--bar-color", "#4af");
      fill.parentElement!.style.display = "";
    } else {
      fill.parentElement!.style.display = "none";
    }
  }

  private drawSpriteOnCanvas(canvas: HTMLCanvasElement, itemType: ItemType, player: Player): void {
    if (!this.spriteSheet) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = SPRITE_COORDS[itemType];
    if (!coords) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (itemType === ItemType.CTDM) {
      ctx.filter = player.ctdmEnabled ? "brightness(1.1) saturate(1.4) hue-rotate(120deg)" : "brightness(0.4) saturate(0.2)";
    }
    ctx.drawImage(this.spriteSheet, coords.x * SPRITE_SIZE, coords.y * SPRITE_SIZE, SPRITE_SIZE, SPRITE_SIZE, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  public dispose(): void {
    this.stopBrowse();
    this.stopDrag();
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    this.window.remove();
    this.scrim.remove();
    this.tooltipEl.remove();
    if (this._cursorGhost) this._cursorGhost.remove();
  }
}
