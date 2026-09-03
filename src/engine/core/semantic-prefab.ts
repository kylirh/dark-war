/** Runtime semantic prefab transforms, validation, and deterministic stamping. */

import prefabManifest from "../../generated/semantic-prefabs.json";
import { WorldPlane } from "./world-plane";
import {
  FIXTURE_KEYS,
  FixtureType,
  GROUND_KEYS,
  GroundType,
  STRUCTURE_KEYS,
  StructureType,
} from "./world-semantics";

export type PrefabTransform =
  | "identity"
  | "rotate90"
  | "rotate180"
  | "rotate270"
  | "reflectX";

export interface SemanticPrefabMarker {
  readonly id: number;
  readonly kind: "spawn" | "portal" | "socket" | "require" | "sign";
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface SemanticPrefab {
  readonly source: string;
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly transforms: readonly string[];
  readonly layers: {
    readonly ground: readonly (string | null)[];
    readonly structure: readonly (string | null)[];
    readonly fixture: readonly (string | null)[];
    readonly elevation: readonly (number | null)[];
  };
  readonly markers: readonly SemanticPrefabMarker[];
}

export interface StampedPrefabMarker extends SemanticPrefabMarker {
  readonly worldX: number;
  readonly worldY: number;
}

export interface SemanticPrefabStampResult {
  readonly width: number;
  readonly height: number;
  readonly changedIndices: readonly number[];
  readonly markers: readonly StampedPrefabMarker[];
}

const PREFABS = new Map(
  (prefabManifest.prefabs as unknown as SemanticPrefab[]).map((prefab) => [
    prefab.key,
    prefab,
  ]),
);
const GROUND_IDS = invertSemanticKeys(GROUND_KEYS);
const STRUCTURE_IDS = invertSemanticKeys(STRUCTURE_KEYS);
const FIXTURE_IDS = invertSemanticKeys(FIXTURE_KEYS);

function invertSemanticKeys<T extends number>(
  keys: Readonly<Record<T, string>>,
): ReadonlyMap<string, T> {
  return new Map<string, T>(
    (Object.entries(keys) as Array<[string, string]>).map(([id, key]) => [
      key,
      Number(id) as T,
    ]),
  );
}

/** Resolve a compiled prefab by its editor-independent semantic key. */
export function semanticPrefab(key: string): SemanticPrefab {
  const prefab = PREFABS.get(key);
  if (!prefab) throw new Error(`Unknown semantic prefab: ${key}`);
  return prefab;
}

export function prefabKeys(): readonly string[] {
  return [...PREFABS.keys()].sort();
}

/** Stamp a prefab after validating bounds, transform policy, and requirements. */
export function stampSemanticPrefab(
  plane: WorldPlane,
  prefab: SemanticPrefab,
  originX: number,
  originY: number,
  transform: PrefabTransform = "identity",
): SemanticPrefabStampResult {
  if (!prefab.transforms.includes(transform)) {
    throw new Error(`${prefab.key} does not allow ${transform}`);
  }
  const output = transformedSize(prefab.width, prefab.height, transform);
  if (
    originX < 0 ||
    originY < 0 ||
    originX + output.width > plane.width ||
    originY + output.height > plane.height
  ) {
    throw new Error(`${prefab.key} stamp is out of world bounds`);
  }
  const markers = prefab.markers.map((marker) => {
    const point = transformPoint(
      marker.x,
      marker.y,
      prefab.width,
      prefab.height,
      transform,
    );
    const direction = marker.properties["darkwar.direction"];
    return {
      ...marker,
      properties:
        typeof direction === "string"
          ? {
              ...marker.properties,
              "darkwar.direction": transformDirection(direction, transform),
            }
          : marker.properties,
      worldX: originX + point.x,
      worldY: originY + point.y,
    };
  });
  validateRequirements(plane, markers);

  const changed = new Set<number>();
  for (let y = 0; y < prefab.height; y++) {
    for (let x = 0; x < prefab.width; x++) {
      const sourceIndex = x + y * prefab.width;
      const point = transformPoint(
        x,
        y,
        prefab.width,
        prefab.height,
        transform,
      );
      const edit = {
        ground: semanticId(prefab.layers.ground[sourceIndex], GROUND_IDS),
        structure: semanticId(
          prefab.layers.structure[sourceIndex],
          STRUCTURE_IDS,
        ),
        fixture: semanticId(prefab.layers.fixture[sourceIndex], FIXTURE_IDS),
        elevation: prefab.layers.elevation[sourceIndex] ?? undefined,
      };
      if (Object.values(edit).every((value) => value === undefined)) continue;
      for (const index of plane.editCell(
        originX + point.x,
        originY + point.y,
        edit,
      )) {
        changed.add(index);
      }
    }
  }
  return {
    ...output,
    changedIndices: [...changed].sort((a, b) => a - b),
    markers: markers.filter((marker) => marker.kind !== "require"),
  };
}

function semanticId<T extends number>(
  key: string | null,
  ids: ReadonlyMap<string, T>,
): T | undefined {
  if (key === null) return undefined;
  const id = ids.get(key);
  if (id === undefined)
    throw new Error(`Unknown compiled semantic key: ${key}`);
  return id;
}

function validateRequirements(
  plane: WorldPlane,
  markers: readonly StampedPrefabMarker[],
): void {
  for (const marker of markers) {
    if (marker.kind !== "require") continue;
    const layer = marker.properties["darkwar.layer"];
    const key = marker.properties["darkwar.semanticKey"];
    if (typeof layer !== "string" || typeof key !== "string") {
      throw new Error("Prefab requirement needs a layer and semantic key");
    }
    const index = plane.indexFor(marker.worldX, marker.worldY);
    const actual =
      layer === "ground"
        ? GROUND_KEYS[plane.layers.ground[index] as GroundType]
        : layer === "structure"
          ? STRUCTURE_KEYS[plane.layers.structure[index] as StructureType]
          : layer === "fixture"
            ? FIXTURE_KEYS[plane.layers.fixture[index] as FixtureType]
            : undefined;
    if (actual !== key) {
      throw new Error(
        `${marker.name || "Prefab"} requires ${key}, got ${actual}`,
      );
    }
  }
}

function transformedSize(
  width: number,
  height: number,
  transform: PrefabTransform,
): { width: number; height: number } {
  return transform === "rotate90" || transform === "rotate270"
    ? { width: height, height: width }
    : { width, height };
}

function transformPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  transform: PrefabTransform,
): { x: number; y: number } {
  switch (transform) {
    case "identity":
      return { x, y };
    case "rotate90":
      return { x: height - 1 - y, y: x };
    case "rotate180":
      return { x: width - 1 - x, y: height - 1 - y };
    case "rotate270":
      return { x: y, y: width - 1 - x };
    case "reflectX":
      return { x: width - 1 - x, y };
  }
}

function transformDirection(
  direction: string,
  transform: PrefabTransform,
): string {
  const directions = ["north", "east", "south", "west"];
  const index = directions.indexOf(direction);
  if (index < 0) return direction;
  if (transform === "reflectX") {
    return direction === "east"
      ? "west"
      : direction === "west"
        ? "east"
        : direction;
  }
  const quarterTurns =
    transform === "rotate90"
      ? 1
      : transform === "rotate180"
        ? 2
        : transform === "rotate270"
          ? 3
          : 0;
  return directions[(index + quarterTurns) % directions.length];
}
