/** Contract tests for the editor-independent asset compiler. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compileTiledPrefab, compileTiledTileset } from "./asset-compiler.mjs";
import { decodePNG } from "./png.mjs";

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

test("compiles semantic prefab layers and typed markers", () => {
  const prefabSource = join(
    root,
    "assets-src",
    "prefabs",
    "cave-rest-stop.tmj",
  );
  const registry = JSON.parse(
    readFileSync(join(root, "assets-src", "semantic-keys.json"), "utf8"),
  );
  const prefab = compileTiledPrefab(
    JSON.parse(readFileSync(prefabSource, "utf8")),
    prefabSource,
    root,
    new Set(registry.keys),
  );
  assert.equal(prefab.key, "cave.rest-stop");
  assert.equal(prefab.layers.ground.length, 120);
  assert.equal(prefab.layers.elevation.filter(Number.isInteger).length, 4);
  assert.deepEqual(
    prefab.markers.map((marker) => marker.kind),
    ["socket", "socket", "spawn", "portal", "require"],
  );
});

test("keeps production sprite boards aligned and transparent", () => {
  for (const filename of [
    "environment-board.png",
    "characters-board.png",
    "supplemental-board.png",
  ]) {
    const image = decodePNG(
      readFileSync(join(root, "assets-src", "production", filename)),
    );
    assert.equal(image.width, 1536);
    assert.equal(image.height, 1024);
    let transparentPixels = 0;
    let visiblePixels = 0;
    for (let index = 3; index < image.data.length; index += 4) {
      if (image.data[index] <= 24) transparentPixels += 1;
      else visiblePixels += 1;
    }
    assert.ok(transparentPixels > image.width * image.height * 0.25);
    assert.ok(visiblePixels > image.width * image.height * 0.05);
  }
});
