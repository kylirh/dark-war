/** Build-time compiler for Dark War Aseprite exports and Tiled metadata. */

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CARDINAL_MASKS = Array.from({ length: 16 }, (_, index) => index);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function filesWithExtension(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? filesWithExtension(path, extension)
        : extname(entry.name) === extension
          ? [path]
          : [];
    })
    .sort();
}

function propertiesFor(owner) {
  return Object.fromEntries(
    (owner.properties ?? []).map((property) => [property.name, property.value]),
  );
}

function pngDimensions(path) {
  const bytes = readFileSync(path);
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`${path}: expected a PNG image`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function requireInteger(value, label) {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

/** Compile and validate one standard Tiled JSON tileset. */
export function compileTiledTileset(
  tsj,
  sourcePath,
  rootDirectory,
  allowedSemanticKeys,
) {
  if (tsj.type !== "tileset") throw new Error(`${sourcePath}: not a tileset`);
  const tileWidth = requireInteger(tsj.tilewidth, `${sourcePath}: tilewidth`);
  const tileHeight = requireInteger(
    tsj.tileheight,
    `${sourcePath}: tileheight`,
  );
  const columns = requireInteger(tsj.columns, `${sourcePath}: columns`);
  const tileCount = requireInteger(tsj.tilecount, `${sourcePath}: tilecount`);
  const imagePath = resolve(sourcePath, "..", tsj.image);
  const image = pngDimensions(imagePath);
  if (image.width !== tsj.imagewidth || image.height !== tsj.imageheight) {
    throw new Error(
      `${sourcePath}: declared image dimensions do not match PNG`,
    );
  }
  if (
    columns * tileWidth > image.width ||
    tileCount > columns * (image.height / tileHeight)
  ) {
    throw new Error(`${sourcePath}: tile grid exceeds atlas bounds`);
  }

  const variants = [];
  const familyMasks = new Map();
  const variantKeys = new Set();
  for (const tile of tsj.tiles ?? []) {
    const properties = propertiesFor(tile);
    const semanticKey = properties["darkwar.semanticKey"];
    const family = properties["darkwar.family"];
    const resolver = properties["darkwar.resolver"];
    const mask = properties["darkwar.mask"];
    if (typeof semanticKey !== "string" || typeof family !== "string") continue;
    if (allowedSemanticKeys && !allowedSemanticKeys.has(semanticKey)) {
      throw new Error(`${sourcePath}: unknown semantic key ${semanticKey}`);
    }
    if (resolver !== "cardinal-16") {
      throw new Error(
        `${sourcePath}: ${family} has unsupported resolver ${resolver}`,
      );
    }
    requireInteger(mask, `${sourcePath}: ${family} mask`);
    if (mask < 0 || mask > 15)
      throw new Error(`${sourcePath}: ${family} mask must be 0..15`);
    const variantKey = `${family}:${mask}`;
    if (variantKeys.has(variantKey))
      throw new Error(`${sourcePath}: duplicate ${variantKey}`);
    variantKeys.add(variantKey);
    const masks = familyMasks.get(family) ?? new Set();
    masks.add(mask);
    familyMasks.set(family, masks);
    variants.push({
      semanticKey,
      family,
      resolver,
      mask,
      tileId: tile.id,
      atlas: {
        x: (tile.id % columns) * tileWidth,
        y: Math.floor(tile.id / columns) * tileHeight,
        width: tileWidth,
        height: tileHeight,
      },
    });
  }

  for (const [family, masks] of familyMasks) {
    const missing = CARDINAL_MASKS.filter((mask) => !masks.has(mask));
    if (missing.length > 0) {
      throw new Error(
        `${sourcePath}: ${family} missing masks ${missing.join(", ")}`,
      );
    }
  }
  const wangTileIds = new Set(
    (tsj.wangsets ?? []).flatMap((set) =>
      (set.wangtiles ?? []).map((tile) => tile.tileid),
    ),
  );
  for (const variant of variants) {
    if (!wangTileIds.has(variant.tileId)) {
      throw new Error(
        `${sourcePath}: tile ${variant.tileId} is missing Wang metadata`,
      );
    }
  }

  return {
    source: relative(rootDirectory, sourcePath),
    name: tsj.name,
    image: relative(rootDirectory, imagePath),
    tileWidth,
    tileHeight,
    columns,
    variants: variants.sort(
      (a, b) => a.family.localeCompare(b.family) || a.mask - b.mask,
    ),
  };
}

function semanticGidsForMap(tmj, sourcePath, allowedSemanticKeys) {
  const gids = new Map();
  for (const reference of tmj.tilesets ?? []) {
    if (typeof reference.source !== "string") {
      throw new Error(`${sourcePath}: embedded tilesets are not supported`);
    }
    const tilesetPath = resolve(sourcePath, "..", reference.source);
    const tileset = readJson(tilesetPath);
    for (const tile of tileset.tiles ?? []) {
      const semanticKey = propertiesFor(tile)["darkwar.semanticKey"];
      if (typeof semanticKey !== "string") continue;
      if (!allowedSemanticKeys.has(semanticKey)) {
        throw new Error(`${sourcePath}: unknown semantic key ${semanticKey}`);
      }
      gids.set(reference.firstgid + tile.id, semanticKey);
    }
  }
  return gids;
}

/** Compile one standard Tiled JSON map into an editor-independent prefab. */
export function compileTiledPrefab(
  tmj,
  sourcePath,
  rootDirectory,
  allowedSemanticKeys,
) {
  if (tmj.type !== "map" || tmj.orientation !== "orthogonal") {
    throw new Error(`${sourcePath}: prefab must be an orthogonal Tiled map`);
  }
  const width = requireInteger(tmj.width, `${sourcePath}: width`);
  const height = requireInteger(tmj.height, `${sourcePath}: height`);
  const tileWidth = requireInteger(tmj.tilewidth, `${sourcePath}: tilewidth`);
  const tileHeight = requireInteger(
    tmj.tileheight,
    `${sourcePath}: tileheight`,
  );
  const mapProperties = propertiesFor(tmj);
  const key = mapProperties["darkwar.prefabKey"];
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(`${sourcePath}: missing darkwar.prefabKey`);
  }
  const gids = semanticGidsForMap(tmj, sourcePath, allowedSemanticKeys);
  const cellCount = width * height;
  const layers = {
    ground: new Array(cellCount).fill(null),
    structure: new Array(cellCount).fill(null),
    fixture: new Array(cellCount).fill(null),
    elevation: new Array(cellCount).fill(null),
  };
  const markers = [];

  for (const layer of tmj.layers ?? []) {
    const layerProperties = propertiesFor(layer);
    const semanticLayer =
      layerProperties["darkwar.semanticLayer"] ?? layer.name;
    if (layer.type === "tilelayer" && semanticLayer in layers) {
      if (!Array.isArray(layer.data) || layer.data.length !== cellCount) {
        throw new Error(`${sourcePath}: ${layer.name} must be finite CSV data`);
      }
      if (semanticLayer === "elevation") {
        throw new Error(`${sourcePath}: elevation uses rectangle objects`);
      }
      for (let index = 0; index < cellCount; index++) {
        const rawGid = layer.data[index];
        if (rawGid === 0) continue;
        const gid = rawGid & 0x1fffffff;
        const semanticKey = gids.get(gid);
        if (!semanticKey) {
          throw new Error(
            `${sourcePath}: ${layer.name} has unmapped gid ${gid}`,
          );
        }
        if (!semanticKey.startsWith(`${semanticLayer}.`)) {
          throw new Error(
            `${sourcePath}: ${semanticKey} cannot appear on ${semanticLayer}`,
          );
        }
        layers[semanticLayer][index] = semanticKey;
      }
      continue;
    }
    if (layer.type !== "objectgroup") continue;
    for (const object of layer.objects ?? []) {
      const objectProperties = propertiesFor(object);
      const kind = object.class || object.type || layer.name;
      const x = Math.floor(object.x / tileWidth);
      const y = Math.floor(object.y / tileHeight);
      if (kind === "elevation") {
        const value = objectProperties["darkwar.elevation"];
        requireInteger(value, `${sourcePath}: elevation value`);
        const objectWidth = Math.max(1, Math.round(object.width / tileWidth));
        const objectHeight = Math.max(
          1,
          Math.round(object.height / tileHeight),
        );
        for (let yy = y; yy < y + objectHeight; yy++) {
          for (let xx = x; xx < x + objectWidth; xx++) {
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) {
              throw new Error(
                `${sourcePath}: elevation rectangle is out of bounds`,
              );
            }
            layers.elevation[xx + yy * width] = value;
          }
        }
        continue;
      }
      if (!["spawn", "portal", "socket", "require", "sign"].includes(kind)) {
        throw new Error(`${sourcePath}: unsupported marker kind ${kind}`);
      }
      if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(`${sourcePath}: ${kind} marker is out of bounds`);
      }
      markers.push({
        id: object.id,
        kind,
        name: object.name || "",
        x,
        y,
        properties: objectProperties,
      });
    }
  }

  const transforms = String(mapProperties["darkwar.transforms"] ?? "identity")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    source: relative(rootDirectory, sourcePath),
    key,
    width,
    height,
    transforms,
    layers,
    markers: markers.sort((a, b) => a.id - b.id),
  };
}

