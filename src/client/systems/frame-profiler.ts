/** Bounded presentation frame-time sampler; never changes simulation timing. */
export class FrameProfiler {
  private samples: number[] = [];
  private previous: number | undefined;
  private active = false;

  /** Record the interval between rendered frames while a sample is active. */
  public frame(now: number): void {
    if (!this.active) return;
    if (this.previous !== undefined) this.samples.push(now - this.previous);
    this.previous = now;
    if (this.samples.length >= 3600) this.active = false;
  }

  /** Start, stop, or summarize a bounded profiling session. */
  public command(action: string): string {
    if (action === "start") {
      if (this.active)
        return "Profiling is already running. Use /profile stop or status.";
      this.samples = [];
      this.previous = undefined;
      this.active = true;
      return "Profiling started (up to 3,600 frames). Close the prompt, play, then use /profile stop.";
    }
    if (action === "stop") this.active = false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    if (!sorted.length)
      return `Profiling ${this.active ? "running" : "stopped"}: no frame intervals recorded.`;
    const average =
      sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    return `Profiling ${this.active ? "running" : "stopped"}: ${sorted.length} frames; ${(1000 / average).toFixed(1)} FPS average; ${average.toFixed(2)} ms mean, ${p95.toFixed(2)} ms p95. Includes all frame delays; use /console for CPU profiling.`;
  }
}
