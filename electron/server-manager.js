/**
 * Dark War LAN Multiplayer — Server Manager
 *
 * Runs in the Electron main process.
 * Manages the embedded WebSocket game server (child process)
 * and the UDP LAN discovery system.
 */

const { fork } = require("child_process");
const dgram = require("dgram");
const os = require("os");
const path = require("path");
const fs = require("fs");

// ─── Constants ──────────────────────────────────────────────────────────────────

const DISCOVERY_PORT = 7779;
const DISCOVERY_BROADCAST = "255.255.255.255";
const DISCOVERY_INTERVAL_MS = 2000;
const DISCOVERY_TTL_MS = 7000; // remove server after 7s of silence
const APP_ID = "dark-war-v1";

// ─── Local IP detection ─────────────────────────────────────────────────────────

function getLocalIps() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

// ─── Server Process Manager ─────────────────────────────────────────────────────

class ServerManager {
  constructor() {
    this._child = null;
    this._port = null;
    this._onExit = null;

    // Synchronously kill the child when this process exits (covers crashes/Ctrl+C).
    process.on("exit", () => {
      if (this._child) {
        try { this._child.kill("SIGKILL"); } catch {}
      }
    });
  }

  /**
   * Start the embedded server as a forked child process.
   * @param {number} port
   * @returns {Promise<number>} the actual port the server is listening on
   */
  start(port = 7777) {
    if (this._child) return Promise.resolve(this._port);

    return new Promise((resolve, reject) => {
      const bundlePath = this._findBundle();
      if (!bundlePath) {
        return reject(new Error("Server bundle not found. Run npm run build:server."));
      }

      const child = fork(bundlePath, [`--port=${port}`], {
        silent: true,
        env: { ...process.env, PORT: String(port) },
      });

      this._child = child;
      this._port = port;

      let started = false;
      let stderrOutput = "";

      // Watch stdout for the ready message
      child.stdout?.on("data", (data) => {
        const text = data.toString();
        process.stdout.write(`[server] ${text}`);
        if (!started && text.includes("Listening on")) {
          started = true;
          resolve(port);
        }
      });

      child.stderr?.on("data", (data) => {
        stderrOutput += data.toString();
        process.stderr.write(`[server-err] ${data}`);
      });

      child.on("exit", (code) => {
        this._child = null;
        this._port = null;
        if (!started) {
          let msg = `Server exited with code ${code} before starting`;
          if (stderrOutput.includes("EADDRINUSE")) {
            msg = `Port ${port} is already in use. Close any other Dark War instances and try again.`;
          }
          reject(new Error(msg));
        }
        if (typeof this._onExit === "function") this._onExit(code);
      });

      child.on("error", (err) => {
        this._child = null;
        this._port = null;
        if (!started) reject(err);
      });

      // Give it 5 seconds to start
      setTimeout(() => {
        if (!started) {
          this._child = null;
          this._port = null;
          try { child.kill("SIGKILL"); } catch {}
          reject(new Error("Server start timeout"));
        }
      }, 5000);
    });
  }

