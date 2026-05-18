const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("native", {
  saveWrite: (dataStr) => ipcRenderer.invoke("save:write", dataStr),
  saveRead: () => ipcRenderer.invoke("save:read"),

  onNewGame: (callback) => {
    ipcRenderer.on("game:new", () => callback());
  },
  onSaveGame: (callback) => {
    ipcRenderer.on("game:save", () => callback());
  },
  onLoadGame: (callback) => {
    ipcRenderer.on("game:load", () => callback());
  },
  onAboutGame: (callback) => {
    ipcRenderer.on("game:about", () => callback());
  },
  onSoundSettings: (callback) => {
    ipcRenderer.on("sound:settings", callback);
  },
  onAbout: (callback) => {
    ipcRenderer.on("help:about", callback);
  },

  closeWindow: () => ipcRenderer.send("window:close"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  toggleFullscreen: () => ipcRenderer.send("window:toggle-fullscreen"),
  setDevToolsEnabled: (enabled) =>
    ipcRenderer.invoke("window:set-devtools-enabled", enabled),
  getWindowBounds: () => ipcRenderer.invoke("window:get-bounds"),
  setWindowBounds: (bounds) => ipcRenderer.send("window:set-bounds", bounds),
  setGameWindowOpaque: () => ipcRenderer.invoke("window:game-ready"),
  onEnterFullscreen: (callback) => {
    ipcRenderer.on("window:fullscreen-entered", callback);
  },
  onLeaveFullscreen: (callback) => {
    ipcRenderer.on("window:fullscreen-left", callback);
  },
});
