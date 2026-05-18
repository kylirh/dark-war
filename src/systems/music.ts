class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private volume: number = 0.3;
  private _playing: boolean = false;

  public async load(src: string): Promise<void> {
    this.audio = new Audio(src);
    this.audio.loop = true;
    this.audio.volume = this.volume;
    this.audio.preload = "auto";
  }

  public play(): void {
    if (!this.audio) return;
    this._playing = true;
    this.audio.play().catch(() => {});
  }

  public pause(): void {
    if (!this.audio) return;
    this._playing = false;
    this.audio.pause();
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this.volume;
  }

  public getVolume(): number {
    return this.volume;
  }

  public isPlaying(): boolean {
    return this._playing;
  }
}

export const Music = new MusicPlayer();
