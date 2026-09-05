import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MultiplayerClient } from "./multiplayer-client";

describe("MultiplayerClient", () => {
  let originalWebSocket: typeof WebSocket;
  let mockSocket: any;

  beforeEach(() => {
    if (typeof globalThis !== "undefined") {
      originalWebSocket = (globalThis as any).WebSocket;
    }
    mockSocket = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
      readyState: 0, // CONNECTING
    };
    (globalThis as any).WebSocket = class {
      constructor() {
        return mockSocket;
      }
    };
  });

  afterEach(() => {
    if (originalWebSocket) {
      (globalThis as any).WebSocket = originalWebSocket;
    } else {
      delete (globalThis as any).WebSocket;
    }
    vi.restoreAllMocks();
  });

  it("handles socket errors correctly", () => {
    const client = new MultiplayerClient(
      "ws://localhost:8080",
      "room-1",
      "player-1",
    );

    const onErrorMock = vi.fn();
    client.onError(onErrorMock);

    client.connect();

    // Verify error listener was added
    const errorCall = mockSocket.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === "error",
    );
    expect(errorCall).toBeDefined();

    // Trigger error
    const errorCallback = errorCall[1];
    errorCallback();

    // Verify onErrorCallback was invoked with the expected message
    expect(onErrorMock).toHaveBeenCalledWith(
      "Connection error (ws://localhost:8080).",
    );
  });

  describe("lobby_update", () => {
    const deliver = (client: MultiplayerClient, payload: unknown): void => {
      client.connect();
      const messageCall = mockSocket.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === "message",
      );
      expect(messageCall).toBeDefined();
      messageCall[1]({ data: JSON.stringify(payload) });
    };

    it("forwards a well-formed lobby roster", () => {
      const client = new MultiplayerClient("ws://localhost:8080", "r", "p");
      const onLobby = vi.fn();
      client.onLobbyUpdate(onLobby);

      deliver(client, {
        type: "lobby_update",
        roomId: "r",
        phase: "lobby",
        players: [{ id: "a", name: "Kylir", isHost: true }],
      });

      expect(onLobby).toHaveBeenCalledTimes(1);
      expect(onLobby.mock.calls[0][0].players).toEqual([
        { id: "a", name: "Kylir", isHost: true },
      ]);
    });

    it("drops a roster whose entries are the wrong type", () => {
      // The client can be pointed at any address, so a server may send a name
      // that is not a string. game-menu.ts interpolates it into innerHTML, so
      // it must be rejected here rather than reaching the UI.
      const client = new MultiplayerClient("ws://localhost:8080", "r", "p");
      const onLobby = vi.fn();
      client.onLobbyUpdate(onLobby);

      deliver(client, {
        type: "lobby_update",
        roomId: "r",
        phase: "lobby",
        players: [{ id: "a", name: 1337, isHost: true }],
      });

      expect(onLobby).not.toHaveBeenCalled();
    });

    it("drops a roster containing a non-object entry", () => {
      const client = new MultiplayerClient("ws://localhost:8080", "r", "p");
      const onLobby = vi.fn();
      client.onLobbyUpdate(onLobby);

      deliver(client, {
        type: "lobby_update",
        roomId: "r",
        phase: "lobby",
        players: [null],
      });

      expect(onLobby).not.toHaveBeenCalled();
    });
  });
});
