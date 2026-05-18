/**
 * Sound effect types available in the game
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

/**
 * Sound system manager
 * Handles loading, caching, and playing sound effects
 */
class SoundManager {
  private sounds: Map<SoundEffect, HTMLAudioElement> = new Map();
  private enabled: boolean = true;
  private volume: number = 0.5;

  /**
   * Preload all sound effects
   */
  public async preload(): Promise<void> {
    const soundEffects = Object.values(SoundEffect) as SoundEffect[];

    const loadPromises = soundEffects.map(async (effect) => {
      try {
        const audio = new Audio(`assets/sounds/${effect}.ogg`);
        audio.volume = this.volume;
        audio.preload = "auto";

        // Load metadata only (faster than waiting for full audio buffer)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            // Don't wait forever - resolve after 100ms regardless
            resolve();
          }, 100);

          audio.addEventListener(
            "loadedmetadata",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            {
              once: true,
            }
          );
          audio.addEventListener(
            "error",
            () => {
              clearTimeout(timeout);
              reject(new Error(`Failed to load ${effect}`));
            },
            {
              once: true,
            }
          );
        });

        this.sounds.set(effect, audio);
      } catch (error) {
        console.warn(`Could not load sound effect: ${effect}`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Play a specific sound effect with optional volume override
   */
  public play(effect: SoundEffect, volume?: number): void {
    if (!this.enabled) return;

    const audio = this.sounds.get(effect);
    if (!audio) {
      console.warn(`Sound effect not loaded: ${effect}`);
      return;
    }

    // Clone the audio node to allow overlapping plays
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = volume !== undefined ? Math.max(0, Math.min(1, volume)) : this.volume;

    // Clean up clone after it finishes playing to prevent memory leak
    clone.addEventListener(
      "ended",
      () => {
        clone.remove();
      },
      { once: true }
    );

    clone.play().catch((error) => {
      console.warn(`Failed to play sound effect: ${effect}`, error);
    });
  }

  /**
   * Play a random "player hit" sound effect
   */
  public playPlayerHit(): void {
    const hitSounds: SoundEffect[] = [
      SoundEffect.PLAYER_HIT_1,
      SoundEffect.PLAYER_HIT_2,
      SoundEffect.PLAYER_HIT_3,
      SoundEffect.PLAYER_HIT_4,
      SoundEffect.PLAYER_HIT_5,
    ];

    // Use Math.random instead of RNG to avoid desyncing deterministic game RNG
    const randomHit = hitSounds[Math.floor(Math.random() * hitSounds.length)];
    this.play(randomHit);
  }

  /**
   * Play a random monster hit (thunk) sound
   */
  public playHitMonster(volume?: number): void {
    const sounds: SoundEffect[] = [
      SoundEffect.HIT_MONSTER_1,
      SoundEffect.HIT_MONSTER_2,
      SoundEffect.HIT_MONSTER_3,
      SoundEffect.HIT_MONSTER_4,
      SoundEffect.HIT_MONSTER_5,
    ];
    this.play(sounds[Math.floor(Math.random() * sounds.length)], volume);
  }

  /**
   * Play a random monster death sound
   */
  public playMonsterDeath(volume?: number): void {
    const deathSounds: SoundEffect[] = [
      SoundEffect.MONSTER_DEATH_1,
      SoundEffect.MONSTER_DEATH_2,
      SoundEffect.MONSTER_DEATH_3,
      SoundEffect.MONSTER_DEATH_4,
    ];
    const pick = deathSounds[Math.floor(Math.random() * deathSounds.length)];
    this.play(pick, volume);
  }

  /**
   * Play a random bot hit (metal impact) sound
   */
  public playBotHit(volume?: number): void {
    const hitSounds: SoundEffect[] = [
      SoundEffect.HIT_METAL_1,
      SoundEffect.HIT_METAL_2,
      SoundEffect.HIT_METAL_3,
    ];
    const pick = hitSounds[Math.floor(Math.random() * hitSounds.length)];
    this.play(pick, volume);
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach((audio) => {
      audio.volume = this.volume;
    });
  }

  /**
   * Enable or disable sound effects
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get current enabled state
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current volume (0.0 to 1.0)
   */
  public getVolume(): number {
    return this.volume;
  }
}

// Export singleton instance
export const Sound = new SoundManager();
