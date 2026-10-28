/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { UI } from "./ui";
import { Player } from "../../engine/types";
import { AlertManager } from "./alert-manager";

vi.mock("./alert-manager", () => {
  const AlertManagerMock = vi.fn();
  AlertManagerMock.prototype.show = vi.fn();
  AlertManagerMock.prototype.clear = vi.fn();
  AlertManagerMock.prototype.dispose = vi.fn();

  return {
    AlertManager: AlertManagerMock,
  };
});

describe("UI", () => {
  let ui: UI;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    mockContainer = document.createElement("div");

    // Create elements needed by UI
    const ids = [
      "story",
      "story-scroll",
      "hp",
      "hpbar",
      "resting-status",
      "game-over-score",
      "alert-overlay",
    ];
    for (const id of ids) {
      const el = document.createElement("div");
      el.id = id;
      mockContainer.appendChild(el);
    }

    document.body.appendChild(mockContainer);

    ui = new UI();
  });

  afterEach(() => {
    document.body.removeChild(mockContainer);
    vi.clearAllMocks();
  });

  it("should initialize successfully when elements are present", () => {
    expect(ui).toBeDefined();
    expect(AlertManager).toHaveBeenCalledTimes(1);
  });

  it("should throw error if an element is missing", () => {
    const el = document.getElementById("hp");
    if (el) {
      el.remove();
    }

    expect(() => new UI()).toThrow('Element with id "hp" not found');
  });

  describe("updateStats", () => {
    it("should update HP correctly", () => {
      const player = {
        hp: 50,
        hpMax: 100,
        resting: false,
        score: 10,
      } as unknown as Player;
      ui.updateStats(player);

      const hpEl = document.getElementById("hp");
      expect(hpEl?.textContent).toBe("50/100");

      const hpBarEl = document.getElementById("hpbar");
      expect(hpBarEl?.style.getPropertyValue("--hp-width")).toBe("50%");
    });

    it("should clamp HP bar width between 0 and 100", () => {
      const player = {
        hp: -10,
        hpMax: 100,
        resting: false,
        score: 10,
      } as unknown as Player;
      ui.updateStats(player);
      const hpBarEl = document.getElementById("hpbar");
      expect(hpBarEl?.style.getPropertyValue("--hp-width")).toBe("0%");

      const player2 = {
        hp: 120,
        hpMax: 100,
        resting: false,
        score: 10,
      } as unknown as Player;
      ui.updateStats(player2);
      expect(hpBarEl?.style.getPropertyValue("--hp-width")).toBe("100%");
    });

    it("should update resting status", () => {
      const player = {
        hp: 50,
        hpMax: 100,
        resting: true,
        score: 10,
      } as unknown as Player;
      ui.updateStats(player);
      const restingEl = document.getElementById("resting-status");
      expect(restingEl?.textContent).toBe("RESTING");
    });

    it("should update game over score", () => {
      const player = {
        hp: 50,
        hpMax: 100,
        resting: false,
        score: 1500,
      } as unknown as Player;
      ui.updateStats(player);
      const scoreEl = document.getElementById("game-over-score");
      expect(scoreEl?.textContent).toBe("Score: 1500");
    });
  });

  describe("updateStory", () => {
    it("should render messages in reverse order up to 200", () => {
      const messages = ["message 1", "message 2", "message 3"];
      ui.updateStory(messages);

      const storyEl = document.getElementById("story");
      const listItems = storyEl?.querySelectorAll("li");
      expect(listItems?.length).toBe(3);
      expect(listItems?.[0].textContent).toBe("message 3");
      expect(listItems?.[1].textContent).toBe("message 2");
      expect(listItems?.[2].textContent).toBe("message 1");
    });

    it("should scroll to bottom when new messages arrive if not scrolled up", () => {
      const storyScrollEl = document.getElementById(
        "story-scroll",
      ) as HTMLElement;

      // Mock properties for scroll calculation
      Object.defineProperty(storyScrollEl, "scrollHeight", {
        value: 500,
        configurable: true,
      });
      Object.defineProperty(storyScrollEl, "clientHeight", {
        value: 100,
        configurable: true,
      });

      ui.updateStory(["new message"]);

      expect(storyScrollEl.scrollTop).toBe(500);
    });
  });

  describe("AlertManager wrapper functions", () => {
    it("showAlert should pass through to alert manager", () => {
      ui.showAlert("test message", 1000);
      // @ts-ignore - reaching into private for test
      expect(ui.alertManager.show).toHaveBeenCalledWith("test message", 1000);
    });

    it("clearAlerts should pass through to alert manager", () => {
      ui.clearAlerts();
      // @ts-ignore - reaching into private for test
      expect(ui.alertManager.clear).toHaveBeenCalled();
    });

    it("dispose should pass through to alert manager", () => {
      ui.dispose();
      // @ts-ignore - reaching into private for test
      expect(ui.alertManager.dispose).toHaveBeenCalled();
    });
  });

  describe("updateAll", () => {
    it("should call both updateStats and updateStory", () => {
      const player = {
        hp: 50,
        hpMax: 100,
        resting: false,
        score: 10,
      } as unknown as Player;
      const story = ["test message"];

      const updateStatsSpy = vi.spyOn(ui, "updateStats");
      const updateStorySpy = vi.spyOn(ui, "updateStory");

      ui.updateAll(player, 1, story, {} as any, 1, false);

      expect(updateStatsSpy).toHaveBeenCalledWith(player);
      expect(updateStorySpy).toHaveBeenCalledWith(story);
    });
  });
});
