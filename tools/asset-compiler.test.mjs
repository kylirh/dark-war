/** Contract tests for the editor-independent asset compiler. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compileTiledTileset } from "./asset-compiler.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets-src", "tilesets", "dark-war-terrain.tsj");
const allowedSemanticKeys = new Set(["ground.hole", "structure.wall"]);

test("compiles complete cardinal terrain families", () => {
  const manifest = compileTiledTileset(
    JSON.parse(readFileSync(source, "utf8")),
    source,
    root,
    allowedSemanticKeys,
  );
  assert.equal(manifest.variants.length, 32);
  assert.deepEqual(
    [...new Set(manifest.variants.map((variant) => variant.family))],
    ["hole.cardinal", "wall.concrete.cardinal"],
  );
});

test("rejects an incomplete cardinal family", () => {
  const tileset = JSON.parse(readFileSync(source, "utf8"));
  tileset.tiles = tileset.tiles.filter((tile) => {
    const properties = Object.fromEntries(
      tile.properties.map((property) => [property.name, property.value]),
    );
    return !(
      properties["darkwar.family"] === "hole.cardinal" &&
      properties["darkwar.mask"] === 15
    );
  });
  assert.throws(
    () => compileTiledTileset(tileset, source, root, allowedSemanticKeys),
    /hole\.cardinal missing masks 15/,
  );
});

test("rejects unknown gameplay semantics", () => {
  const tileset = JSON.parse(readFileSync(source, "utf8"));
  const property = tileset.tiles[0].properties.find(
    (candidate) => candidate.name === "darkwar.semanticKey",
  );
  property.value = "ground.not-real";
  assert.throws(
    () => compileTiledTileset(tileset, source, root, allowedSemanticKeys),
    /unknown semantic key ground\.not-real/,
  );
});
