import { Player, SimulationState } from "../types";

/**
 * Handles UI updates (stats, log, inventory)
 */
export class UI {
  private logElement: HTMLElement;
  private floorElement: HTMLElement;
  private hpElement: HTMLElement;
  private hpBarElement: HTMLElement;
  private scoreElement: HTMLElement;
  private inventoryElement: HTMLElement;
  private modeElement: HTMLElement | null;

  constructor() {
    this.logElement = this.getElement("log");
    this.floorElement = this.getElement("floor");
    this.hpElement = this.getElement("hp");
    this.hpBarElement = this.getElement("hpbar");
    this.scoreElement = this.getElement("score");
    this.inventoryElement = this.getElement("inventory");
    this.modeElement = document.getElementById("mode"); // Optional element
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
    this.scoreElement.textContent = String(player.score);

    // Update HP bar
    const hpPercent = Math.max(0, Math.min(1, player.hp / player.hpMax));
    this.hpBarElement.style.setProperty("--hp-width", `${hpPercent * 100}%`);
  }

  /**
   * Update mode display
   */
  public updateMode(sim: SimulationState): void {
    if (!this.modeElement) return;

    let modeText = "";
    if (sim.mode === "PLANNING") {
      modeText = "Stratego!";
    } else {
      // Show time scale percentage
      const timePercent = Math.round(sim.timeScale * 100);
      if (timePercent < 10) {
        modeText = `⏸ Slow-Mo (${timePercent}%)`;
      } else {
        modeText = `▶ Real-Time (${timePercent}%)`;
      }
    }
    this.modeElement.textContent = modeText;
  }

  /**
   * Update inventory display
   */
  public updateInventory(player: Player): void {
    const items: string[] = [];

    if (player.weapon) {
      items.push(`Pistol (${player.ammo}/12)`);
    }

    if (player.ammoReserve > 0) {
      items.push(`Ammo: ${player.ammoReserve}`);
    }

    if (player.keys > 0) {
      items.push(`Keycards: ${player.keys}`);
    }

    this.inventoryElement.textContent =
      items.length > 0 ? items.join("  •  ") : "Empty";
  }

  /**
   * Update message log (messages already ordered newest first)
   */
  public updateLog(messages: string[]): void {
    this.logElement.innerHTML = "";
    const displayCount = Math.min(100, messages.length);
    for (let i = 0; i < displayCount; i++) {
      const li = document.createElement("li");
      li.textContent = messages[i];
      this.logElement.appendChild(li);
    }
  }

  /**
   * Update all UI elements
   */
  public updateAll(
    player: Player,
    depth: number,
    log: string[],
    sim: SimulationState
  ): void {
    this.updateStats(player, depth);
    this.updateInventory(player);
    this.updateLog(log);
    this.updateMode(sim);
  }
}
