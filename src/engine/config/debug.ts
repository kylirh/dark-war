/**
 * Global game debug flag.
 * Set to true to enable debug console output across the game.
 */
export let DEBUG = false;

/**
 * Toggle debug mode at runtime.
 */
export function setDebug(value: boolean): void {
  DEBUG = value;
}
