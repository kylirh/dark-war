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
  CELL_CONFIG,
  STACKABLE_ITEMS_SET,
} from "../../types";
import { ItemEntity } from "../../entities/item-entity";
import { MONSTER_DEFS } from "../../content/monster-defs";
import { ITEM_DEFS, itemName } from "../../content/item-defs";
import { idxFor, setPositionFromGrid } from "../../utils/helpers";
import { removeFromInventory } from "../../utils/inventory";
import { applyWallDamageAt } from "../../utils/walls";
import { RNG } from "../../utils/rng";
import { SoundEffect } from "../../content/sound-effects";
import { setStateTileAtIndex } from "../../utils/state-tiles";
import { emitPlayerAlert } from "../../utils/player-alerts";
import { addStoryMessage } from "../../utils/story";
import {
  equippedMonsterWeaponItem,
  isAdaptiveWeaponMonster,
} from "../../utils/monster-weapons";

/** Flat damage reduction granted by a macrometal jacket. */
const ARMOR_PER_JACKET = 3;
const METAL_ROBOT_TYPES = new Set<MonsterType>([
  MonsterType.CYBERCOP,
  MonsterType.UTILITY_BOT,
  MonsterType.DREADNAUGHT,
]);

function alertPlayer(
  state: GameState,
  message: string,
  playerId: string,
): void {
  emitPlayerAlert(state, message, { audiencePlayerIds: [playerId] });
}
import {
  MAX_EVENTS_PER_TICK,
  EXPLOSION_KNOCKBACK_MAX_DISTANCE,
  EXPLOSION_KNOCKBACK_MIN_DISTANCE,
  REST_DAMAGE_MULTIPLIER,
} from "./constants";
import {
  pushEvent,
  getClosestPlayer,
  positiveAmount,
  stopPlayerResting,
} from "./sim-helpers";
import { triggerExplosion } from "./explosives";
import { addToInventory } from "../../utils/inventory";
import { reconcileSnagglepussCompanion } from "./snagglepuss-social";
import { dropPlayerInventoryOnDeath } from "../../utils/player-respawn";
import { signViewForPlacement } from "./signs";

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
    case EventType.SIGN_READ:
      processSignReadEvent(state, event);
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
  const target = state.entityManager.getById(data.targetId);
  if (!target) return;

  if (target.kind === EntityKind.PLAYER && state.options.godMode) {
    return;
  }

  // Hit flash for visual feedback (monster and player)
  if (target.kind === EntityKind.MONSTER || target.kind === EntityKind.PLAYER) {
    state.effects.push({
      id: crypto.randomUUID(),
      type: "hit_flash",
      worldX: target.worldX ?? target.gridX * CELL_CONFIG.w,
      worldY: target.worldY ?? target.gridY * CELL_CONFIG.h,
      ageTicks: 0,
      durationTicks: 3,
      entityId: target.id,
    });
  }

  if (target.kind === EntityKind.PLAYER) {
    const player = target as Player;

    // Don't damage or play sounds if already dead
    if (player.hp <= 0) return;

    const wasResting = player.resting;
    if (wasResting) stopPlayerResting(state, player);

    // Armor (e.g. macrometal jacket) softens normal blows to at least 1 HP,
    // while naturally sub-1 attacks such as an icky lump's remain sub-1.
    const armor = (player as Player & { armor?: number }).armor ?? 0;
    const rawIncoming = data.amount * (wasResting ? REST_DAMAGE_MULTIPLIER : 1);
    const incoming =
      armor > 0 && !data.fromExplosion
        ? Math.max(Math.min(1, rawIncoming), rawIncoming - armor)
        : rawIncoming;
    data.amount = incoming;

    player.hp -= data.amount;

    // Don't let HP go below 0
    if (player.hp < 0) player.hp = 0;

    if (player.hp > 0) {
      applyDamageKnockback(state, player, data);
      // On-hit attacker abilities: stun/slow (spider) and theft (snagglepuss/moppet).
      const attacker = data.sourceId
        ? state.entityManager.getById(data.sourceId)
        : null;
      if (attacker && attacker.kind === EntityKind.MONSTER) {
        const flags = MONSTER_DEFS[(attacker as Monster).type]?.flags;
        if (flags) {
          if (flags.stunsOnHit && RNG.chance(0.5)) {
            player.slowUntilTick = state.sim.nowTick + 40; // ~2s sluggish
            alertPlayer(state, "Venom slows your movements!", player.id);
          }
          if (flags.steals) {
            stealFromPlayer(state, attacker as Monster, player, flags.steals);
          }
        }
      }
    }

    // Queue random player hit sound (using Math.random to avoid desyncing RNG)
    const hitSounds: SoundEffect[] = [
      SoundEffect.PLAYER_HIT_1,
      SoundEffect.PLAYER_HIT_2,
      SoundEffect.PLAYER_HIT_3,
      SoundEffect.PLAYER_HIT_4,
      SoundEffect.PLAYER_HIT_5,
    ];
    state.pendingSounds.push({
      effect: hitSounds[Math.floor(Math.random() * hitSounds.length)],
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

    const damageSource = data.sourceId
      ? state.entityManager.getById(data.sourceId)
      : undefined;
    if (
      monster.type === MonsterType.SNAGGLEPUSS &&
      damageSource?.kind === EntityKind.PLAYER &&
      monster.hp > 0
    ) {
      state.relationships.adjust(damageSource.id, monster.id, {
        affinity: -25,
        fear: Math.max(5, Math.ceil(data.amount * 2)),
        grievance: 20,
      });
      reconcileSnagglepussCompanion(state, monster);
    }
    if (monster.hp > 0) {
      applyDamageKnockback(state, monster, data);
      // Moppets blink away when struck.
      if (
        MONSTER_DEFS[monster.type]?.flags?.teleportsOnHit &&
        RNG.chance(0.6)
      ) {
        teleportMonsterNearby(state, monster);
      }
    }

    if (!data.suppressHitSound) {
      const mwx = monster.worldX ?? monster.gridX * CELL_CONFIG.w;
      const mwy = monster.worldY ?? monster.gridY * CELL_CONFIG.h;
      const sourceEntity = data.sourceId
        ? state.entityManager.getById(data.sourceId)
        : null;
      const monsterTileIdx = idxFor(
        monster.gridX,
        monster.gridY,
        state.mapWidth,
      );
      const sourceTileIdx = sourceEntity
        ? idxFor(sourceEntity.gridX, sourceEntity.gridY, state.mapWidth)
        : monsterTileIdx;
      const eitherVisible =
        state.visible.has(monsterTileIdx) || state.visible.has(sourceTileIdx);

      if (eitherVisible) {
        if (METAL_ROBOT_TYPES.has(monster.type)) {
          // Metal impact when a visible robot is hit.
          const metalSounds = [
            SoundEffect.HIT_METAL_1,
            SoundEffect.HIT_METAL_2,
            SoundEffect.HIT_METAL_3,
            SoundEffect.HIT_METAL_4,
          ];
          state.pendingSounds.push({
            effect: metalSounds[Math.floor(Math.random() * metalSounds.length)],
            worldX: mwx,
            worldY: mwy,
          });
        } else {
          // Random flesh impact when an organic monster is visibly hit.
          const fleshHitSounds = [
            SoundEffect.HIT_FLESH_1,
            SoundEffect.HIT_FLESH_2,
            SoundEffect.HIT_FLESH_3,
            SoundEffect.HIT_FLESH_4,
            SoundEffect.HIT_FLESH_5,
          ];
          state.pendingSounds.push({
            effect:
              fleshHitSounds[Math.floor(Math.random() * fleshHitSounds.length)],
            worldX: mwx,
            worldY: mwy,
          });
        }
      } else {
        // Neither combatant is visible — silent, occasional distant fighting sound
        if (RNG.chance(0.2)) {
          state.pendingSounds.push({
            effect: SoundEffect.FIGHT,
            worldX: mwx,
            worldY: mwy,
          });
        }
      }
    }

    // Utility bot fights back when attacked
    if (
      monster.type === MonsterType.UTILITY_BOT &&
      data.sourceId &&
      monster.hp > 0
    ) {
      const attacker = state.entities.find(
        (e) => e.id === data.sourceId,
      ) as any;
      if (attacker) {
        monster.alertLevel = 100;
        monster.lastAttackerId = data.sourceId;
        monster.lastKnownPlayerX =
          attacker.worldX ?? attacker.gridX * CELL_CONFIG.w;
        monster.lastKnownPlayerY =
          attacker.worldY ?? attacker.gridY * CELL_CONFIG.h;
      }
    }

    // Regular monster fights back when hit by another monster
    if (
      monster.type !== MonsterType.UTILITY_BOT &&
      data.sourceId &&
      monster.hp > 0
    ) {
      const attacker = state.entityManager.getById(data.sourceId);
      if (attacker?.kind === EntityKind.MONSTER) {
        monster.alertLevel = Math.max(monster.alertLevel ?? 0, 60);
        monster.lastAttackerId = data.sourceId;
        monster.lastKnownPlayerX =
          attacker.worldX ?? attacker.gridX * CELL_CONFIG.w;
        monster.lastKnownPlayerY =
          attacker.worldY ?? attacker.gridY * CELL_CONFIG.h;
      }
    }

    // Civilian work is interrupted by danger, but occupation remains intact.
    if (
      monster.occupation?.type === "builder" &&
      damageSource &&
      monster.hp > 0
    ) {
      monster.alertLevel = Math.max(monster.alertLevel ?? 0, 100);
      monster.lastAttackerId = damageSource.id;
      monster.lastKnownPlayerX = damageSource.worldX;
      monster.lastKnownPlayerY = damageSource.worldY;
      if (monster.agent) monster.agent.nextDecisionTick = state.sim.nowTick;
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
    state.holeCreatedTiles?.has(
      idxFor(target.gridX, target.gridY, state.mapWidth),
    )
  ) {
    return;
  }

  const length = Math.sqrt(
    data.knockbackX * data.knockbackX + data.knockbackY * data.knockbackY,
  );
  if (length <= 0.001) return;

  const unitX = data.knockbackX / length;
  const unitY = data.knockbackY / length;
  target.prevWorldX = target.worldX;
  target.prevWorldY = target.worldY;

  // Sweep toward the knockback target in small steps and stop at the last
  // passable position, so a hit never shoves an actor inside a wall (where the
  // collision solver would otherwise leave it stuck and jittering).
  const startX = target.worldX;
  const startY = target.worldY;
  const steps = Math.max(1, Math.ceil(data.knockbackDistance / 4));
  for (let i = 1; i <= steps; i++) {
    const t = (data.knockbackDistance * i) / steps;
    const candX = startX + unitX * t;
    const candY = startY + unitY * t;
    const gx = Math.floor(candX / CELL_CONFIG.w);
    const gy = Math.floor(candY / CELL_CONFIG.h);
    if (!state.tiles.passable(gx, gy)) break;
    const previousGridX = Math.floor(target.worldX / CELL_CONFIG.w);
    const previousGridY = Math.floor(target.worldY / CELL_CONFIG.h);
    if (
      (gx !== previousGridX || gy !== previousGridY) &&
      !state.tiles.canTraverse(previousGridX, previousGridY, gx, gy)
    ) {
      break;
    }
    target.worldX = candX;
    target.worldY = candY;
  }

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
    const dx = entity.worldX - worldX;
    const dy = entity.worldY - worldY;
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
      explosive.worldX,
      explosive.worldY,
      explosive.type,
      event.id,
    );
    state.entityManager.destroy(explosive.id);
  }

  for (const item of itemsToTrigger) {
    triggerExplosion(
      state,
      item.worldX,
      item.worldY,
      item.type as ItemType.GRENADE | ItemType.LAND_MINE,
      event.id,
    );
    state.entityManager.destroy(item.id);
  }
}

function processDeathEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "DEATH";
    entityId: string;
    fromExplosion?: boolean;
    sourceId?: string;
  };
  const entity = state.entityManager.getById(data.entityId);
  if (!entity) return;

  if (entity.kind === EntityKind.MONSTER) {
    const monster = entity as Monster;
    if (!monster.carriedItems) {
      monster.carriedItems = [];
    }

    // Organic monsters vocalize on death; robots do not scream.
    if (!METAL_ROBOT_TYPES.has(monster.type)) {
      const deathSounds = [
        SoundEffect.MONSTER_DEATH_1,
        SoundEffect.MONSTER_DEATH_2,
        SoundEffect.MONSTER_DEATH_3,
        SoundEffect.MONSTER_DEATH_4,
      ];
      const mwx = monster.worldX ?? monster.gridX * CELL_CONFIG.w;
      const mwy = monster.worldY ?? monster.gridY * CELL_CONFIG.h;
      state.pendingSounds.push({
        effect: deathSounds[Math.floor(Math.random() * deathSounds.length)],
        worldX: mwx,
        worldY: mwy,
      });
    }

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

    // Flutterbangs (and any "explodes" creature) detonate like a grenade on
    // death — unless they already died from an explosion (avoid recursion).
    if (MONSTER_DEFS[monster.type]?.flags?.explodes && !data.fromExplosion) {
      triggerExplosion(
        state,
        monster.worldX,
        monster.worldY,
        ItemType.GRENADE,
        event.id,
      );
    }

    // Drop loot, scattered slightly around the defeated monster so individual
    // items are visible and reachable by magnetic auto-pickup.
    const baseX =
      monster.worldX ?? monster.gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const baseY =
      monster.worldY ?? monster.gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    const dropItem = (
      type: ItemType,
      opts?: { amount?: number; heal?: number },
    ): void => {
      const item = new ItemEntity(monster.gridX, monster.gridY, type);
      if (typeof opts?.amount === "number") item.amount = opts.amount;
      if (typeof opts?.heal === "number") item.heal = opts.heal;
      // Scatter within ~6–16px using the deterministic RNG.
      const ang = (RNG.int(360) * Math.PI) / 180;
      const r = 6 + RNG.int(11);
      item.worldX = baseX + Math.cos(ang) * r;
      item.worldY = baseY + Math.sin(ang) * r;
      item.prevWorldX = item.worldX;
      item.prevWorldY = item.worldY;
      state.entityManager.spawn(item);
    };

    if (monster.grenades > 0 || monster.landMines > 0) {
      const spawnExplosive = (
        type: ItemType.GRENADE | ItemType.LAND_MINE,
        count: number,
      ) => {
        for (let i = 0; i < count; i++) {
          if (data.fromExplosion) {
            triggerExplosion(
              state,
              monster.worldX,
              monster.worldY,
              type,
              event.cause,
            );
          } else {
            dropItem(type);
          }
        }
      };

      spawnExplosive(ItemType.GRENADE, monster.grenades);
      spawnExplosive(ItemType.LAND_MINE, monster.landMines);
    }

    if (monster.bullets > 0) {
      dropItem(ItemType.AMMO, { amount: monster.bullets });
    }

    if (isAdaptiveWeaponMonster(monster)) {
      dropItem(equippedMonsterWeaponItem(monster));
    }

    if (monster.carriedItems.length > 0) {
      for (const carried of monster.carriedItems) {
        dropItem(carried.type, { amount: carried.amount, heal: carried.heal });
      }
    }

    // Creature-specific loot table (bones, coins, metal scraps, ...).
    const lootTable = MONSTER_DEFS[monster.type]?.loot ?? [];
    for (const entry of lootTable) {
      if (RNG.chance(entry.chance)) {
        dropItem(entry.type, { amount: entry.amount });
      }
    }

    // Remove from entity list
    state.entityManager.destroy(entity.id);
  }
}

