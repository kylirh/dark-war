import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Sprite/graphics pool reset guard for `Renderer`.
 *
 * `Renderer` recycles `Sprite` and `Graphics` objects across frames through
 * `spritePool` / `graphicsPool`. The reset to Pixi's defaults happens once, in
 * `destroyFrameChildren`, when an object is released — not when it is handed
 * out. `acquireSprite` and `createSpriteFromFrame` depend on that: they skip
 * writing `scale` and `anchor` when the frame already matches the defaults,
 * which is only sound because every pooled object re-enters the pool through
 * that one reset.
 *
 * Both halves of the contract fail silently if broken. A second pool push site,
 * or a reset dropped from the release loop, hands out a sprite still carrying
 * the previous frame's anchor, tint or alpha, and the skipped write no longer
 * covers for it — the symptom is a rendering glitch that no unit test sees,
 * because the Pixi render path has no test coverage at all. So this is pinned
 * structurally, in the same spirit as `src/engine-purity.test.ts`.
 */

const RENDERER_PATH = "src/client/systems/renderer.ts";

/**
 * Extract a method body by brace matching from its declaration. Returns the
 * source between the outermost `{` and its match, exclusive.
 */
function methodBody(source: string, declaration: string): string {
  const declStart = source.indexOf(declaration);
  expect(
    declStart,
    `${declaration} not found in ${RENDERER_PATH}`,
  ).toBeGreaterThanOrEqual(0);

  const open = source.indexOf("{", declStart);
  expect(open, `no body found for ${declaration}`).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces while reading ${declaration}`);
}

function occurrences(source: string, needle: string): number[] {
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at < 0) return found;
    found.push(at);
    from = at + needle.length;
  }
}

describe("renderer sprite pool", () => {
  const source = readFileSync(RENDERER_PATH, "utf8");
  const releaseLoop = methodBody(
    source,
    "private destroyFrameChildren(container: Container): void",
  );

  it("releases pooled objects only through destroyFrameChildren", () => {
    const bodyStart = source.indexOf(releaseLoop);
    const bodyEnd = bodyStart + releaseLoop.length;

    const outside: string[] = [];
    for (const push of ["spritePool.push(", "graphicsPool.push("]) {
      for (const at of occurrences(source, push)) {
        if (at < bodyStart || at >= bodyEnd) {
          const line = source.slice(0, at).split("\n").length;
          outside.push(`${push} at ${RENDERER_PATH}:${line}`);
        }
      }
    }

    // A push outside the release loop returns an object to the pool without
    // resetting it, and the skipped scale/anchor writes then leak a frame.
    expect(outside).toEqual([]);
  });

  it("restores every pooled sprite property the acquisition sites skip", () => {
    const spriteBranch = releaseLoop.slice(
      releaseLoop.indexOf("child instanceof Sprite"),
      releaseLoop.indexOf("child instanceof Graphics"),
    );
    expect(spriteBranch).not.toEqual("");

    for (const reset of [
      "child.scale.set(1)",
      "child.anchor.set(0, 0)",
      "child.rotation = 0",
      "child.alpha = 1",
      "child.tint = 0xffffff",
      "child.zIndex = 0",
    ]) {
      expect(spriteBranch, `release loop must restore ${reset}`).toContain(
        reset,
      );
    }
  });

  it("restores every pooled graphics property the acquisition site skips", () => {
    const graphicsBranch = releaseLoop.slice(
      releaseLoop.indexOf("child instanceof Graphics"),
    );
    expect(graphicsBranch).not.toEqual("");

    for (const reset of ["child.alpha = 1", "child.zIndex = 0"]) {
      expect(graphicsBranch, `release loop must restore ${reset}`).toContain(
        reset,
      );
    }
  });
});
