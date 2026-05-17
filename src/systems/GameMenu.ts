import { Sound } from "./Sound";
import { Music } from "./Music";

export class GameMenu {
  private soundDialog: HTMLElement | null = null;
  private aboutDialog: HTMLElement | null = null;

  constructor() {
    this.injectHTML();
    this.attachListeners();
  }

  private injectHTML(): void {
    // Sound dialog
    const soundDlg = document.createElement("div");
    soundDlg.id = "sound-dialog";
    soundDlg.className = "imb-dialog hidden";
    soundDlg.innerHTML = `
      <div class="imb-dialog-titlebar">
        <button class="imb-dialog-close" data-close="sound-dialog">&#x2715;</button>
        <span class="imb-dialog-title">Sound Settings</span>
      </div>
      <div class="imb-dialog-body">
        <div class="imb-slider-row">
          <label>Sound Effects</label>
          <input type="range" id="sfx-volume" min="0" max="100" value="50" />
          <span class="imb-slider-val" id="sfx-vol-label">50%</span>
        </div>
        <div class="imb-slider-row">
          <label>Music</label>
          <input type="range" id="music-volume" min="0" max="100" value="30" />
          <span class="imb-slider-val" id="music-vol-label">30%</span>
        </div>
        <div class="imb-dialog-footer">
          <button class="imb-btn" data-close="sound-dialog">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(soundDlg);
    this.soundDialog = soundDlg;

    // About dialog
    const aboutDlg = document.createElement("div");
    aboutDlg.id = "about-dialog";
    aboutDlg.className = "imb-dialog hidden";
    aboutDlg.innerHTML = `
      <div class="imb-dialog-titlebar">
        <button class="imb-dialog-close" data-close="about-dialog">&#x2715;</button>
        <span class="imb-dialog-title">About Dark War</span>
      </div>
      <div class="imb-dialog-body">
        <div class="imb-about-layout">
          <img src="assets/img/avatar.svg" class="imb-avatar" alt="Profile" />
          <div class="imb-about-text">
            <h2 class="imb-about-title">DARK WAR</h2>
            <p class="imb-about-version">Version 0.1.0 &#x2014; 2026</p>
            <div class="imb-about-sep"></div>
            <p>A roguelike remake of <em>Mission Thunderbolt</em> (1992).</p>
            <p>Featuring fluid movement, Superhot-style time mechanics,<br>
            mouse-aimed combat, and destructible environments.</p>
            <div class="imb-about-sep"></div>
            <p class="imb-about-credit">Designed &amp; developed by<br>
            <strong>Kyle Horton</strong></p>
            <p class="imb-about-small">Built with TypeScript, Pixi.js &amp; Electron.</p>
          </div>
        </div>
        <div class="imb-dialog-footer">
          <button class="imb-btn" data-close="about-dialog">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(aboutDlg);
    this.aboutDialog = aboutDlg;
  }

  private attachListeners(): void {
    window.native?.onSoundSettings?.(() => this.openSoundDialog());
    window.native?.onAbout?.(() => this.openAboutDialog());

    // Close buttons on dialogs
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.close!;
        document.getElementById(id)?.classList.add("hidden");
      });
    });

    // Sliders
    const sfxSlider = document.getElementById(
      "sfx-volume",
    ) as HTMLInputElement | null;
    const musicSlider = document.getElementById(
      "music-volume",
    ) as HTMLInputElement | null;

    if (sfxSlider) {
      sfxSlider.addEventListener("input", () => {
        const v = parseInt(sfxSlider.value) / 100;
        Sound.setVolume(v);
        const label = document.getElementById("sfx-vol-label");
        if (label) label.textContent = `${sfxSlider.value}%`;
      });
    }

    if (musicSlider) {
      musicSlider.addEventListener("input", () => {
        const v = parseInt(musicSlider.value) / 100;
        Music.setVolume(v);
        const label = document.getElementById("music-vol-label");
        if (label) label.textContent = `${musicSlider.value}%`;
      });
    }
  }

  openSoundDialog(): void {
    if (!this.soundDialog) return;

    const sfxSlider = document.getElementById(
      "sfx-volume",
    ) as HTMLInputElement | null;
    const musicSlider = document.getElementById(
      "music-volume",
    ) as HTMLInputElement | null;
    const sfxLabel = document.getElementById("sfx-vol-label");
    const musicLabel = document.getElementById("music-vol-label");

    if (sfxSlider) {
      const v = Math.round(Sound.getVolume() * 100);
      sfxSlider.value = String(v);
      if (sfxLabel) sfxLabel.textContent = `${v}%`;
    }
    if (musicSlider) {
      const v = Math.round(Music.getVolume() * 100);
      musicSlider.value = String(v);
      if (musicLabel) musicLabel.textContent = `${v}%`;
    }

    this.soundDialog.classList.remove("hidden");
  }

  openAboutDialog(): void {
    this.aboutDialog?.classList.remove("hidden");
  }
}
