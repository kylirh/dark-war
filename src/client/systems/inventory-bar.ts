import { INVENTORY_BAR_SIZE, ItemType, Player } from "../../engine/types";
import { SPRITE_COORDS, SPRITE_SIZE } from "../../engine/config/sprites";
import {
  getSlotActions,
  getSlotDisplayCount,
  getSlotKeyLabel,
  getSlotLabel,
} from "../../engine/utils/inventory";

const SLOT_SIZE = 44; // Slot outer size including border and padding
const ICON_SIZE = 32;
const SPRITESHEET_URL = "assets/img/sprites.png";

export class InventoryBar {
  private container: HTMLElement;
  private slots: HTMLElement[] = [];
  private tooltipEl: HTMLElement;
  private spriteSheet: HTMLImageElement | null = null;
  private pendingRender: Player | null = null;

  constructor() {
    this.container = this.buildContainer();
    this.tooltipEl = this.buildTooltip();
    document.body.appendChild(this.tooltipEl);

    this.loadSpriteSheet();
  }

  private buildContainer(): HTMLElement {
    const bar = document.createElement("div");
    bar.id = "inventory-bar";
    bar.className = "inventory-bar";

    for (let i = 0; i < INVENTORY_BAR_SIZE; i++) {
      const slot = this.buildSlot(i);
      this.slots.push(slot);
      bar.appendChild(slot);
    }

    // Float over the game canvas — inserted as last child of .game-area
    // (position: absolute anchors it to .game-area which has position: relative)
    const gameArea = document.querySelector(".game-area");
    if (gameArea) {
      gameArea.appendChild(bar);
    } else {
      document.body.appendChild(bar);
    }

    return bar;
  }

