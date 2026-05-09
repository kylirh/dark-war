import { Sound } from "./Sound";
import { Music } from "./Music";

type MenuCallbacks = {
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
};

export class GameMenu {
  private callbacks: MenuCallbacks;
  private soundDialog: HTMLElement | null = null;
  private aboutDialog: HTMLElement | null = null;
  private activeMenu: HTMLElement | null = null;

  constructor(callbacks: MenuCallbacks) {
    this.callbacks = callbacks;
    this.injectHTML();
    this.attachListeners();
  }

  private injectHTML(): void {
    // Menu bar
    const bar = document.createElement("div");
    bar.id = "ingame-menubar";
    bar.className = "ingame-menubar";
    bar.innerHTML = `
      <div class="imb-item imb-brand">&#9670; DARK WAR</div>
      <div class="imb-item imb-menu-root" data-menu="game">
        <span>Game</span>
        <div class="imb-dropdown" id="imb-menu-game">
          <button class="imb-action" data-action="new-game">New Game<span class="imb-shortcut">⌘N</span></button>
          <div class="imb-separator"></div>
          <button class="imb-action" data-action="save">Save<span class="imb-shortcut">⌘S</span></button>
          <button class="imb-action" data-action="load">Load<span class="imb-shortcut">⌘O</span></button>
        </div>
      </div>
      <div class="imb-item imb-menu-root" data-menu="sound">
        <span>Sound</span>
        <div class="imb-dropdown" id="imb-menu-sound">
          <button class="imb-action" data-action="sound-settings">Sound Settings...</button>
        </div>
      </div>
      <div class="imb-item imb-menu-root" data-menu="help">
        <span>Help</span>
        <div class="imb-dropdown" id="imb-menu-help">
          <button class="imb-action" data-action="about">About Dark War...</button>
        </div>
      </div>
    `;
    document.body.prepend(bar);

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
    // Menu root click — toggle dropdown
    document.querySelectorAll(".imb-menu-root").forEach((root) => {
      root.addEventListener("click", (e) => {
        e.stopPropagation();
        const el = root as HTMLElement;
        const dropdown = el.querySelector(".imb-dropdown") as HTMLElement;
        const isOpen = el.classList.contains("open");
        this.closeAllMenus();
        if (!isOpen) {
          el.classList.add("open");
          dropdown.classList.add("open");
          this.activeMenu = el;
        }
      });
    });

    // Close menus on outside click
    document.addEventListener("click", () => this.closeAllMenus());

    // Action buttons in dropdowns
    document.querySelectorAll(".imb-action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        this.closeAllMenus();
        this.handleAction(action ?? "");
      });
    });

    // Close buttons on dialogs
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.close!;
        document.getElementById(id)?.classList.add("hidden");
      });
    });

    // Sliders
    const sfxSlider = document.getElementById("sfx-volume") as HTMLInputElement;
    const musicSlider = document.getElementById(
      "music-volume",
    ) as HTMLInputElement;

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

  private closeAllMenus(): void {
    document.querySelectorAll(".imb-menu-root").forEach((r) => {
      r.classList.remove("open");
      r.querySelector(".imb-dropdown")?.classList.remove("open");
    });
    this.activeMenu = null;
  }

  private handleAction(action: string): void {
    switch (action) {
      case "new-game":
        this.callbacks.onNewGame();
        break;
      case "save":
        this.callbacks.onSave();
        break;
      case "load":
        this.callbacks.onLoad();
        break;
      case "sound-settings":
        this.openSoundDialog();
        break;
      case "about":
        this.aboutDialog?.classList.remove("hidden");
        break;
    }
  }

  private openSoundDialog(): void {
    if (!this.soundDialog) return;

    // Sync sliders to current values
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
}
