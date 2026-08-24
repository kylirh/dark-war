import { describe, it, expect, afterEach } from "vitest";
import { RawData, WebSocket } from "ws";
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
function waitFor(
  socket: WebSocket,
  type: string,
  timeoutMs = 2000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onMessage = (raw: RawData): void => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        cleanup();
        resolve(msg);
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${type}`));
    }, timeoutMs);
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function send(socket: WebSocket, payload: unknown): void {
  socket.send(JSON.stringify(payload));
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function requestState(socket: WebSocket): Promise<any> {
  const state = waitFor(socket, "state_full");
  send(socket, { type: "request_keyframe" });
  return state;
}

function gridPosition(entity: { worldX: number; worldY: number }): {
  x: number;
  y: number;
} {
  return {
    x: Math.floor(entity.worldX / 32),
    y: Math.floor(entity.worldY / 32),
  };
}

async function approachMarda(
  socket: WebSocket,
  approach: "west" | "north",
): Promise<any> {
  let lastPosition = "unknown";
  for (let attempt = 0; attempt < 20; attempt++) {
    const snapshot = await requestState(socket);
    const marda = snapshot.state.entities.find(
      (entity: { name?: string }) => entity.name === "Marda",
    );
    if (!marda) throw new Error("Marda missing from entry world");
    const playerPosition = gridPosition(snapshot.state.player);
    const mardaPosition = gridPosition(marda);
    lastPosition = `${playerPosition.x},${playerPosition.y} -> ${mardaPosition.x},${mardaPosition.y}`;
    if (
      Math.abs(playerPosition.x - mardaPosition.x) +
        Math.abs(playerPosition.y - mardaPosition.y) ===
      1
    ) {
      send(socket, { type: "velocity", vx: 0, vy: 0 });
      return snapshot;
    }
    const deltaX = mardaPosition.x - playerPosition.x;
    const deltaY = mardaPosition.y - playerPosition.y;
    const moveHorizontally = approach === "west" ? deltaY === 0 : deltaX !== 0;
    send(socket, {
      type: "velocity",
      vx: moveHorizontally ? Math.sign(deltaX) * 180 : 0,
      vy: moveHorizontally ? 0 : Math.sign(deltaY) * 180,
    });
    await delay(75);
  }
  send(socket, { type: "velocity", vx: 0, vy: 0 });
  throw new Error(`client did not reach Marda (${lastPosition})`);
}

function interactWithMarda(
  socket: WebSocket,
  snapshot: any,
  seq: number,
): void {
  const marda = snapshot.state.entities.find(
    (entity: { name?: string }) => entity.name === "Marda",
  );
  if (!marda) throw new Error("Marda missing from entry world");
  const playerPosition = gridPosition(snapshot.state.player);
  const mardaPosition = gridPosition(marda);
  send(socket, {
    type: "action",
    action: {
      type: "INTERACT",
      dx: mardaPosition.x - playerPosition.x,
      dy: mardaPosition.y - playerPosition.y,
    },
    seq,
  });
}

function waitForCallout(socket: WebSocket, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout waiting for world callout")),
      timeoutMs,
    );
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const callouts =
        message.type === "state_full"
          ? message.state.callouts
          : message.type === "state_delta"
            ? message.delta.callouts
            : undefined;
      if (Array.isArray(callouts) && callouts.length > 0) {
        clearTimeout(timer);
        resolve(callouts[0]);
      }
    });
    socket.on("error", reject);
  });
}

function collectCalloutsFor(
  socket: WebSocket,
  durationMs: number,
): Promise<any[]> {
  return new Promise((resolve) => {
    const found: any[] = [];
    const onMessage = (raw: RawData): void => {
      const message = JSON.parse(raw.toString());
      const callouts =
        message.type === "state_full"
          ? message.state.callouts
          : message.type === "state_delta"
            ? message.delta.callouts
            : undefined;
      if (Array.isArray(callouts)) found.push(...callouts);
    };
    socket.on("message", onMessage);
    setTimeout(() => {
      socket.off("message", onMessage);
      resolve(found);
    }, durationMs);
  });
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

  it("keeps a dead player in the current world until an explicit respawn request", async () => {
    server = await startMultiplayerServer(0);
    const client = connect(server.port, "Host");
    await waitFor(client, "welcome");

    send(client, { type: "start_game" });
    const initial = await waitFor(client, "state_full");
    const blackPillSlot = initial.state.player.inventorySlots.findIndex(
      (slot: { type: string | null }) => slot.type === "black-pill",
    );
    expect(blackPillSlot).toBeGreaterThanOrEqual(0);

    send(client, { type: "select_weapon", slot: blackPillSlot });
    send(client, {
      type: "action",
      action: { type: "USE_ITEM", dx: 0, dy: 0 },
      seq: 1,
    });
    await delay(100);
    const dead = await requestState(client);
    expect(dead.state.player.hp).toBe(0);
    expect(dead.state.depth).toBe(initial.state.depth);
    expect(dead.state.worldPlaneId).toBe(initial.state.worldPlaneId);
    expect(dead.state.player.inventoryDroppedOnDeath).toBe(true);

    send(client, { type: "request_respawn" });
    await delay(100);
    const respawned = await requestState(client);
    expect(respawned.state.player.hp).toBeGreaterThan(0);
    expect(respawned.state.depth).toBe(dead.state.depth);
    expect(respawned.state.worldPlaneId).toBe(dead.state.worldPlaneId);
    expect(respawned.state.player.inventoryDroppedOnDeath).toBe(false);

    client.close();
  });

  it("changes the player's weapon by inventory bar slot", async () => {
    server = await startMultiplayerServer(0);
    const client = connect(server.port, "Host");
    await waitFor(client, "welcome");

    send(client, { type: "start_game" });
    const initial = await waitFor(client, "state_full");
    // Starter weapon is a pistol or a laser, depending on the random loadout.
    expect(["pistol", "laser"]).toContain(initial.state.player.weapon);

    // The butcher knife is always in the starter kit; selecting it should
    // switch to the melee weapon.
    const knifeSlot = initial.state.player.inventorySlots.findIndex(
      (s: { type: string | null }) => s.type === "butcher-knife",
    );
    expect(knifeSlot).toBeGreaterThanOrEqual(0);
    send(client, { type: "select_weapon", slot: knifeSlot });
    send(client, { type: "request_keyframe" });
    const updated = await waitFor(client, "state_full");
    expect(updated.state.player.weapon).toBe("melee");
    expect(updated.state.player.selectedBarSlot).toBe(knifeSlot);

    client.close();
  });

  it("applies an authoritative inventory swap", async () => {
    server = await startMultiplayerServer(0);
    const client = connect(server.port, "Host");
    await waitFor(client, "welcome");
    send(client, { type: "start_game" });
    const initial = await waitFor(client, "state_full");

    // Swap the primary firearm (slot 0) with the always-present butcher knife.
    const slot0Type = initial.state.player.inventorySlots[0].type;
    const knifeSlot = initial.state.player.inventorySlots.findIndex(
      (s: { type: string | null }) => s.type === "butcher-knife",
    );
    expect(knifeSlot).toBeGreaterThan(0);
    send(client, { type: "inventory_swap", from: 0, to: knifeSlot });
    send(client, { type: "request_keyframe" });
    const updated = await waitFor(client, "state_full");

    expect(updated.state.player.inventorySlots[0].type).toBe("butcher-knife");
    expect(updated.state.player.inventorySlots[knifeSlot].type).toBe(slot0Type);
    // Selected bar slot 0 now holds the knife, so the weapon follows.
    expect(updated.state.player.weapon).toBe("melee");

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

  it("validates and broadcasts player speech to everyone on the plane", async () => {
    server = await startMultiplayerServer(0);
    const host = connect(server.port, "Host");
    const hostWelcome = await waitFor(host, "welcome");
    const guest = connect(server.port, "Guest");
    await waitFor(guest, "welcome");
    send(host, { type: "start_game" });
    await Promise.all([
      waitFor(host, "state_full"),
      waitFor(guest, "state_full"),
    ]);

    const hostCallout = waitForCallout(host);
    const guestCallout = waitForCallout(guest);
    send(host, {
      type: "action",
      action: { type: "SPEAK", kind: "speech", text: "  Hello\nworld!  " },
      seq: 1,
    });

    await expect(hostCallout).resolves.toMatchObject({
      kind: "speech",
      speakerId: hostWelcome.playerId,
      text: "Hello world!",
    });
    await expect(guestCallout).resolves.toMatchObject({
      kind: "speech",
      speakerId: hostWelcome.playerId,
      text: "Hello world!",
    });

    const rateLimitedCallouts = collectCalloutsFor(host, 300);
    send(host, {
      type: "action",
      action: { type: "SPEAK", kind: "speech", text: "Too soon" },
      seq: 2,
    });
    await expect(rateLimitedCallouts).resolves.toEqual([]);

    host.close();
    guest.close();
  });

  it("keeps simultaneous NPC conversations private and authoritative", async () => {
    server = await startMultiplayerServer(0);
    const host = connect(server.port, "Host");
    await waitFor(host, "welcome");
    const guest = connect(server.port, "Guest");
    await waitFor(guest, "welcome");
    send(host, { type: "start_game" });
    await Promise.all([
      waitFor(host, "state_full"),
      waitFor(guest, "state_full"),
    ]);

    // Separate the initially co-located solid player bodies, then approach the
    // same speaker from different sides.
    send(guest, { type: "velocity", vx: 0, vy: -180 });
    await delay(400);
    send(guest, { type: "velocity", vx: 0, vy: 0 });
    const hostNearMarda = await approachMarda(host, "west");
    interactWithMarda(host, hostNearMarda, 1);
    await delay(100);
    const guestNearMarda = await approachMarda(guest, "north");
    interactWithMarda(guest, guestNearMarda, 1);
    await delay(100);

    let [hostState, guestState] = await Promise.all([
      requestState(host),
      requestState(guest),
    ]);
    expect(hostState.state.conversation).toMatchObject({
      speakerName: "Marda",
      revision: 1,
    });
    expect(guestState.state.conversation).toMatchObject({
      speakerName: "Marda",
      revision: 1,
    });
    const mardaId = hostState.state.conversation.speakerId;
    const conversationTick = hostState.state.sim.nowTick;

    send(host, {
      type: "action",
      action: {
        type: "DIALOGUE_CHOICE",
        choiceId: "name",
        expectedRevision: 1,
      },
      seq: 2,
    });
    send(guest, {
      type: "action",
      action: {
        type: "DIALOGUE_CHOICE",
        choiceId: "gear",
        expectedRevision: 1,
      },
      seq: 2,
    });
    await delay(100);
    [hostState, guestState] = await Promise.all([
      requestState(host),
      requestState(guest),
    ]);
    expect(hostState.state.conversation).toMatchObject({
      revision: 2,
      allowFreeText: true,
    });
    expect(guestState.state.conversation).toMatchObject({
      revision: 2,
      canContinue: true,
    });
    expect(hostState.state.socialFacts[mardaId]?.flags?.receivedGear).not.toBe(
      true,
    );
    expect(guestState.state.socialFacts[mardaId]?.flags?.receivedGear).toBe(
      true,
    );

    const hostWorldX = hostState.state.player.worldX;
    send(host, { type: "velocity", vx: -180, vy: 0, seq: 3 });
    send(host, {
      type: "action",
      action: { type: "FIRE", dx: 1, dy: 0 },
      seq: 4,
    });
    await delay(100);
    hostState = await requestState(host);
    expect(hostState.state.player.worldX).toBe(hostWorldX);
    expect(hostState.state.entities).not.toContainEqual(
      expect.objectContaining({
        kind: "bullet",
        ownerId: hostState.state.player.id,
      }),
    );
    expect(hostState.state.sim.nowTick).toBeGreaterThan(conversationTick);

    send(host, {
      type: "action",
      action: {
        type: "DIALOGUE_CHOICE",
        choiceId: "__freeText",
        freeText: "Ripley",
        expectedRevision: 2,
      },
      seq: 5,
    });
    send(guest, {
      type: "action",
      action: {
        type: "DIALOGUE_CHOICE",
        choiceId: "__continue",
        expectedRevision: 2,
      },
      seq: 3,
    });
    await delay(100);
    [hostState, guestState] = await Promise.all([
      requestState(host),
      requestState(guest),
    ]);
    expect(hostState.state.socialFacts[mardaId]?.notes?.name).toBe("Ripley");
    expect(guestState.state.socialFacts[mardaId]?.notes?.name).toBeUndefined();
    expect(hostState.state.conversation.revision).toBe(3);
    expect(guestState.state.conversation.revision).toBe(3);

    send(guest, {
      type: "action",
      action: {
        type: "DIALOGUE_LEAVE",
        expectedRevision: 3,
      },
      seq: 4,
    });
    await delay(100);
    [hostState, guestState] = await Promise.all([
      requestState(host),
      requestState(guest),
    ]);
    expect(hostState.state.conversation).toBeTruthy();
    expect(guestState.state.conversation).toBeUndefined();

    host.close();
    guest.close();
  }, 15_000);
});
