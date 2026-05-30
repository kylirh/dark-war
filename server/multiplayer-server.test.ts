import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { startMultiplayerServer } from "./multiplayer-server";

type Server = Awaited<ReturnType<typeof startMultiplayerServer>>;

let server: Server | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

function connect(port: number, name: string): WebSocket {
  return new WebSocket(`ws://localhost:${port}/?room=test&name=${name}`);
}

/** Resolve with the first message whose `type` matches. */
function waitFor(socket: WebSocket, type: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    socket.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    socket.on("error", reject);
  });
}

function send(socket: WebSocket, payload: unknown): void {
  socket.send(JSON.stringify(payload));
}

describe("multiplayer server (multi-world)", () => {
  it("boots, lobbies a host, starts the game, and broadcasts a keyframe", async () => {
    server = await startMultiplayerServer(0);
    const client = connect(server.port, "Host");

    const welcome = await waitFor(client, "welcome");
    expect(welcome.playerId).toBeTruthy();
    expect(welcome.isHost).toBe(true);

    send(client, { type: "start_game" });

    const full = await waitFor(client, "state_full");
    expect(full.state).toBeTruthy();
    expect(full.state.player.id).toBe(welcome.playerId);
    expect(full.state.depth).toBe(0); // everyone starts in the entry world

    client.close();
  });

  it("changes the player's weapon by inventory bar slot", async () => {
    server = await startMultiplayerServer(0);
    const client = connect(server.port, "Host");
    await waitFor(client, "welcome");

    send(client, { type: "start_game" });
    const initial = await waitFor(client, "state_full");
    expect(initial.state.player.weapon).toBe("pistol"); // default

    // Bar slot 2 holds a grenade by default; selecting it should switch weapons.
    send(client, { type: "select_weapon", slot: 2 });
    send(client, { type: "request_keyframe" });
    const updated = await waitFor(client, "state_full");
    expect(updated.state.player.weapon).toBe("grenade");
    expect(updated.state.player.selectedBarSlot).toBe(2);

    client.close();
  });

  it("applies an authoritative inventory swap", async () => {
    server = await startMultiplayerServer(0);
    const client = connect(server.port, "Host");
    await waitFor(client, "welcome");
    send(client, { type: "start_game" });
    await waitFor(client, "state_full");

    // Default: slot 0 = pistol, slot 2 = grenade. Swap them.
    send(client, { type: "inventory_swap", from: 0, to: 2 });
    send(client, { type: "request_keyframe" });
    const updated = await waitFor(client, "state_full");

    expect(updated.state.player.inventorySlots[0].type).toBe("grenade");
    expect(updated.state.player.inventorySlots[2].type).toBe("pistol");
    // Selected bar slot 0 now holds the grenade, so the weapon follows.
    expect(updated.state.player.weapon).toBe("grenade");

    client.close();
  });

  it("keeps two players in the same entry world", async () => {
    server = await startMultiplayerServer(0);
    const host = connect(server.port, "Host");
    const hostWelcome = await waitFor(host, "welcome");

    const guest = connect(server.port, "Guest");
    await waitFor(guest, "welcome");

    send(host, { type: "start_game" });

    const hostState = await waitFor(host, "state_full");
    const guestState = await waitFor(guest, "state_full");

    // Both players are on the same depth and each sees two players.
    expect(hostState.state.depth).toBe(0);
    expect(guestState.state.depth).toBe(0);
    expect(hostState.state.players.length).toBe(2);

    host.close();
    guest.close();
    void hostWelcome;
  });
});
