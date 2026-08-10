#!/usr/bin/env node
/**
 * Launch the app in development.
 *
 * macOS needs a real app bundle for the process name, Command-Tab identity, and
 * icon to come from Dark War instead of the stock Electron runtime. The unpacked
 * directory build is fast after Electron is cached and is kept quiet here so it
 * does not obscure the game when launched from a terminal.
 */
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const packageJson = require(path.join(rootDir, "package.json"));
const appName = packageJson.productName || "Dark War";
const args = process.argv.slice(2);

function findMacApp() {
  const distDir = path.join(rootDir, "dist");
  const appBundleName = `${appName}.app`;
  const preferredDir = process.arch === "arm64" ? "mac-arm64" : "mac";
  const candidates = [
    path.join(distDir, preferredDir, appBundleName),
    ...fs
      .readdirSync(distDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"))
      .map((entry) => path.join(distDir, entry.name, appBundleName)),
  ];

  const appPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!appPath) {
    throw new Error(`Could not find ${appBundleName} in ${distDir}.`);
  }
  return appPath;
}

function buildMacApp() {
  const electronBuilderPath = path.join(
    rootDir,
    "node_modules",
    ".bin",
    "electron-builder",
  );

  try {
    execFileSync(electronBuilderPath, ["--mac", "dir", "--publish=never"], {
      cwd: rootDir,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    const details = error.stderr?.toString().trim() || error.message;
    throw new Error(`Could not build the macOS development app: ${details}`);
  }
}

function launchMacApp() {
  buildMacApp();
  const appPath = findMacApp();
  const child = spawn("open", ["-W", "-n", appPath, "--args", ...args], {
    cwd: rootDir,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

function launchElectronBinary() {
  const electronPath = require("electron");
  const child = spawn(electronPath, [rootDir, ...args], {
    cwd: rootDir,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

console.log(`▶ launching ${appName}…`);

if (process.platform === "darwin") {
  launchMacApp();
} else {
  launchElectronBinary();
}
