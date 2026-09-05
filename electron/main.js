const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const packageJson = require("../package.json");
const {
  ServerManager,
  DiscoveryManager,
  getLocalIps,
} = require("./server-manager");
const {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  isWindowBoundsVisible,
  normalizeWindowBounds,
} = require("./window-state");

const APP_NAME = packageJson.productName || "Dark War";
const APP_ICON = path.join(
  __dirname,
  "..",
  "app",
  "assets",
  "img",
  "app-icon.png",
);

process.title = APP_NAME;
app.setName(APP_NAME);
app.setAppUserModelId(packageJson.build?.appId || "com.kylir.darkwar");

// ─── Singletons ─────────────────────────────────────────────────────────────────

const serverManager = new ServerManager();
const discoveryManager = new DiscoveryManager();

// ─── Helpers ────────────────────────────────────────────────────────────────────

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
      rawKey === "name" ||
      rawKey === "skipTitle" ||
      rawKey === "terrainPrototype"
    ) {
      query[rawKey] = value;
    }
  }
  return query;
}

const MIN_WINDOW_WIDTH = 960;
const MIN_WINDOW_HEIGHT = 640;
const GAME_WINDOW_BACKGROUND = "#0f1013";
const WINDOW_STATE_FILE = path.join(
  app.getPath("userData"),
  "window-state.json",
);

let mainWindow = null;
let initialGameQuery = {};

function getEventWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function sendToCommandWindow(channel, ...args) {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  win?.webContents.send(channel, ...args);
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

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Could not read window state:", error.message);
    }
    return null;
  }
}

function writeWindowState(bounds) {
  try {
    fs.mkdirSync(path.dirname(WINDOW_STATE_FILE), { recursive: true });
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(bounds), "utf8");
  } catch (error) {
    console.warn("Could not save window state:", error.message);
  }
}

function currentWindowBounds(win) {
  if (win.isMaximized() && typeof win.getNormalBounds === "function") {
    return win.getNormalBounds();
  }
  return win.getBounds();
}

function attachWindowStatePersistence(win) {
  let saveTimer = null;

  const save = () => {
    saveTimer = null;
    if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
    writeWindowState(currentWindowBounds(win));
  };

  const scheduleSave = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 150);
  };

  win.on("move", scheduleSave);
  win.on("resize", scheduleSave);
  win.on("close", () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    save();
  });
  win.on("closed", () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
  });
}

function centerWindowOnPrimaryDisplay(win) {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea ?? display.bounds;
  const { width, height } = win.getBounds();
  const x = Math.max(
    workArea.x,
    Math.round(workArea.x + (workArea.width - width) / 2),
  );
  const y = Math.max(
    workArea.y,
    Math.round(workArea.y + (workArea.height - height) / 2),
  );
  win.setPosition(x, y);
}

function launchBoundsFor(options) {
  const explicitBounds = normalizeWindowBounds(
    options,
    MIN_WINDOW_WIDTH,
    MIN_WINDOW_HEIGHT,
  );
  const storedBounds = explicitBounds
    ? explicitBounds
    : normalizeWindowBounds(
        readWindowState(),
        MIN_WINDOW_WIDTH,
        MIN_WINDOW_HEIGHT,
      );
  const bounds = storedBounds ?? {
    width: options.width ?? DEFAULT_WINDOW_WIDTH,
    height: options.height ?? DEFAULT_WINDOW_HEIGHT,
  };
  const shouldCenter =
    !storedBounds || !isWindowBoundsVisible(bounds, screen.getAllDisplays());

  return { bounds, shouldCenter };
}

// ─── Window creation ─────────────────────────────────────────────────────────────

function createWindow(options = {}) {
  const transparentIntro = options.transparentIntro ?? true;
  const query = options.query ?? initialGameQuery;
  const { bounds, shouldCenter } = launchBoundsFor(options);
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    icon: APP_ICON,
    useContentSize: true,
    transparent: transparentIntro,
    frame: false,
    roundedCorners: false,
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

  if (shouldCenter) centerWindowOnPrimaryDisplay(win);

  mainWindow = win;
  attachWindowStatePersistence(win);
  win.setFullScreenable?.(true);

  win.on("enter-full-screen", () => sendFullscreenState(win, true));
  win.on("leave-full-screen", () => sendFullscreenState(win, false));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.loadFile(path.join(__dirname, "..", "app", "index.html"), { query });
  return win;
}

// ─── App menu ────────────────────────────────────────────────────────────────────

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
        { label: "Quit", accelerator: "CmdOrCtrl+Q", role: "quit" },
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

// ─── Window IPC ──────────────────────────────────────────────────────────────────

