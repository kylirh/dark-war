// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AlertManager } from "./alert-manager";
import { DEFAULT_ALERT_DURATION_MS } from "./alert-queue";

describe("AlertManager", () => {
  let container: HTMLElement;
  let manager: AlertManager;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    manager = new AlertManager(container);
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it("shows an alert that automatically dismisses after the duration", () => {
    manager.show("test alert");

    const elements = container.querySelectorAll(".alert-message");
    expect(elements.length).toBe(1);
    expect(elements[0].textContent).toBe("test alert");

    vi.advanceTimersByTime(DEFAULT_ALERT_DURATION_MS);
    expect(elements[0].classList.contains("alert-message-dismissing")).toBe(
      true,
    );

    vi.advanceTimersByTime(350); // ALERT_FADE_DURATION_MS
    expect(container.querySelectorAll(".alert-message").length).toBe(0);
  });

  it("refreshes the duration when a repeated message is shown", () => {
    manager.show("repeated");
    vi.advanceTimersByTime(DEFAULT_ALERT_DURATION_MS - 100);

    manager.show("repeated");

    vi.advanceTimersByTime(100);
    // Should still be visible because we repeated it
    const elements = container.querySelectorAll(".alert-message");
    expect(elements.length).toBe(1);
    expect(elements[0].classList.contains("alert-message-dismissing")).toBe(
      false,
    );

    vi.advanceTimersByTime(DEFAULT_ALERT_DURATION_MS);
    expect(elements[0].classList.contains("alert-message-dismissing")).toBe(
      true,
    );
  });

  it("dismisses the oldest message when max limit is exceeded", () => {
    // MAX_ALERT_MESSAGES is 6
    for (let i = 0; i < 6; i++) {
      manager.show(`message ${i}`);
    }

    expect(container.querySelectorAll(".alert-message").length).toBe(6);

    manager.show("newest");

    // The first one should be dismissing
    const elements = container.querySelectorAll(".alert-message");
    expect(elements.length).toBe(7);
    expect(elements[0].classList.contains("alert-message-dismissing")).toBe(
      true,
    );
    expect(elements[6].textContent).toBe("newest");

    vi.advanceTimersByTime(350);
    expect(container.querySelectorAll(".alert-message").length).toBe(6);
    expect(container.querySelectorAll(".alert-message")[0].textContent).toBe(
      "message 1",
    );
  });

  it("clears all alerts", () => {
    manager.show("one");
    manager.show("two");

    manager.clear();

    const elements = container.querySelectorAll(".alert-message");
    expect(elements[0].classList.contains("alert-message-dismissing")).toBe(
      true,
    );
    expect(elements[1].classList.contains("alert-message-dismissing")).toBe(
      true,
    );

    vi.advanceTimersByTime(350);
    expect(container.querySelectorAll(".alert-message").length).toBe(0);
  });

  it("handles repeated messages correctly", () => {
    manager.show("hello", 100);
    manager.show("hello", 200);

    const elements = container.querySelectorAll(".alert-message");
    expect(elements.length).toBe(1);

    vi.advanceTimersByTime(100);
    expect(elements[0].classList.contains("alert-message-dismissing")).toBe(
      false,
    );

    vi.advanceTimersByTime(100);
    expect(elements[0].classList.contains("alert-message-dismissing")).toBe(
      true,
    );
  });
});
