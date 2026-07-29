/** CLI entry point for the reproducible visual-asset build. */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { compileAssetManifest } from "./asset-compiler.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "app", "assets", "data", "visual-manifest.json");
const prefabOutput = join(root, "src", "generated", "semantic-prefabs.json");
const manifest = compileAssetManifest(root);
const manifestJson = await format(JSON.stringify(manifest), { parser: "json" });
const prefabsJson = await format(
  JSON.stringify({ version: 1, prefabs: manifest.prefabs }),
  { parser: "json" },
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, manifestJson);
mkdirSync(dirname(prefabOutput), { recursive: true });
writeFileSync(prefabOutput, prefabsJson);
console.log(
  `visual assets: ${manifest.tilesets.length} tileset(s), ${manifest.prefabs.length} prefab(s) -> ${output}`,
);
