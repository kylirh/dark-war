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

interface FakeDoc {
  activeElement: HTMLElement | null;
}

/**
 * `focusable: false` models a control that is present in the document but
 * cannot take focus — inside a `display: none` dialog, or `disabled`. The
 * browser ignores `focus()` on those, leaving `activeElement` where it was.
 */
function fakeElement(
  id: string,
  focused: string[],
  options: { doc?: () => FakeDoc; focusable?: boolean } = {},
) {
  const focusable = options.focusable ?? true;
  return {
    id,
    focus(): void {
      focused.push(id);
      if (!focusable) return;
      const doc = options.doc?.();
      if (doc) doc.activeElement = this as unknown as HTMLElement;
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
  const doc = {
    activeElement: options.activeElement,
    body,
    getElementById: (id: string) => (id === "game" ? options.canvas : null),
  };
  return doc as unknown as Document;
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
    let doc!: Document;
    const getDoc = () => doc as unknown as FakeDoc;

    const button = fakeElement("save-button", focused, { doc: getDoc });
    const canvas = fakeElement("game", focused, { doc: getDoc });
    doc = fakeDocument({
      activeElement: null,
      contained: [button],
      canvas,
      body,
    });

    restoreFocus(button, doc);
    expect(focused).toEqual(["save-button"]);
    expect(doc.activeElement).toBe(button);
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

describe("restoreFocus when the opener cannot take focus", () => {
  it("falls back to the canvas for an opener that is present but unfocusable", () => {
    // `document.body.contains()` answers "is it in the document", not "can it
    // take focus". A control inside a dialog that was hidden while this one was
    // open is still contained, but `.focus()` on it is a no-op and focus is
    // left on <body> — exactly the stranding this module exists to prevent.
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    let doc!: Document;
    const getDoc = () => doc as unknown as FakeDoc;

    const hiddenOpener = fakeElement("pause-button", focused, {
      doc: getDoc,
      focusable: false,
    });
    const canvas = fakeElement("game", focused, { doc: getDoc });

    doc = fakeDocument({
      activeElement: body,
      contained: [hiddenOpener, canvas],
      canvas,
      body,
    });

    restoreFocus(hiddenOpener, doc);

    expect(focused).toEqual(["pause-button", "game"]);
    expect(doc.activeElement).toBe(canvas);
  });

  it("does not double-focus when the opener accepts focus", () => {
    const focused: string[] = [];
    const body = fakeElement("body", focused);
    let doc!: Document;
    const getDoc = () => doc as unknown as FakeDoc;

    const opener = fakeElement("save-button", focused, { doc: getDoc });
    const canvas = fakeElement("game", focused, { doc: getDoc });

    doc = fakeDocument({
      activeElement: body,
      contained: [opener, canvas],
      canvas,
      body,
    });

    restoreFocus(opener, doc);

    expect(focused).toEqual(["save-button"]);
    expect(doc.activeElement).toBe(opener);
  });
});
