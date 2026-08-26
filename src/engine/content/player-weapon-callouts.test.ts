/** Tests for deterministic, weapon-aware player combat quips. */

import { describe, expect, it } from "vitest";
import { WeaponType } from "../types";
import { selectPlayerWeaponCallout } from "./player-weapon-callouts";

function collectLines(
  weapon: WeaponType,
  situation: "reloaded" | "depleted",
): { emitted: number; lines: Map<string, "speech" | "thought"> } {
  const lines = new Map<string, "speech" | "thought">();
  let emitted = 0;
  for (let index = 0; index < 4_000; index++) {
    const line = selectPlayerWeaponCallout(
      weapon,
      situation,
      `command-${index}`,
    );
    if (!line) continue;
    emitted++;
    lines.set(line.text, line.kind);
  }
  return { emitted, lines };
}

describe("selectPlayerWeaponCallout", () => {
  it("emits deterministically about half the time without gameplay RNG", () => {
    const first = collectLines(WeaponType.PISTOL, "reloaded");
    const second = collectLines(WeaponType.PISTOL, "reloaded");

    expect(second).toEqual(first);
    expect(first.emitted).toBeGreaterThan(1_800);
    expect(first.emitted).toBeLessThan(2_200);
  });

  it("combines common and ballistic reload lines", () => {
    const { lines } = collectLines(WeaponType.SHOTGUN, "reloaded");

    expect(lines).toHaveLength(11);
    expect(lines.get("Back in business.")).toBe("speech");
    expect(lines.get("RELOAD!!")).toBe("speech");
    expect(lines.has("RECHARGE!!")).toBe(false);
  });

  it("combines common and laser recharge lines", () => {
    const { lines } = collectLines(WeaponType.LASER, "reloaded");

    expect(lines).toHaveLength(12);
    expect(lines.get("Your move!")).toBe("speech");
    expect(lines.get("Hasta laser, baby.")).toBe("speech");
    expect(lines.has("Full mag!")).toBe(false);
  });

  it("uses thought bubbles only for the two authored depleted thoughts", () => {
    const { lines } = collectLines(WeaponType.PISTOL, "depleted");

    expect(lines).toHaveLength(8);
    expect(lines.get("Guess we improvise...")).toBe("thought");
    expect(lines.get("Well, that’s awkward...")).toBe("thought");
    expect(lines.get("I'm out!!")).toBe("speech");
  });

  it("adds the battery line only for a depleted laser", () => {
    const laser = collectLines(WeaponType.LASER, "depleted").lines;
    const pistol = collectLines(WeaponType.PISTOL, "depleted").lines;

    expect(laser).toHaveLength(9);
    expect(laser.get("Anyone got batteries?")).toBe("speech");
    expect(pistol.has("Anyone got batteries?")).toBe(false);
  });

  it("combines common and ballistic reload lines for SMG", () => {
    const { lines } = collectLines(WeaponType.SMG, "reloaded");

    expect(lines).toHaveLength(11);
    expect(lines.get("Back in business.")).toBe("speech");
    expect(lines.get("RELOAD!!")).toBe("speech");
    expect(lines.has("RECHARGE!!")).toBe(false);
  });

  it("does not emit reload quips for unsupported weapons", () => {
    expect(
      selectPlayerWeaponCallout(WeaponType.MELEE, "reloaded", "command"),
    ).toBeUndefined();
    expect(
      selectPlayerWeaponCallout(WeaponType.GRENADE, "reloaded", "command"),
    ).toBeUndefined();
    expect(
      selectPlayerWeaponCallout(WeaponType.LAND_MINE, "reloaded", "command"),
    ).toBeUndefined();
  });

  it("partitions every WeaponType into quipping and silent", () => {
    // Fails when a new WeaponType is added without deciding which side it is
    // on, rather than letting it default to silence unnoticed.
    const QUIPPING = new Set<WeaponType>([
      WeaponType.PISTOL,
      WeaponType.SMG,
      WeaponType.SHOTGUN,
      WeaponType.LASER,
    ]);

    for (const weapon of Object.values(WeaponType)) {
      const { emitted } = collectLines(weapon, "reloaded");
      if (QUIPPING.has(weapon)) {
        expect(emitted, `${weapon} should quip on reload`).toBeGreaterThan(0);
      } else {
        expect(emitted, `${weapon} should stay silent on reload`).toBe(0);
      }
    }
  });
});
