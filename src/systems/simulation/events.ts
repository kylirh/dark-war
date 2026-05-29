import {
  GameState,
  GameEvent,
  EventType,
  EntityKind,
  Monster,
  MonsterType,
  Player,
  Item,
  Explosive,
  ItemType,
  TileType,
  WeaponType,
  CELL_CONFIG,
} from "../../types";
import { ItemEntity } from "../../entities/item-entity";
import { idxFor } from "../../utils/helpers";
import { applyWallDamageAt } from "../../utils/walls";
import { RNG } from "../../utils/rng";
import { SoundEffect } from "../sound";
import {
  MAX_EVENTS_PER_TICK,
  EXPLOSION_KNOCKBACK_MAX_DISTANCE,
  EXPLOSION_KNOCKBACK_MIN_DISTANCE,
} from "./constants";
import { pushEvent, getEventDepth, getClosestPlayer } from "./sim-helpers";
import { triggerExplosion } from "./explosives";
import { addToInventory } from "../../utils/inventory";

function positiveAmount(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  return fallback;
}

export function processEventQueue(state: GameState): void {
  let processed = 0;
  let head = 0;

  while (head < state.eventQueue.length) {
    if (processed++ > MAX_EVENTS_PER_TICK) {
      console.error("Event cascade exceeded max events per tick");
      break;
    }
    processEvent(state, state.eventQueue[head++]);
  }

  // Remove processed events in one splice (O(remaining)) instead of per-shift O(n²)
  state.eventQueue.splice(0, head);
}

function processEvent(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case EventType.DAMAGE:
      processDamageEvent(state, event);
      break;
    case EventType.DEATH:
      processDeathEvent(state, event);
      break;
    case EventType.EXPLOSION:
      processExplosionEvent(state, event);
      break;
    case EventType.MESSAGE:
      processMessageEvent(state, event);
      break;
    case EventType.DOOR_OPEN:
      processDoorOpenEvent(state, event);
      break;
    case EventType.PICKUP_ITEM:
      processPickupItemEvent(state, event);
      break;
    case EventType.PLAYER_DEATH:
      processPlayerDeathEvent(state, event);
      break;
    case EventType.NPC_TALK:
      processNPCTalkEvent(state, event);
      break;
  }
}

function processDamageEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "DAMAGE";
    targetId: string;
    amount: number;
    sourceId?: string;
    fromExplosion?: boolean;
    suppressHitSound?: boolean;
    knockbackX?: number;
    knockbackY?: number;
    knockbackDistance?: number;
  };
  const target = state.entities.find((e) => e.id === data.targetId);
  if (!target) return;

  if (target.kind === EntityKind.PLAYER && state.options.godMode) {
    return;
  }

  // Hit flash for visual feedback (monster and player)
  if (target.kind === EntityKind.MONSTER || target.kind === EntityKind.PLAYER) {
    state.effects.push({
      id: crypto.randomUUID(),
      type: "hit_flash",
      worldX: (target as any).worldX ?? target.gridX * CELL_CONFIG.w,
      worldY: (target as any).worldY ?? target.gridY * CELL_CONFIG.h,
      ageTicks: 0,
      durationTicks: 3,
      entityId: target.id,
    });
  }

  if (target.kind === EntityKind.PLAYER) {
    const player = target as Player;

    // Don't damage or play sounds if already dead
    if (player.hp <= 0) return;

    player.hp -= data.amount;

    // Don't let HP go below 0
    if (player.hp < 0) player.hp = 0;

    if (player.hp > 0) {
      applyDamageKnockback(state, player, data);
    }

    // Queue random player hit sound (using Math.random to avoid desyncing RNG)
    const hitSounds: SoundEffect[] = [
      SoundEffect.PLAYER_HIT_1,
      SoundEffect.PLAYER_HIT_2,
      SoundEffect.PLAYER_HIT_3,
      SoundEffect.PLAYER_HIT_4,
      SoundEffect.PLAYER_HIT_5,
    ];
    state.pendingSounds.push({ effect: hitSounds[Math.floor(Math.random() * hitSounds.length)] });

    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: `You take ${data.amount} damage!` },
      cause: event.id,
    });

    if (player.hp <= 0) {
      // Stop movement immediately on death to prevent sliding
      player.velocityX = 0;
      player.velocityY = 0;

      pushEvent(state, {
        type: EventType.PLAYER_DEATH,
        data: { type: "PLAYER_DEATH", playerId: player.id },
        cause: event.id,
      });
    }
  } else if (target.kind === EntityKind.MONSTER) {
    const monster = target as Monster;
    monster.hp -= data.amount;

    if (monster.hp > 0) {
      applyDamageKnockback(state, monster, data);
    }

    if (!data.suppressHitSound) {
      const mwx = (monster as any).worldX ?? monster.gridX * CELL_CONFIG.w;
      const mwy = (monster as any).worldY ?? monster.gridY * CELL_CONFIG.h;
      const sourceEntity = data.sourceId ? state.entities.find((e) => e.id === data.sourceId) : null;
      const monsterTileIdx = idxFor(monster.gridX, monster.gridY, state.mapWidth);
      const sourceTileIdx = sourceEntity
        ? idxFor(sourceEntity.gridX, sourceEntity.gridY, state.mapWidth)
        : monsterTileIdx;
      const eitherVisible =
        state.visible.has(monsterTileIdx) || state.visible.has(sourceTileIdx);

      if (eitherVisible) {
        if (monster.type === MonsterType.UTILITY_BOT) {
          // Metal clang when bot is visible
          const metalSounds = [SoundEffect.HIT_METAL_1, SoundEffect.HIT_METAL_2, SoundEffect.HIT_METAL_3];
          state.pendingSounds.push({
            effect: metalSounds[Math.floor(Math.random() * metalSounds.length)],
            worldX: mwx,
            worldY: mwy,
          });
        } else {
          // Random thunk when any visible entity is in the fight
          const thunkSounds = [
            SoundEffect.HIT_MONSTER_1,
            SoundEffect.HIT_MONSTER_2,
            SoundEffect.HIT_MONSTER_3,
            SoundEffect.HIT_MONSTER_4,
            SoundEffect.HIT_MONSTER_5,
          ];
          state.pendingSounds.push({
            effect: thunkSounds[Math.floor(Math.random() * thunkSounds.length)],
            worldX: mwx,
            worldY: mwy,
          });
        }
      } else {
        // Neither combatant is visible — silent, occasional distant fighting sound
        if (RNG.chance(0.2)) {
          state.pendingSounds.push({ effect: SoundEffect.FIGHTING, worldX: mwx, worldY: mwy });
        }
      }
    }

    // Utility bot fights back when attacked
    if (monster.type === MonsterType.UTILITY_BOT && data.sourceId && monster.hp > 0) {
      const attacker = state.entities.find((e) => e.id === data.sourceId) as any;
      if (attacker) {
        (monster as any).alertLevel = 100;
        (monster as any).lastAttackerId = data.sourceId;
        (monster as any).lastKnownPlayerX = attacker.worldX ?? attacker.gridX * CELL_CONFIG.w;
        (monster as any).lastKnownPlayerY = attacker.worldY ?? attacker.gridY * CELL_CONFIG.h;
      }
    }

    // Regular monster fights back when hit by another monster
    if (
      monster.type !== MonsterType.UTILITY_BOT &&
      data.sourceId &&
      monster.hp > 0
    ) {
      const attacker = state.entities.find((e) => e.id === data.sourceId);
      if (attacker?.kind === EntityKind.MONSTER) {
        (monster as any).alertLevel = Math.max((monster as any).alertLevel ?? 0, 60);
        (monster as any).lastAttackerId = data.sourceId;
        (monster as any).lastKnownPlayerX = (attacker as any).worldX ?? attacker.gridX * CELL_CONFIG.w;
        (monster as any).lastKnownPlayerY = (attacker as any).worldY ?? attacker.gridY * CELL_CONFIG.h;
      }
    }

    if (monster.hp <= 0) {
      pushEvent(state, {
        type: EventType.DEATH,
        data: {
          type: "DEATH",
          entityId: monster.id,
          fromExplosion: data.fromExplosion,
          sourceId: data.sourceId,
        },
        cause: event.id,
      });
    }
  }
}

