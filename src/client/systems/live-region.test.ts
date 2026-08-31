import { describe, expect, it } from "vitest";
import {
  SERVER_LIST_ERROR,
  SERVER_LIST_UNRENDERED,
  setStatusText,
} from "./live-region";

/**
 * The Vitest environment is `node`, so there is no DOM here. These tests drive
 * `setStatusText` through the smallest stand-in that exercises what it actually
 * relies on — a class list and a `textContent` — and record the write order,
 * which is the part that fails silently in a real browser.
 */
function fakeElement(initialText = "", classes: string[] = []) {
  const classSet = new Set(classes);
  const writes: string[] = [];
  let text = initialText;
  return {
    writes,
    get textContent(): string {
      return text;
    },
    set textContent(value: string) {
      writes.push(`text:${value}`);
      text = value;
    },
    get hidden(): boolean {
      return classSet.has("hidden");
    },
    classList: {
      toggle(name: string, force: boolean): void {
        writes.push(`class:${name}=${force}`);
        if (force) classSet.add(name);
        else classSet.delete(name);
      },
    },
  };
}

describe("setStatusText", () => {
  it("reveals the region before writing the text", () => {
    // A mutation inside a `display: none` subtree is not announced, so the
    // hidden class has to come off first. Order is the whole point here.
    const el = fakeElement("", ["hidden"]);
    setStatusText(el as unknown as HTMLElement, "Connecting...");

    expect(el.writes).toEqual(["class:hidden=false", "text:Connecting..."]);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("Connecting...");
  });

  it("does not rewrite textContent when the message is unchanged", () => {
    // Discovery refreshes on a timer; re-assigning an identical string still
    // replaces the text node and makes a polite region announce again.
    const el = fakeElement("", ["hidden"]);
    setStatusText(el as unknown as HTMLElement, "Error scanning network.");
    el.writes.length = 0;

    setStatusText(el as unknown as HTMLElement, "Error scanning network.");
    setStatusText(el as unknown as HTMLElement, "Error scanning network.");

    expect(el.writes.filter((w) => w.startsWith("text:"))).toEqual([]);
    expect(el.textContent).toBe("Error scanning network.");
  });

  it("still announces a genuinely changed message", () => {
    const el = fakeElement("", ["hidden"]);
    setStatusText(el as unknown as HTMLElement, "Connecting...");
    setStatusText(el as unknown as HTMLElement, "Connection refused.");

    expect(el.textContent).toBe("Connection refused.");
    expect(el.hidden).toBe(false);
  });

  it("hides the region again on an empty message", () => {
    const el = fakeElement("Connecting...", []);
    setStatusText(el as unknown as HTMLElement, "");

    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });

  it("is a no-op on an already-visible region with the same text", () => {
    const el = fakeElement("3 players connected", []);
    setStatusText(el as unknown as HTMLElement, "3 players connected");

    expect(el.writes.filter((w) => w.startsWith("text:"))).toEqual([]);
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
