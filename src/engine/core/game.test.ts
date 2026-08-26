import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./game";
import {
  EntityKind,
  ItemType,
  Item,
  TileType,
  WeaponType,
  CommandType,
} from "../types";
import { RNG } from "../utils/rng";
import { enqueueCommand } from "../systems/simulation/commands";
import { stepSimulationTick } from "../systems/simulation/tick";
import { BulletEntity } from "../entities/bullet-entity";
import { SoundEffect } from "../content/sound-effects";
import { TerrainPrototypeTransitionMode } from "../systems/terrain/terrain-prototype";
import { setStateDamageAtIndex, setStateTile } from "../utils/state-tiles";
import { FixtureType, StructureType } from "./world-semantics";
import { MEDKIT_HEAL_AMOUNT } from "../content/item-defs";

describe("Game serialize/deserialize round-trip", () => {
  beforeEach(() => RNG.reseed(424242));

  it("restores depth, map, player, and entities", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1); // a dungeon level

    const before = game.getState();
    const serialized = game.serialize();
    expect(serialized.plane.width).toBe(before.mapWidth);
    expect(serialized.plane.height).toBe(before.mapHeight);
    expect("map" in serialized).toBe(false);
    expect("wallDamage" in serialized).toBe(false);
    expect("ctdmCharge" in serialized.player).toBe(false);
    expect("ctdmChargeMax" in serialized.player).toBe(false);

    const restored = new Game({ mode: "offline" });
    restored.deserialize(serialized);
    const after = restored.getState();

    expect(after.depth).toBe(before.depth);
    expect(after.worldPlane.layers).toEqual(before.worldPlane.layers);
    expect(after.mapWidth).toBe(before.mapWidth);
    expect(after.mapHeight).toBe(before.mapHeight);
    expect(after.player.gridX).toBe(before.player.gridX);
    expect(after.player.gridY).toBe(before.player.gridY);
    expect(after.entities.length).toBe(before.entities.length);
    const restoredMedkit = after.entities.find(
      (entity) =>
        entity.kind === EntityKind.ITEM && entity.type === ItemType.MEDKIT,
    ) as Item | undefined;
    expect(restoredMedkit?.heal).toBe(MEDKIT_HEAL_AMOUNT);
    expect(after.worldPlane.visuals).toBeDefined();
    expect(after.worldPlane.visuals!.layers.coordinateHash).toEqual(
      before.worldPlane.visuals!.layers.coordinateHash,
    );
  });

  it("uses rare deterministic offline medkits while keeping one online", () => {
    RNG.reseed(9001);
    const firstOffline = new Game({ mode: "offline" });
    firstOffline.reset(1);
    const firstPositions = firstOffline
      .getState()
      .entities.filter(
        (entity) =>
          entity.kind === EntityKind.ITEM && entity.type === ItemType.MEDKIT,
      )
      .map((entity) => [entity.gridX, entity.gridY]);

    RNG.reseed(9001);
    const secondOffline = new Game({ mode: "offline" });
    secondOffline.reset(1);
    const secondPositions = secondOffline
      .getState()
      .entities.filter(
        (entity) =>
          entity.kind === EntityKind.ITEM && entity.type === ItemType.MEDKIT,
      )
      .map((entity) => [entity.gridX, entity.gridY]);

    expect(firstPositions).toEqual(secondPositions);
    expect(firstPositions).toHaveLength(1);

    RNG.reseed(9001);
    const offlineBetweenDrops = new Game({ mode: "offline" });
    offlineBetweenDrops.reset(2);
    expect(
      offlineBetweenDrops
        .getState()
        .entities.filter(
          (entity) =>
            entity.kind === EntityKind.ITEM && entity.type === ItemType.MEDKIT,
        ),
    ).toHaveLength(0);

    RNG.reseed(9001);
    const online = new Game({ mode: "online" });
    online.reset(1);
    expect(
      online
        .getState()
        .entities.filter(
          (entity) =>
            entity.kind === EntityKind.ITEM && entity.type === ItemType.MEDKIT,
        ),
    ).toHaveLength(1);
  });

  it("rejects legacy scalar saves without a world plane", () => {
    const game = new Game({ mode: "offline" });
    expect(() =>
      game.deserialize({
        depth: 1,
        map: [TileType.FLOOR],
        mapWidth: 1,
        mapHeight: 1,
      } as unknown as ReturnType<Game["serialize"]>),
    ).toThrow("Invalid save: missing world plane");
  });

  it("rebuilds the tile source over the restored map", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    const state = restored.getState();
    // tiles must reference the restored authoritative plane.
    expect(state.tiles.width).toBe(state.mapWidth);
    expect(state.tiles.getTile(state.player.gridX, state.player.gridY)).toBe(
      state.worldPlane.getTile(state.player.gridX, state.player.gridY),
    );
  });

  it("serializes independent world-plane arrays so deltas can detect changes", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);

    const before = game.serialize();
    setStateTile(game.getState(), 10, 0, TileType.HOLE);
    setStateDamageAtIndex(game.getState(), 10, 5);
    const after = game.serialize();

    // Distinct arrays (not shared references) so a delta baseline sees the diff.
    expect(after.plane.ground).not.toBe(before.plane.ground);
    expect(after.plane.damage).not.toBe(before.plane.damage);
    expect(before.plane.ground[10]).not.toBe(after.plane.ground[10]);
    expect(before.plane.damage[10]).not.toBe(after.plane.damage[10]);
  });

  it("copies callout transport data without restoring it as world state", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.pendingCallouts.push({
      id: "callout-1",
      kind: "speech",
      speakerId: state.player.id,
      text: "Just passing through.",
      worldX: state.player.worldX,
      worldY: state.player.worldY,
      priority: "normal",
      audiencePlayerIds: [state.player.id],
    });

    const serialized = game.serialize();
    state.pendingCallouts[0].audiencePlayerIds?.push("someone-else");
    expect(serialized.callouts[0].audiencePlayerIds).toEqual([state.player.id]);

    const restored = new Game({ mode: "offline" });
    restored.deserialize(serialized);
    expect(restored.getState().pendingCallouts).toEqual([]);
  });

  it("reuses each accessibility flood fill until its plane changes", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    game.updateFOV();
    const cachedAccessible = state.accessible;
    game.updateFOV();
    expect(state.accessible).toBe(cachedAccessible);

    state.worldPlane.editCell(0, 0, { damage: 1 });
    game.updateFOV();
    expect(state.accessible).not.toBe(cachedAccessible);
  });

  it("generates a large bounded dungeon in full, with the player on floor", () => {
    RNG.reseed(2024);
    const game = new Game({ mode: "offline" });
    game.reset(1); // a dungeon level
    const state = game.getState();

    expect(state.mapWidth).toBe(128);
    expect(state.mapHeight).toBe(96);
    // The player spawns on floor (up-stairs at the entry).
    expect(state.tiles.passable(state.player.gridX, state.player.gridY)).toBe(
      true,
    );
    expect(state.tiles.getTile(state.player.gridX, state.player.gridY)).toBe(
      TileType.STAIRS_UP,
    );
    // The whole level exists up front, with plenty of floor.
    expect(
      Array.from({ length: state.mapWidth * state.mapHeight }, (_, index) =>
        state.tiles.getTile(
          index % state.mapWidth,
          Math.floor(index / state.mapWidth),
        ),
      ).filter((tile) => tile === TileType.FLOOR).length,
    ).toBeGreaterThan(800);
  });

  it("descends from the outside into a bounded dungeon with down-stairs", () => {
    RNG.reseed(99);
    const game = new Game({ mode: "offline" });
    game.reset(0); // outside city
    game.descend(); // → depth 1 dungeon
    const state = game.getState();

    expect(state.depth).toBe(1);
    expect(state.levelKind).toBe("dungeon");
    expect(state.mapWidth).toBe(128);
    expect(state.worldPlane).toBeDefined();
    expect(state.tiles).toBe(state.worldPlane);
    expect([...state.worldPlane!.layers.structure]).toContain(
      StructureType.WALL,
    );
    expect([...state.worldPlane!.layers.fixture]).toContain(
      FixtureType.STAIRS_DOWN,
    );
    expect(state.tiles.getTile(state.stairsDown[0], state.stairsDown[1])).toBe(
      TileType.STAIRS_DOWN,
    );
  });

  it("restores the authoritative outside WorldPlane after a depth round-trip", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const outside = game.getState();
    const editX = outside.player.gridX + 1;
    const editY = outside.player.gridY;
    setStateTile(outside, editX, editY, TileType.DOOR_LOCKED);
    const outsidePlane = outside.worldPlane;

    game.descend();
    expect(game.getState().worldPlane).toBeDefined();
    expect(game.getState().tiles).toBe(game.getState().worldPlane);
    game.ascend();

    const restored = game.getState();
    expect(restored.worldPlane).toBe(outsidePlane);
    expect(restored.tiles).toBe(outsidePlane);
    expect(restored.tiles.getTile(editX, editY)).toBe(TileType.DOOR_LOCKED);
    expect(restored.tiles.getTile(editX, editY)).toBe(TileType.DOOR_LOCKED);
  });

  it("spawns pistol bullets at the muzzle, in front of the shooter", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = WeaponType.PISTOL;
    player.ammo = 5;
    player.facingAngle = 0; // aim +x (right)

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx: 1, dy: 0 },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);

    const bullet = state.entities.find(
      (e): e is BulletEntity => e.kind === EntityKind.BULLET,
    );
    expect(bullet).toBeDefined();
    // Spawned ahead of the player along the aim (muzzle offset), not at center,
    // and outside the player's body so it can never self-collide.
    expect(bullet!.worldX).toBeGreaterThan(player.worldX + 12);
    expect(Math.abs(bullet!.worldY - player.worldY)).toBeLessThan(0.001);
  });

  it("keeps the player present in the entities list", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const players = state.entities.filter((e) => e.kind === EntityKind.PLAYER);
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe(state.player.id);
  });
});

