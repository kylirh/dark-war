import { describe, expect, it } from "vitest";
import { ItemType } from "../../engine/types";
import { getSlotActions, getSlotLabel } from "../../engine/utils/inventory";
import { renderInventoryTooltipHtml } from "./inventory-bar";

/**
 * `renderInventoryTooltipHtml` is the single copy of the slot-tooltip markup,
 * shared by the hot bar and the character modal. Both call sites derive its
 * arguments the same way — `getSlotLabel`, `getSlotDisplayCount`,
 * `getSlotActions` and the slot's own `ItemType` — so the cases below feed it
 * the real values for a slot rather than invented ones.
 *
 * Two of its three decisions are invisible from the call sites and neither is
 * covered: a count of zero is still shown, and only a CTDM slot gets a status
 * row.
 */
describe("renderInventoryTooltipHtml", () => {
  it("keeps a zero count visible", () => {
    // The guard is an explicit null/undefined check rather than truthiness,
    // which is what an empty pistol depends on: `getSlotDisplayCount` returns
    // `player.ammo`, and 0 is exactly when the player needs to be told.
    const html = renderInventoryTooltipHtml(
      getSlotLabel(ItemType.PISTOL),
      0,
      ItemType.PISTOL,
      getSlotActions(ItemType.PISTOL),
      false,
    );

    expect(html).toContain('<div class="inv-tip-count">Count: 0</div>');
  });

  it("omits the count row when the slot has no count", () => {
    // `getSlotDisplayCount` returns null for a non-stackable misc item, and
    // for the CTDM, which is why the row has to be omitted rather than zeroed.
    const html = renderInventoryTooltipHtml(
      getSlotLabel(ItemType.BUTCHER_KNIFE),
      null,
      ItemType.BUTCHER_KNIFE,
      getSlotActions(ItemType.BUTCHER_KNIFE),
      false,
    );

    expect(html).toBe('<div class="inv-tip-name">Butcher Knife</div>');
  });

  it("reports the ctdm toggle state on the ctdm slot", () => {
    const on = renderInventoryTooltipHtml(
      getSlotLabel(ItemType.CTDM),
      null,
      ItemType.CTDM,
      getSlotActions(ItemType.CTDM),
      true,
    );
    const off = renderInventoryTooltipHtml(
      getSlotLabel(ItemType.CTDM),
      null,
      ItemType.CTDM,
      getSlotActions(ItemType.CTDM),
      false,
    );

    expect(on).toContain('<div class="inv-tip-count">Status: ON</div>');
    expect(off).toContain('<div class="inv-tip-count">Status: OFF</div>');
    expect(on).toContain(
      '<div class="inv-tip-actions">Toggle time dilation (C)</div>',
    );
  });

  it("leaves the status row off every other slot", () => {
    // `ctdmEnabled` is read from the player, so it is true for every slot
    // once the device is on. Only the CTDM's own slot may report it.
    const html = renderInventoryTooltipHtml(
      getSlotLabel(ItemType.GRENADE),
      3,
      ItemType.GRENADE,
      getSlotActions(ItemType.GRENADE),
      true,
    );

    expect(html).not.toContain("Status:");
    expect(html).toContain('<div class="inv-tip-count">Count: 3</div>');
  });

  it("joins multiple actions with a line break", () => {
    const actions = getSlotActions(ItemType.GRENADE);
    expect(actions).toHaveLength(2);

    const html = renderInventoryTooltipHtml(
      getSlotLabel(ItemType.GRENADE),
      3,
      ItemType.GRENADE,
      actions,
      false,
    );

    expect(html).toContain(
      '<div class="inv-tip-actions">Select (click)<br>Throw (left-click)</div>',
    );
  });
});
