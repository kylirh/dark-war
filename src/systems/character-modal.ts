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
  moveInventorySlot,
  swapInventorySlots,
} from "../utils/inventory";
import { getWeaponForSlot } from "../utils/inventory";

export type ModalTab = "inventory" | "settings" | "game";

export class CharacterModal {
  private overlay: HTMLElement;
  private window: HTMLElement;
  private tabButtons: Map<ModalTab, HTMLElement> = new Map();
  private tabPanels: Map<ModalTab, HTMLElement> = new Map();
  private invSlotEls: HTMLElement[] = [];
  private spriteSheet: HTMLImageElement | null = null;
  private _player: Player | null = null;
  private _isOpen = false;
  private _currentTab: ModalTab = "inventory";

  private _dragFromIndex: number | null = null;
  private _dragGhost: HTMLElement | null = null;
  private _grabbedIndex: number | null = null;
  private _grabbedItemType: ItemType | null = null;
  private _cursorGhost: HTMLElement | null = null;

  private tooltipEl: HTMLElement;

  public onClose: (() => void) | null = null;
  public onWeaponChanged: ((slot: number) => void) | null = null;
  public onNewGame: (() => void) | null = null;
  public onSave: (() => void) | null = null;
  public onLoad: (() => void) | null = null;

  constructor() {
    this.tooltipEl = this.buildTooltip();
    document.body.appendChild(this.tooltipEl);

    this.overlay = document.createElement("div");
    this.overlay.className = "char-modal-overlay";
    this.overlay.style.display = "none";

    this.window = document.createElement("div");
    this.window.className = "char-modal-window";

    this.window.appendChild(this.buildTitlebar());
    this.window.appendChild(this.buildTabBar());
    this.window.appendChild(this.buildTabPanels());

    this.overlay.appendChild(this.window);
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);

