/**
 * Web `window.native` shim — the browser equivalent of the Electron preload
 * bridge (electron/preload.js). Loaded before the game bundle in the static web
 * build (apps/web). It backs saves with localStorage and stubs the things a
 * browser can't do: hosting a LAN server, UDP discovery, and OS window control.
 *
 * Joining an Internet/LAN server by address still works (that's plain WebSocket
 * in the game bundle) — only *hosting* and *auto-discovery* are unavailable.
 */
(function () {
  const SAVE_PREFIX = "dark-war:save:";
  const SLOT_COUNT = 12;

  const readSlot = (slot) => localStorage.getItem(SAVE_PREFIX + slot);

  window.native = {
    // ── Save / Load (localStorage) ───────────────────────────────────────────
    saveWrite: async (dataStr) => {
      localStorage.setItem(SAVE_PREFIX + "auto", dataStr);
      return { ok: true };
    },
    saveRead: async () => {
      const data = localStorage.getItem(SAVE_PREFIX + "auto");
      return { ok: true, data: data ?? null };
    },
    saveList: async () => {
      const saves = [];
      for (let slot = 0; slot < SLOT_COUNT; slot++) {
        const data = readSlot(slot);
        if (data) saves.push({ slot, data });
      }
      return { ok: true, saves };
    },
    saveWriteSlot: async (slot, dataStr) => {
      try {
        localStorage.setItem(SAVE_PREFIX + slot, dataStr);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    saveReadSlot: async (slot) => {
      return { ok: true, data: readSlot(slot) };
    },
    saveDeleteSlot: async (slot) => {
      localStorage.removeItem(SAVE_PREFIX + slot);
      return { ok: true };
    },

    // ── Native menu callbacks (no OS menu in the browser) ────────────────────
    onNewGame: () => {},
    onSaveGame: () => {},
    onLoadGame: () => {},
    onAboutGame: () => {},
    onSoundSettings: () => {},
    onAbout: () => {},

    // ── Window control → browser Fullscreen API / no-ops ─────────────────────
    closeWindow: () => {},
    minimizeWindow: () => {},
    toggleMaximize: () => {},
    toggleFullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    },
    setDevToolsEnabled: async () => {},
    getWindowBounds: async () => null,
    setWindowBounds: () => {},
    setGameWindowOpaque: async () => {},
    onEnterFullscreen: (cb) => {
      document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) cb();
      });
    },
    onLeaveFullscreen: (cb) => {
      document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement) cb();
      });
    },

    // ── Multiplayer hosting / LAN discovery: unavailable in a browser ────────
    serverStart: async () => ({
      ok: false,
      error:
        "Hosting a game isn't available in the web build — join a server by address.",
    }),
    serverStop: async () => ({ ok: true }),
    serverStatus: async () => ({ running: false }),
    serverGetLocalIps: async () => [],
    onServerExited: () => {},
    discoveryStartBroadcast: async () => {},
    discoveryUpdateBroadcast: async () => {},
    discoveryStopBroadcast: async () => {},
    discoveryStartListen: async () => {},
    discoveryStopListen: async () => {},
    discoveryGetServers: async () => [],
  };
})();
