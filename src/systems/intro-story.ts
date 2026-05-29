/**
 * Skippable single-player story intro shown before starting a new game.
 */

import { Music } from "./music";

interface IntroStorySlide {
  imageSrc: string;
  text: string[];
}

const INTRO_STORY_SLIDES: IntroStorySlide[] = [
  {
    imageSrc: "assets/img/intro-1.png",
    text: [
      '"DoomsDay in the year 2000"',
      "It came in the Spring of the year of our Lord 2000 AD, the doom that mankind had justly feared for so long. Upon the once great nations of the earth rained chemical, biological, and nuclear terror so devastating in its effect, that it laid waste to every strategic, industrial, and cultural center existing on the face of the globe.",
    ],
  },
  {
    imageSrc: "assets/img/intro-2.png",
    text: [
      "Over two billion people died in the holocaust. One billion more died soon after from disease, starvation, and hopeless terror.",
    ],
  },
  {
    imageSrc: "assets/img/intro-3.png",
    text: [
      "And then came the invader. And it was not Man. Although the war had mankind's baser nature (avarice, paranoia, suspicion, fear, and the hunger for power) as its seedling, it had been nurtured by intruders from a far distant galaxy until the time proved ripe for conquest.",
      "A conquest against which no force could stand, for militant forces no longer existed in the aftermath of this terrible war. By June the last vestige of human resistance was obliterated.",
    ],
  },
  {
    imageSrc: "assets/img/intro-4.png",
    text: [
      "But yet there was hope! For small groups of individuals banded together during the successive months to carry on the struggle, to reclaim the proud but war torn world that had once been theirs.",
      "Many such bands were routed out and slaughtered by the aliens. Others flourished, silently, as they quickly rebuilt a technological foundation for a counter offensive.",
    ],
  },
  {
    imageSrc: "assets/img/intro-5.png",
    text: [
      '"Your mission, whether or not you decide to accept it..."',
      "You are a member of Operation Thunderbolt. Your mission is to recover what is believed to be a working prototype of a revolutionary leap in offensive weapons technology: an anti-matter bomb.",
      "Partially documented in a recently recovered ultra-top-secret Joint Chiefs of Staff report, its light-weight tactical design was evidently being seriously considered as a means of defeating the alien invaders, irrespective of the toll in human life, just three days before the Cheyenne Mountain stronghold was vaporized.",
    ],
  },
  {
    imageSrc: "assets/img/intro-6.png",
    text: [
      "The L.A.M.B. (as it was known by military insiders) is thought to be secreted in the underground research labs of MegaCorp International, beneath the southern tip of the Appalachian mountains near the Tennessee / Georgia border.",
      "Find it and return to Nova Base Alpha - a QuickLift will zone you in as you exit the MegaCorp facility. Our fabrication units will be standing by.",
    ],
  },
  {
    imageSrc: "assets/img/intro-7.png",
    text: [
      "You MUST succeed in this mission!!! The aliens have begun a comprehensive campaign to destroy all of our remaining rebel bases.",
      "But under no, repeat NO circumstances are you to permit yourself, or any of your squad, to be captured for interrogation. Each of you will be given a small black pill.",
    ],
  },
  {
    imageSrc: "assets/img/intro-8.png",
    text: [
      '"Unfortunately, you encounter an enemy patrol en route..."',
      "...and only YOU survived. Retreating with your life, and little else, you barely manage to locate the shattered remains of the research lab.",
      "After several days of harried investigation, with interludes of hunting for food and avoiding predators that hunted YOU as food, you finally dig your way into the basement complex ... and discover that it is inhabited!",
    ],
  },
  {
    imageSrc: "assets/img/intro-9.png",
    text: [
      "All manner of strangely mutated creatures live within the sheltering ruin, creatures distorted by the gene-wrenching effects of the war, and creatures brought to Earth by the alien invaders.",
      "And as you begin your perilous journey downward, you soon begin to see signs of recent exploration by sentient creatures, and begin to suspect that here, too, the aliens have come - with their ubiquitous metal servants.",
    ],
  },
  {
    imageSrc: "assets/img/intro-9.png",
    text: [
      "Then you find the message. Scrawled with grime and blood across a section of flooring by an unsteady hand are words that tell you all too clearly that the invader is here:",
      "Beware of the Zyths!!!",
    ],
  },
];

