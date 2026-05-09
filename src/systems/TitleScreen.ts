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

    // Image starts invisible; shown after canvas processing removes the
    // black background so there is no flash of the original black-bg version.
    const img = document.createElement("img");
    img.className = "title-image title-image--loading";
    img.alt = "Dark War";

    const text = document.createElement("div");
    text.className = "press-any-key";
    text.textContent = "Press any key to start...";

    el.appendChild(img);
    el.appendChild(text);

    // Load image off-screen, strip black pixels, then reveal the result
    const loader = new Image();
    loader.src = `assets/img/title-${num}.png`;
    loader.addEventListener(
      "load",
      () => {
        this.stripBlackBackground(loader)
          .then((url) => {
            img.src = url;
          })
          .catch(() => {
            // Fallback: show original (with black bg)
            img.src = loader.src;
          })
          .finally(() => {
            img.classList.remove("title-image--loading");
          });
      },
      { once: true },
    );

    return el;
  }

  /** Draws the image to an offscreen canvas and zeroes alpha on near-black pixels. */
  private stripBlackBackground(source: HTMLImageElement): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.reject(new Error("no 2d context"));

    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;

    // Threshold: treat pixels where all channels < 12 as "black background"
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 12 && data[i + 1] < 12 && data[i + 2] < 12) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(new Error("toBlob failed"));
      }, "image/png");
    });
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
