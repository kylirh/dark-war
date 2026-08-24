import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { Game } from "../src/engine/core/game";
import { Physics } from "../src/engine/systems/physics";
import { stepSimulationTick } from "../src/engine/systems/simulation/tick";
import { enqueueCommand } from "../src/engine/systems/simulation/commands";
import { SIM_DT_MS } from "../src/engine/systems/simulation/constants";
import { PROTOCOL_VERSION } from "../src/net/protocol";
import { computeStateDelta, requiresKeyframe } from "../src/net/state-delta";
import { Sound } from "../src/client/systems/sound";
import {
  CommandType,
  EntityKind,
  HOLE_FALL_DAMAGE,
  INVENTORY_BAR_SIZE,
  ONLINE_TIME_SCALE,
  SerializedState,
  TileType,
} from "../src/engine/types";
import {
  getWeaponForSlot,
  swapInventorySlots,
} from "../src/engine/utils/inventory";
import {
  depthForWorldAddress,
  portalAt,
  WorldAddress,
  WorldPortalDestination,
  worldAddressForDepth,
  worldAddressKey,
} from "../src/engine/core/world-space";
import {
  emitWorldTextCallout,
  sanitizeWorldCalloutText,
} from "../src/engine/utils/world-callouts";

// Force a fresh keyframe at least this often (in broadcasts) so a client that
// somehow drifted re-baselines within a few seconds. ~5s at 20 broadcasts/sec.
const KEYFRAME_INTERVAL = 100;

const PLAYER_CALLOUT_COOLDOWN_MS = 650;

// ─── Protocol types ────────────────────────────────────────────────────────────

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
}

type RoomPhase = "lobby" | "playing";

type IncomingAction =
  | {
      type: "FIRE";
      dx: number;
      dy: number;
      facingAngle?: number;
      targetWorldX?: number;
      targetWorldY?: number;
    }
  | {
      type: "USE_ITEM";
      dx: number;
      dy: number;
      facingAngle?: number;
      targetWorldX?: number;
      targetWorldY?: number;
    }
  | { type: "INTERACT"; dx: number; dy: number }
  | { type: "PICKUP" }
  | { type: "RELOAD" }
  | { type: "WAIT" }
  | { type: "DESCEND" }
  | { type: "ASCEND" }
  | { type: "SHAPE_TERRAIN"; tileX: number; tileY: number; delta: -1 | 1 }
  | { type: "SPEAK"; kind: "speech" | "thought"; text: string }
  | {
      type: "DIALOGUE_CHOICE";
      choiceId: string;
      freeText?: string;
      expectedRevision: number;
    }
  | { type: "DIALOGUE_LEAVE"; expectedRevision: number }
  | { type: "TOGGLE_GOD_MODE" };

type IncomingMessage2 =
  | { type: "velocity"; vx: number; vy: number; seq?: number }
  | { type: "action"; action: IncomingAction; seq?: number }
  | { type: "select_weapon"; slot: number }
  | { type: "inventory_swap"; from: number; to: number }
  | { type: "new_game" }
  | { type: "start_game" }
  | { type: "set_name"; name: string }
  | { type: "request_respawn" }
  | { type: "request_keyframe" };