/** Remove one of a counted item from a player; clear the slot when empty. */
function takePlayerItem(player: Player, type: ItemType): void {
  const remaining = (player.itemCounts[type] ?? 0) - 1;
  if (remaining <= 0) {
    delete player.itemCounts[type];
    removeFromInventory(player, type);
  } else {
    player.itemCounts[type] = remaining;
  }
}

/**
 * A thief monster snatches money (moppet) or an item (snagglepuss) from the
 * player, stashes it, and turns to flee. Stolen loot drops when the thief dies.
 */
function stealFromPlayer(
  state: GameState,
  monster: Monster,
  player: Player,
  kind: "item" | "money",
): void {
  if (monster.fleeing) return; // one heist per encounter
  if (!monster.carriedItems) monster.carriedItems = [];

  if (kind === "money") {
    const coins = player.itemCounts[ItemType.COIN] ?? 0;
    if (coins <= 0) return;
    const taken = Math.min(coins, 1 + RNG.int(5));
    const left = coins - taken;
    if (left <= 0) {
      delete player.itemCounts[ItemType.COIN];
      removeFromInventory(player, ItemType.COIN);
    } else {
      player.itemCounts[ItemType.COIN] = left;
    }
    monster.carriedItems.push({ type: ItemType.COIN, amount: taken });
    monster.fleeing = true;
    monster.fleeingFromPlayerId = player.id;
    alertPlayer(
      state,
      `The ${monster.type} grabs ${taken} coins and bolts!`,
      player.id,
    );
    return;
  }

  // Steal a random carried item that isn't the equipped weapon or a starter.
  // Restrict to genuinely count-backed trinkets (tracked in itemCounts). Gear
  // whose authoritative state lives in dedicated fields — ammo (ammoReserve),
  // grenades, mines, keycards (keys), CTDM (hasCTDM), armor, weapons — isn't in
  // itemCounts, so takePlayerItem can't actually remove it: stealing it would
  // clear the slot while the player keeps the resource, then drop a duplicate
  // when the thief dies. Excluding it keeps theft consistent.
  const candidates = player.inventorySlots
    .map((slot, index) => ({ slot, index }))
    .filter(
      ({ slot, index }) =>
        slot.type &&
        index !== player.selectedBarSlot &&
        slot.type !== ItemType.BLACK_PILL &&
        slot.type !== ItemType.BUTCHER_KNIFE &&
        (player.itemCounts[slot.type] ?? 0) > 0,
    );
  if (candidates.length === 0) return;
  const pick = candidates[RNG.int(candidates.length)];
  const type = pick.slot.type as ItemType;
  takePlayerItem(player, type);
  monster.carriedItems.push({ type });
  monster.fleeing = true;
  monster.fleeingFromPlayerId = player.id;
  if (monster.type === MonsterType.SNAGGLEPUSS) {
    state.relationships.adjust(player.id, monster.id, {
      affinity: -15,
      grievance: 30,
    });
    reconcileSnagglepussCompanion(state, monster);
    state.pendingSounds.push({
      effect: SoundEffect.SNAGGLEPUSS_STEAL,
      worldX: monster.worldX,
      worldY: monster.worldY,
    });
  }
  alertPlayer(
    state,
    `The ${monster.type} snatches your ${itemName(type)} and scampers off!`,
    player.id,
  );
}

