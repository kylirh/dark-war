import { describe, it, expect, beforeEach } from "vitest";
import { PlayerEntity } from "../../entities/player-entity";
import { ItemType } from "../../types";
import { grantCoreDevice } from "./events";

describe("grantCoreDevice", () => {
  let player: PlayerEntity;

  beforeEach(() => {
    player = new PlayerEntity(0, 0);
  });

  it("grants CTDM if player doesn't have it", () => {
    expect(player.hasCTDM).toBe(false);
    expect(player.ctdmEnabled).toBe(false);

    const result = grantCoreDevice(player, ItemType.CTDM);

    expect(result).toBe(true);
    expect(player.hasCTDM).toBe(true);
    expect(player.ctdmEnabled).toBe(true);
    expect(player.inventorySlots.some((s) => s?.type === ItemType.CTDM)).toBe(
      true,
    );
  });

  it("does not grant CTDM if player already has it", () => {
    player.hasCTDM = true;
    player.ctdmEnabled = true;

    const result = grantCoreDevice(player, ItemType.CTDM);

    expect(result).toBe(false);
    expect(player.hasCTDM).toBe(true); // Should remain true
    // Inventory shouldn't have another CTDM added
    expect(
      player.inventorySlots.filter((s) => s?.type === ItemType.CTDM).length,
    ).toBe(0);
  });

  it("grants Matter Manipulator if player doesn't have it", () => {
    expect(player.hasMatterManipulator).toBe(false);

    const result = grantCoreDevice(player, ItemType.MATTER_MANIPULATOR);

    expect(result).toBe(true);
    expect(player.hasMatterManipulator).toBe(true);
    expect(
      player.inventorySlots.some(
        (s) => s?.type === ItemType.MATTER_MANIPULATOR,
      ),
    ).toBe(true);
  });

  it("does not grant Matter Manipulator if player already has it", () => {
    player.hasMatterManipulator = true;

    const result = grantCoreDevice(player, ItemType.MATTER_MANIPULATOR);

    expect(result).toBe(false);
    expect(player.hasMatterManipulator).toBe(true); // Should remain true
    // Inventory shouldn't have another Matter Manipulator added
    expect(
      player.inventorySlots.filter(
        (s) => s?.type === ItemType.MATTER_MANIPULATOR,
      ).length,
    ).toBe(0);
  });

  it("returns false for non-core devices", () => {
    const result = grantCoreDevice(player, ItemType.PISTOL);
    expect(result).toBe(false);
  });
});
