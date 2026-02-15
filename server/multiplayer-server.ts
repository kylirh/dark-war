import { createServer } from "node:http";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { Game } from "../src/core/Game";
import { Physics } from "../src/systems/Physics";
import { enqueueCommand, SIM_DT_MS, stepSimulationTick } from "../src/systems/Simulation";
import { Sound } from "../src/systems/Sound";
import { CommandType, EntityKind, MAP_WIDTH, SLOWMO_SCALE, TIME_SCALE_TRANSITION_SPEED, WeaponType } from "../src/types";

type IncomingAction =
  | { type: "FIRE"; dx: number; dy: number; facingAngle?: number }
  | { type: "INTERACT"; dx: number; dy: number }
  | { type: "PICKUP" }
  | { type: "RELOAD" }
  | { type: "WAIT" }
  | { type: "DESCEND" }
  | { type: "ASCEND" };

type IncomingMessage =
  | { type: "velocity"; vx: number; vy: number }
  | { type: "action"; action: IncomingAction }
  | { type: "select_weapon"; slot: number }
  | { type: "new_game" };

interface RoomClient {
  socket: WebSocket;
  playerId: string;
  name: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toCardinalStep(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < -1 || rounded > 1) return null;
  return rounded;
}

class RoomSession {
  private readonly id: string;
  private readonly game: Game;
  private readonly physics: Physics;
  private readonly clients = new Map<WebSocket, RoomClient>();
  private readonly closeRoom: (roomId: string) => void;
  private tickHandle: NodeJS.Timeout;
  private placeholderPlayerId: string;
  private playerActedThisTick: boolean = false;

  constructor(id: string, closeRoom: (roomId: string) => void) {
    this.id = id;
    this.closeRoom = closeRoom;
    this.game = new Game({ mode: "online" });
    this.game.reset(1);
    this.placeholderPlayerId = this.game.getState().player.id;
    this.physics = new Physics();
    this.rebuildPhysics();
    this.tickHandle = setInterval(() => this.step(), SIM_DT_MS);
  }

  public addClient(socket: WebSocket, name: string): void {
    const playerId = crypto.randomUUID();
    const client: RoomClient = { socket, playerId, name };
    const wasEmpty = this.clients.size === 0;
    this.clients.set(socket, client);

    this.game.addNetworkPlayer(playerId);
    if (wasEmpty && this.placeholderPlayerId !== playerId) {
      this.game.removeNetworkPlayer(this.placeholderPlayerId);
    }

    this.send(socket, {
      type: "welcome",
      playerId,
      roomId: this.id,
    });

    this.game.addLog(`${name} joined room ${this.id}.`);
    this.broadcastState();
  }

  public removeClient(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;

    this.clients.delete(socket);
    this.game.removeNetworkPlayer(client.playerId);
    this.game.addLog(`${client.name} left room ${this.id}.`);

    if (this.clients.size === 0) {
      clearInterval(this.tickHandle);
      this.closeRoom(this.id);
      return;
    }

    this.broadcastState();
  }

