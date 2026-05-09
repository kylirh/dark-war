export class TitleScreen {
  private overlay: HTMLElement;
  private onDismiss: () => void;
  private introAudio: HTMLAudioElement | null = null;
  private dismissed = false;

  constructor(onDismiss: () => void) {
    this.onDismiss = onDismiss;
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
      <img src="assets/img/title-${num}.png" class="title-image" alt="Dark War" />
      <div class="press-any-key">Press any key to start...</div>
    `;
    return el;
  }

  private playIntro(): void {
    this.introAudio = new Audio("assets/sounds/intro.ogg");
    this.introAudio.volume = 0.8;
    this.introAudio.play().catch(() => {});
  }

  private setupDismiss(): void {
    const dismiss = () => this.dismiss();
    document.addEventListener("keydown", dismiss, { once: true });
    document.addEventListener("click", dismiss, { once: true });
  }

  public dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;

    if (this.introAudio) {
      this.introAudio.pause();
      this.introAudio = null;
    }

    this.overlay.classList.add("fade-out");
    this.overlay.addEventListener(
      "transitionend",
      () => {
        this.overlay.remove();
        document.documentElement.classList.remove("title-screen-active");
        document.body.classList.remove("title-screen-active");
        this.onDismiss();
      },
      { once: true },
    );
  }
}
