import { RNG } from "../utils/RNG";

/**
 * Sound effect types available in the game
 */
export enum SoundEffect {
  DOOR_OPEN = "door-opening",
  DOOR_CLOSE = "door-closing",
  SHOOT = "gyrojet-pistol",
  HIT_MONSTER = "thunk",
  PLAYER_HIT_1 = "grunt1",
  PLAYER_HIT_2 = "grunt2",
  PLAYER_HIT_3 = "grunt3",
  PLAYER_HIT_4 = "grunt4",
  PLAYER_HIT_5 = "grunt5",
  RELOAD = "reload",
  MONSTER_DEATH = "death",
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

        // Wait for the audio to be loadable
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("canplaythrough", () => resolve(), {
            once: true,
          });
          audio.addEventListener("error", () => reject(new Error(`Failed to load ${effect}`)), {
            once: true,
          });
        });

        this.sounds.set(effect, audio);
      } catch (error) {
        console.warn(`Could not load sound effect: ${effect}`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Play a specific sound effect
   */
  public play(effect: SoundEffect): void {
    if (!this.enabled) return;

    const audio = this.sounds.get(effect);
    if (!audio) {
      console.warn(`Sound effect not loaded: ${effect}`);
      return;
    }

    // Clone the audio node to allow overlapping plays
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = this.volume;
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

    const randomHit = RNG.choose(hitSounds);
    this.play(randomHit);
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
}

// Export singleton instance
export const Sound = new SoundManager();
