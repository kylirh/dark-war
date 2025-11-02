const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("native", {
  saveWrite: (dataStr) => ipcRenderer.invoke("save:write", dataStr),
  saveRead: () => ipcRenderer.invoke("save:read"),
});
