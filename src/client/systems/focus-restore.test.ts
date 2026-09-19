/**
 * The Vitest environment is `node`, so there is no DOM here. These tests drive
 * the helpers through the smallest stand-in for a `Document` that exercises
 * what they actually rely on — an `activeElement`, a `body` that can answer
 * `contains`, and `getElementById` — and record which element received focus.
 *
 * The case that matters is the fallback: a dialog opened straight from
 * gameplay has `document.body` as the active element, and focusing the body is
 * indistinguishable from leaving focus stranded.
 */

import { describe, expect, it } from "vitest";
import { captureFocusOpener, restoreFocus } from "./focus-restore";

function fakeElement(id: string, focused: string[]) {
  return {
    id,
    focus(): void {
      focused.push(id);
    },
  } as unknown as HTMLElement;
}

function fakeDocument(options: {
  activeElement: HTMLElement | null;
  contained: HTMLElement[];
  canvas: HTMLElement | null;
  body: HTMLElement;
}) {
  const body = options.body as unknown as HTMLElement & {
    contains(node: HTMLElement): boolean;
  };
  body.contains = (node: HTMLElement) =>
    node === body || options.contained.includes(node);
  return {
    activeElement: options.activeElement,
    body,
    getElementById: (id: string) => (id === "game" ? options.canvas : null),
  } as unknown as Document;
}

describe("captureFocusOpener", () => {
  it("captures a real focused control", () => {
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    const button = fakeElement("save-button", focused);
    const doc = fakeDocument({
      activeElement: button,
      contained: [button],
      canvas: null,
      body,
    });

    expect(captureFocusOpener(doc)).toBe(button);
  });

  it("treats the body as no opener at all", () => {
    // Opening the pause menu from gameplay leaves `document.body` active.
    // Recording it as the opener would make the canvas fallback unreachable.
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    const doc = fakeDocument({
      activeElement: body,
      contained: [],
      canvas: null,
      body,
    });

    expect(captureFocusOpener(doc)).toBeNull();
  });

  it("returns null when nothing is focused", () => {
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    const doc = fakeDocument({
      activeElement: null,
      contained: [],
      canvas: null,
      body,
    });

    expect(captureFocusOpener(doc)).toBeNull();
  });
});

describe("restoreFocus", () => {
  it("returns focus to the opener that is still in the document", () => {
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    const button = fakeElement("save-button", focused);
    const canvas = fakeElement("game", focused);
    const doc = fakeDocument({
      activeElement: null,
      contained: [button],
      canvas,
      body,
    });

    restoreFocus(button, doc);
    expect(focused).toEqual(["save-button"]);
  });

  it("falls back to the canvas when the opener was removed while open", () => {
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    const removed = fakeElement("stale-button", focused);
    const canvas = fakeElement("game", focused);
    const doc = fakeDocument({
      activeElement: null,
      contained: [],
      canvas,
      body,
    });

    restoreFocus(removed, doc);
    expect(focused).toEqual(["game"]);
  });

  it("falls back to the canvas when there is no opener", () => {
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    const canvas = fakeElement("game", focused);
    const doc = fakeDocument({
      activeElement: null,
      contained: [],
      canvas,
      body,
    });

    restoreFocus(null, doc);
    expect(focused).toEqual(["game"]);
  });

  it("does not throw when the canvas is missing", () => {
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    const doc = fakeDocument({
      activeElement: null,
      contained: [],
      canvas: null,
      body,
    });

    expect(() => restoreFocus(null, doc)).not.toThrow();
    expect(focused).toEqual([]);
  });
});
