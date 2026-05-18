import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { Game } from "../src/core/Game";
import { Physics } from "../src/systems/Physics";
import { enqueueCommand, SIM_DT_MS, stepSimulationTick } from "../src/systems/Simulation";
import { Sound } from "../src/systems/Sound";
import { CommandType, EntityKind, SLOWMO_SCALE, TIME_SCALE_TRANSITION_SPEED, WeaponType } from "../src/types";

// ─── Protocol types ────────────────────────────────────────────────────────────

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
}

type RoomPhase = "lobby" | "playing";

type IncomingAction =
  | { type: "FIRE"; dx: number; dy: number; facingAngle?: number; targetWorldX?: number; targetWorldY?: number }
  | { type: "INTERACT"; dx: number; dy: number }
  | { type: "PICKUP" }
  | { type: "RELOAD" }
  | { type: "WAIT" }
  | { type: "DESCEND" }
  | { type: "ASCEND" }
  | { type: "TOGGLE_GOD_MODE" };

type IncomingMessage2 =
  | { type: "velocity"; vx: number; vy: number }
  | { type: "action"; action: IncomingAction }
  | { type: "select_weapon"; slot: number }
  | { type: "new_game" }
  | { type: "start_game" }
  | { type: "set_name"; name: string };

interface RoomClient {
  socket: WebSocket;
  playerId: string;
  name: string;
}

// ─── Validation helpers ────────────────────────────────────────────────────────

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function toCardinalStep(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < -1 || rounded > 1) return null;
  return rounded;
}

// ─── Room session ──────────────────────────────────────────────────────────────

class RoomSession {
  private readonly id: string;
  private readonly game: Game;
  private readonly physics: Physics;
  private readonly clients = new Map<WebSocket, RoomClient>();
  private readonly closeRoom: (roomId: string) => void;
  private tickHandle: NodeJS.Timeout | null = null;
  private placeholderPlayerId: string;
  private playerActedThisTick = false;
  private phase: RoomPhase = "lobby";
  private hostPlayerId: string | null = null;

