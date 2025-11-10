import { Player } from "../types";

/**
 * Handles UI updates (stats, log, inventory)
 */
export class UI {
  private logElement: HTMLElement;
  private floorElement: HTMLElement;
  private hpElement: HTMLElement;
  private hpBarElement: HTMLElement;
  private ammoElement: HTMLElement;
  private weaponElement: HTMLElement;
  private keysElement: HTMLElement;
  private scoreElement: HTMLElement;
  private inventoryElement: HTMLElement;

  constructor() {
    this.logElement = this.getElement("log");
    this.floorElement = this.getElement("floor");
    this.hpElement = this.getElement("hp");
    this.hpBarElement = this.getElement("hpbar");
    this.ammoElement = this.getElement("ammo");
    this.weaponElement = this.getElement("weapon");
    this.keysElement = this.getElement("keys");
    this.scoreElement = this.getElement("score");
    this.inventoryElement = this.getElement("inventory");
  }

  private getElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id "${id}" not found`);
    }
    return element;
  }

  /**
   * Update player stats display
   */
  public updateStats(player: Player, depth: number): void {
    this.floorElement.textContent = String(depth);
    this.hpElement.textContent = `${player.hp}/${player.hpMax}`;
    this.ammoElement.textContent = `${player.ammo} | ${player.ammoReserve}`;
    this.weaponElement.textContent = player.weapon ? "Pistol" : "—";
    this.keysElement.textContent = String(player.keys);
    this.scoreElement.textContent = String(player.score);

    // Update HP bar
    const hpPercent = Math.max(0, Math.min(1, player.hp / player.hpMax));
    this.hpBarElement.style.width = `${hpPercent * 100}%`;
  }

  /**
   * Update inventory display
   */
  public updateInventory(player: Player): void {
    const items: string[] = [];

    if (player.weapon) {
      items.push(`Weapon: Pistol (${player.ammo}/12)`);
    }

    if (player.ammoReserve > 0) {
      items.push(`Ammo reserve: ${player.ammoReserve}`);
    }

    if (player.keys > 0) {
      items.push(`Keycards: ${player.keys}`);
    }

    if (player.hp < player.hpMax) {
      items.push(`Med need: ${player.hpMax - player.hp}`);
    }

    this.inventoryElement.textContent =
      items.length > 0 ? items.join("  •  ") : "Empty";
  }

  /**
   * Update message log
   */
  public updateLog(messages: string[]): void {
    this.logElement.textContent = messages.slice(0, 20).join("\n");
  }

  /**
   * Add a message to the log
   */
  public addMessage(message: string, log: string[]): void {
    log.unshift(message);
    if (log.length > 200) {
      log.pop();
    }
    this.updateLog(log);
  }

  /**
   * Update all UI elements
   */
  public updateAll(player: Player, depth: number, log: string[]): void {
    this.updateStats(player, depth);
    this.updateInventory(player);
    this.updateLog(log);
  }
}
