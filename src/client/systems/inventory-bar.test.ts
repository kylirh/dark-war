import { describe, expect, it } from "vitest";
import { renderInventoryTooltipHtml } from "./inventory-bar";
import { ItemType } from "../../engine/types";

describe("renderInventoryTooltipHtml", () => {
  it("renders just the label if no count, not CTDM, and no actions", () => {
    const html = renderInventoryTooltipHtml(
      "Pistol",
      null,
      ItemType.PISTOL,
      [],
      false,
    );
    expect(html).toBe('<div class="inv-tip-name">Pistol</div>');
  });

  it("escapes the label", () => {
    const html = renderInventoryTooltipHtml(
      "<Script>Bomb</Script>",
      null,
      ItemType.GRENADE,
      [],
      false,
    );
    expect(html).toBe(
      '<div class="inv-tip-name">&lt;Script&gt;Bomb&lt;/Script&gt;</div>',
    );
  });

  it("renders the count if provided (including zero)", () => {
    let html = renderInventoryTooltipHtml("Ammo", 42, ItemType.AMMO, [], false);
    expect(html).toContain('<div class="inv-tip-count">Count: 42</div>');

    html = renderInventoryTooltipHtml("Ammo", 0, ItemType.AMMO, [], false);
    expect(html).toContain('<div class="inv-tip-count">Count: 0</div>');
  });

  it("renders CTDM status if slotType is CTDM", () => {
    let html = renderInventoryTooltipHtml(
      "CTDM",
      null,
      ItemType.CTDM,
      [],
      true,
    );
    expect(html).toContain('<div class="inv-tip-count">Status: ON</div>');

    html = renderInventoryTooltipHtml("CTDM", null, ItemType.CTDM, [], false);
    expect(html).toContain('<div class="inv-tip-count">Status: OFF</div>');
  });

  it("renders and escapes actions", () => {
    const html = renderInventoryTooltipHtml(
      "Medkit",
      null,
      ItemType.MEDKIT,
      ["Use (Heal)", "Drop <item>"],
      false,
    );
    expect(html).toContain(
      '<div class="inv-tip-actions">Use (Heal)<br>Drop &lt;item&gt;</div>',
    );
  });

  it("renders a complex combination", () => {
    const html = renderInventoryTooltipHtml(
      "CTDM Module",
      1,
      ItemType.CTDM,
      ["Toggle", "Drop"],
      true,
    );
    expect(html).toBe(
      '<div class="inv-tip-name">CTDM Module</div>' +
        '<div class="inv-tip-count">Count: 1</div>' +
        '<div class="inv-tip-count">Status: ON</div>' +
        '<div class="inv-tip-actions">Toggle<br>Drop</div>',
    );
  });
});
