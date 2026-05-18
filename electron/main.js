const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const packageJson = require("../package.json");

const APP_NAME = packageJson.productName || "Dark War";
const APP_ICON = path.join(
  __dirname,
  "..",
  "app",
  "assets",
  "img",
  "app-icon.png",
);

app.setName(APP_NAME);
app.setAppUserModelId(packageJson.build?.appId || "com.kylir.darkwar");

function getAppIcon() {
  return nativeImage.createFromPath(APP_ICON);
}

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

const MIN_WINDOW_WIDTH = 960;
const MIN_WINDOW_HEIGHT = 640;
const GAME_WINDOW_BACKGROUND = "#0f1013";

let mainWindow = null;
let initialGameQuery = {};

function getEventWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function sendToCommandWindow(channel) {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  win?.webContents.send(channel);
}

function sendFullscreenState(win, isFullscreen) {
  win.webContents.send(
    isFullscreen ? "window:fullscreen-entered" : "window:fullscreen-left",
  );
}

function isWindowFullscreen(win) {
  return win.isFullScreen();
}

function toggleWindowFullscreen(win) {
  win.setFullScreen(!isWindowFullscreen(win));
}

function toggleWindowMaximize(win) {
  if (isWindowFullscreen(win)) return;
  if (win.isMaximized()) {
    win.unmaximize();
    return;
  }
  win.maximize();
}

function createWindow(options = {}) {
  const transparentIntro = options.transparentIntro ?? true;
  const query = options.query ?? initialGameQuery;
  const win = new BrowserWindow({
    width: options.width ?? 1440,
    height: options.height ?? 920,
    x: options.x,
    y: options.y,
    icon: APP_ICON,
    useContentSize: true,
    transparent: transparentIntro,
    frame: false, // Custom window chrome handled in renderer
    roundedCorners: false, // Sharp square corners to match retro aesthetic
    resizable: true,
    fullscreenable: true,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: transparentIntro ? "#00000000" : GAME_WINDOW_BACKGROUND,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow = win;
  win.setFullScreenable?.(true);

  win.on("enter-full-screen", () => sendFullscreenState(win, true));
  win.on("leave-full-screen", () => sendFullscreenState(win, false));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.loadFile(path.join(__dirname, "..", "app", "index.html"), { query });
  return win;
}

function createMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: "Dark War",
            submenu: [
              {
                label: `About ${APP_NAME}`,
                click: () => sendToCommandWindow("game:about"),
              },
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
          click: () => sendToCommandWindow("game:new"),
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendToCommandWindow("game:save"),
        },
        {
          label: "Load",
          accelerator: "CmdOrCtrl+O",
          click: () => sendToCommandWindow("game:load"),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          role: "quit",
        },
      ],
    },
    {
      label: "Sound",
      submenu: [
        {
          label: "Sound Settings...",
          click: () => sendToCommandWindow("sound:settings"),
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Dark War...",
          click: () => sendToCommandWindow("game:about"),
        },
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
        {
          label: "Toggle Full Screen",
          accelerator: "Ctrl+Command+F",
          click: () => {
            const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
            if (win) toggleWindowFullscreen(win);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on("window:close", () => app.quit());
ipcMain.on("window:minimize", (event) => getEventWindow(event)?.minimize());
ipcMain.on("window:toggle-maximize", (event) => {
  const win = getEventWindow(event);
  if (!win) return;
  toggleWindowMaximize(win);
});
ipcMain.on("window:toggle-fullscreen", (event) => {
  const win = getEventWindow(event);
  if (!win) return;
  toggleWindowFullscreen(win);
});
ipcMain.handle("window:get-bounds", (event) => {
  const win = getEventWindow(event);
  return win?.getBounds() ?? null;
});
ipcMain.on("window:set-bounds", (event, nextBounds) => {
  const win = getEventWindow(event);
  if (!win || isWindowFullscreen(win)) return;
  if (
    !nextBounds ||
    !Number.isFinite(nextBounds.width) ||
    !Number.isFinite(nextBounds.height)
  ) {
    return;
  }

  const currentBounds = win.getBounds();
  const width = Math.max(MIN_WINDOW_WIDTH, Math.round(nextBounds.width));
  const height = Math.max(MIN_WINDOW_HEIGHT, Math.round(nextBounds.height));
  const x = Number.isFinite(nextBounds.x)
    ? Math.round(nextBounds.x)
    : currentBounds.x;
  const y = Number.isFinite(nextBounds.y)
    ? Math.round(nextBounds.y)
    : currentBounds.y;

  win.setBounds({
    x,
    y,
    width,
    height,
  });
});
ipcMain.handle("window:game-ready", async (event) => {
  const win = getEventWindow(event);
  if (!win) return false;

  const bounds = win.getBounds();
  const nextQuery = { ...initialGameQuery, skipTitle: "1" };
  const gameWindow = createWindow({
    ...bounds,
    query: nextQuery,
    transparentIntro: false,
  });

  gameWindow.webContents.once("did-finish-load", () => {
    if (!win.isDestroyed()) win.destroy();
  });

  return true;
});

app.whenReady().then(() => {
  initialGameQuery = parseGameQueryFromArgs(process.argv.slice(1));

  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: packageJson.version,
    version: packageJson.version,
    copyright: " ",
    iconPath: APP_ICON,
  });

  if (process.platform === "darwin" && app.dock && fs.existsSync(APP_ICON)) {
    app.dock.setIcon(getAppIcon());
  }

  createMenu();
  createWindow({ query: initialGameQuery, transparentIntro: true });
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
