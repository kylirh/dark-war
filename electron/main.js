const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 640,
    useContentSize: true,
    backgroundColor: "#0b0e12",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "app", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Simple persistent save API — stores savegame.json in app.getPath('userData')
const SAVE_DIR = app.getPath("userData");
const SAVE_FILE = path.join(SAVE_DIR, "darkwar-save.json");

ipcMain.handle("save:write", async (_evt, dataStr) => {
  try {
    await fs.promises.mkdir(SAVE_DIR, { recursive: true });
    await fs.promises.writeFile(SAVE_FILE, dataStr, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("save:read", async () => {
  try {
    const data = await fs.promises.readFile(SAVE_FILE, "utf8");
    return { ok: true, data };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, data: null };
    return { ok: false, error: e.message };
  }
});
