/**
 * Throwaway sanity check for state-delta round-tripping.
 * Run: npx tsx scripts/delta-roundtrip-check.ts
 *
 * Verifies that for a variety of base→next transitions,
 * applyStateDelta(base, computeStateDelta(base, next)) reconstructs `next`
 * (entity/player arrays compared as id-keyed sets, since order is allowed
 * to differ).
 */
import { computeStateDelta, applyStateDelta } from "../src/net/state-delta";
import { SerializedState, TileType, EntityKind } from "../src/types";

let failures = 0;

function entity(id: string, x: number, hp = 10): any {
  return { id, kind: EntityKind.MONSTER, worldX: x, worldY: 0, hp, type: "RAT" };
}
function player(id: string, x: number, hp = 100): any {
  return { id, kind: EntityKind.PLAYER, worldX: x, worldY: 0, hp, weapon: 1 };
}

function baseState(): SerializedState {
  return {
    depth: 1,
    levelKind: "dungeon",
    map: [TileType.WALL, TileType.FLOOR, TileType.FLOOR, TileType.WALL],
    mapWidth: 2,
    mapHeight: 2,
    floorVariant: 0,
    wallSet: "concrete",
    wallDamage: [0, 0, 0, 0],
    stairsDown: [1, 1],
    stairsUp: null,
    player: player("p1", 10),
    players: [player("p1", 10)],
    entities: [player("p1", 10), entity("e1", 5), entity("e2", 7)],
    explored: [0, 1],
    enhancedVision: false,
    godMode: false,
    story: ["hello"],
    sim: { nowTick: 100, mode: "REALTIME", timeScale: 1, targetTimeScale: 1 },
    multiplayer: { mode: "online", localPlayerId: "p1" },
    sounds: [],
    effects: [],
  };
}

function idSet(arr: any[] | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of arr ?? []) m.set(o.id, JSON.stringify(o));
  return m;
}

function check(name: string, base: SerializedState, next: SerializedState): void {
  const delta = computeStateDelta(base, next, 2, 1);
  const got = applyStateDelta(base, delta);

  const problems: string[] = [];

  // Compare id-keyed collections order-independently.
  for (const key of ["entities", "players"] as const) {
    const want = idSet(next[key] as any[]);
    const have = idSet(got[key] as any[]);
    if (want.size !== have.size) problems.push(`${key} size ${have.size}!=${want.size}`);
    for (const [id, json] of want) {
      if (have.get(id) !== json) problems.push(`${key}[${id}] mismatch`);
    }
  }

  // Compare explored as a set.
  const wantExp = new Set(next.explored);
  const haveExp = new Set(got.explored);
  if (wantExp.size !== haveExp.size) problems.push(`explored size ${haveExp.size}!=${wantExp.size}`);
  for (const v of wantExp) if (!haveExp.has(v)) problems.push(`explored missing ${v}`);

  // Compare the rest by JSON, minus the order-sensitive collections.
  const strip = (s: SerializedState) => {
    const { entities, players, explored, ...rest } = s;
    return rest;
  };
  if (JSON.stringify(strip(got)) !== JSON.stringify(strip(next))) {
    problems.push("scalar/array fields differ");
  }

  if (problems.length > 0) {
    failures++;
    console.log(`FAIL ${name}: ${problems.join("; ")}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// 1. No change.
check("no-change", baseState(), baseState());

// 2. Entity moved + hp changed.
{
  const next = baseState();
  next.entities[1] = entity("e1", 6, 8);
  next.sim = { ...next.sim, nowTick: 101 };
  check("entity-moved", baseState(), next);
}

// 3. Entity removed, entity added.
{
  const next = baseState();
  next.entities = [player("p1", 10), entity("e2", 7), entity("e3", 9)];
  check("entity-add-remove", baseState(), next);
}

// 4. Player moved.
{
  const next = baseState();
  next.player = player("p1", 12);
  next.players = [player("p1", 12)];
  check("player-moved", baseState(), next);
}

// 5. Explored grew.
{
  const next = baseState();
  next.explored = [0, 1, 2, 3];
  check("explored-grew", baseState(), next);
}

// 6. Map tile + wall damage changed.
{
  const next = baseState();
  next.map = [TileType.WALL, TileType.FLOOR, TileType.HOLE, TileType.WALL];
  next.wallDamage = [0, 0, 0, 2];
  check("map-walldamage", baseState(), next);
}

// 7. Scalars (godMode, story, floorVariant).
{
  const next = baseState();
  next.godMode = true;
  next.floorVariant = 2;
  next.story = ["new", "hello"];
  check("scalars", baseState(), next);
}

// 8. New player joins.
{
  const next = baseState();
  next.players = [player("p1", 10), player("p2", 20)];
  next.entities = [...baseState().entities, player("p2", 20)];
  check("player-joins", baseState(), next);
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
