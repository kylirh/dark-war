const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("native", {
  // ── Save / Load ────────────────────────────────────────────────────────────
  saveWrite: (dataStr) => ipcRenderer.invoke("save:write", dataStr),
  saveRead: () => ipcRenderer.invoke("save:read"),

  // ── Game menu callbacks ────────────────────────────────────────────────────
  onNewGame: (callback) => { ipcRenderer.on("game:new", () => callback()); },
  onSaveGame: (callback) => { ipcRenderer.on("game:save", () => callback()); },
  onLoadGame: (callback) => { ipcRenderer.on("game:load", () => callback()); },
  onAboutGame: (callback) => { ipcRenderer.on("game:about", () => callback()); },
  onSoundSettings: (callback) => { ipcRenderer.on("sound:settings", callback); },
  onAbout: (callback) => { ipcRenderer.on("help:about", callback); },

  // ── Window control ─────────────────────────────────────────────────────────
  closeWindow: () => ipcRenderer.send("window:close"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  toggleFullscreen: () => ipcRenderer.send("window:toggle-fullscreen"),
  setDevToolsEnabled: (enabled) => ipcRenderer.invoke("window:set-devtools-enabled", enabled),
  getWindowBounds: () => ipcRenderer.invoke("window:get-bounds"),
  setWindowBounds: (bounds) => ipcRenderer.send("window:set-bounds", bounds),
  setGameWindowOpaque: () => ipcRenderer.invoke("window:game-ready"),
  onEnterFullscreen: (callback) => { ipcRenderer.on("window:fullscreen-entered", callback); },
  onLeaveFullscreen: (callback) => { ipcRenderer.on("window:fullscreen-left", callback); },

  // ── Multiplayer: server lifecycle ──────────────────────────────────────────
  serverStart: (port) => ipcRenderer.invoke("server:start", port),
  serverStop: () => ipcRenderer.invoke("server:stop"),
  serverStatus: () => ipcRenderer.invoke("server:status"),
  serverGetLocalIps: () => ipcRenderer.invoke("server:get-local-ips"),
  onServerExited: (callback) => { ipcRenderer.on("server:exited", (_e, data) => callback(data)); },

  // ── Multiplayer: LAN discovery ─────────────────────────────────────────────
  discoveryStartBroadcast: (info) => ipcRenderer.invoke("discovery:start-broadcast", info),
  discoveryUpdateBroadcast: (info) => ipcRenderer.invoke("discovery:update-broadcast", info),
  discoveryStopBroadcast: () => ipcRenderer.invoke("discovery:stop-broadcast"),
  discoveryStartListen: () => ipcRenderer.invoke("discovery:start-listen"),
  discoveryStopListen: () => ipcRenderer.invoke("discovery:stop-listen"),
  discoveryGetServers: () => ipcRenderer.invoke("discovery:get-servers"),
});
