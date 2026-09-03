/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  SERVER_LIST_ERROR,
  SERVER_LIST_UNRENDERED,
  setStatusText,
} from "./live-region";

describe("setStatusText", () => {
  it("reveals the region before writing the text", async () => {
    // A mutation inside a `display: none` subtree is not announced, so the
    // hidden class has to come off first. Order is the whole point here.
    const el = document.createElement("div");
    el.classList.add("hidden");

    const writes: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "class") {
          writes.push(`class:hidden=${el.classList.contains("hidden")}`);
        } else if (record.type === "childList") {
          writes.push(`text:${el.textContent}`);
        }
      }
    });
    observer.observe(el, { attributes: true, childList: true, subtree: true });

    setStatusText(el, "Connecting...");

    // Mutation observers are async (microtask queue)
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();

    expect(writes).toEqual(["class:hidden=false", "text:Connecting..."]);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("Connecting...");
  });

  it("does not rewrite textContent when the message is unchanged", async () => {
    // Discovery refreshes on a timer; re-assigning an identical string still
    // replaces the text node and makes a polite region announce again.
    const el = document.createElement("div");
    el.classList.add("hidden");
    setStatusText(el, "Error scanning network.");

    const writes: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "childList") {
          writes.push(`text:${el.textContent}`);
        }
      }
    });
    observer.observe(el, { childList: true, subtree: true });

    setStatusText(el, "Error scanning network.");
    setStatusText(el, "Error scanning network.");

    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();

    expect(writes).toEqual([]);
    expect(el.textContent).toBe("Error scanning network.");
  });

  it("still announces a genuinely changed message", () => {
    const el = document.createElement("div");
    el.classList.add("hidden");
    setStatusText(el, "Connecting...");
    setStatusText(el, "Connection refused.");

    expect(el.textContent).toBe("Connection refused.");
    expect(el.classList.contains("hidden")).toBe(false);
  });

  it("hides the region again on an empty message", () => {
    const el = document.createElement("div");
    el.textContent = "Connecting...";
    setStatusText(el, "");

    expect(el.classList.contains("hidden")).toBe(true);
    expect(el.textContent).toBe("");
  });

  it("is a no-op on an already-visible region with the same text", async () => {
    const el = document.createElement("div");
    el.textContent = "3 players connected";

    const writes: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "childList") {
          writes.push(`text:${el.textContent}`);
        }
      }
    });
    observer.observe(el, { childList: true, subtree: true });

    setStatusText(el, "3 players connected");

    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();

    expect(writes).toEqual([]);
  });
});

describe("server list sentinels", () => {
  it("cannot collide with a real server-list key", () => {
    // Real keys are `ip:port:players:phase` joined by `|`; the empty-scan key
    // is "". None of those can contain a NUL, which is why the sentinels do.
    const emptyScanKey = ([] as string[]).join("|");
    const populatedKey = [
      "192.168.1.5:7777:2:lobby",
      "10.0.0.9:7777:1:playing",
    ].join("|");

    for (const sentinel of [SERVER_LIST_UNRENDERED, SERVER_LIST_ERROR]) {
      expect(sentinel).not.toBe(emptyScanKey);
      expect(sentinel).not.toBe(populatedKey);
      expect(sentinel).toContain("\u0000");
    }
    expect(SERVER_LIST_UNRENDERED).not.toBe(SERVER_LIST_ERROR);
  });
});