describe("Game multiplayer player management", () => {
  beforeEach(() => RNG.reseed(7));

  it("adds and removes network players", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    const startCount = game.getState().players.length;

    game.addNetworkPlayer("remote-1");
    expect(game.getState().players.some((p) => p.id === "remote-1")).toBe(true);
    expect(game.getState().players.length).toBe(startCount + 1);

    game.removeNetworkPlayer("remote-1");
    expect(game.getState().players.some((p) => p.id === "remote-1")).toBe(
      false,
    );
    expect(game.getState().entities.some((e) => e.id === "remote-1")).toBe(
      false,
    );
  });

  it("suppresses a shooter's own weapon-sound echo but not for other players", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    game.addNetworkPlayer("p1");
    game.addNetworkPlayer("p2");
    // Both weapon sounds are predicted locally by the firing client.
    game
      .getState()
      .pendingSounds.push(
        { effect: SoundEffect.SHOOT, sourceId: "p1" },
        { effect: SoundEffect.LASER_SHOOT_1, sourceId: "p1" },
        { effect: SoundEffect.LASER_SHOOT_2, sourceId: "p1" },
        { effect: SoundEffect.LASER_SHOOT_3, sourceId: "p1" },
        { effect: SoundEffect.LASER_SHOOT_4, sourceId: "p1" },
        { effect: SoundEffect.SMG_SHOOT_1, sourceId: "p1" },
        { effect: SoundEffect.SMG_SHOOT_2, sourceId: "p1" },
        { effect: SoundEffect.SHOTGUN_BLAST_1, sourceId: "p1" },
        { effect: SoundEffect.SHOTGUN_BLAST_2, sourceId: "p1" },
        { effect: SoundEffect.SHOTGUN_BLAST_3, sourceId: "p1" },
      );

    const effectsFor = (playerId: string): string[] =>
      (game.serializeForPlayer(playerId).sounds ?? []).map(
        (sound) => sound.effect,
      );
    const weaponSounds = [
      SoundEffect.SHOOT,
      SoundEffect.LASER_SHOOT_1,
      SoundEffect.LASER_SHOOT_2,
      SoundEffect.LASER_SHOOT_3,
      SoundEffect.LASER_SHOOT_4,
      SoundEffect.SMG_SHOOT_1,
      SoundEffect.SMG_SHOOT_2,
      SoundEffect.SHOTGUN_BLAST_1,
      SoundEffect.SHOTGUN_BLAST_2,
      SoundEffect.SHOTGUN_BLAST_3,
    ];

    expect(effectsFor("p1")).toEqual([]);
    expect(effectsFor("p2")).toEqual(expect.arrayContaining(weaponSounds));
  });

  it("preserves spatial sound metadata for network clients", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    game.addNetworkPlayer("p1");
    game.getState().pendingSounds.push({
      effect: SoundEffect.MUTANT_EAT,
      worldX: 320,
      worldY: 640,
      maxDistancePx: 480,
      minimumVolumeScale: 0.2,
      sourceId: "monster-1",
    });

    expect(game.serializeForPlayer("p1").sounds).toContainEqual({
      effect: SoundEffect.MUTANT_EAT,
      worldX: 320,
      worldY: 640,
      maxDistancePx: 480,
      minimumVolumeScale: 0.2,
    });
  });

  it("does not spawn the CTDM item in online mode", () => {
    const online = new Game({ mode: "online" });
    online.reset(0); // outside level (where the CTDM normally is)
    const hasCtdm = online
      .getState()
      .entities.some((e) => (e as { type?: string }).type === "CTDM");
    expect(hasCtdm).toBe(false);
  });

  it("loads the terrain prototype through the canonical tile source", () => {
    const prototypeGame = new Game();
    prototypeGame.reset(0);
    prototypeGame.loadTerrainPrototype();

    const state = prototypeGame.getState();
    expect(state.terrainPrototype).toBeDefined();
    expect(state.mapWidth).toBe(40);
    expect(state.mapHeight).toBe(30);
    expect(state.tiles).toBe(state.worldPlane);
    expect(state.tiles).toBe(state.terrainPrototype!.world);
    expect(state.tiles.getTile(20, 3)).toBe(TileType.WALL);
    expect(state.tiles.getTile(20, 6)).toBe(TileType.FLOOR);
    expect([state.player.gridX, state.player.gridY]).toEqual([19, 14]);
    expect(state.entities).toEqual([state.player]);
    expect(state.options.fov).toBe(false);
  });

  it("publishes bounded terrain prototype edits to tile consumers", () => {
    const prototypeGame = new Game();
    prototypeGame.reset(0);
    prototypeGame.loadTerrainPrototype();
    prototypeGame.getState().mapDirty = false;

    const result = prototypeGame.editTerrainPrototypeElevation(22, 14, -1);
    const state = prototypeGame.getState();

    expect(result?.dirtyCellIndices).toHaveLength(9);
    expect(state.changedTiles).toEqual(new Set(result?.dirtyCellIndices));
    expect(state.mapDirty).toBe(false);
    expect(state.story[0]).toContain("9 visual cells resolved");
  });

  it("toggles the development shoreline comparison without changing semantics", () => {
    const prototypeGame = new Game();
    prototypeGame.reset(0);
    prototypeGame.loadTerrainPrototype();
    const state = prototypeGame.getState();
    const groundBefore = state.terrainPrototype!.ground.slice();

    expect(prototypeGame.toggleTerrainPrototypeTransitionMode()).toBe(
      TerrainPrototypeTransitionMode.DUAL_GRID,
    );
    expect(state.terrainPrototype!.ground).toEqual(groundBefore);
    expect(prototypeGame.toggleTerrainPrototypeTransitionMode()).toBe(
      TerrainPrototypeTransitionMode.BLOB_47,
    );
  });

  it("detaches a player and re-attaches it to another world with stats intact", () => {
    const from = new Game({ mode: "online" });
    from.reset(1);
    const to = new Game({ mode: "online" });
    to.reset(2);

    const player = from.addNetworkPlayer("traveler");
    player.hp = 37;
    player.weapon = WeaponType.PISTOL;

    const detached = from.detachPlayer("traveler");
    expect(detached).toBe(player);
    expect(from.getState().players.some((p) => p.id === "traveler")).toBe(
      false,
    );
    expect(from.getState().entities.some((e) => e.id === "traveler")).toBe(
      false,
    );

    to.attachExistingPlayer(detached!, to.getState().stairsUp ?? [1, 1]);
    const moved = to.getState().players.find((p) => p.id === "traveler");
    expect(moved).toBeDefined();
    expect(moved!.hp).toBe(37); // stats carried over
    expect(moved!.weapon).toBe(WeaponType.PISTOL);
    expect(to.getState().entities.some((e) => e.id === "traveler")).toBe(true);
  });

  it("respawns in the current world, drops ordinary inventory, and preserves exploration", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    const plane = state.worldPlane;
    const exploredIndex = player.gridX + player.gridY * state.mapWidth;
    state.explored.add(exploredIndex);
    state.exploredByPlayer.set(player.id, state.explored);
    state.worldPlane.editCell(2, 2, { damage: 1 });

    player.score = 123;
    player.hpMax = 24;
    player.sight = 11;
    player.laserChargeMax = 125;
    player.panicChargeMax = 75;
    player.hasCTDM = true;
    player.hasMatterManipulator = true;
    player.inventorySlots = [
      { type: ItemType.VIBRA_SWORD },
      { type: ItemType.AMMO },
      { type: ItemType.MEDKIT },
      { type: ItemType.CTDM },
      { type: ItemType.MATTER_MANIPULATOR },
      { type: ItemType.PANIC_BUTTON },
      ...Array.from({ length: 30 }, () => ({ type: null })),
    ];
    player.ammo = 4;
    player.ammoReserve = 6;
    player.keys = 2;
    player.itemCounts[ItemType.MEDKIT] = 2;
    player.itemCounts[ItemType.COIN] = 3;

    const beforeEntityIds = new Set(state.entities.map((entity) => entity.id));
    const deathWorld = [player.worldX, player.worldY];
    player.hp = 0;
    expect(game.updateDeathStatus()).toBe(true);
    const droppedEntityCount = state.entities.length;
    expect(game.updateDeathStatus()).toBe(false);
    expect(state.entities).toHaveLength(droppedEntityCount);

    const drops = state.entities.filter(
      (entity): entity is Item =>
        entity.kind === EntityKind.ITEM && !beforeEntityIds.has(entity.id),
    );
    expect(drops.map((item) => item.type)).toContain(ItemType.VIBRA_SWORD);
    expect(drops.map((item) => item.type)).toContain(ItemType.PANIC_BUTTON);
    expect(drops.filter((item) => item.type === ItemType.AMMO)).toHaveLength(1);
    expect(drops.find((item) => item.type === ItemType.AMMO)?.amount).toBe(10);
    expect(drops.filter((item) => item.type === ItemType.MEDKIT)).toHaveLength(
      2,
    );
    expect(drops.filter((item) => item.type === ItemType.COIN)).toHaveLength(3);
    expect(drops.filter((item) => item.type === ItemType.CTDM)).toHaveLength(0);
    expect(
      drops.filter((item) => item.type === ItemType.MATTER_MANIPULATOR),
    ).toHaveLength(0);
    expect(
      drops.every(
        (item) =>
          item.worldX === deathWorld[0] && item.worldY === deathWorld[1],
      ),
    ).toBe(true);

    expect(game.respawnPlayer()).toBe(true);
    expect(state.worldPlane).toBe(plane);
    expect(state.worldPlane.layers.damage[plane.indexFor(2, 2)]).toBe(1);
    expect(state.explored).toContain(exploredIndex);
    expect([player.gridX, player.gridY]).toEqual(state.playerStart);
    expect(player.hp).toBe(player.hpMax);
    expect(player.score).toBe(123);
    expect(player.hpMax).toBe(24);
    expect(player.sight).toBe(11);
    expect(player.laserChargeMax).toBe(125);
    expect(player.panicChargeMax).toBe(75);
    expect(player.hasCTDM).toBe(true);
    expect(player.hasMatterManipulator).toBe(true);
    expect(player.inventorySlots.map((slot) => slot.type)).toContain(
      ItemType.CTDM,
    );
    expect(player.inventorySlots.map((slot) => slot.type)).toContain(
      ItemType.MATTER_MANIPULATOR,
    );
    expect(player.inventorySlots.map((slot) => slot.type)).not.toContain(
      ItemType.VIBRA_SWORD,
    );

    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    expect(
      restored
        .getState()
        .entities.some(
          (entity) =>
            entity.kind === EntityKind.ITEM &&
            entity.type === ItemType.VIBRA_SWORD &&
            entity.deathDrop === true,
        ),
    ).toBe(true);
  });

  it("does not allow respawning while the player is alive", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    expect(game.respawnPlayer()).toBe(false);
  });
});