/** Blink a monster to a random nearby passable, unoccupied tile. */
function teleportMonsterNearby(state: GameState, monster: Monster): void {
  for (let attempt = 0; attempt < 16; attempt++) {
    const dx = RNG.int(11) - 5; // -5..+5 tiles
    const dy = RNG.int(11) - 5;
    if (Math.abs(dx) + Math.abs(dy) < 3) continue;
    const nx = monster.gridX + dx;
    const ny = monster.gridY + dy;
    if (!state.tiles.passable(nx, ny)) {
      continue;
    }
    const occupied = state.entities.some(
      (e) =>
        (e.kind === EntityKind.MONSTER || e.kind === EntityKind.PLAYER) &&
        e.gridX === nx &&
        e.gridY === ny,
    );
    if (occupied) continue;
    setPositionFromGrid(monster, nx, ny);
    monster.velocityX = 0;
    monster.velocityY = 0;
    state.pendingSounds.push({
      effect: RNG.choose([
        SoundEffect.MOPPET_TELEPORT_1,
        SoundEffect.MOPPET_TELEPORT_2,
      ]),
      worldX: monster.worldX,
      worldY: monster.worldY,
    });
    return;
  }
}

function processMessageEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "MESSAGE"; message: string };
  addStoryMessage(state.story, data.message);
}

function processDoorOpenEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "DOOR_OPEN"; x: number; y: number };
  const i = idxFor(data.x, data.y, state.mapWidth);
  const tile = state.tiles.getTile(data.x, data.y);

  if (tile === TileType.DOOR_CLOSED || tile === TileType.DOOR_LOCKED) {
    // Open the door
    setStateTileAtIndex(state, i, TileType.DOOR_OPEN);
    state.pendingSounds.push({
      effect: SoundEffect.DOOR_OPEN,
      worldX: data.x * CELL_CONFIG.w,
      worldY: data.y * CELL_CONFIG.h,
    });
    // Track tile change for physics update
    if (!state.changedTiles) state.changedTiles = new Set();
    state.changedTiles.add(i);
  } else if (tile === TileType.DOOR_OPEN) {
    // Close the door
    setStateTileAtIndex(state, i, TileType.DOOR_CLOSED);
    state.pendingSounds.push({
      effect: SoundEffect.DOOR_CLOSE,
      worldX: data.x * CELL_CONFIG.w,
      worldY: data.y * CELL_CONFIG.h,
    });
    // Track tile change for physics update
    if (!state.changedTiles) state.changedTiles = new Set();
    state.changedTiles.add(i);
  }
}

/**
 * Grant a core device (CTDM / Matter Manipulator) to a player, applying the
 * same state changes as picking it up. Returns true if newly granted (false if
 * already owned). Shared by item pickup and the workshop builder's gift so both
 * paths stay identical. Callers own the messaging.
 */