  constructor(id: string, closeRoom: (roomId: string) => void) {
    this.id = id;
    this.closeRoom = closeRoom;
    this.game = new Game({ mode: "online" });
    this.game.reset(0);
    this.placeholderPlayerId = this.game.getState().player.id;
    this.physics = new Physics();
    this.rebuildPhysics();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  public getInfo(): { roomId: string; phase: RoomPhase; players: LobbyPlayer[]; version: number } {
    return {
      roomId: this.id,
      phase: this.phase,
      players: this.getLobbyPlayers(),
      version: 1,
    };
  }

  public addClient(socket: WebSocket, name: string): void {
    const playerId = crypto.randomUUID();
    const wasEmpty = this.clients.size === 0;
    const client: RoomClient = { socket, playerId, name };
    this.clients.set(socket, client);

    if (wasEmpty) {
      this.hostPlayerId = playerId;
      this.game.removeNetworkPlayer(this.placeholderPlayerId);
    }

    // In lobby: track players but don't add to game yet
    // In playing: add to game immediately
    if (this.phase === "playing") {
      this.game.addNetworkPlayer(playerId);
    }

    this.send(socket, {
      type: "welcome",
      playerId,
      roomId: this.id,
      isHost: playerId === this.hostPlayerId,
    });

    this.broadcastLobbyUpdate();
    this.game.addLog(`${name} joined room ${this.id}.`);
  }

  public removeClient(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;

    this.clients.delete(socket);

    if (this.phase === "playing") {
      this.game.removeNetworkPlayer(client.playerId);
    }

    // Transfer host if needed
    if (client.playerId === this.hostPlayerId && this.clients.size > 0) {
      const nextClient = this.clients.values().next().value;
      if (nextClient) {
        this.hostPlayerId = nextClient.playerId;
      }
    }

    this.game.addLog(`${client.name} left room ${this.id}.`);

    if (this.clients.size === 0) {
      if (this.tickHandle) {
        clearInterval(this.tickHandle);
        this.tickHandle = null;
      }
      this.closeRoom(this.id);
      return;
    }

    this.broadcastLobbyUpdate();
    if (this.phase === "playing") {
      this.broadcastState();
    }
  }

  public handleMessage(socket: WebSocket, rawMessage: RawData): void {
    const client = this.clients.get(socket);
    if (!client) return;

    const text = rawMessageToString(rawMessage);
    let message: IncomingMessage2;
    try {
      message = JSON.parse(text) as IncomingMessage2;
    } catch {
      this.send(socket, { type: "error", message: "Invalid payload." });
      return;
    }

    if (message.type === "set_name") {
      const cleaned = sanitizePlayerName(message.name);
      if (cleaned) client.name = cleaned;
      this.broadcastLobbyUpdate();
      return;
    }

    if (message.type === "start_game") {
      if (client.playerId === this.hostPlayerId && this.phase === "lobby") {
        this.startGame();
      }
      return;
    }

    if (this.phase !== "playing") return;

    if (message.type === "velocity") {
      this.applyVelocity(client.playerId, message.vx, message.vy);
      return;
    }
    if (message.type === "action") {
      this.applyAction(client.playerId, message.action);
      return;
    }
    if (message.type === "select_weapon") {
      this.applyWeaponSelection(client.playerId, message.slot);
      return;
    }
    if (message.type === "new_game") {
      this.resetRoomState();
    }
  }

  // ── Private: phase management ───────────────────────────────────────────────

  private startGame(): void {
    this.phase = "playing";

    // Add all lobby clients to the game
    const clientList = Array.from(this.clients.values());
    for (const client of clientList) {
      this.game.addNetworkPlayer(client.playerId);
    }

    // Broadcast lobby update so clients know game started
    this.broadcastLobbyUpdate();

    // Start the tick loop
    this.tickHandle = setInterval(() => this.step(), SIM_DT_MS);
    this.broadcastState();
  }

  // ── Private: velocity / actions ─────────────────────────────────────────────

  private applyVelocity(playerId: string, vx: number, vy: number): void {
    const player = this.game.getPlayerById(playerId);
    if (!player || player.hp <= 0) return;

    const speedLimit = 260;
    player.velocityX = Number.isFinite(vx) ? Math.max(-speedLimit, Math.min(speedLimit, vx)) : 0;
    player.velocityY = Number.isFinite(vy) ? Math.max(-speedLimit, Math.min(speedLimit, vy)) : 0;

    if (vx !== 0 || vy !== 0) this.playerActedThisTick = true;
  }

  private applyAction(playerId: string, action: IncomingAction): void {
    const state = this.game.getState();
    const player = this.game.getPlayerById(playerId);
    if (!player || player.hp <= 0) return;

    this.playerActedThisTick = true;
    const tick = state.sim.nowTick;

    if (action.type === "FIRE") {
      const dx = toFiniteNumber(action.dx);
      const dy = toFiniteNumber(action.dy);
      if (dx === null || dy === null) return;
      const facingAngle = toFiniteNumber(action.facingAngle);
      if (facingAngle !== null) player.facingAngle = facingAngle;
      enqueueCommand(state, {
        tick, actorId: playerId, type: CommandType.FIRE,
        data: { type: "FIRE", dx, dy, targetWorldX: toFiniteNumber(action.targetWorldX) ?? undefined, targetWorldY: toFiniteNumber(action.targetWorldY) ?? undefined },
        priority: 0, source: "PLAYER",
      });
      return;
    }

    if (action.type === "INTERACT") {
      const dx = toCardinalStep(action.dx);
      const dy = toCardinalStep(action.dy);
      if (dx === null || dy === null) return;
      if (Math.abs(dx) + Math.abs(dy) !== 1) return;
      enqueueCommand(state, {
        tick, actorId: playerId, type: CommandType.INTERACT,
        data: { type: "INTERACT", x: player.gridX + dx, y: player.gridY + dy },
        priority: 0, source: "PLAYER",
      });
      return;
    }

    if (action.type === "TOGGLE_GOD_MODE") {
      this.game.toggleGodMode();
      return;
    }

    const commandTypeByAction: Record<string, CommandType> = {
      WAIT: CommandType.WAIT,
      PICKUP: CommandType.PICKUP,
      RELOAD: CommandType.RELOAD,
      DESCEND: CommandType.DESCEND,
      ASCEND: CommandType.ASCEND,
    };
    const commandType = commandTypeByAction[action.type];
    if (!commandType) return;
    enqueueCommand(state, {
      tick, actorId: playerId, type: commandType,
      data: { type: action.type } as { type: "WAIT" } | { type: "PICKUP" } | { type: "RELOAD" } | { type: "DESCEND" } | { type: "ASCEND" },
      priority: 0, source: "PLAYER",
    });
  }

  private applyWeaponSelection(playerId: string, slot: number): void {
    const player = this.game.getPlayerById(playerId);
    if (!player) return;
    const slotToWeapon: Record<number, WeaponType> = {
      1: WeaponType.MELEE,
      2: WeaponType.PISTOL,
      3: WeaponType.GRENADE,
      4: WeaponType.LAND_MINE,
    };
    const weapon = slotToWeapon[slot];
    if (weapon) player.weapon = weapon;
  }

  private resetRoomState(): void {
    const clientIds = Array.from(this.clients.values()).map((c) => c.playerId);
    this.game.reset(0);
    this.placeholderPlayerId = this.game.getState().player.id;
    for (const playerId of clientIds) {
      const player = this.game.addNetworkPlayer(playerId);
      player.velocityX = 0;
      player.velocityY = 0;
    }
    this.game.removeNetworkPlayer(this.placeholderPlayerId);
    this.game.addLog("New game started.");
    this.rebuildPhysics();
    this.broadcastState();
  }

  // ── Private: game loop ──────────────────────────────────────────────────────

  private step(): void {
    if (this.clients.size === 0) return;

    const state = this.game.getState();
    const dt = SIM_DT_MS / 1000;
    state.sim.mode = "REALTIME";

    const anyPlayerActive =
      state.players.some((p) => p.hp > 0 && (Math.abs(p.velocityX) > 0.1 || Math.abs(p.velocityY) > 0.1)) ||
      this.playerActedThisTick;
    const allDead = state.players.every((p) => p.hp <= 0);

    state.sim.targetTimeScale = allDead || anyPlayerActive ? 1.0 : SLOWMO_SCALE;

    const timeDiff = state.sim.targetTimeScale - state.sim.timeScale;
    if (Math.abs(timeDiff) > 0.001) {
      if (timeDiff > 0) {
        state.sim.timeScale = Math.min(state.sim.timeScale + TIME_SCALE_TRANSITION_SPEED, state.sim.targetTimeScale);
      } else {
        state.sim.timeScale = Math.max(state.sim.timeScale - TIME_SCALE_TRANSITION_SPEED, state.sim.targetTimeScale);
      }
    } else {
      state.sim.timeScale = state.sim.targetTimeScale;
    }

    const scaledDt = dt * state.sim.timeScale;

    this.physics.updatePhysics(state, scaledDt);
    this.physics.updateBullets(state, scaledDt);
    this.physics.updateExplosives(state, scaledDt);

    if (state.mapDirty) {
      state.mapDirty = false;
      this.physics.initializeMap(state.map, state.mapWidth, state.mapHeight);
    }

    state.sim.accumulatorMs += scaledDt * 1000;
    while (state.sim.accumulatorMs >= SIM_DT_MS) {
      stepSimulationTick(state);
      state.sim.accumulatorMs -= SIM_DT_MS;

      if (state.changedTiles && state.changedTiles.size > 0) {
        for (const tileIndex of state.changedTiles) {
          const x = tileIndex % state.mapWidth;
          const y = Math.floor(tileIndex / state.mapWidth);
          this.physics.updateTile(x, y, state.map[tileIndex], state.mapWidth);
        }
        state.changedTiles.clear();
      }

      if (state.shouldDescend) {
        state.shouldDescend = false;
        this.game.descend();
        this.rebuildPhysics();
      }
      if (state.shouldAscend) {
        state.shouldAscend = false;
        this.game.ascend();
        this.rebuildPhysics();
      }

      for (const player of state.players) {
        if (player.hp <= 0) {
          player.velocityX = 0;
          player.velocityY = 0;
        }
      }
    }

    for (const player of state.players) {
      if (player.kind === EntityKind.PLAYER) {
        this.game.updateFOVForPlayer(player.id);
      }
    }

    this.playerActedThisTick = false;
    this.broadcastState();
  }

  // ── Private: broadcasts ─────────────────────────────────────────────────────

  private getLobbyPlayers(): LobbyPlayer[] {
    return Array.from(this.clients.values()).map((c) => ({
      id: c.playerId,
      name: c.name,
      isHost: c.playerId === this.hostPlayerId,
    }));
  }

  private broadcastLobbyUpdate(): void {
    const msg = {
      type: "lobby_update",
      players: this.getLobbyPlayers(),
      roomId: this.id,
      phase: this.phase,
    };
    for (const client of this.clients.values()) {
      this.send(client.socket, msg);
    }
  }

  private broadcastState(): void {
    for (const client of this.clients.values()) {
      const payload = this.game.serializeForPlayer(client.playerId);
      this.send(client.socket, { type: "state", state: payload });
    }
  }

  private rebuildPhysics(): void {
    const state = this.game.getState();
    for (const entity of state.entities) {
      if ("physicsBody" in entity) (entity as unknown as Record<string, unknown>).physicsBody = undefined;
    }
    this.physics.initializeMap(state.map, state.mapWidth, state.mapHeight);
    for (const entity of state.entities) {
      this.physics.updateEntityBody(entity as Parameters<Physics["updateEntityBody"]>[0]);
    }
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function rawMessageToString(rawMessage: RawData): string {
  if (typeof rawMessage === "string") return rawMessage;
  if (Array.isArray(rawMessage)) return Buffer.concat(rawMessage).toString("utf8");
  if (rawMessage instanceof ArrayBuffer) return Buffer.from(rawMessage).toString("utf8");
  return rawMessage.toString("utf8");
}

function parsePort(argv: string[]): number {
  const portArg = argv.find((arg) => arg.startsWith("--port="));
  if (portArg) {
    const parsed = Number(portArg.split("=")[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) return envPort;
  return 7777;
}

function sanitizeRoomId(roomId: string | null): string {
  const fallback = "default";
  if (!roomId) return fallback;
  const normalized = roomId.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9_-]/g, "").slice(0, 64) || fallback;
}

function sanitizePlayerName(name: string | null | undefined): string {
  if (!name) return "Player";
  const cleaned = name.trim().slice(0, 24);
  return cleaned || "Player";
}

// ─── Server factory ────────────────────────────────────────────────────────────

interface StartedServer {
  close(): Promise<void>;
  port: number;
}

export function startMultiplayerServer(port: number): Promise<StartedServer> {
  Sound.setEnabled(false);

  const rooms = new Map<string, RoomSession>();

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (url.pathname === "/info") {
      const roomId = sanitizeRoomId(url.searchParams.get("room"));
      const room = rooms.get(roomId);
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(room?.getInfo() ?? { roomId, phase: "lobby", players: [], version: 1 }));
      return;
    }

    if (url.pathname === "/rooms") {
      const list = Array.from(rooms.entries()).map(([id, room]) => ({ ...room.getInfo(), roomId: id }));
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(list));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Dark War multiplayer server is running.\n");
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const roomId = sanitizeRoomId(url.searchParams.get("room"));
    const playerName = sanitizePlayerName(url.searchParams.get("name"));

    let room = rooms.get(roomId);
    if (!room) {
      room = new RoomSession(roomId, (closedRoomId) => rooms.delete(closedRoomId));
      rooms.set(roomId, room);
    }

    room.addClient(socket, playerName);

    socket.on("message", (rawMessage) => room?.handleMessage(socket, rawMessage));
    socket.on("close", () => room?.removeClient(socket));
    socket.on("error", () => room?.removeClient(socket));
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, () => {
      console.log(`[dark-war-server] Listening on ws://localhost:${port}`);
      resolve({
        port,
        close(): Promise<void> {
          return new Promise((res) => {
            wss.close(() => httpServer.close(() => res()));
          });
        },
      });
    });
  });
}

// ─── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const port = parsePort(process.argv.slice(2));
  startMultiplayerServer(port).then(() => {
    console.log(`[dark-war-server] Ready on port ${port}`);
  }).catch((err) => {
    console.error("[dark-war-server] Failed to start:", err);
    process.exit(1);
  });

  // IPC from parent process (when forked by Electron main)
  process.on("message", (msg: unknown) => {
    if (typeof msg === "object" && msg !== null && (msg as Record<string, unknown>).type === "shutdown") {
      process.exit(0);
    }
  });
}