interface RoomClient {
  socket: WebSocket;
  playerId: string;
  name: string;
  // Highest input seq we have processed from this client, echoed back in
  // state messages so the client can reconcile its prediction.
  lastProcessedSeq: number;
  // Delta-broadcast bookkeeping: the last full state we sent this client
  // (their baseline) plus the monotonic ids used to keep deltas aligned.
  baseline: SerializedState | null;
  stateSeq: number;
  baselineSeq: number;
  lastKeyframeSeq: number;
  needsKeyframe: boolean;
  lastCalloutAtMs: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIncomingAction(value: unknown): value is IncomingAction {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  return (
    value.type === "FIRE" ||
    value.type === "USE_ITEM" ||
    value.type === "INTERACT" ||
    value.type === "PICKUP" ||
    value.type === "RELOAD" ||
    value.type === "WAIT" ||
    value.type === "DESCEND" ||
    value.type === "ASCEND" ||
    value.type === "SHAPE_TERRAIN" ||
    value.type === "SPEAK" ||
    value.type === "DIALOGUE_CHOICE" ||
    value.type === "DIALOGUE_LEAVE" ||
    value.type === "TOGGLE_GOD_MODE"
  );
}

function isIncomingMessage(value: unknown): value is IncomingMessage2 {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  return (
    value.type === "velocity" ||
    value.type === "action" ||
    value.type === "select_weapon" ||
    value.type === "inventory_swap" ||
    value.type === "new_game" ||
    value.type === "start_game" ||
    value.type === "set_name" ||
    value.type === "request_respawn" ||
    value.type === "request_keyframe"
  );
}

// ─── Level world ─────────────────────────────────────────────────────────────
//
// Each depth is its own simulated world (map + entities + physics), shared by
// every player currently on that depth. Players migrate between worlds when
// they take stairs or fall through holes; empty worlds are frozen (not stepped)
// but keep their state so they're intact when someone returns.

class LevelWorld {
  readonly players = new Set<string>();
  constructor(
    readonly address: WorldAddress,
    readonly depth: number,
    readonly game: Game,
    readonly physics: Physics,
  ) {}
}

// ─── Room session ──────────────────────────────────────────────────────────────

class RoomSession {
  private readonly id: string;
  private readonly worlds = new Map<string, LevelWorld>();
  private readonly playerLocation = new Map<string, string>();
  private readonly clients = new Map<WebSocket, RoomClient>();
  private readonly closeRoom: (roomId: string) => void;
  private tickHandle: NodeJS.Timeout | null = null;
  private phase: RoomPhase = "lobby";
  private hostPlayerId: string | null = null;

  constructor(id: string, closeRoom: (roomId: string) => void) {
    this.id = id;
    this.closeRoom = closeRoom;
    // Pre-create the entry world (the outside city, depth 0).
    this.getOrCreateDepthWorld(0);
  }

  // ── Private: world management ────────────────────────────────────────────────

  /** Get the world for a depth, generating it (player-free) on first visit. */
  private getOrCreateDepthWorld(depth: number): LevelWorld {
    return this.getOrCreateWorld(worldAddressForDepth(depth), depth);
  }

  private getOrCreateWorld(address: WorldAddress, depth: number): LevelWorld {
    const key = worldAddressKey(address);
    const existing = this.worlds.get(key);
    if (existing) return existing;

    const game = new Game({ mode: "online" });
    game.resetToWorld(address);
    const placeholderId = game.getState().player?.id;
    if (placeholderId) game.detachPlayer(placeholderId);

    const physics = new Physics();
    physics.rebuildAll(game.getState());

    const world = new LevelWorld(address, depth, game, physics);
    this.worlds.set(key, world);
    return world;
  }

  private worldOfPlayer(playerId: string): LevelWorld | undefined {
    const location = this.playerLocation.get(playerId);
    return location ? this.worlds.get(location) : undefined;
  }

  private addPlayerToWorld(playerId: string, depth: number): void {
    const world = this.getOrCreateDepthWorld(depth);
    world.game.addNetworkPlayer(playerId);
    world.players.add(playerId);
    this.playerLocation.set(playerId, worldAddressKey(world.address));
    world.physics.rebuildAll(world.game.getState());
  }

  /** Move a player to another depth, carrying their stats and forcing a keyframe. */
  private migratePlayer(
    playerId: string,
    destination: WorldPortalDestination,
    mode: "descend" | "ascend" | "hole",
  ): void {
    const from = this.worldOfPlayer(playerId);
    if (!from) return;
    const player = from.game.detachPlayer(playerId);
    if (!player) return;
    from.players.delete(playerId);
    from.physics.rebuildAll(from.game.getState());

    const toDepth = depthForWorldAddress(destination) ?? from.depth;
    const to = this.getOrCreateWorld(destination, toDepth);
    const toState = to.game.getState();
    let position: [number, number];
    if (
      typeof destination.x === "number" &&
      typeof destination.y === "number"
    ) {
      position = [destination.x, destination.y];
    } else if (destination.entry === "same" || mode === "hole") {
      position = [player.gridX, player.gridY];
    } else if (destination.entry === "stairs-up" || mode === "descend") {
      position = toState.stairsUp ?? toState.playerStart;
    } else if (destination.entry === "stairs-down" || mode === "ascend") {
      position = toState.stairsDown ?? toState.playerStart;
    } else {
      position = toState.playerStart;
    }
    if (mode === "hole") player.hp = Math.max(0, player.hp - HOLE_FALL_DAMAGE);

    to.game.attachExistingPlayer(player, position);
    to.players.add(playerId);
    this.playerLocation.set(playerId, worldAddressKey(to.address));
    to.physics.rebuildAll(toState);

    const client = this.clientByPlayerId(playerId);
    if (client) client.needsKeyframe = true;
  }

