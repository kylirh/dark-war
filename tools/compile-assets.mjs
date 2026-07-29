/** CLI entry point for the reproducible visual-asset build. */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAssetManifest } from "./asset-compiler.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "app", "assets", "data", "visual-manifest.json");
const manifest = compileAssetManifest(root);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `visual assets: ${manifest.tilesets.length} tileset(s) -> ${output}`,
);