ipcMain.on("window:close", () => app.quit());
ipcMain.on("window:minimize", (event) => getEventWindow(event)?.minimize());
ipcMain.on("window:toggle-maximize", (event) => {
  const win = getEventWindow(event);
  if (win) toggleWindowMaximize(win);
});
ipcMain.on("window:toggle-fullscreen", (event) => {
  const win = getEventWindow(event);
  if (win) toggleWindowFullscreen(win);
});
ipcMain.handle("window:set-devtools-enabled", (event, enabled) => {
  const win = getEventWindow(event);
  if (!win) return false;
  if (enabled) {
    if (!win.webContents.isDevToolsOpened())
      win.webContents.openDevTools({ mode: "detach" });
  } else if (win.webContents.isDevToolsOpened())
    win.webContents.closeDevTools();
  return true;
});
ipcMain.handle(
  "window:get-bounds",
  (event) => getEventWindow(event)?.getBounds() ?? null,
);
ipcMain.on("window:set-bounds", (event, nextBounds) => {
  const win = getEventWindow(event);
  if (!win || isWindowFullscreen(win)) return;
  if (
    !nextBounds ||
    !Number.isFinite(nextBounds.width) ||
    !Number.isFinite(nextBounds.height)
  )
    return;
  const currentBounds = win.getBounds();
  win.setBounds({
    x: Number.isFinite(nextBounds.x)
      ? Math.round(nextBounds.x)
      : currentBounds.x,
    y: Number.isFinite(nextBounds.y)
      ? Math.round(nextBounds.y)
      : currentBounds.y,
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(nextBounds.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(nextBounds.height)),
  });
});
ipcMain.handle("window:game-ready", async (event) => {
  const win = getEventWindow(event);
  if (!win) return false;
  const bounds = win.getBounds();
  const nextQuery = { ...initialGameQuery, skipTitle: "1", showMenu: "1" };
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

// ─── Save IPC ────────────────────────────────────────────────────────────────────

const SAVE_DIR = app.getPath("userData");
const SAVE_FILE = path.join(SAVE_DIR, "darkwar-save.json");
const SAVE_SLOT_COUNT = 8;
const SAVE_SLOT_DIR = path.join(SAVE_DIR, "saves");

function isValidSaveSlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOT_COUNT;
}

function saveSlotFile(slot) {
  if (!isValidSaveSlot(slot)) {
    throw new Error("Invalid save slot.");
  }
  return path.join(SAVE_SLOT_DIR, `slot-${slot + 1}.json`);
}

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

ipcMain.handle("save:list", async () => {
  try {
    // Read every slot at once rather than awaiting them one after another;
    // Promise.all preserves order, so slots stay ascending. An empty slot is
    // ENOENT and is filtered out; any other error fails the whole listing.
    const slots = await Promise.all(
      Array.from({ length: SAVE_SLOT_COUNT }, (_unused, slot) =>
        fs.promises
          .readFile(saveSlotFile(slot), "utf8")
          .then((data) => ({ slot, data }))
          .catch((e) => {
            if (e.code === "ENOENT") return null;
            throw e;
          }),
      ),
    );
    return { ok: true, saves: slots.filter((entry) => entry !== null) };
  } catch (e) {
    return { ok: false, error: e.message, saves: [] };
  }
});

ipcMain.handle("save:write-slot", async (_evt, slot, dataStr) => {
  try {
    if (!isValidSaveSlot(slot)) {
      return { ok: false, error: "Invalid save slot." };
    }
    await fs.promises.mkdir(SAVE_SLOT_DIR, { recursive: true });
    await fs.promises.writeFile(saveSlotFile(slot), dataStr, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("save:read-slot", async (_evt, slot) => {
  try {
    if (!isValidSaveSlot(slot)) {
      return { ok: false, data: null, error: "Invalid save slot." };
    }
    const data = await fs.promises.readFile(saveSlotFile(slot), "utf8");
    return { ok: true, data };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, data: null };
    return { ok: false, data: null, error: e.message };
  }
});

ipcMain.handle("save:delete-slot", async (_evt, slot) => {
  try {
    if (!isValidSaveSlot(slot)) {
      return { ok: false, error: "Invalid save slot." };
    }
    await fs.promises.unlink(saveSlotFile(slot));
    return { ok: true };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true };
    return { ok: false, error: e.message };
  }
});

// ─── Multiplayer: server lifecycle IPC ───────────────────────────────────────────

ipcMain.handle("server:start", async (_event, port = 7777) => {
  try {
    const actualPort = await serverManager.start(port);

    // Notify renderer when server exits unexpectedly
    serverManager.onExit((code) => {
      mainWindow?.webContents.send("server:exited", { code });
    });

    return { ok: true, port: actualPort };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("server:stop", async () => {
  try {
    discoveryManager.stopBroadcast();
    await serverManager.stop();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("server:status", () => ({
  running: serverManager.isRunning(),
  port: serverManager.getPort(),
}));

ipcMain.handle("server:get-local-ips", () => getLocalIps());

// ─── Multiplayer: discovery IPC ───────────────────────────────────────────────────

ipcMain.handle("discovery:start-broadcast", (_event, info) => {
  try {
    discoveryManager.startBroadcast(info);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("discovery:update-broadcast", (_event, info) => {
  discoveryManager.updateBroadcast(info);
  return { ok: true };
});

ipcMain.handle("discovery:stop-broadcast", () => {
  discoveryManager.stopBroadcast();
  return { ok: true };
});

ipcMain.handle("discovery:start-listen", () => {
  try {
    discoveryManager.startListen();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("discovery:stop-listen", () => {
  discoveryManager.stopListen();
  return { ok: true };
});

ipcMain.handle("discovery:get-servers", () => {
  const localIps = getLocalIps();
  return discoveryManager.getServers(localIps);
});

// ─── App lifecycle ───────────────────────────────────────────────────────────────

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

app.on("window-all-closed", async () => {
  // Clean up server and discovery before quitting
  discoveryManager.stopBroadcast();
  discoveryManager.stopListen();
  await serverManager.stop().catch(() => {});
  if (process.platform !== "darwin") app.quit();
});