  private clientByPlayerId(playerId: string): RoomClient | undefined {
    for (const client of this.clients.values()) {
      if (client.playerId === playerId) return client;
    }
    return undefined;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  public getInfo(): {
    roomId: string;
    phase: RoomPhase;
    players: LobbyPlayer[];
    version: number;
  } {
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
    const client: RoomClient = {
      socket,
      playerId,
      name,
      lastProcessedSeq: 0,
      baseline: null,
      stateSeq: 0,
      baselineSeq: 0,
      lastKeyframeSeq: 0,
      needsKeyframe: true,
      lastCalloutAtMs: Number.NEGATIVE_INFINITY,
    };
    this.clients.set(socket, client);

    if (wasEmpty) {
      this.hostPlayerId = playerId;
    }

    // In lobby: track players but don't add to a world yet.
    // In playing: drop them into the entry world immediately.
    if (this.phase === "playing") {
      this.addPlayerToWorld(playerId, 0);
    }

    this.send(socket, {
      type: "welcome",
      playerId,
      roomId: this.id,
      isHost: playerId === this.hostPlayerId,
      protocolVersion: PROTOCOL_VERSION,
    });

    this.broadcastLobbyUpdate();
    this.getOrCreateDepthWorld(0).game.addStory(
      `${name} joined room ${this.id}.`,
    );
  }

  public removeClient(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;

    this.clients.delete(socket);

    if (this.phase === "playing") {
      const world = this.worldOfPlayer(client.playerId);
      if (world) {
        world.game.removeNetworkPlayer(client.playerId);
        world.players.delete(client.playerId);
        world.physics.rebuildAll(world.game.getState());
      }
      this.playerLocation.delete(client.playerId);
    }

    // Transfer host if needed
    if (client.playerId === this.hostPlayerId && this.clients.size > 0) {
      const nextClient = this.clients.values().next().value;
      if (nextClient) {
        this.hostPlayerId = nextClient.playerId;
      }
    }

    this.getOrCreateDepthWorld(0).game.addStory(
      `${client.name} left room ${this.id}.`,
    );

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.send(socket, { type: "error", message: "Invalid payload." });
      return;
    }
    if (!isIncomingMessage(parsed)) {
      this.send(socket, { type: "error", message: "Invalid payload." });
      return;
    }
    const message = parsed;

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

    if (message.type === "request_keyframe") {
      client.needsKeyframe = true;
      return;
    }
    if (message.type === "request_respawn") {
      const world = this.worldOfPlayer(client.playerId);
      const player = world?.game.getPlayerById(client.playerId);
      if (!world || !player || player.hp > 0) return;
      if (world.game.respawnPlayer(client.playerId)) {
        world.physics.rebuildAll(world.game.getState());
        client.needsKeyframe = true;
      }
      return;
    }
    if (message.type === "velocity") {
      this.recordProcessedSeq(client, message.seq);
      this.applyVelocity(client.playerId, message.vx, message.vy);
      return;
    }
    if (message.type === "action") {
      if (!isIncomingAction(message.action)) {
        this.send(socket, { type: "error", message: "Invalid action." });
        return;
      }
      this.recordProcessedSeq(client, message.seq);
      this.applyAction(client.playerId, message.action);
      return;
    }
    if (message.type === "select_weapon") {
      this.applyWeaponSelection(client.playerId, message.slot);
      return;
    }
    if (message.type === "inventory_swap") {
      this.applyInventorySwap(client.playerId, message.from, message.to);
      return;
    }
    if (message.type === "new_game") {
      if (client.playerId !== this.hostPlayerId) {
        this.send(socket, {
          type: "error",
          message: "Only the host can start a new game.",
        });
        return;
      }
      this.resetRoomState();
    }
  }