  private buildSlot(index: number): HTMLElement {
    const slot = document.createElement("div");
    slot.className = "inv-slot";
    slot.dataset.slot = String(index);

    const keyLabel = document.createElement("span");
    keyLabel.className = "inv-slot-key";
    keyLabel.textContent = getSlotKeyLabel(index);

    const icon = document.createElement("canvas");
    icon.className = "inv-slot-icon";
    icon.width = ICON_SIZE;
    icon.height = ICON_SIZE;

    const count = document.createElement("span");
    count.className = "inv-slot-count";

    const bar = document.createElement("div");
    bar.className = "inv-slot-bar";
    const barFill = document.createElement("div");
    barFill.className = "inv-slot-bar-fill";
    bar.appendChild(barFill);

    slot.appendChild(keyLabel);
    slot.appendChild(icon);
    slot.appendChild(count);
    slot.appendChild(bar);

    slot.addEventListener("mouseenter", () => this.showTooltip(slot, index));
    slot.addEventListener("mouseleave", () => this.hideTooltip());
    slot.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onSlotClick?.(index);
    });

    return slot;
  }

  private buildTooltip(): HTMLElement {
    const tip = document.createElement("div");
    tip.id = "inv-tooltip";
    tip.className = "inv-tooltip";
    tip.style.display = "none";
    return tip;
  }

  private loadSpriteSheet(): void {
    const img = new Image();
    img.src = SPRITESHEET_URL;
    img.onload = () => {
      this.spriteSheet = img;
      if (this.pendingRender) {
        this.render(this.pendingRender);
        this.pendingRender = null;
      }
    };
  }

  public onSlotClick: ((index: number) => void) | null = null;

  public render(player: Player): void {
    if (!this.spriteSheet) {
      this.pendingRender = player;
      return;
    }

    for (let i = 0; i < INVENTORY_BAR_SIZE; i++) {
      this.renderSlot(player, i);
    }
  }

  private renderSlot(player: Player, index: number): void {
    const slotEl = this.slots[index];
    if (!slotEl) return;

    const slot = player.inventorySlots[index];
    const isSelected = player.selectedBarSlot === index;

    slotEl.classList.toggle("selected", isSelected);
    slotEl.classList.toggle("empty", !slot?.type);

    const iconCanvas = slotEl.querySelector(
      ".inv-slot-icon",
    ) as HTMLCanvasElement;
    const ctx = iconCanvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

    if (slot?.type) {
      this.drawSprite(ctx, slot.type, player);
    }

    // Count badge
    const countEl = slotEl.querySelector(".inv-slot-count") as HTMLElement;
    const count = slot?.type ? getSlotDisplayCount(player, index) : null;
    if (count !== null && count !== undefined) {
      countEl.textContent = String(count);
      countEl.style.display = "";
    } else {
      countEl.textContent = "";
      countEl.style.display = "none";
    }

    // Charge / health bar
    const barFill = slotEl.querySelector(".inv-slot-bar-fill") as HTMLElement;
    if (slot?.type === ItemType.CTDM && player.hasCTDM) {
      const pct = Math.max(
        0,
        Math.min(1, player.ctdmCharge / player.ctdmChargeMax),
      );
      barFill.style.width = `${pct * 100}%`;
      barFill.style.setProperty("--bar-color", this.ctdmBarColor(pct));
      barFill.parentElement!.style.display = "";
    } else if (slot?.type === ItemType.PISTOL) {
      const pct = Math.max(0, Math.min(1, player.ammo / 12));
      barFill.style.width = `${pct * 100}%`;
      barFill.style.setProperty("--bar-color", "#4af");
      barFill.parentElement!.style.display = "";
    } else {
      barFill.style.width = "0";
      barFill.parentElement!.style.display = "none";
    }
  }

  private ctdmBarColor(pct: number): string {
    if (pct > 0.5) return "#44ff88";
    if (pct > 0.2) return "#ffcc00";
    return "#ff4422";
  }

  private drawSprite(
    ctx: CanvasRenderingContext2D,
    itemType: ItemType,
    player: Player,
  ): void {
    if (!this.spriteSheet) return;

    // For CTDM: tint based on enabled/disabled
    const spriteKey =
      itemType === ItemType.CTDM && !player.ctdmEnabled
        ? ItemType.CTDM // use same sprite but dim it
        : itemType;

    const coords = SPRITE_COORDS[spriteKey];
    if (!coords) return;

    const srcX = coords.x * SPRITE_SIZE;
    const srcY = coords.y * SPRITE_SIZE;

    ctx.save();

    if (itemType === ItemType.CTDM) {
      if (!player.ctdmEnabled) {
        ctx.filter = "brightness(0.4) saturate(0.2)";
      } else {
        ctx.filter = "brightness(1.1) saturate(1.4) hue-rotate(120deg)";
      }
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.spriteSheet,
      srcX,
      srcY,
      SPRITE_SIZE,
      SPRITE_SIZE,
      0,
      0,
      ICON_SIZE,
      ICON_SIZE,
    );

    ctx.restore();
  }

  private showTooltip(slotEl: HTMLElement, index: number): void {
    // Tooltip content is populated in render, so we need player data
    // We store the last rendered player for this
    if (!this._lastPlayer) return;
    const slot = this._lastPlayer.inventorySlots[index];
    if (!slot?.type) return;

    const label = getSlotLabel(slot.type);
    const actions = getSlotActions(slot.type);
    const count = getSlotDisplayCount(this._lastPlayer, index);

    let html = `<div class="inv-tip-name">${label}</div>`;
    if (count !== null && count !== undefined) {
      html += `<div class="inv-tip-count">Count: ${count}</div>`;
    }
    if (slot.type === ItemType.CTDM) {
      const pct = Math.round(
        (this._lastPlayer.ctdmCharge / this._lastPlayer.ctdmChargeMax) * 100,
      );
      const status = this._lastPlayer.ctdmEnabled ? "ON" : "OFF";
      html += `<div class="inv-tip-count">Charge: ${pct}% (${status})</div>`;
    }
    if (actions.length > 0) {
      html += `<div class="inv-tip-actions">${actions.join("<br>")}</div>`;
    }

    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = "";

    const rect = slotEl.getBoundingClientRect();
    const tipW = 180;
    let left = rect.left + rect.width / 2 - tipW / 2;
    left = Math.max(4, Math.min(window.innerWidth - tipW - 4, left));
    const top = rect.bottom + 6;

    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
    this.tooltipEl.style.width = `${tipW}px`;
  }

  private hideTooltip(): void {
    this.tooltipEl.style.display = "none";
  }

  private _lastPlayer: Player | null = null;

  public update(player: Player): void {
    this._lastPlayer = player;
    this.render(player);
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? "" : "none";
  }

  public dispose(): void {
    this.container.remove();
    this.tooltipEl.remove();
  }
}
