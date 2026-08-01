/**
 * Authored player quips for successful reloads and depleted weapons.
 * Selection is stateless so presentation never consumes gameplay RNG.
 */

import { WeaponType } from "../types";

export type PlayerWeaponCalloutSituation = "reloaded" | "depleted";

export interface PlayerWeaponCalloutLine {
  kind: "speech" | "thought";
  text: string;
}

const COMMON_RELOAD_LINES: readonly PlayerWeaponCalloutLine[] = [
  { kind: "speech", text: "Come get some!" },
  { kind: "speech", text: "Coming hot in!" },
  { kind: "speech", text: "Back in business." },
  { kind: "speech", text: "Bring it." },
  { kind: "speech", text: "Your move!" },
  { kind: "speech", text: "Want an encore?" },
  { kind: "speech", text: "Round two!" },
];

const BALLISTIC_RELOAD_LINES: readonly PlayerWeaponCalloutLine[] = [
  { kind: "speech", text: "RELOAD!!" },
  { kind: "speech", text: "Lucky you I had to reload..." },
  { kind: "speech", text: "Full mag!" },
  { kind: "speech", text: "Locked and loaded!" },
];

const LASER_RELOAD_LINES: readonly PlayerWeaponCalloutLine[] = [
  { kind: "speech", text: "RECHARGE!!" },
  { kind: "speech", text: "Hasta laser, baby." },
  { kind: "speech", text: "Lucky you I had to recharge..." },
  { kind: "speech", text: "Full charge!" },
  { kind: "speech", text: "Laser's hot!" },
];

const COMMON_DEPLETED_LINES: readonly PlayerWeaponCalloutLine[] = [
  { kind: "speech", text: "I'm out!!" },
  { kind: "speech", text: "Out of thunder!" },
  { kind: "speech", text: "Uh… time out?" },
  { kind: "speech", text: "Time to get personal!" },
  { kind: "speech", text: "Fine. Old school." },
  { kind: "speech", text: "Okay… sword time." },
  { kind: "thought", text: "Guess we improvise..." },
  { kind: "thought", text: "Well, that’s awkward..." },
];

const LASER_DEPLETED_LINES: readonly PlayerWeaponCalloutLine[] = [
  { kind: "speech", text: "Anyone got batteries?" },
];

const BALLISTIC_RELOAD_POOL = [
  ...COMMON_RELOAD_LINES,
  ...BALLISTIC_RELOAD_LINES,
];
const LASER_RELOAD_POOL = [...COMMON_RELOAD_LINES, ...LASER_RELOAD_LINES];
const LASER_DEPLETED_POOL = [...COMMON_DEPLETED_LINES, ...LASER_DEPLETED_LINES];

/**
 * Returns a quip about half the time, using command identity as cosmetic
 * entropy. This avoids perturbing the deterministic gameplay RNG stream.
 */
export function selectPlayerWeaponCallout(
  weapon: WeaponType,
  situation: PlayerWeaponCalloutSituation,
  commandId: string,
): PlayerWeaponCalloutLine | undefined {
  if (!isSupportedWeapon(weapon)) return undefined;
  if (hashString(`${commandId}:${situation}:chance`) >= 0x80000000) {
    return undefined;
  }

  const lines = linesFor(weapon, situation);
  const index = hashString(`${commandId}:${situation}:line`) % lines.length;
  return lines[index];
}

function linesFor(
  weapon: WeaponType,
  situation: PlayerWeaponCalloutSituation,
): readonly PlayerWeaponCalloutLine[] {
  if (situation === "depleted") {
    return weapon === WeaponType.LASER
      ? LASER_DEPLETED_POOL
      : COMMON_DEPLETED_LINES;
  }
  return weapon === WeaponType.LASER
    ? LASER_RELOAD_POOL
    : BALLISTIC_RELOAD_POOL;
}

function isSupportedWeapon(weapon: WeaponType): boolean {
  return (
    weapon === WeaponType.PISTOL ||
    weapon === WeaponType.SMG ||
    weapon === WeaponType.SHOTGUN ||
    weapon === WeaponType.LASER
  );
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
