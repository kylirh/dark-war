import { Player, SimulationState } from "../engine/types";

export class UI {
  private storyElement: HTMLElement;
  private storyScrollElement: HTMLElement;
  private hpElement: HTMLElement;
  private hpBarElement: HTMLElement;
  private gameOverScoreElement: HTMLElement;

  private lastStoryLength = 0;
  private userScrolledUp = false;

  constructor() {
    this.storyElement = this.getElement("story");
    this.storyScrollElement = this.getElement("story-scroll");
    this.hpElement = this.getElement("hp");
    this.hpBarElement = this.getElement("hpbar");
    this.gameOverScoreElement = this.getElement("game-over-score");

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

  public updateStats(player: Player): void {
    this.hpElement.textContent = `${player.hp}/${player.hpMax}`;
    this.gameOverScoreElement.textContent = `Score: ${player.score}`;

    const hpPercent = Math.max(0, Math.min(1, player.hp / player.hpMax));
    this.hpBarElement.style.setProperty("--hp-width", `${hpPercent * 100}%`);
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
    _depth: number,
    story: string[],
    _sim: SimulationState,
    _threatLevel: number,
    _godMode: boolean,
  ): void {
    this.updateStats(player);
    this.updateStory(story);
  }
}