  stop() {
    if (!this._child) return Promise.resolve();
    return new Promise((resolve) => {
      const child = this._child;
      this._child = null;
      this._port = null;

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2000);

      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      // Ask nicely first
      try {
        child.send({ type: "shutdown" });
      } catch {
        child.kill("SIGTERM");
      }
    });
  }

  isRunning() {
    return this._child !== null && !this._child.killed;
  }

  getPort() {
    return this._port;
  }

  onExit(callback) {
    this._onExit = callback;
  }

  _findBundle() {
    // Try packaged app path first, then development path
    const candidates = [
      // Packaged: resources/app/server-bundle.js
      path.join(process.resourcesPath ?? "", "app", "server-bundle.js"),
      // Development: app/server-bundle.js relative to project root
      path.join(__dirname, "..", "app", "server-bundle.js"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
}

// ─── UDP Discovery Manager ──────────────────────────────────────────────────────

class DiscoveryManager {
  constructor() {
    this._broadcastSocket = null;
    this._broadcastTimer = null;
    this._broadcastInfo = null;

    this._listenSocket = null;
    this._discoveredServers = new Map(); // "ip:port" -> DiscoveredServer
    this._pruneTimer = null;
  }

  /**
   * Start broadcasting this server's presence over UDP.
   */
  startBroadcast(info) {
    this.stopBroadcast();
    this._broadcastInfo = info;

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("error", (err) => {
      console.error("[discovery] Broadcast error:", err.message);
      this.stopBroadcast();
    });

    socket.bind(() => {
      try {
        socket.setBroadcast(true);
      } catch {
        // May fail on some systems — try anyway
      }
      this._sendBroadcast(socket, info);
      this._broadcastTimer = setInterval(() => this._sendBroadcast(socket, info), DISCOVERY_INTERVAL_MS);
    });

    this._broadcastSocket = socket;
  }

  updateBroadcast(info) {
    this._broadcastInfo = { ...this._broadcastInfo, ...info };
    if (this._broadcastSocket) {
      this._sendBroadcast(this._broadcastSocket, this._broadcastInfo);
    }
  }

  stopBroadcast() {
    if (this._broadcastTimer) {
      clearInterval(this._broadcastTimer);
      this._broadcastTimer = null;
    }
    if (this._broadcastSocket) {
      try { this._broadcastSocket.close(); } catch {}
      this._broadcastSocket = null;
    }
    this._broadcastInfo = null;
  }

  /**
   * Start listening for other servers broadcasting on the LAN.
   */
  startListen() {
    if (this._listenSocket) return;

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("error", (err) => {
      console.error("[discovery] Listen error:", err.message);
      this.stopListen();
    });

    socket.on("message", (buf, rinfo) => {
      try {
        const msg = JSON.parse(buf.toString("utf8"));
        if (msg.app !== APP_ID) return;
        const ip = rinfo.address;
        const key = `${ip}:${msg.wsPort}`;
        this._discoveredServers.set(key, {
          ip,
          port: msg.wsPort,
          name: msg.name,
          host: msg.host,
          players: msg.players,
          maxPlayers: msg.maxPlayers ?? 4,
          phase: msg.phase ?? "lobby",
          lastSeen: Date.now(),
        });
      } catch {
        // Ignore malformed packets
      }
    });

    socket.bind(DISCOVERY_PORT, "0.0.0.0", () => {
      try { socket.setBroadcast(true); } catch {}
      try { socket.addMembership("224.0.0.251"); } catch {}
    });

    this._listenSocket = socket;
    this._pruneTimer = setInterval(() => this._pruneStale(), DISCOVERY_TTL_MS);
  }

  stopListen() {
    if (this._pruneTimer) {
      clearInterval(this._pruneTimer);
      this._pruneTimer = null;
    }
    if (this._listenSocket) {
      try { this._listenSocket.close(); } catch {}
      this._listenSocket = null;
    }
    this._discoveredServers.clear();
  }

  getServers(localIps = []) {
    this._pruneStale();
    const localIpSet = new Set(localIps);
    return Array.from(this._discoveredServers.values())
      .filter((s) => !localIpSet.has(s.ip))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _sendBroadcast(socket, info) {
    const payload = Buffer.from(JSON.stringify({
      app: APP_ID,
      name: info.name,
      host: info.host,
      wsPort: info.wsPort,
      players: info.players ?? 0,
      maxPlayers: info.maxPlayers ?? 4,
      phase: info.phase ?? "lobby",
    }), "utf8");

    socket.send(payload, 0, payload.length, DISCOVERY_PORT, DISCOVERY_BROADCAST, (err) => {
      if (err) console.error("[discovery] Send error:", err.message);
    });
  }

  _pruneStale() {
    const cutoff = Date.now() - DISCOVERY_TTL_MS;
    for (const [key, server] of this._discoveredServers) {
      if (server.lastSeen < cutoff) this._discoveredServers.delete(key);
    }
  }
}

// ─── Module exports ─────────────────────────────────────────────────────────────

module.exports = { ServerManager, DiscoveryManager, getLocalIps };