  // ── Private: phase management ───────────────────────────────────────────────

  private startGame(): void {
    this.phase = "playing";

    // Drop every lobby client into the entry world.
    for (const client of this.clients.values()) {
      this.addPlayerToWorld(client.playerId, 0);
    }

    // Broadcast lobby update so clients know game started
    this.broadcastLobbyUpdate();

    // Start the tick loop
    this.tickHandle = setInterval(() => this.step(), SIM_DT_MS);
    this.broadcastState();
  }

  // ── Private: velocity / actions ─────────────────────────────────────────────

  private recordProcessedSeq(
    client: RoomClient,
    seq: number | undefined,
  ): void {
    const value = toFiniteNumber(seq);
    if (value !== null && value > client.lastProcessedSeq) {
      client.lastProcessedSeq = value;
    }
  }

  private applyVelocity(playerId: string, vx: number, vy: number): void {
    const world = this.worldOfPlayer(playerId);
    const player = world?.game.getPlayerById(playerId);
    if (!player || player.hp <= 0) return;
    if (world?.game.getState().conversations.has(playerId)) {
      player.velocityX = 0;
      player.velocityY = 0;
      return;
    }

    const speedLimit = 260;
    let nextVx = Number.isFinite(vx) ? vx : 0;
    let nextVy = Number.isFinite(vy) ? vy : 0;
    const speed = Math.sqrt(nextVx * nextVx + nextVy * nextVy);
    if (speed > speedLimit) {
      nextVx = (nextVx / speed) * speedLimit;
      nextVy = (nextVy / speed) * speedLimit;
    }

    player.velocityX = nextVx;
    player.velocityY = nextVy;
  }

  private applyAction(playerId: string, action: IncomingAction): void {
    const world = this.worldOfPlayer(playerId);
    if (!world) return;
    const state = world.game.getState();
    const player = world.game.getPlayerById(playerId);
    if (!player || player.hp <= 0) return;
    if (
      state.conversations.has(playerId) &&
      action.type !== "DIALOGUE_CHOICE" &&
      action.type !== "DIALOGUE_LEAVE"
    ) {
      return;
    }

    // Level transitions migrate only this player between worlds.
    if (action.type === "DESCEND") {
      this.tryDescend(playerId);
      return;
    }
    if (action.type === "ASCEND") {
      this.tryAscend(playerId);
      return;
    }

    const tick = state.sim.nowTick;

    if (action.type === "SPEAK") {
      if (action.kind !== "speech" && action.kind !== "thought") return;
      if (typeof action.text !== "string") return;
      const text = sanitizeWorldCalloutText(action.text);
      if (text.length === 0) return;
      const client = Array.from(this.clients.values()).find(
        (candidate) => candidate.playerId === playerId,
      );
      if (!client) return;
      const nowMs = Date.now();
      if (nowMs - client.lastCalloutAtMs < PLAYER_CALLOUT_COOLDOWN_MS) return;
      client.lastCalloutAtMs = nowMs;
      emitWorldTextCallout(state, {
        kind: action.kind,
        text,
        speakerId: playerId,
      });
      return;
    }

    if (action.type === "FIRE" || action.type === "USE_ITEM") {
      const dx = toFiniteNumber(action.dx);
      const dy = toFiniteNumber(action.dy);
      if (dx === null || dy === null) return;
      const facingAngle = toFiniteNumber(action.facingAngle);
      if (facingAngle !== null) player.facingAngle = facingAngle;
      const targetWorldX = toFiniteNumber(action.targetWorldX) ?? undefined;
      const targetWorldY = toFiniteNumber(action.targetWorldY) ?? undefined;
      enqueueCommand(
        state,
        action.type === "USE_ITEM"
          ? {
              tick,
              actorId: playerId,
              type: CommandType.USE_ITEM,
              data: { type: "USE_ITEM", dx, dy, targetWorldX, targetWorldY },
              priority: 0,
              source: "PLAYER",
            }
          : {
              tick,
              actorId: playerId,
              type: CommandType.FIRE,
              data: { type: "FIRE", dx, dy, targetWorldX, targetWorldY },
              priority: 0,
              source: "PLAYER",
            },
      );
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
        data: { type: "INTERACT", x: player.gridX + dx, y: player.gridY + dy },
        priority: 0,
        source: "PLAYER",
      });
      return;
    }