  public handleMessage(socket: WebSocket, rawMessage: RawData): void {
    const client = this.clients.get(socket);
    if (!client) return;

    const text =
      typeof rawMessage === "string"
        ? rawMessage
        : Array.isArray(rawMessage)
          ? Buffer.concat(rawMessage).toString("utf8")
          : rawMessage instanceof ArrayBuffer
            ? Buffer.from(rawMessage).toString("utf8")
            : rawMessage.toString("utf8");
    let message: IncomingMessage;
    try {
      message = JSON.parse(text) as IncomingMessage;
    } catch {
      this.send(socket, { type: "error", message: "Invalid payload." });
      return;
    }

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

  private applyVelocity(playerId: string, vx: number, vy: number): void {
    const player = this.game.getPlayerById(playerId);
    if (!player || player.hp <= 0) return;

    const speedLimit = 260;
    const clampedVx = Math.max(-speedLimit, Math.min(speedLimit, vx));
    const clampedVy = Math.max(-speedLimit, Math.min(speedLimit, vy));

    player.velocityX = Number.isFinite(clampedVx) ? clampedVx : 0;
    player.velocityY = Number.isFinite(clampedVy) ? clampedVy : 0;

    // Any movement input should resume time (Superhot mechanic)
    if (vx !== 0 || vy !== 0) {
      this.playerActedThisTick = true;
    }
  }

  private applyAction(playerId: string, action: IncomingAction): void {
    const state = this.game.getState();
    const player = this.game.getPlayerById(playerId);
    if (!player || player.hp <= 0) return;

    // Any action should resume time (Superhot mechanic)
    this.playerActedThisTick = true;

    const tick = state.sim.nowTick;

    if (action.type === "FIRE") {
      const dx = toFiniteNumber(action.dx);
      const dy = toFiniteNumber(action.dy);
      if (dx === null || dy === null) return;

      const facingAngle = toFiniteNumber(action.facingAngle);
      if (facingAngle !== null) {
        player.facingAngle = facingAngle;
      }
      enqueueCommand(state, {
        tick,
        actorId: playerId,
        type: CommandType.FIRE,
        data: { type: "FIRE", dx, dy },
        priority: 0,
        source: "PLAYER",
      });
      return;
    }

    if (action.type === "INTERACT") {
      const dx = toCardinalStep(action.dx);
      const dy = toCardinalStep(action.dy);
      if (dx === null || dy === null) return;
      if (Math.abs(dx) + Math.abs(dy) !== 1) return;

      enqueueCommand(state, {
        tick,
        actorId: playerId,
        type: CommandType.INTERACT,
        data: {
          type: "INTERACT",
          x: player.gridX + dx,
          y: player.gridY + dy,
        },
        priority: 0,
        source: "PLAYER",
      });
      return;
    }

    const commandTypeByAction: Record<
      Exclude<IncomingAction["type"], "FIRE" | "INTERACT">,
      CommandType
    > = {
      WAIT: CommandType.WAIT,
      PICKUP: CommandType.PICKUP,
      RELOAD: CommandType.RELOAD,
      DESCEND: CommandType.DESCEND,
      ASCEND: CommandType.ASCEND,
    };

    const commandType = commandTypeByAction[action.type];
    if (!commandType) {
      return;
    }
    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: commandType,
      data: { type: action.type } as
        | { type: "WAIT" }
        | { type: "PICKUP" }
        | { type: "RELOAD" }
        | { type: "DESCEND" }
        | { type: "ASCEND" },
      priority: 0,
      source: "PLAYER",
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
    const selectedWeapon = slotToWeapon[slot];
    if (!selectedWeapon) return;
    player.weapon = selectedWeapon;
  }

  private resetRoomState(): void {
    const clientIds = Array.from(this.clients.values()).map(
      (client) => client.playerId,
    );
    this.game.reset(1);
    this.placeholderPlayerId = this.game.getState().player.id;

    for (const playerId of clientIds) {
      const player = this.game.addNetworkPlayer(playerId);
      // Zero velocities for new players to prevent phantom movement
      player.velocityX = 0;
      player.velocityY = 0;
    }
    this.game.removeNetworkPlayer(this.placeholderPlayerId);
    this.game.addLog("New game started.");

    this.rebuildPhysics();
    this.broadcastState();
  }

  private rebuildPhysics(): void {
    const state = this.game.getState();
    // Clear existing entity physics body references before rebuilding
    // so updateEntityBody creates fresh bodies
    for (const entity of state.entities) {
      if ("physicsBody" in entity) {
        (entity as any).physicsBody = undefined;
      }
    }
    this.physics.initializeMap(state.map);
    for (const entity of state.entities) {
      this.physics.updateEntityBody(entity as any);
    }
  }

  private step(): void {
    if (this.clients.size === 0) return;

    const state = this.game.getState();
    const dt = SIM_DT_MS / 1000;
    state.sim.mode = "REALTIME";

    // Superhot time dilation: slow time when no players are active
    const anyPlayerActive = state.players.some(
      (p) =>
        p.hp > 0 &&
        (Math.abs(p.velocityX) > 0.1 || Math.abs(p.velocityY) > 0.1),
    ) || this.playerActedThisTick;

    // Check if all players are dead - run at full speed
    const allDead = state.players.every((p) => p.hp <= 0);

    if (allDead) {
      state.sim.targetTimeScale = 1.0;
    } else if (anyPlayerActive) {
      state.sim.targetTimeScale = 1.0;
    } else {
      state.sim.targetTimeScale = SLOWMO_SCALE;
    }

    // Smooth time scale transition
    const timeDiff = state.sim.targetTimeScale - state.sim.timeScale;
    if (Math.abs(timeDiff) > 0.001) {
      if (timeDiff > 0) {
        state.sim.timeScale = Math.min(
          state.sim.timeScale + TIME_SCALE_TRANSITION_SPEED,
          state.sim.targetTimeScale,
        );
      } else {
        state.sim.timeScale = Math.max(
          state.sim.timeScale - TIME_SCALE_TRANSITION_SPEED,
          state.sim.targetTimeScale,
        );
      }
    } else {
      state.sim.timeScale = state.sim.targetTimeScale;
    }

    // Scale physics dt by time scale
    const scaledDt = dt * state.sim.timeScale;

    this.physics.updatePhysics(state, scaledDt);
    this.physics.updateBullets(state, scaledDt);
    this.physics.updateExplosives(state, scaledDt);

    if (state.mapDirty) {
      state.mapDirty = false;
      this.physics.initializeMap(state.map);
    }

    // Advance simulation ticks with time scaling (accumulator pattern)
    state.sim.accumulatorMs += scaledDt * 1000;
    while (state.sim.accumulatorMs >= SIM_DT_MS) {
      stepSimulationTick(state);
      state.sim.accumulatorMs -= SIM_DT_MS;

      if (state.changedTiles && state.changedTiles.size > 0) {
        for (const tileIndex of state.changedTiles) {
          const x = tileIndex % MAP_WIDTH;
          const y = Math.floor(tileIndex / MAP_WIDTH);
          this.physics.updateTile(x, y, state.map[tileIndex]);
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

      // Zero velocity for dead players (Fix 3: dead slide)
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

    // Reset per-tick flags
    this.playerActedThisTick = false;

    this.broadcastState();
  }

  private broadcastState(): void {
    for (const client of this.clients.values()) {
      const payload = this.game.serializeForPlayer(client.playerId);
      this.send(client.socket, {
        type: "state",
        state: payload,
      });
    }
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }
}

function parsePort(argv: string[]): number {
  const portArg = argv.find((arg) => arg.startsWith("--port="));
  if (portArg) {
    const parsed = Number(portArg.split("=")[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) {
    return envPort;
  }

  return 7777;
}

function sanitizeRoomId(roomId: string | null): string {
  const fallback = "default";
  if (!roomId) return fallback;
  const normalized = roomId.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.replace(/[^a-z0-9_-]/g, "").slice(0, 64) || fallback;
}

function sanitizePlayerName(name: string | null): string {
  if (!name) return "Player";
  const cleaned = name.trim().slice(0, 24);
  return cleaned || "Player";
}

const port = parsePort(process.argv.slice(2));
Sound.setEnabled(false);
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Dark War multiplayer server is running.\n");
});
const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map<string, RoomSession>();

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const roomId = sanitizeRoomId(url.searchParams.get("room"));
  const playerName = sanitizePlayerName(url.searchParams.get("name"));

  let room = rooms.get(roomId);
  if (!room) {
    room = new RoomSession(roomId, (closedRoomId) => {
      rooms.delete(closedRoomId);
    });
    rooms.set(roomId, room);
  }

  room.addClient(socket, playerName);

  socket.on("message", (rawMessage) => {
    room?.handleMessage(socket, rawMessage);
  });

  socket.on("close", () => {
    room?.removeClient(socket);
  });

  socket.on("error", () => {
    room?.removeClient(socket);
  });
});

httpServer.listen(port, () => {
  console.log(`Dark War multiplayer server listening on ws://localhost:${port}`);
});
