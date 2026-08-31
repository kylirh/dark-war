import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * There are two copies of the app shell:
 *
 *   app/index.html — what Electron loads and what `build:web` ships.
 *   index.html     — the Vite dev-server entry (`npm run dev:web`).
 *
 * They are separate files because the dev entry needs a module script Vite can
 * compile on demand, while the shipped page loads the prebuilt `game.js`. That
 * is the *only* difference they are allowed to have.
 *
 * They drifted once already: the story-tab focus fix (#128) landed in
 * app/index.html and never reached the dev entry, so `npm run dev:web` kept
 * serving markup with the old `blur()` call and no `aria-expanded` for months,
 * and a UI review of the dev page reported the bug all over again. This test
 * fails the moment they diverge, so a fix to one has to be made to both.
 */

const ROOT = resolve(__dirname, "..", "..");

/** The prebuilt-bundle script tag in the shipped page. */
const PROD_ENTRY = '  <script src="game.js"></script>\n';

/** Its dev-server counterpart: the leading comment plus the module script. */
const DEV_ENTRY =
  /^ {2}<!-- Vite dev entry:[\s\S]*?-->\n {2}<script type="module" src="\/src\/client\/main\.ts"><\/script>\n/m;

function read(name: string): string {
  return readFileSync(resolve(ROOT, name), "utf8");
}

describe("dev entry parity", () => {
  const shipped = read("app/index.html");
  const dev = read("index.html");

  it("keeps the shipped page on the prebuilt bundle", () => {
    expect(shipped).toContain(PROD_ENTRY);
    expect(shipped).not.toContain("/src/client/main.ts");
  });

  it("keeps the dev entry on the Vite module entry", () => {
    expect(dev).toMatch(DEV_ENTRY);
    expect(dev).not.toContain('<script src="game.js">');
  });

  it("is otherwise byte-identical to app/index.html", () => {
    const normalized = dev.replace(DEV_ENTRY, PROD_ENTRY);

    // Compare line arrays so a failure names the drifting lines rather than
    // dumping both files.
    expect(normalized.split("\n")).toEqual(shipped.split("\n"));
  });
});
