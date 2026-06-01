/**
 * Sound effect identifiers — pure data, safe for the engine to reference when
 * queuing `pendingSounds`. The DOM playback layer (`src/systems/sound.ts`) maps
 * these to audio files. Kept out of that module so engine code never imports a
 * browser/DOM dependency (see docs/ARCHITECTURE.md, engine-purity rule).
 */
export enum SoundEffect {
  DOOR_OPEN = "door-opening",
  DOOR_CLOSE = "door-closing",
  SHOOT = "gyrojet-pistol",
  HIT_MONSTER_1 = "thunk-1",
  HIT_MONSTER_2 = "thunk-2",
  HIT_MONSTER_3 = "thunk-3",
  HIT_MONSTER_4 = "thunk-4",
  HIT_MONSTER_5 = "thunk-5",
  HIT_METAL_1 = "hit-metal-1",
  HIT_METAL_2 = "hit-metal-2",
  HIT_METAL_3 = "hit-metal-3",
  PLAYER_HIT_1 = "grunt1",
  PLAYER_HIT_2 = "grunt2",
  PLAYER_HIT_3 = "grunt3",
  PLAYER_HIT_4 = "grunt4",
  PLAYER_HIT_5 = "grunt5",
  RELOAD = "reload",
  MONSTER_DEATH_1 = "death-1",
  MONSTER_DEATH_2 = "death-2",
  MONSTER_DEATH_3 = "death-3",
  MONSTER_DEATH_4 = "death-4",
  EXPLOSION = "explosion",
  LEVEL_EXPLORED = "level-explored",
  REPAIR = "repair",
  REPAIR_HOLE = "repair-hole",
  FIGHTING = "fighting",
  BEEP = "beep",
}