function applyDamageKnockback(
  state: GameState,
  target: Player | Monster,
  data: {
    fromExplosion?: boolean;
    knockbackX?: number;
    knockbackY?: number;
    knockbackDistance?: number;
  },
): void {
  if (
    typeof data.knockbackX !== "number" ||
    typeof data.knockbackY !== "number" ||
    typeof data.knockbackDistance !== "number" ||
    data.knockbackDistance <= 0
  ) {
    return;
  }

  if (
    data.fromExplosion &&
    state.holeCreatedTiles?.has(idxFor(target.gridX, target.gridY, state.mapWidth))
  ) {
    return;
  }

  const length = Math.sqrt(
    data.knockbackX * data.knockbackX +
      data.knockbackY * data.knockbackY,
  );
  if (length <= 0.001) return;

  const unitX = data.knockbackX / length;
  const unitY = data.knockbackY / length;
  target.prevWorldX = target.worldX;
  target.prevWorldY = target.worldY;
  target.worldX += unitX * data.knockbackDistance;
  target.worldY += unitY * data.knockbackDistance;
  if (target.physicsBody) {
    target.physicsBody.setPosition(target.worldX, target.worldY);
  }
}

function processExplosionEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "EXPLOSION";
    x: number;
    y: number;
    radius: number;
    damage: number;
  };

  const worldX = data.x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
  const worldY = data.y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
  const radiusPx = data.radius * CELL_CONFIG.w;

  state.pendingSounds.push({ effect: SoundEffect.EXPLOSION, worldX, worldY });
  state.effects.push({
    id: crypto.randomUUID(),
    type: "explosion",
    worldX,
    worldY,
    ageTicks: 0,
    durationTicks: 6,
  });

  const explosivesToTrigger: Explosive[] = [];
  const itemsToTrigger: Item[] = [];

  for (const entity of state.entities) {
    const dx = (entity as any).worldX - worldX;
    const dy = (entity as any).worldY - worldY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > radiusPx) continue;

    if (
      entity.kind === EntityKind.MONSTER ||
      entity.kind === EntityKind.PLAYER
    ) {
      const falloff = Math.max(0, 1 - distance / Math.max(radiusPx, 1));
      const knockbackDistance =
        EXPLOSION_KNOCKBACK_MIN_DISTANCE +
        (EXPLOSION_KNOCKBACK_MAX_DISTANCE - EXPLOSION_KNOCKBACK_MIN_DISTANCE) *
          falloff;
      pushEvent(state, {
        type: EventType.DAMAGE,
        data: {
          type: "DAMAGE",
          targetId: entity.id,
          amount: data.damage,
          fromExplosion: true,
          knockbackX: dx,
          knockbackY: dy,
          knockbackDistance,
        },
        cause: event.id,
      });
    } else if (entity.kind === EntityKind.EXPLOSIVE) {
      explosivesToTrigger.push(entity as Explosive);
    } else if (
      entity.kind === EntityKind.ITEM &&
      (entity as Item).type &&
      ((entity as Item).type === ItemType.GRENADE ||
        (entity as Item).type === ItemType.LAND_MINE)
    ) {
      itemsToTrigger.push(entity as Item);
    }
  }

  const minX = Math.max(0, Math.floor(data.x - data.radius) - 1);
  const maxX = Math.min(
    state.mapWidth - 1,
    Math.ceil(data.x + data.radius) + 1,
  );
  const minY = Math.max(0, Math.floor(data.y - data.radius) - 1);
  const maxY = Math.min(
    state.mapHeight - 1,
    Math.ceil(data.y + data.radius) + 1,
  );

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tileCenterX = x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
      const tileCenterY = y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
      const dx = tileCenterX - worldX;
      const dy = tileCenterY - worldY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusPx * radiusPx) continue;
      applyWallDamageAt(state, x, y, data.damage);
    }
  }

  for (const explosive of explosivesToTrigger) {
    triggerExplosion(
      state,
      (explosive as any).worldX,
      (explosive as any).worldY,
      explosive.type,
      event.id,
    );
    state.entities = state.entities.filter((e) => e.id !== explosive.id);
  }

  for (const item of itemsToTrigger) {
    triggerExplosion(
      state,
      (item as any).worldX,
      (item as any).worldY,
      item.type as ItemType.GRENADE | ItemType.LAND_MINE,
      event.id,
    );
    state.entities = state.entities.filter((e) => e.id !== item.id);
  }
}

function processDeathEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "DEATH";
    entityId: string;
    fromExplosion?: boolean;
    sourceId?: string;
  };
  const entity = state.entities.find((e) => e.id === data.entityId);
  if (!entity) return;

  if (entity.kind === EntityKind.MONSTER) {
    const monster = entity as Monster;
    if (!monster.carriedItems) {
      monster.carriedItems = [];
    }

    // Play death sound (skip for utility bot)
    if (monster.type !== MonsterType.UTILITY_BOT) {
      const deathSounds = [
        SoundEffect.MONSTER_DEATH_1,
        SoundEffect.MONSTER_DEATH_2,
        SoundEffect.MONSTER_DEATH_3,
        SoundEffect.MONSTER_DEATH_4,
      ];
      const mwx = (monster as any).worldX ?? monster.gridX * CELL_CONFIG.w;
      const mwy = (monster as any).worldY ?? monster.gridY * CELL_CONFIG.h;
      state.pendingSounds.push({
        effect: deathSounds[Math.floor(Math.random() * deathSounds.length)],
        worldX: mwx,
        worldY: mwy,
      });
    }

    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: `The ${monster.type} dies.` },
      cause: event.id,
    });

    const scoringPlayer =
      (data.sourceId
        ? state.entities.find(
            (entity): entity is Player =>
              entity.kind === EntityKind.PLAYER && entity.id === data.sourceId,
          )
        : null) ?? getClosestPlayer(state, monster);
    if (scoringPlayer) {
      scoringPlayer.score += 10;
    }

    if (monster.grenades > 0 || monster.landMines > 0) {
      const spawnExplosive = (
        type: ItemType.GRENADE | ItemType.LAND_MINE,
        count: number,
      ) => {
        for (let i = 0; i < count; i++) {
          if (data.fromExplosion) {
            triggerExplosion(
              state,
              (monster as any).worldX,
              (monster as any).worldY,
              type,
              event.cause,
            );
          } else {
            state.entities.push(
              new ItemEntity(monster.gridX, monster.gridY, type),
            );
          }
        }
      };

      spawnExplosive(ItemType.GRENADE, monster.grenades);
      spawnExplosive(ItemType.LAND_MINE, monster.landMines);
    }

    if (monster.bullets > 0) {
      const ammoItem = new ItemEntity(monster.gridX, monster.gridY, ItemType.AMMO);
      ammoItem.amount = monster.bullets;
      state.entities.push(ammoItem);
    }

    if (monster.carriedItems.length > 0) {
      for (const carried of monster.carriedItems) {
        const item = new ItemEntity(monster.gridX, monster.gridY, carried.type);
        if (typeof carried.amount === "number") {
          item.amount = carried.amount;
        }
        if (typeof carried.heal === "number") {
          item.heal = carried.heal;
        }
        state.entities.push(item);
      }
    }

    // Remove from entity list
    state.entities = state.entities.filter((e) => e.id !== entity.id);
  }
}

function processMessageEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "MESSAGE"; message: string };
  state.story.unshift(data.message);
  if (state.story.length > 200) {
    state.story.pop();
  }
}

function processDoorOpenEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "DOOR_OPEN"; x: number; y: number };
  const i = idxFor(data.x, data.y, state.mapWidth);
  const tile = state.map[i];

  if (tile === TileType.DOOR_CLOSED || tile === TileType.DOOR_LOCKED) {
    // Open the door
    state.map[i] = TileType.DOOR_OPEN;
    state.pendingSounds.push({ effect: SoundEffect.DOOR_OPEN, worldX: data.x * CELL_CONFIG.w, worldY: data.y * CELL_CONFIG.h });
    // Track tile change for physics update
    if (!state.changedTiles) state.changedTiles = new Set();
    state.changedTiles.add(i);
  } else if (tile === TileType.DOOR_OPEN) {
    // Close the door
    state.map[i] = TileType.DOOR_CLOSED;
    state.pendingSounds.push({ effect: SoundEffect.DOOR_CLOSE, worldX: data.x * CELL_CONFIG.w, worldY: data.y * CELL_CONFIG.h });
    // Track tile change for physics update
    if (!state.changedTiles) state.changedTiles = new Set();
    state.changedTiles.add(i);
  }
}

function processPickupItemEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "PICKUP_ITEM";
    actorId: string;
    itemId: string;
  };
  const actor = state.entities.find((e) => e.id === data.actorId);
  const item = state.entities.find((e) => e.id === data.itemId) as
    | Item
    | undefined;

  if (!actor || !item || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;

  switch (item.type) {
    case ItemType.MEDKIT: {
      const heal = positiveAmount(item.heal, 20);
      player.hp = Math.min(player.hpMax, player.hp + heal);
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: `You use the medkit. +${heal} HP` },
        cause: event.id,
      });
      break;
    }
    case ItemType.AMMO: {
      const amount = positiveAmount(item.amount, 24);
      player.ammoReserve += amount;
      addToInventory(player, ItemType.AMMO);
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: {
          type: "MESSAGE",
          message: `You pick up ${amount} rounds.`,
        },
        cause: event.id,
      });
      break;
    }
    case ItemType.KEYCARD:
      player.keys++;
      addToInventory(player, ItemType.KEYCARD);
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a keycard." },
        cause: event.id,
      });
      break;
    case ItemType.PISTOL:
      if (!player.inventorySlots.some((s) => s.type === ItemType.PISTOL)) {
        addToInventory(player, ItemType.PISTOL);
        player.weapon = WeaponType.PISTOL;
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: { type: "MESSAGE", message: "You pick up a pistol." },
          cause: event.id,
        });
      } else {
        // Already have a pistol — convert to ammo
        player.ammoReserve += 12;
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: { type: "MESSAGE", message: "You already have a pistol. +12 ammo." },
          cause: event.id,
        });
      }
      break;
    case ItemType.GRENADE: {
      const amount = positiveAmount(item.amount, 1);
      player.grenades += amount;
      addToInventory(player, ItemType.GRENADE);
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a grenade." },
        cause: event.id,
      });
      break;
    }
    case ItemType.LAND_MINE: {
      const amount = positiveAmount(item.amount, 1);
      player.landMines += amount;
      addToInventory(player, ItemType.LAND_MINE);
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a land mine." },
        cause: event.id,
      });
      break;
    }
    case ItemType.CTDM:
      if (!player.hasCTDM) {
        player.hasCTDM = true;
        player.ctdmEnabled = true;
        if (player.ctdmCharge <= 0) {
          player.ctdmCharge = Math.floor(player.ctdmChargeMax * 0.5);
        }
        addToInventory(player, ItemType.CTDM);
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: {
            type: "MESSAGE",
            message: "CTDM installed. Danger now triggers time dilation.",
          },
          cause: event.id,
        });
      } else {
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: { type: "MESSAGE", message: "CTDM already installed." },
          cause: event.id,
        });
      }
      break;
    case ItemType.POWERCELL: {
      const recharge = positiveAmount(item.amount, 25);
      player.ctdmCharge = Math.min(
        player.ctdmChargeMax,
        player.ctdmCharge + recharge,
      );
      if (!player.ctdmEnabled && player.ctdmCharge > 0 && player.hasCTDM) {
        player.ctdmEnabled = true;
      }
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: {
          type: "MESSAGE",
          message: `Powercell absorbed. CTDM +${recharge} charge.`,
        },
        cause: event.id,
      });
      break;
    }
  }

  // Remove item
  state.entities = state.entities.filter((e) => e.id !== item.id);
}

function processPlayerDeathEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "PLAYER_DEATH"; playerId: string };

  // Stop dead player's movement immediately (works for both single and multiplayer)
  const player = state.players.find((p) => p.id === data.playerId);
  if (player) {
    player.velocityX = 0;
    player.velocityY = 0;
  }

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: "You have died." },
    cause: event.id,
  });

  // Note: Additional death handling (showing overlay, time adjustment)
  // is done in Game.updateDeathStatus() which is called after each simulation tick
}

function processNPCTalkEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "NPC_TALK";
    npcId: string;
    message: string;
  };

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: data.message },
    cause: event.id,
  });

  // Slow down time on NPC talk
  state.sim.targetTimeScale = 0.01;
  state.sim.pauseReasons.add("npc_talk");
}