function commandAvailable(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function exportAsepriteSources(rootDirectory, config, explicitExecutable) {
  const enabled = (config.asepriteSources ?? []).filter(
    (source) => source.enabled,
  );
  if (enabled.length === 0) return [];
  const executable = explicitExecutable || process.env.ASEPRITE || "aseprite";
  if (!commandAvailable(executable)) {
    throw new Error(
      "Active Aseprite sources require Aseprite or the ASEPRITE environment variable",
    );
  }
  return enabled.map((source) => {
    const sourcePath = resolve(rootDirectory, source.source);
    const pngPath = resolve(rootDirectory, source.png);
    const jsonPath = resolve(rootDirectory, source.data);
    mkdirSync(resolve(pngPath, ".."), { recursive: true });
    mkdirSync(resolve(jsonPath, ".."), { recursive: true });
    const result = spawnSync(
      executable,
      [
        "--batch",
        sourcePath,
        "--sheet",
        pngPath,
        "--data",
        jsonPath,
        "--format",
        "json-array",
        "--list-tags",
        "--list-slices",
      ],
      { cwd: rootDirectory, stdio: "inherit" },
    );
    if (result.status !== 0)
      throw new Error(`Aseprite export failed: ${source.source}`);
    const data = readJson(jsonPath);
    return {
      source: source.source,
      image: relative(rootDirectory, pngPath),
      data: relative(rootDirectory, jsonPath),
      frames: Array.isArray(data.frames)
        ? data.frames.length
        : Object.keys(data.frames ?? {}).length,
      tags: (data.meta?.frameTags ?? []).map((tag) => tag.name).sort(),
      slices: (data.meta?.slices ?? []).map((slice) => slice.name).sort(),
    };
  });
}

/** Compile all configured art sources into a stable runtime manifest object. */
export function compileAssetManifest(rootDirectory, options = {}) {
  const configPath = join(rootDirectory, "assets-src", "assets.json");
  const config = readJson(configPath);
  if (config.version !== 1)
    throw new Error(`${configPath}: unsupported version`);
  const semanticRegistry = readJson(
    join(rootDirectory, "assets-src", "semantic-keys.json"),
  );
  if (semanticRegistry.version !== 1 || !Array.isArray(semanticRegistry.keys)) {
    throw new Error("assets-src/semantic-keys.json: malformed registry");
  }
  const semanticKeys = [...new Set(semanticRegistry.keys)].sort();
  if (semanticKeys.length !== semanticRegistry.keys.length) {
    throw new Error("assets-src/semantic-keys.json: duplicate semantic key");
  }
  const allowedSemanticKeys = new Set(semanticKeys);

  if (options.runGenerators !== false) {
    for (const atlas of config.atlases ?? []) {
      if (!Array.isArray(atlas.generator) || atlas.generator.length === 0)
        continue;
      const result = spawnSync(atlas.generator[0], atlas.generator.slice(1), {
        cwd: rootDirectory,
        stdio: "inherit",
      });
      if (result.status !== 0)
        throw new Error(`Atlas generator failed: ${atlas.key}`);
    }
  }

  const atlases = (config.atlases ?? []).map((atlas) => {
    const imagePath = resolve(rootDirectory, atlas.image);
    const dimensions = pngDimensions(imagePath);
    if (
      dimensions.width % atlas.tileWidth !== 0 ||
      dimensions.height % atlas.tileHeight !== 0
    ) {
      throw new Error(
        `${atlas.image}: dimensions are not aligned to its tile grid`,
      );
    }
    return {
      key: atlas.key,
      image: atlas.runtimePath,
      ...dimensions,
      tileWidth: atlas.tileWidth,
      tileHeight: atlas.tileHeight,
    };
  });
  const tilesets = filesWithExtension(
    join(rootDirectory, "assets-src"),
    ".tsj",
  ).map((path) =>
    compileTiledTileset(
      readJson(path),
      path,
      rootDirectory,
      allowedSemanticKeys,
    ),
  );
  const aseprite = exportAsepriteSources(
    rootDirectory,
    config,
    options.asepritePath,
  );
  const prefabs = filesWithExtension(
    join(rootDirectory, "assets-src"),
    ".tmj",
  ).map((path) =>
    compileTiledPrefab(
      readJson(path),
      path,
      rootDirectory,
      allowedSemanticKeys,
    ),
  );

  const semanticIds = Object.fromEntries(
    semanticKeys.map((semanticKey, index) => [semanticKey, index]),
  );
  for (const tileset of tilesets) {
    for (const variant of tileset.variants) {
      variant.semanticId = semanticIds[variant.semanticKey];
    }
  }

  return { version: 1, semanticKeys, atlases, aseprite, tilesets, prefabs };
}
