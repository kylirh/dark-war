import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AlertManager } from "./alert-manager";
import { DEFAULT_ALERT_DURATION_MS, MAX_ALERT_MESSAGES } from "./alert-queue";

const ALERT_FADE_DURATION_MS = 350;

class FakeClassList {
  private classes = new Set<string>();
  public add(className: string) {
    this.classes.add(className);
  }
  public contains(className: string) {
    return this.classes.has(className);
  }
}

class FakeElement {
  public className = "";
  public textContent = "";
  public classList = new FakeClassList();
  public remove = vi.fn();
}

class FakeContainer {
  public children: FakeElement[] = [];
  public appendChild(child: FakeElement) {
    this.children.push(child);
  }
}

describe("AlertManager", () => {
  let container: FakeContainer;
  let manager: AlertManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.spyOn(performance, "now").mockReturnValue(0);

    container = new FakeContainer();
    manager = new AlertManager(container as unknown as HTMLElement);
  });

  afterEach(() => {
    manager.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates an alert element and appends it to the container", () => {
    manager.show("Hello, world!");

    expect(container.children).toHaveLength(1);
    const element = container.children[0];
    expect(element.className).toBe("alert-message");
    expect(element.textContent).toBe("Hello, world!");
  });

  it("ignores empty messages", () => {
    manager.show("");
    manager.show("   ");
    expect(container.children).toHaveLength(0);
  });

  it("automatically dismisses alerts after their duration", () => {
    manager.show("Hello, world!");
    const element = container.children[0];

    expect(element.classList.contains("alert-message-dismissing")).toBe(false);

    vi.advanceTimersByTime(DEFAULT_ALERT_DURATION_MS);

    expect(element.classList.contains("alert-message-dismissing")).toBe(true);

    vi.advanceTimersByTime(ALERT_FADE_DURATION_MS);

    expect(element.remove).toHaveBeenCalled();
  });

  it("refreshes the duration of a duplicate alert instead of creating a new element", () => {
    manager.show("Duplicate text");
    const element = container.children[0];

    vi.advanceTimersByTime(DEFAULT_ALERT_DURATION_MS - 100);

    // Show it again to refresh
    manager.show("Duplicate text");

    // Only 1 element should exist
    expect(container.children).toHaveLength(1);

    // Original element should not be dismissing yet, even after passing original time
    vi.advanceTimersByTime(100);
    expect(element.classList.contains("alert-message-dismissing")).toBe(false);

    // Advance past the refreshed duration
    vi.advanceTimersByTime(DEFAULT_ALERT_DURATION_MS - 100);
    expect(element.classList.contains("alert-message-dismissing")).toBe(true);
  });

  it("evicts the oldest alert when exceeding the maximum limit", () => {
    for (let i = 0; i < MAX_ALERT_MESSAGES; i++) {
      manager.show(`Message ${i}`);
    }

    expect(container.children).toHaveLength(MAX_ALERT_MESSAGES);
    const oldestElement = container.children[0];

    // Trigger eviction of the oldest message
    manager.show("Overflow message");

    expect(oldestElement.classList.contains("alert-message-dismissing")).toBe(
      true,
    );

    vi.advanceTimersByTime(ALERT_FADE_DURATION_MS);
    expect(oldestElement.remove).toHaveBeenCalled();
  });

  it("clears all active alerts", () => {
    manager.show("Message 1");
    manager.show("Message 2");

    manager.clear();

    const element1 = container.children[0];
    const element2 = container.children[1];

    expect(element1.classList.contains("alert-message-dismissing")).toBe(true);
    expect(element2.classList.contains("alert-message-dismissing")).toBe(true);
  });

  it("immediately removes elements when disposed", () => {
    manager.show("Message");
    const element = container.children[0];

    manager.dispose();

    expect(element.remove).toHaveBeenCalled();
  });
});
