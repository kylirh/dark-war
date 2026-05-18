#!/usr/bin/env node

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const packageJson = require(path.join(rootDir, "package.json"));
const appName = packageJson.productName || "Dark War";
const args = process.argv.slice(2);

function run(command, commandArgs) {
  execFileSync(command, commandArgs, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

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

function launchMacApp() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  run(npx, ["electron-builder", "--mac", "dir", "--publish=never"]);

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

if (process.platform === "darwin") {
  launchMacApp();
} else {
  launchElectronBinary();
}
