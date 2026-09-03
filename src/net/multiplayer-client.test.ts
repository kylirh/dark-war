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
});
