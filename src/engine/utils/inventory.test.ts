import { describe, it, expect } from "vitest";
import { ItemType, WeaponType, Player, INVENTORY_TOTAL_SLOTS } from "../types";
import {
  isInventoryFull,
  canAddToInventory,
  addToInventory,
  removeFromInventory,
  consumeItem,
  getWeaponForSlot,
  getSlotDisplayCount,
  getSlotLabel,
  getSlotKeyLabel,
  swapInventorySlots,
  moveInventorySlot,
} from "./inventory";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    inventorySlots: Array.from({ length: INVENTORY_TOTAL_SLOTS }, () => ({
      type: null,
    })),
    ammo: 0,
    ammoReserve: 0,
    grenades: 0,
    landMines: 0,
    keys: 0,
    ...overrides,
  } as unknown as Player;
}

describe("inventory add/remove", () => {
  it("reports full only when every slot is occupied", () => {
    const player = makePlayer();
    expect(isInventoryFull(player)).toBe(false);
    player.inventorySlots.forEach((s) => (s.type = ItemType.MEDKIT));
    expect(isInventoryFull(player)).toBe(true);
  });

  it("places a non-stackable item in the first empty slot", () => {
    const player = makePlayer();
    expect(addToInventory(player, ItemType.PISTOL)).toBe(true);
    expect(player.inventorySlots[0].type).toBe(ItemType.PISTOL);
  });

  it("does not duplicate a non-stackable item already held", () => {
    const player = makePlayer();
    addToInventory(player, ItemType.PISTOL);
    expect(canAddToInventory(player, ItemType.PISTOL)).toBe(false);
    addToInventory(player, ItemType.PISTOL);
    const pistolSlots = player.inventorySlots.filter(
      (s) => s.type === ItemType.PISTOL,
    );
    expect(pistolSlots).toHaveLength(1);
  });

  it("stacks a stackable item into a single slot", () => {
    const player = makePlayer();
    addToInventory(player, ItemType.AMMO);
    addToInventory(player, ItemType.AMMO);
    const ammoSlots = player.inventorySlots.filter(
      (s) => s.type === ItemType.AMMO,
    );
    expect(ammoSlots).toHaveLength(1);
  });

  it("cannot add a non-stackable item when full", () => {
    const player = makePlayer();
    player.inventorySlots.forEach((s) => (s.type = ItemType.MEDKIT));
    expect(canAddToInventory(player, ItemType.PISTOL)).toBe(false);
    expect(addToInventory(player, ItemType.PISTOL)).toBe(false);
  });

  it("does not use an explicitly avoided empty slot", () => {
    const player = makePlayer();
    player.inventorySlots.forEach((slot) => {
      slot.type = ItemType.MEDKIT;
    });
    player.inventorySlots[0].type = null;

    expect(addToInventory(player, ItemType.PICKAXE, 0)).toBe(false);
    expect(player.inventorySlots[0].type).toBeNull();
  });

  it("removes an item by type", () => {
    const player = makePlayer();
    addToInventory(player, ItemType.PISTOL);
    removeFromInventory(player, ItemType.PISTOL);
    expect(player.inventorySlots.some((s) => s.type === ItemType.PISTOL)).toBe(
      false,
    );
  });
});

describe("consumeItem", () => {
  /** A player holding `count` of one stackable item in a single slot. */
  function playerHolding(itemType: ItemType, count: number): Player {
    const player = makePlayer({ itemCounts: { [itemType]: count } });
    addToInventory(player, itemType);
    return player;
  }

  it("spends one by default and keeps the slot while a count remains", () => {
    const player = playerHolding(ItemType.COOKIE, 3);

    consumeItem(player, ItemType.COOKIE);

    expect(player.itemCounts[ItemType.COOKIE]).toBe(2);
    expect(player.inventorySlots[0].type).toBe(ItemType.COOKIE);
  });

  it("spends an explicit amount in one call", () => {
    const player = playerHolding(ItemType.COIN, 10);

    consumeItem(player, ItemType.COIN, 4);

    expect(player.itemCounts[ItemType.COIN]).toBe(6);
    expect(player.inventorySlots[0].type).toBe(ItemType.COIN);
  });

  it("clears the count and the slot when the last one is spent", () => {
    const player = playerHolding(ItemType.COOKIE, 1);

    consumeItem(player, ItemType.COOKIE);

    expect(ItemType.COOKIE in player.itemCounts).toBe(false);
    expect(player.inventorySlots[0].type).toBeNull();
  });

  it("clears the slot rather than leaving a negative count behind", () => {
    const player = playerHolding(ItemType.COIN, 2);

    consumeItem(player, ItemType.COIN, 5);

    expect(ItemType.COIN in player.itemCounts).toBe(false);
    expect(player.inventorySlots[0].type).toBeNull();
  });
});