    if (action.type === "DIALOGUE_CHOICE") {
      if (typeof action.choiceId !== "string") return;
      const expectedRevision = toFiniteNumber(action.expectedRevision);
      if (expectedRevision === null) return;
      enqueueCommand(state, {
        tick,
        actorId: playerId,
        type: CommandType.DIALOGUE_CHOICE,
        data: {
          type: "DIALOGUE_CHOICE",
          choiceId: action.choiceId,
          freeText:
            typeof action.freeText === "string" ? action.freeText : undefined,
          expectedRevision,
        },
        priority: 0,
        source: "PLAYER",
      });
      return;
    }

    if (action.type === "DIALOGUE_LEAVE") {
      const expectedRevision = toFiniteNumber(action.expectedRevision);
      if (expectedRevision === null) return;
      enqueueCommand(state, {
        tick,
        actorId: playerId,
        type: CommandType.DIALOGUE_LEAVE,
        data: { type: "DIALOGUE_LEAVE", expectedRevision },
        priority: 0,
        source: "PLAYER",
      });
      return;
    }

    if (action.type === "SHAPE_TERRAIN") {
      const tileX = toFiniteNumber(action.tileX);
      const tileY = toFiniteNumber(action.tileY);
      const delta = toFiniteNumber(action.delta);
      if (
        tileX === null ||
        tileY === null ||
        !Number.isInteger(tileX) ||
        !Number.isInteger(tileY) ||
        (delta !== -1 && delta !== 1)
      ) {
        return;
      }
      enqueueCommand(state, {
        tick,
        actorId: playerId,
        type: CommandType.SHAPE_TERRAIN,
        data: { type: "SHAPE_TERRAIN", tileX, tileY, delta },
        priority: 0,
        source: "PLAYER",
      });
      return;
    }

    if (action.type === "TOGGLE_GOD_MODE") {
      world.game.toggleGodMode();
      return;
    }