    this.loadSpriteSheet();
  }

  private buildTooltip(): HTMLElement {
    const tip = document.createElement("div");
    tip.id = "char-modal-tooltip";
    tip.className = "inv-tooltip char-modal-tooltip";
    tip.style.display = "none";
    return tip;
  }

  private buildTitlebar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "char-modal-titlebar";

    const stripes = document.createElement("div");
    stripes.className = "char-modal-stripes";

    const title = document.createElement("div");
    title.className = "char-modal-title";
    title.textContent = "Character";

    const stripes2 = document.createElement("div");
    stripes2.className = "char-modal-stripes";

    const closeBtn = document.createElement("button");
    closeBtn.className = "char-modal-close";
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => this.close());

    bar.appendChild(stripes);
    bar.appendChild(title);
    bar.appendChild(stripes2);
    bar.appendChild(closeBtn);
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
    invPanel.className = "char-modal-panel";
    invPanel.dataset.panel = "inventory";
    this.tabPanels.set("inventory", invPanel);
    panels.appendChild(invPanel);

    const settingsPanel = this.buildSettingsPanel();
    settingsPanel.className = "char-modal-panel";
    settingsPanel.dataset.panel = "settings";
    this.tabPanels.set("settings", settingsPanel);
    panels.appendChild(settingsPanel);

    const gamePanel = this.buildGamePanel();
    gamePanel.className = "char-modal-panel";
    gamePanel.dataset.panel = "game";
    this.tabPanels.set("game", gamePanel);
    panels.appendChild(gamePanel);

    return panels;
  }

  private buildInventoryPanel(): HTMLElement {
    const panel = document.createElement("div");

    const label = document.createElement("p");
    label.className = "char-modal-inv-label";
    label.textContent = "Click items to grab and move them. Top row = hot bar.";
    panel.appendChild(label);

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

    slot.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.handleSlotMouseDown(index, e);
    });
    slot.addEventListener("mouseenter", (e) => {
      this.showSlotTooltip(slot, index, e);
    });
    slot.addEventListener("mouseleave", () => this.hideSlotTooltip());

    return slot;
  }

  private buildSettingsPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.innerHTML = `<p class="char-modal-placeholder">Settings will appear here.</p>`;
    return panel;
  }

  private buildGamePanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "char-modal-game-panel";

    const makeBtn = (label: string, handler: () => void): HTMLElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-modal-game-btn";
      btn.textContent = label;
      btn.addEventListener("click", handler);
      return btn;
    };

    panel.appendChild(makeBtn("Resume Game", () => this.close()));
    panel.appendChild(makeBtn("New Game", () => {
      this.close();
      this.onNewGame?.();
    }));
    panel.appendChild(makeBtn("Save Game", () => {
      this.onSave?.();
    }));
    panel.appendChild(makeBtn("Load Game", () => {
      this.onLoad?.();
    }));

    return panel;
  }

  private loadSpriteSheet(): void {
    const img = new Image();
    img.src = "assets/img/sprites.png";
    img.onload = () => {
      this.spriteSheet = img;
      if (this._player && this._isOpen) this.renderInventory(this._player);
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this._isOpen) return;
    // Only handle Escape/E for cancelling an active grab; closing/switching tabs
    // is handled by InputHandler (window listener fires after document listener).
    if (e.key === "Escape" || e.key === "e" || e.key === "E") {
      if (this._grabbedItemType !== null) {
        e.preventDefault();
        this.cancelGrab();
      }
    }
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
        swapInventorySlots(this._player, this._grabbedIndex, toIndex);

        // Sync weapon if bar slots changed
        const selSlot = this._player.selectedBarSlot;
        this._player.weapon = getWeaponForSlot(this._player.inventorySlots[selSlot]);
        this.onWeaponChanged?.(selSlot);

        this.renderInventory(this._player);
      }
    }

    this.cancelGrab();
  };

  private handleSlotMouseDown(index: number, e: MouseEvent): void {
    if (!this._player) return;
    const slot = this._player.inventorySlots[index];
    if (!slot?.type) return;

    this._grabbedIndex = index;
    this._grabbedItemType = slot.type;

    // Create cursor ghost
    this._cursorGhost = document.createElement("div");
    this._cursorGhost.className = "inv-cursor-ghost";

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    this.drawSpriteOnCanvas(canvas, slot.type, this._player);
    this._cursorGhost.appendChild(canvas);
    this._cursorGhost.style.left = `${e.clientX + 12}px`;
    this._cursorGhost.style.top = `${e.clientY + 12}px`;
    document.body.appendChild(this._cursorGhost);
  }

  private cancelGrab(): void {
    this._grabbedIndex = null;
    this._grabbedItemType = null;
    if (this._cursorGhost) {
      this._cursorGhost.remove();
      this._cursorGhost = null;
    }
  }

  private showSlotTooltip(slotEl: HTMLElement, index: number, e: MouseEvent): void {
    if (!this._player) return;
    const slot = this._player.inventorySlots[index];
    if (!slot?.type) return;

    const label = getSlotLabel(slot.type);
    const actions = getSlotActions(slot.type);
    const count = getSlotDisplayCount(this._player, index);

    let html = `<div class="inv-tip-name">${label}</div>`;
    if (count !== null && count !== undefined) {
      html += `<div class="inv-tip-count">Count: ${count}</div>`;
    }
    if (slot.type === ItemType.CTDM) {
      const pct = Math.round((this._player.ctdmCharge / this._player.ctdmChargeMax) * 100);
      const status = this._player.ctdmEnabled ? "ON" : "OFF";
      html += `<div class="inv-tip-count">Charge: ${pct}% (${status})</div>`;
    }
    if (actions.length > 0) {
      html += `<div class="inv-tip-actions">${actions.join("<br>")}</div>`;
    }

    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = "";

    const rect = slotEl.getBoundingClientRect();
    const tipW = 180;
    let left = rect.right + 8;
    if (left + tipW > window.innerWidth - 4) left = rect.left - tipW - 8;
    const top = Math.min(rect.top, window.innerHeight - 120);

    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
    this.tooltipEl.style.width = `${tipW}px`;
  }

  private hideSlotTooltip(): void {
    this.tooltipEl.style.display = "none";
  }

  public get currentTab(): ModalTab {
    return this._currentTab;
  }

  public switchTab(tab: ModalTab): void {
    this._currentTab = tab;

    for (const [id, btn] of this.tabButtons) {
      btn.classList.toggle("active", id === tab);
    }
    for (const [id, panel] of this.tabPanels) {
      panel.style.display = id === tab ? "" : "none";
    }
  }

  public open(tab: ModalTab = "inventory", player: Player): void {
    if (this._isOpen) {
      if (this._currentTab !== tab) this.switchTab(tab);
      return;
    }

    this._player = player;
    this._isOpen = true;
    this.overlay.style.display = "";
    document.body.classList.add("imb-modal-open");
    this.switchTab(tab);
    this.renderInventory(player);
  }

  public close(): void {
    if (!this._isOpen) return;
    this.cancelGrab();
    this.hideSlotTooltip();
    this._isOpen = false;
    this.overlay.style.display = "none";
    document.body.classList.remove("imb-modal-open");
    this.onClose?.();
  }

  public isOpen(): boolean {
    return this._isOpen;
  }

  public renderInventory(player: Player): void {
    this._player = player;
    if (!this._isOpen) return;

    for (let i = 0; i < INVENTORY_TOTAL_SLOTS; i++) {
      this.renderInvSlot(player, i);
    }
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
    if (slot?.type) {
      this.drawSpriteOnCanvas(icon, slot.type, player);
    }

    const countEl = slotEl.querySelector(".char-inv-count") as HTMLElement;
    const count = slot?.type ? getSlotDisplayCount(player, index) : null;
    if (count !== null && count !== undefined) {
      countEl.textContent = String(count);
      countEl.style.display = "";
    } else {
      countEl.style.display = "none";
    }

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

  private drawSpriteOnCanvas(
    canvas: HTMLCanvasElement,
    itemType: ItemType,
    player: Player,
  ): void {
    if (!this.spriteSheet) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coords = SPRITE_COORDS[itemType];
    if (!coords) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (itemType === ItemType.CTDM) {
      ctx.filter = player.ctdmEnabled
        ? "brightness(1.1) saturate(1.4) hue-rotate(120deg)"
        : "brightness(0.4) saturate(0.2)";
    }

    ctx.drawImage(
      this.spriteSheet,
      coords.x * SPRITE_SIZE,
      coords.y * SPRITE_SIZE,
      SPRITE_SIZE,
      SPRITE_SIZE,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    ctx.restore();
  }

  public dispose(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    this.overlay.remove();
    this.tooltipEl.remove();
    if (this._cursorGhost) this._cursorGhost.remove();
  }
}