describe("slot queries", () => {
  it("maps weapon-bearing slots to their weapon and others to melee", () => {
    expect(getWeaponForSlot({ type: ItemType.PISTOL })).toBe(WeaponType.PISTOL);
    expect(getWeaponForSlot({ type: ItemType.GRENADE })).toBe(
      WeaponType.GRENADE,
    );
    expect(getWeaponForSlot({ type: ItemType.LAND_MINE })).toBe(
      WeaponType.LAND_MINE,
    );
    expect(getWeaponForSlot({ type: ItemType.MEDKIT })).toBe(WeaponType.MELEE);
    expect(getWeaponForSlot(null)).toBe(WeaponType.MELEE);
  });

  it("shows the relevant counter per slot type", () => {
    const player = makePlayer({
      ammo: 6,
      grenades: 3,
      keys: 2,
    } as Partial<Player>);
    player.inventorySlots[0].type = ItemType.PISTOL;
    player.inventorySlots[1].type = ItemType.GRENADE;
    player.inventorySlots[2].type = ItemType.KEYCARD;
    player.inventorySlots[3].type = ItemType.CTDM;
    expect(getSlotDisplayCount(player, 0)).toBe(6); // pistol -> ammo
    expect(getSlotDisplayCount(player, 1)).toBe(3); // grenades
    expect(getSlotDisplayCount(player, 2)).toBe(2); // keys
    expect(getSlotDisplayCount(player, 3)).toBeNull(); // CTDM has no count or meter
  });

  it("labels items and slot keys", () => {
    expect(getSlotLabel(ItemType.LAND_MINE)).toBe("Land Mine");
    expect(getSlotLabel(null)).toBe("");
    expect(getSlotKeyLabel(0)).toBe("1");
    expect(getSlotKeyLabel(9)).toBe("0");
    expect(getSlotKeyLabel(99)).toBe("");
  });
});

describe("slot movement", () => {
  it("swaps two slots", () => {
    const player = makePlayer();
    player.inventorySlots[0].type = ItemType.PISTOL;
    player.inventorySlots[5].type = ItemType.MEDKIT;
    swapInventorySlots(player, 0, 5);
    expect(player.inventorySlots[0].type).toBe(ItemType.MEDKIT);
    expect(player.inventorySlots[5].type).toBe(ItemType.PISTOL);
  });

  it("moves an item into an empty slot, leaving the source empty", () => {
    const player = makePlayer();
    player.inventorySlots[0].type = ItemType.PISTOL;
    moveInventorySlot(player, 0, 10);
    expect(player.inventorySlots[0].type).toBeNull();
    expect(player.inventorySlots[10].type).toBe(ItemType.PISTOL);
  });

  it("swaps when moving onto an occupied slot", () => {
    const player = makePlayer();
    player.inventorySlots[0].type = ItemType.PISTOL;
    player.inventorySlots[1].type = ItemType.MEDKIT;
    moveInventorySlot(player, 0, 1);
    expect(player.inventorySlots[0].type).toBe(ItemType.MEDKIT);
    expect(player.inventorySlots[1].type).toBe(ItemType.PISTOL);
  });

  it("ignores out-of-range indices", () => {
    const player = makePlayer();
    player.inventorySlots[0].type = ItemType.PISTOL;
    expect(() => moveInventorySlot(player, 0, 999)).not.toThrow();
    expect(() => swapInventorySlots(player, -1, 0)).not.toThrow();
    expect(player.inventorySlots[0].type).toBe(ItemType.PISTOL);
  });
});