    const commandTypeByAction: Record<string, CommandType> = {
      WAIT: CommandType.WAIT,
      PICKUP: CommandType.PICKUP,
      RELOAD: CommandType.RELOAD,
    };
    const commandType = commandTypeByAction[action.type];
    if (!commandType) return;
    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: commandType,
      data: { type: action.type } as
        | { type: "WAIT" }
        | { type: "PICKUP" }
        | { type: "RELOAD" },
      priority: 0,
      source: "PLAYER",
    });
  }

  private applyWeaponSelection(playerId: string, slot: number): void {
    const world = this.worldOfPlayer(playerId);
    const player = world?.game.getPlayerById(playerId);
    if (!player || world?.game.getState().conversations.has(playerId)) return;
    // `slot` is a 0-based inventory-bar index; the weapon is whatever item sits
    // there (authoritative, so it always matches the player's real inventory).
    if (!Number.isInteger(slot) || slot < 0 || slot >= INVENTORY_BAR_SIZE)
      return;
    player.selectedBarSlot = slot;
    player.weapon = getWeaponForSlot(player.inventorySlots[slot] ?? null);
  }

  private applyInventorySwap(playerId: string, from: number, to: number): void {
    const world = this.worldOfPlayer(playerId);
    const player = world?.game.getPlayerById(playerId);
    if (!player || world?.game.getState().conversations.has(playerId)) return;
    const total = player.inventorySlots.length;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from < 0 || from >= total || to < 0 || to >= total) return;
    swapInventorySlots(player, from, to);
    // Keep the equipped weapon consistent with whatever now sits in the bar slot.
    player.weapon = getWeaponForSlot(
      player.inventorySlots[player.selectedBarSlot] ?? null,
    );
  }

  private resetRoomState(): void {
    const clientIds = Array.from(this.clients.values()).map((c) => c.playerId);

    // Tear every world down and start fresh from the entry world.
    this.worlds.clear();
    this.playerLocation.clear();
    this.getOrCreateDepthWorld(0).game.addStory("New game started.");
    for (const playerId of clientIds) this.addPlayerToWorld(playerId, 0);

    for (const client of this.clients.values()) client.needsKeyframe = true;
    this.broadcastState();
  }

  // ── Private: level transitions ───────────────────────────────────────────────

  private tileUnderPlayer(
    world: LevelWorld,
    playerId: string,
  ): TileType | null {
    const player = world.game.getPlayerById(playerId);
    if (!player) return null;
    return world.game.getState().tiles.getTile(player.gridX, player.gridY);
  }

  private tryDescend(playerId: string): void {
    const world = this.worldOfPlayer(playerId);
    if (!world) return;
    const state = world.game.getState();
    const player = world.game.getPlayerById(playerId);
    if (!player) return;
    const portal = portalAt(
      state.portals,
      world.address,
      player.gridX,
      player.gridY,
    );
    if (
      !portal ||
      this.tileUnderPlayer(world, playerId) !== TileType.STAIRS_DOWN
    )
      return;
    this.migratePlayer(playerId, portal.destination, "descend");
  }

  private tryAscend(playerId: string): void {
    const world = this.worldOfPlayer(playerId);
    if (!world) return;
    const state = world.game.getState();
    const player = world.game.getPlayerById(playerId);
    if (!player) return;
    const portal = portalAt(
      state.portals,
      world.address,
      player.gridX,
      player.gridY,
    );
    if (!portal || this.tileUnderPlayer(world, playerId) !== TileType.STAIRS_UP)
      return;
    this.migratePlayer(playerId, portal.destination, "ascend");
  }

  /** After a world steps, drop any player standing on a hole to the next depth. */
  private handleHoleFalls(world: LevelWorld): void {
    for (const playerId of [...world.players]) {
      if (this.tileUnderPlayer(world, playerId) === TileType.HOLE) {
        this.migratePlayer(
          playerId,
          { ...worldAddressForDepth(world.depth + 1), entry: "same" },
          "hole",
        );
      }
    }
  }

  // ── Private: game loop ──────────────────────────────────────────────────────

  private step(): void {
    if (this.clients.size === 0) return;

    // Simulate every world that currently has players; freeze empty ones.
    for (const world of this.worlds.values()) {
      if (world.players.size > 0) this.stepWorld(world);
    }
    // Resolve hole falls after stepping (migrates players between worlds).
    for (const world of [...this.worlds.values()]) {
      if (world.players.size > 0) this.handleHoleFalls(world);
    }
    this.broadcastState();
  }

  private stepWorld(world: LevelWorld): void {
    const { game, physics } = world;
    const state = game.getState();
    const dt = SIM_DT_MS / 1000;
    state.sim.mode = "REALTIME";

    // Multiplayer runs at a fixed, slightly-relaxed real-time pace — no CTDM
    // time dilation, just a touch under full speed so combat is readable.
    state.sim.timeScale = ONLINE_TIME_SCALE;
    state.sim.targetTimeScale = ONLINE_TIME_SCALE;
    const scaledDt = dt * ONLINE_TIME_SCALE;

    physics.updatePhysics(state, scaledDt);
    physics.updateBullets(state, scaledDt);
    physics.updateExplosives(state, scaledDt);

    if (state.mapDirty) {
      state.mapDirty = false;
      physics.initializeMap(state.tiles);
    }

    state.sim.accumulatorMs += scaledDt * 1000;
    while (state.sim.accumulatorMs >= SIM_DT_MS) {
      stepSimulationTick(state);
      state.sim.accumulatorMs -= SIM_DT_MS;

      if (state.changedTiles && state.changedTiles.size > 0) {
        for (const tileIndex of state.changedTiles) {
          const x = tileIndex % state.mapWidth;
          const y = Math.floor(tileIndex / state.mapWidth);
          physics.updateTile(state.tiles, x, y);
        }
        state.changedTiles.clear();
      }

      // Per-player level transitions are handled by the room, not the shared
      // descend/ascend flags — clear them so a single Game never warps the party.
      state.shouldDescend = false;
      state.shouldAscend = false;

      for (const player of state.players) {
        if (player.hp <= 0) {
          player.velocityX = 0;
          player.velocityY = 0;
        }
      }
    }

    for (const player of state.players) {
      if (player.kind === EntityKind.PLAYER && player.hp > 0) {
        game.updateFOVForPlayer(player.id);
      }
    }
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
      const world = this.worldOfPlayer(client.playerId);
      if (!world) continue;
      const next = world.game.serializeForPlayer(client.playerId);
      const seq = ++client.stateSeq;

      const mustKeyframe =
        client.needsKeyframe ||
        client.baseline === null ||
        requiresKeyframe(client.baseline, next) ||
        seq - client.lastKeyframeSeq >= KEYFRAME_INTERVAL;

      if (mustKeyframe) {
        this.send(client.socket, {
          type: "state_full",
          state: next,
          seq,
          ackSeq: client.lastProcessedSeq,
        });
        client.lastKeyframeSeq = seq;
        client.needsKeyframe = false;
      } else {
        const delta = computeStateDelta(
          client.baseline!,
          next,
          seq,
          client.baselineSeq,
        );
        this.send(client.socket, {
          type: "state_delta",
          delta,
          ackSeq: client.lastProcessedSeq,
        });
      }

      client.baseline = next;
      client.baselineSeq = seq;
    }
    // Ephemeral presentation is consumed per broadcast; clear each active queue.
    for (const world of this.worlds.values()) {
      if (world.players.size > 0) {
        world.game.getState().pendingSounds.length = 0;
        world.game.getState().pendingCallouts.length = 0;
      }
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
  if (Array.isArray(rawMessage))
    return Buffer.concat(rawMessage).toString("utf8");
  if (rawMessage instanceof ArrayBuffer)
    return Buffer.from(rawMessage).toString("utf8");
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

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname === "/info") {
        const roomId = sanitizeRoomId(url.searchParams.get("room"));
        const room = rooms.get(roomId);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify(
            room?.getInfo() ?? {
              roomId,
              phase: "lobby",
              players: [],
              version: 1,
            },
          ),
        );
        return;
      }

      if (url.pathname === "/rooms") {
        const list = Array.from(rooms.entries()).map(([id, room]) => ({
          ...room.getInfo(),
          roomId: id,
        }));
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(list));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Dark War multiplayer server is running.\n");
    },
  );

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const roomId = sanitizeRoomId(url.searchParams.get("room"));
    const playerName = sanitizePlayerName(url.searchParams.get("name"));

    let room = rooms.get(roomId);
    if (!room) {
      room = new RoomSession(roomId, (closedRoomId) =>
        rooms.delete(closedRoomId),
      );
      rooms.set(roomId, room);
    }

    room.addClient(socket, playerName);

    socket.on("message", (rawMessage) =>
      room?.handleMessage(socket, rawMessage),
    );
    socket.on("close", () => room?.removeClient(socket));
    socket.on("error", () => room?.removeClient(socket));
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort =
        typeof address === "object" && address ? address.port : port;
      console.log(
        `[dark-war-server] Listening on ws://localhost:${actualPort}`,
      );
      resolve({
        port: actualPort,
        close(): Promise<void> {
          return new Promise((res) => {
            for (const client of wss.clients) client.terminate();
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
  startMultiplayerServer(port)
    .then(() => {
      console.log(`[dark-war-server] Ready on port ${port}`);
    })
    .catch((err) => {
      console.error("[dark-war-server] Failed to start:", err);
      process.exit(1);
    });

  // IPC from parent process (when forked by Electron main)
  process.on("message", (msg: unknown) => {
    if (
      typeof msg === "object" &&
      msg !== null &&
      (msg as Record<string, unknown>).type === "shutdown"
    ) {
      process.exit(0);
    }
  });
}
