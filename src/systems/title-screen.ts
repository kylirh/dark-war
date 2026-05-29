/**
 * Initial lightning artwork shown before the main menu window is created.
 */
interface TitleScreenOptions {
  sfxVolume: number;
}

export class TitleScreen {
  private overlay: HTMLElement;
  private onDismiss: () => void;
  private readonly sfxVolume: number;
  private introAudio: HTMLAudioElement | null = null;
  private dismissed = false;
  private completed = false;
  private dismissHandler?: () => void;

  constructor(onDismiss: () => void, options: TitleScreenOptions) {
    this.onDismiss = onDismiss;
    this.sfxVolume = Math.max(0, Math.min(1, options.sfxVolume));
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);
    this.playIntro();

    // Dismiss on any key or click after a short grace period
    setTimeout(() => this.setupDismiss(), 800);
  }

  private createOverlay(): HTMLElement {
    const num = Math.floor(Math.random() * 7) + 1;
    const el = document.createElement("div");
    el.className = "title-screen";
    el.innerHTML = `
      <div class="title-image-frame">
        <img src="assets/img/title-${num}.png" class="title-image" alt="Dark War" />
        <div class="press-any-key">Press any key to begin</div>
      </div>
    `;
    return el;
  }

  private playIntro(): void {
    this.introAudio = new Audio("assets/sounds/intro.ogg");
    this.introAudio.volume = 0.8 * this.sfxVolume;
    this.introAudio.play().catch(() => {});
  }

  private setupDismiss(): void {
    this.dismissHandler = () => this.dismiss();
    document.addEventListener("keydown", this.dismissHandler, { once: true });
    document.addEventListener("click", this.dismissHandler, { once: true });
  }

  public dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    if (this.dismissHandler) {
      document.removeEventListener("keydown", this.dismissHandler);
      document.removeEventListener("click", this.dismissHandler);
      this.dismissHandler = undefined;
    }

    if (this.introAudio) {
      this.introAudio.pause();
      this.introAudio.src = "";
      this.introAudio = null;
    }

    const finish = (): void => {
      if (this.completed) return;
      this.completed = true;
      this.overlay.remove();
      document.documentElement.classList.remove("title-screen-active");
      document.body.classList.remove("title-screen-active");
      this.onDismiss();
    };

    this.overlay.classList.add("fade-out");
    this.overlay.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, 1000);
  }
}
