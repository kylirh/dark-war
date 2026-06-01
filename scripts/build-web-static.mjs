#!/usr/bin/env node
/**
 * Build the static web variant (apps/web/dist) — playable in any modern browser:
 * single-player always, and joining an Internet/LAN server by address. No
 * hosting/discovery (the web `window.native` shim stubs those).
 *
 * Reuses the same client bundle the Electron app ships (app/game.js), then
 * assembles a self-contained static site: index.html + web-shim.js + game.js +
 * assets. Output is plain files — host them anywhere (or open index.html).
 *
 *   node scripts/build-web-static.mjs   (or: npm run build:web)
 */
import { build } from "vite";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

process.env.VITE_CJS_IGNORE_WARNING = "true";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const APP = join(ROOT, "app");
const OUT = join(ROOT, "apps", "web", "dist");

// 1. Build the client IIFE bundle (vite.config.ts → app/game.js).
await build();

// 2. Fresh output dir with the bundle + assets.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(APP, "game.js"), join(OUT, "game.js"));
cpSync(join(APP, "assets"), join(OUT, "assets"), { recursive: true });
cpSync(join(ROOT, "apps", "web", "web-shim.js"), join(OUT, "web-shim.js"));

// 3. index.html = the app shell with the web shim loaded before the game bundle.
let html = readFileSync(join(APP, "index.html"), "utf8");
if (!html.includes("web-shim.js")) {
  html = html.replace(
    '<script src="game.js"></script>',
    '<script src="web-shim.js"></script>\n  <script src="game.js"></script>',
  );
}
writeFileSync(join(OUT, "index.html"), html);

console.log(
  `✓ web build -> apps/web/dist (index.html, game.js, web-shim.js, assets)`,
);
