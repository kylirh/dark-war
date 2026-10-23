import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guard for the focus-restoration contract in `retro-modal.ts`.
 *
 * `focus-restore.test.ts` covers the helpers themselves. What it cannot cover
 * is the *wiring*: whether a dialog actually captures its opener and hands
 * focus back to it. That lives in modules that build their DOM in the
 * constructor, and the Vitest environment is `node` with no jsdom, so none of
 * it is reachable from a unit test. This file checks the wiring in the source
 * instead, the way `dev-entry-parity.test.ts` checks the two app shells.
 *
 * It exists because this class of defect keeps recurring — `.jules/palette.md`
 * records four separate focus-restoration fixes (the About dialog, IntroStory,
 * the save-slot dialog, and the character modal), each one a dialog that had
 * not adopted the contract yet. The character modal was the last, and it hid
 * for months behind a hardcoded canvas focus that looked deliberate.
 *
 * Both properties below are about *half-adoption*, which is the failure mode
 * that produces silently stranded focus:
 *
 *   1. Capturing an opener without restoring it, or restoring without
 *      capturing, leaves focus on `<body>` exactly as if neither existed.
 *   2. Keeping a hardcoded `getElementById("game")?.focus()` alongside a
 *      capture duplicates the fallback `restoreFocus` already owns, and the
 *      hand-rolled copy skips its focusability re-check.
 *
 * Deliberately *not* asserted: that every overlay adopts the contract.
 * `dialogue-panel.ts` and `sign-reader.ts` still focus the canvas directly and
 * are outside the adopter set on purpose — they are opened by the simulation
 * when the player walks up to a sign or an NPC, not by a control the player
 * focused, so whether they have a meaningful "opener" at all is a product
 * question for a human. This test takes no position on it; it only requires
 * that whoever does adopt the helper adopts all of it.
 *
 * Matching is on the call form (`name(`) rather than the bare identifier, so
 * the prose references in `retro-modal.ts`'s contract docblock do not register
 * as calls and pull it into the adopter set.
 */

const SYSTEMS_DIR = resolve(__dirname);

/** The helper module itself defines these; it is not a consumer of them. */
const HELPER_MODULE = "focus-restore.ts";

/** The hand-rolled fallback that `restoreFocus` replaced. */
const HARDCODED_CANVAS_FOCUS = 'getElementById("game")?.focus()';

function uiModules(): string[] {
  return readdirSync(SYSTEMS_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => name !== HELPER_MODULE)
    .sort();
}

function read(name: string): string {
  return readFileSync(resolve(SYSTEMS_DIR, name), "utf8");
}

describe("modal focus-restoration contract", () => {
  const sources = new Map(uiModules().map((name) => [name, read(name)]));

  const captures = [...sources]
    .filter(([, src]) => src.includes("captureFocusOpener("))
    .map(([name]) => name);
  const restores = [...sources]
    .filter(([, src]) => src.includes("restoreFocus("))
    .map(([name]) => name);

  it("finds the dialogs that manage opener focus", () => {
    // Guards against the whole suite going vacuous if the helpers are renamed
    // and every `includes` below starts returning false.
    expect(captures).toContain("character-modal.ts");
    expect(captures.length).toBeGreaterThanOrEqual(4);
  });

  it("pairs every capture with a restore", () => {
    // A capture with no restore is the same stranded focus as no capture at
    // all, only harder to spot: the opener is recorded and then dropped.
    expect(restores).toEqual(captures);
  });

  it("leaves the canvas fallback to restoreFocus", () => {
    // `restoreFocus` focuses the canvas when the opener is absent or declines
    // focus, and re-checks that the opener actually took it. A dialog that
    // captures an opener and *also* calls the canvas directly has either a
    // dead branch or a path that skips that re-check.
    const bothWays = captures.filter((name) =>
      sources.get(name)!.includes(HARDCODED_CANVAS_FOCUS),
    );
    expect(bothWays).toEqual([]);
  });
});
