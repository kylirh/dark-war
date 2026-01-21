/**
 * Fixed timestep game loop for deterministic physics and smooth rendering
 * Decouples simulation from framerate for consistent gameplay
 */

export interface GameLoopCallbacks {
  update: (dt: number) => void; // Fixed timestep physics update
  render: (alpha: number) => void; // Variable framerate rendering with interpolation
}

/**
 * GameLoop manages fixed timestep updates and variable framerate rendering
 * Uses accumulator pattern to ensure deterministic simulation
 */
export class GameLoop {
  private callbacks: GameLoopCallbacks;
  private timestep: number; // Fixed timestep in milliseconds
  private accumulator: number = 0;
  private lastTime: number = 0;
  private rafId?: number;
  private isPaused: boolean = false;

  /**
   * Create a new game loop
   * @param callbacks Update and render callbacks
   * @param timestep Fixed timestep in milliseconds (default: 16.67ms for 60Hz)
   */
  constructor(callbacks: GameLoopCallbacks, timestep: number = 1000 / 60) {
    this.callbacks = callbacks;
    this.timestep = timestep;
  }

  /**
   * Start the game loop
   */
  public start(): void {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  /**
   * Stop the game loop
   */
  public stop(): void {
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
  }

  /**
   * Pause the simulation (stops accumulator from advancing)
   */
  public pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume the simulation
   */
  public resume(): void {
    this.isPaused = false;
  }

  /**
   * Check if loop is paused
   */
  public isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Main loop function (called by requestAnimationFrame)
   */
  private loop = (currentTime: number): void => {
    this.rafId = requestAnimationFrame(this.loop);

    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Only accumulate time if not paused
    if (!this.isPaused) {
      this.accumulator += deltaTime;

      // Cap accumulator to prevent spiral of death
      if (this.accumulator > this.timestep * 10) {
        this.accumulator = this.timestep * 10;
      }

      // Update at fixed timestep
      while (this.accumulator >= this.timestep) {
        this.callbacks.update(this.timestep / 1000); // Convert to seconds
        this.accumulator -= this.timestep;
      }
    }

    // Calculate interpolation alpha (0.0 to 1.0)
    const alpha = this.accumulator / this.timestep;

    // Render with interpolation
    this.callbacks.render(alpha);
  };

  /**
   * Get current timestep in milliseconds
   */
  public getTimestep(): number {
    return this.timestep;
  }

  /**
   * Get current accumulator value (for debugging)
   */
  public getAccumulator(): number {
    return this.accumulator;
  }
}
