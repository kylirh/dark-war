import { SerializedState } from "../types";
import { PROTOCOL_VERSION } from "./protocol";
import { StateDelta, applyStateDelta } from "./state-delta";

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
}

export interface LobbyUpdate {
  players: LobbyPlayer[];
  roomId: string;
  phase: "lobby" | "playing";
}

export type NetworkAction =
  | {
      type: "FIRE";
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
  | { type: "TOGGLE_GOD_MODE" };

type ServerMessage =
  | {
      type: "welcome";
      playerId: string;
      roomId: string;
      isHost: boolean;
      protocolVersion?: number;
    }
  | {
      type: "lobby_update";
      players: LobbyPlayer[];
      roomId: string;
      phase: "lobby" | "playing";
    }
  | { type: "state_full"; state: SerializedState; seq: number; ackSeq?: number }
  | { type: "state_delta"; delta: StateDelta; ackSeq?: number }
  | { type: "error"; message: string };

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private readonly serverUrl: string;
  private readonly roomId: string;
  private readonly playerName: string;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;
  private localPlayerId: string | null = null;
  private isHost = false;
  // Monotonic id stamped on every input so the server can tell us which of
  // our inputs it has processed (drives client-side reconciliation).
  private inputSeq = 0;
  // Highest input seq the server has acknowledged in a state message.
  private lastAckedSeq = 0;
  // Last full state reconstructed from the server, used as the baseline that
  // incoming deltas are applied onto. Null until the first keyframe arrives.
  private stateBaseline: SerializedState | null = null;
  private baselineSeq = 0;

  private onStateCallback?: (state: SerializedState) => void;
  private onConnectedCallback?: (
    playerId: string,
    roomId: string,
    isHost: boolean,
  ) => void;
  private onDisconnectedCallback?: () => void;
  private onErrorCallback?: (message: string) => void;
  private onLobbyUpdateCallback?: (update: LobbyUpdate) => void;

  constructor(serverUrl: string, roomId: string, playerName: string) {
    this.serverUrl = serverUrl;
    this.roomId = roomId;
    this.playerName = playerName;
  }

  public connect(): void {
    if (this.socket) return;
    this.shouldReconnect = true;

    let url: URL;
    try {
      url = new URL(this.serverUrl);
    } catch {
      this.onErrorCallback?.(`Invalid server URL: ${this.serverUrl}`);
      return;
    }

    url.searchParams.set("room", this.roomId);
    url.searchParams.set("name", this.playerName);
    this.socket = new WebSocket(url.toString());

    this.socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    this.socket.addEventListener("close", () => {
      this.socket = null;
      this.localPlayerId = null;
      this.isHost = false;
      this.onDisconnectedCallback?.();
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      this.onErrorCallback?.(`Connection error (${this.serverUrl}).`);
    });
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  }

  public getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  // ── Callbacks ────────────────────────────────────────────────────────────────

  public onState(callback: (state: SerializedState) => void): void {
    this.onStateCallback = callback;
  }

  public onConnected(
    callback: (playerId: string, roomId: string, isHost: boolean) => void,
  ): void {
    this.onConnectedCallback = callback;
  }

  public onDisconnected(callback: () => void): void {
    this.onDisconnectedCallback = callback;
  }

  public onError(callback: (message: string) => void): void {
    this.onErrorCallback = callback;
  }

  public onLobbyUpdate(callback: (update: LobbyUpdate) => void): void {
    this.onLobbyUpdateCallback = callback;
  }

  // ── Send actions ─────────────────────────────────────────────────────────────

  /**
   * Send a velocity update. Returns the input seq stamped on it so the caller
   * can record it in its prediction buffer for later reconciliation.
   */
  public sendVelocity(vx: number, vy: number): number {
    const seq = ++this.inputSeq;
    this.send({
      type: "velocity",
      vx: Number.isFinite(vx) ? vx : 0,
      vy: Number.isFinite(vy) ? vy : 0,
      seq,
    });
    return seq;
  }

  /** Send a player action. Returns the input seq stamped on it. */
  public sendAction(action: NetworkAction): number {
    const seq = ++this.inputSeq;
    this.send({ type: "action", action, seq });
    return seq;
  }

  /** Highest input seq the server has acknowledged processing. */
  public getLastAckedSeq(): number {
    return this.lastAckedSeq;
  }

  public selectWeapon(slot: number): void {
    this.send({ type: "select_weapon", slot });
  }

  public swapInventory(from: number, to: number): void {
    this.send({ type: "inventory_swap", from, to });
  }

  public requestNewGame(): void {
    this.send({ type: "new_game" });
  }

  public requestStartGame(): void {
    this.send({ type: "start_game" });
  }

  public setName(name: string): void {
    this.send({ type: "set_name", name });
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private send(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }

  private applyAck(ackSeq: number | undefined): void {
    if (typeof ackSeq === "number" && ackSeq > this.lastAckedSeq) {
      this.lastAckedSeq = ackSeq;
    }
  }

  private requestKeyframe(): void {
    this.send({ type: "request_keyframe" });
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer !== null) return;
    this.reconnectAttempts += 1;
    const delayMs = Math.min(5000, 500 * this.reconnectAttempts);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.onErrorCallback?.("Reconnecting to multiplayer server...");
      this.connect();
    }, delayMs);
  }

  private handleMessage(rawData: unknown): void {
    const text =
      typeof rawData === "string"
        ? rawData
        : rawData instanceof ArrayBuffer
          ? new TextDecoder().decode(rawData)
          : "";
    if (!text) return;

    let message: ServerMessage;
    try {
      message = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }

    if (message.type === "welcome") {
      if (
        typeof message.playerId !== "string" ||
        typeof message.roomId !== "string"
      )
        return;
      if (
        typeof message.protocolVersion === "number" &&
        message.protocolVersion !== PROTOCOL_VERSION
      ) {
        // Incompatible build — stop trying to play rather than desync silently.
        this.shouldReconnect = false;
        this.onErrorCallback?.(
          `Incompatible server (protocol v${message.protocolVersion}, expected v${PROTOCOL_VERSION}). Update the game.`,
        );
        this.disconnect();
        return;
      }
      this.localPlayerId = message.playerId;
      this.isHost = message.isHost;
      this.inputSeq = 0;
      this.lastAckedSeq = 0;
      this.stateBaseline = null;
      this.baselineSeq = 0;
      this.onConnectedCallback?.(
        message.playerId,
        message.roomId,
        message.isHost,
      );
      return;
    }

    if (message.type === "lobby_update") {
      if (!Array.isArray(message.players) || typeof message.roomId !== "string")
        return;
      this.onLobbyUpdateCallback?.({
        players: message.players,
        roomId: message.roomId,
        phase: message.phase,
      });
      return;
    }

    if (message.type === "state_full") {
      if (message.state == null || typeof message.state !== "object") return;
      this.applyAck(message.ackSeq);
      this.stateBaseline = message.state;
      this.baselineSeq = message.seq;
      this.onStateCallback?.(message.state);
      return;
    }

    if (message.type === "state_delta") {
      if (message.delta == null || typeof message.delta !== "object") return;
      this.applyAck(message.ackSeq);
      // A delta is only valid on top of the baseline it was computed against.
      // If we don't have that exact baseline, ask for a fresh keyframe and
      // drop this delta rather than corrupt our state.
      if (
        this.stateBaseline === null ||
        message.delta.baseSeq !== this.baselineSeq
      ) {
        this.requestKeyframe();
        return;
      }
      const reconstructed = applyStateDelta(this.stateBaseline, message.delta);
      this.stateBaseline = reconstructed;
      this.baselineSeq = message.delta.seq;
      this.onStateCallback?.(reconstructed);
      return;
    }

    if (message.type === "error") {
      if (typeof message.message !== "string") return;
      this.onErrorCallback?.(message.message);
    }
  }
}