/**
 * Full-window story viewer for the single-player intro sequence.
 */
export class IntroStory {
  private readonly overlay: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly text: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly hadModalOpenClass: boolean;
  private slideIndex = 0;
  private isDisposed = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.complete();
      return;
    }

    if (
      event.key === "ArrowRight" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.next();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      this.previous();
    }
  };

  constructor(private readonly onComplete: () => void) {
    Music.setScene("intro-story");
    Music.play();
    this.hadModalOpenClass = document.body.classList.contains("imb-modal-open");
    this.overlay = document.createElement("div");
    this.overlay.className = "intro-story-overlay";
    this.overlay.innerHTML = `
      <section class="intro-story-window" role="dialog" aria-modal="true" aria-labelledby="intro-story-title">
        <h1 id="intro-story-title" class="intro-story-heading">Mission Briefing</h1>
        <div class="intro-story-body">
          <figure class="intro-story-figure">
            <img class="intro-story-image" alt="" />
            <figcaption class="intro-story-text"></figcaption>
          </figure>
          <div class="intro-story-footer">
            <button class="imb-btn intro-story-prev" type="button">Back</button>
            <span class="intro-story-counter" aria-live="polite"></span>
            <div class="intro-story-actions">
              <button class="imb-btn intro-story-skip" type="button">Skip</button>
              <button class="imb-btn intro-story-next" type="button">Next</button>
            </div>
          </div>
        </div>
      </section>
    `;

    this.image = this.overlay.querySelector(
      ".intro-story-image",
    ) as HTMLImageElement;
    this.text = this.overlay.querySelector(".intro-story-text") as HTMLElement;
    this.counter = this.overlay.querySelector(
      ".intro-story-counter",
    ) as HTMLElement;
    this.prevButton = this.overlay.querySelector(
      ".intro-story-prev",
    ) as HTMLButtonElement;
    this.nextButton = this.overlay.querySelector(
      ".intro-story-next",
    ) as HTMLButtonElement;
    this.skipButton = this.overlay.querySelector(
      ".intro-story-skip",
    ) as HTMLButtonElement;

    this.prevButton.addEventListener("click", () => this.previous());
    this.nextButton.addEventListener("click", () => this.next());
    this.skipButton.addEventListener("click", () => this.complete());
    window.addEventListener("keydown", this.onKeyDown);

    document.body.appendChild(this.overlay);
    document.body.classList.add("intro-story-active", "imb-modal-open");
    this.renderSlide();
    this.nextButton.focus();
  }

  private previous(): void {
    if (this.slideIndex <= 0) return;
    this.slideIndex -= 1;
    this.renderSlide();
  }

  private next(): void {
    if (this.slideIndex >= INTRO_STORY_SLIDES.length - 1) {
      this.complete();
      return;
    }

    this.slideIndex += 1;
    this.renderSlide();
  }

  private renderSlide(): void {
    const slide = INTRO_STORY_SLIDES[this.slideIndex];
    this.image.src = slide.imageSrc;
    this.image.alt = `Mission briefing illustration ${this.slideIndex + 1}`;
    this.text.innerHTML = slide.text
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
    this.counter.textContent = `${this.slideIndex + 1} / ${INTRO_STORY_SLIDES.length}`;
    this.prevButton.disabled = this.slideIndex === 0;
    this.nextButton.textContent =
      this.slideIndex === INTRO_STORY_SLIDES.length - 1
        ? "Start Mission"
        : "Next";
  }

  private complete(): void {
    this.dispose();
    this.onComplete();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    this.overlay.remove();
    document.body.classList.remove("intro-story-active");
    if (!this.hadModalOpenClass)
      document.body.classList.remove("imb-modal-open");
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