export function grantCoreDevice(player: Player, itemType: ItemType): boolean {
  if (itemType === ItemType.CTDM) {
    if (player.hasCTDM) return false;
    player.hasCTDM = true;
    player.ctdmEnabled = true;
    addToInventory(player, ItemType.CTDM);
    return true;
  }
  if (itemType === ItemType.MATTER_MANIPULATOR) {
    if (player.hasMatterManipulator) return false;
    player.hasMatterManipulator = true;
    addToInventory(player, ItemType.MATTER_MANIPULATOR);
    return true;
  }
  return false;
}

function processPickupItemEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "PICKUP_ITEM";
    actorId: string;
    itemId: string;
  };
  const actor = state.entityManager.getById(data.actorId);
  const item = state.entityManager.getById(data.itemId) as Item | undefined;

  if (!actor || !item || actor.kind !== EntityKind.PLAYER) return;

  // Machines (vending machines) are fixtures — never picked up.
  if (ITEM_DEFS[item.type]?.category === "machine") return;

  const player = actor as Player;

  switch (item.type) {
    case ItemType.MEDKIT: {
      const currentCount = player.itemCounts[ItemType.MEDKIT] ?? 0;
      const maxCarry = ITEM_DEFS[ItemType.MEDKIT].maxCarry;
      if (maxCarry !== undefined && currentCount >= maxCarry) {
        return;
      }
      if (!addToInventory(player, ItemType.MEDKIT)) {
        return;
      }
      player.itemCounts[ItemType.MEDKIT] = currentCount + 1;
      break;
    }
    case ItemType.AMMO: {
      const amount = positiveAmount(item.amount, 24);
      player.ammoReserve += amount;
      addToInventory(player, ItemType.AMMO);
      break;
    }
    case ItemType.KEYCARD:
      player.keys++;
      addToInventory(player, ItemType.KEYCARD);
      break;
    case ItemType.PISTOL:
      if (!player.inventorySlots.some((s) => s.type === ItemType.PISTOL)) {
        const added = addToInventory(
          player,
          ItemType.PISTOL,
          player.selectedBarSlot,
        );
        if (!added) {
          return;
        }
      } else {
        // Already have a pistol — convert to ammo
        player.ammoReserve += 12;
      }
      break;
    case ItemType.GRENADE: {
      const amount = positiveAmount(item.amount, 1);
      player.grenades += amount;
      addToInventory(player, ItemType.GRENADE);
      break;
    }
    case ItemType.LAND_MINE: {
      const amount = positiveAmount(item.amount, 1);
      player.landMines += amount;
      addToInventory(player, ItemType.LAND_MINE);
      break;
    }
    case ItemType.CTDM:
      if (grantCoreDevice(player, ItemType.CTDM)) {
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: {
            type: "MESSAGE",
            message: "CTDM installed. Danger now triggers time dilation.",
          },
          cause: event.id,
        });
      }
      break;
    case ItemType.MATTER_MANIPULATOR:
      if (grantCoreDevice(player, ItemType.MATTER_MANIPULATOR)) {
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: {
            type: "MESSAGE",
            message:
              "Matter Manipulator acquired. Press F to mine and place walls.",
          },
          cause: event.id,
        });
      }
      break;
    case ItemType.POWERCELL: {
      // Power cells are carried now; using one or reloading a laser spends it.
      player.itemCounts[ItemType.POWERCELL] =
        (player.itemCounts[ItemType.POWERCELL] ?? 0) + 1;
      addToInventory(player, ItemType.POWERCELL);
      break;
    }
    default: {
      // Generic collection for every other item (weapons, gear, consumables,
      // currency, junk). This is what makes new items actually land in the
      // inventory instead of vanishing.
      const def = ITEM_DEFS[item.type];
      if (STACKABLE_ITEMS_SET.has(item.type)) {
        const amt = positiveAmount(item.amount, 1);
        player.itemCounts[item.type] =
          (player.itemCounts[item.type] ?? 0) + amt;
      }

      const isWeapon =
        def?.category === "weapon-ranged" || def?.category === "weapon-melee";
      const added = addToInventory(
        player,
        item.type,
        isWeapon ? player.selectedBarSlot : -1,
      );
      if (!added) {
        return; // leave the item on the ground (don't destroy)
      }

      // New weapons enter the inventory without changing the active slot.
      if (item.type === ItemType.LASER_PISTOL && player.laserCharge <= 0) {
        // Laser pistols are found half-drained.
        player.laserCharge = Math.floor(player.laserChargeMax * 0.5);
      }

      // Armor stacks up to the best jacket worn.
      if (def?.category === "armor") {
        player.armor = Math.max(player.armor, ARMOR_PER_JACKET);
      }

      break;
    }
  }

  // Remove item
  state.entityManager.destroy(item.id);
  const coinSounds = [
    SoundEffect.COINS_1,
    SoundEffect.COINS_2,
    SoundEffect.COINS_3,
    SoundEffect.COINS_4,
  ];
  if (item.type === ItemType.COIN) {
    state.pendingSounds.push({
      effect: coinSounds[RNG.int(coinSounds.length)],
      worldX: player.worldX,
      worldY: player.worldY,
    });
  }
}

function processPlayerDeathEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "PLAYER_DEATH"; playerId: string };

  // Stop dead player's movement immediately (works for both single and multiplayer)
  const player = state.players.find((p) => p.id === data.playerId);
  if (player) {
    player.velocityX = 0;
    player.velocityY = 0;
    dropPlayerInventoryOnDeath(state, player);
  }

  alertPlayer(state, "You have died.", data.playerId);

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

  // Intentionally no time-slow / pause here. A one-shot line has no modal UI to
  // dismiss. Full authored conversations own a separate guaranteed offline
  // pause/resume path; online conversations always leave shared time running.
}

function processSignReadEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "SIGN_READ";
    playerId: string;
    signId: string;
  };
  const view = signViewForPlacement(state, data.signId);
  const player = state.players.find(
    (candidate) => candidate.id === data.playerId,
  );
  if (!view || !player) return;

  state.activeSignViews.set(player.id, view);
}
