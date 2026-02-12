import { SerializedState } from "../types";

export type NetworkAction =
  | { type: "FIRE"; dx: number; dy: number; facingAngle?: number }
  | { type: "INTERACT"; dx: number; dy: number }
  | { type: "PICKUP" }
  | { type: "RELOAD" }
  | { type: "WAIT" }
  | { type: "DESCEND" }
  | { type: "ASCEND" };

type ServerMessage =
  | { type: "welcome"; playerId: string; roomId: string }
  | { type: "state"; state: SerializedState }
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
  private onStateCallback?: (state: SerializedState) => void;
  private onConnectedCallback?: (playerId: string, roomId: string) => void;
  private onDisconnectedCallback?: () => void;
  private onErrorCallback?: (message: string) => void;

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
      if (this.onErrorCallback) {
        this.onErrorCallback(`Invalid server URL: ${this.serverUrl}`);
      }
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
      if (this.onDisconnectedCallback) {
        this.onDisconnectedCallback();
      }
      this.scheduleReconnect();
    });
    this.socket.addEventListener("error", () => {
      if (this.onErrorCallback) {
        this.onErrorCallback(`Connection error (${this.serverUrl}).`);
      }
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

  public onState(callback: (state: SerializedState) => void): void {
    this.onStateCallback = callback;
  }

  public onConnected(callback: (playerId: string, roomId: string) => void): void {
    this.onConnectedCallback = callback;
  }

  public onDisconnected(callback: () => void): void {
    this.onDisconnectedCallback = callback;
  }

  public onError(callback: (message: string) => void): void {
    this.onErrorCallback = callback;
  }

  public sendVelocity(vx: number, vy: number): void {
    this.send({
      type: "velocity",
      vx: Number.isFinite(vx) ? vx : 0,
      vy: Number.isFinite(vy) ? vy : 0,
    });
  }

  public sendAction(action: NetworkAction): void {
    this.send({
      type: "action",
      action,
    });
  }

  public selectWeapon(slot: number): void {
    this.send({
      type: "select_weapon",
      slot,
    });
  }

  public requestNewGame(): void {
    this.send({
      type: "new_game",
    });
  }

  private send(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer !== null) {
      return;
    }
    this.reconnectAttempts += 1;
    const delayMs = Math.min(5000, 500 * this.reconnectAttempts);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.onErrorCallback) {
        this.onErrorCallback("Reconnecting to multiplayer server...");
      }
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
      this.localPlayerId = message.playerId;
      if (this.onConnectedCallback) {
        this.onConnectedCallback(message.playerId, message.roomId);
      }
      return;
    }

    if (message.type === "state") {
      if (this.onStateCallback) {
        this.onStateCallback(message.state);
      }
      return;
    }

    if (message.type === "error" && this.onErrorCallback) {
      this.onErrorCallback(message.message);
    }
  }
}
