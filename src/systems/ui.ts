import { Player, SimulationState } from "../types";

export class UI {
  private storyElement: HTMLElement;
  private storyScrollElement: HTMLElement;
  private floorElement: HTMLElement;
  private hpElement: HTMLElement;
  private hpBarElement: HTMLElement;
  private scoreElement: HTMLElement;
  private gameOverScoreElement: HTMLElement;
  private ctdmSectionElement: HTMLElement;
  private ctdmStatusElement: HTMLElement;
  private ctdmBarElement: HTMLElement;

  private lastStoryLength = 0;
  private userScrolledUp = false;

  constructor() {
    this.storyElement = this.getElement("story");
    this.storyScrollElement = this.getElement("story-scroll");
    this.floorElement = this.getElement("floor");
    this.hpElement = this.getElement("hp");
    this.hpBarElement = this.getElement("hpbar");
    this.scoreElement = this.getElement("score");
    this.gameOverScoreElement = this.getElement("game-over-score");
    this.ctdmSectionElement = this.getElement("ctdm-section");
    this.ctdmStatusElement = this.getElement("ctdm-status");
    this.ctdmBarElement = this.getElement("ctdmbar");

    this.storyScrollElement.addEventListener("scroll", () => {
      const el = this.storyScrollElement;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
      this.userScrolledUp = !atBottom;
    });
  }

  private getElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id "${id}" not found`);
    }
    return element;
  }

  public updateStats(player: Player, depth: number): void {
    this.floorElement.textContent = String(depth);
    this.hpElement.textContent = `${player.hp}/${player.hpMax}`;
    this.scoreElement.textContent = String(player.score);
    this.gameOverScoreElement.textContent = `Score: ${player.score}`;

    const hpPercent = Math.max(0, Math.min(1, player.hp / player.hpMax));
    this.hpBarElement.style.setProperty("--hp-width", `${hpPercent * 100}%`);
  }

  public updateCTDM(player: Player, threatLevel: number): void {
    if (!player.hasCTDM) {
      this.ctdmSectionElement.style.display = "none";
      return;
    }

    this.ctdmSectionElement.style.display = "";
    this.ctdmStatusElement.textContent = player.ctdmEnabled ? "ON" : "OFF";

    const chargePercent = Math.max(
      0,
      Math.min(1, player.ctdmCharge / player.ctdmChargeMax),
    );
    this.ctdmBarElement.style.setProperty(
      "--ctdm-width",
      `${chargePercent * 100}%`,
    );
    this.ctdmBarElement.style.setProperty(
      "--ctdm-threat",
      String(threatLevel.toFixed(2)),
    );
  }

  public updateStory(messages: string[]): void {
    const newLength = messages.length;
    const hadNewMessages = newLength !== this.lastStoryLength;
    this.lastStoryLength = newLength;

    this.storyElement.innerHTML = "";
    const displayCount = Math.min(200, messages.length);
    // messages[0] is newest — render oldest→newest so newest is at DOM bottom
    for (let i = displayCount - 1; i >= 0; i--) {
      const li = document.createElement("li");
      li.textContent = messages[i];
      this.storyElement.appendChild(li);
    }

    // Scroll to bottom when new messages arrive (unless user scrolled up in expanded mode)
    if (hadNewMessages && !this.userScrolledUp) {
      this.storyScrollElement.scrollTop = this.storyScrollElement.scrollHeight;
    }
  }

  public updateAll(
    player: Player,
    depth: number,
    story: string[],
    sim: SimulationState,
    threatLevel: number,
    _godMode: boolean,
  ): void {
    this.updateStats(player, depth);
    this.updateStory(story);
    this.updateCTDM(player, threatLevel);
  }
}
