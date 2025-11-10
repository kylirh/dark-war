const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("native", {
  saveWrite: (dataStr) => ipcRenderer.invoke("save:write", dataStr),
  saveRead: () => ipcRenderer.invoke("save:read"),

  onNewGame: (callback) => {
    ipcRenderer.on("game:new", callback);
  },
  onSaveGame: (callback) => {
    ipcRenderer.on("game:save", callback);
  },
  onLoadGame: (callback) => {
    ipcRenderer.on("game:load", callback);
  },
});
