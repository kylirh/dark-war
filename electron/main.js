const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

function parseGameQueryFromArgs(argv) {
  const query = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    let rawKey = "";
    let value = "";

    if (arg.includes("=")) {
      const [keyPart, ...valueParts] = arg.slice(2).split("=");
      rawKey = keyPart;
      value = valueParts.join("=");
    } else {
      rawKey = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        value = next;
        i++;
      }
    }

    if (!rawKey) continue;
    value = value.trim();
    if (!value) continue;

    if (
      rawKey === "mode" ||
      rawKey === "server" ||
      rawKey === "room" ||
      rawKey === "name"
    ) {
      query[rawKey] = value;
    }
  }
  return query;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    useContentSize: true,
    backgroundColor: "#000000",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const query = parseGameQueryFromArgs(process.argv.slice(1));
  win.loadFile(path.join(__dirname, "..", "app", "index.html"), { query });
  return win;
}

function createMenu() {
  const isMac = process.platform === "darwin";

  // Get the focused window for IPC communication
  const getWindow = () => BrowserWindow.getFocusedWindow();

  const template = [
    // macOS app menu (first menu shows app name)
    ...(isMac
      ? [
          {
            label: "Dark War",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Game",
      submenu: [
        {
          label: "New Game",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            const win = getWindow();
            if (win) win.webContents.send("game:new");
          },
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            const win = getWindow();
            if (win) win.webContents.send("game:save");
          },
        },
        {
          label: "Load",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            const win = getWindow();
            if (win) win.webContents.send("game:load");
          },
        },
        ...(!isMac
          ? [
              { type: "separator" },
              {
                label: "Quit",
                accelerator: "CmdOrCtrl+Q",
                role: "quit",
              },
            ]
          : []),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createMenu();
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
