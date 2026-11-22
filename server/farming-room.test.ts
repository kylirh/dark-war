/** Test the authoritative room and its disk checkpoint without opening a port. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { Game } from "../src/engine/core/game";
import { WorldAddress } from "../src/engine/core/world-space";
import {
  FixtureType,
  GroundType,
  StructureType,
} from "../src/engine/core/world-semantics";
import { EntityKind, SerializedState } from "../src/engine/types";
import { applyStateDelta, StateDelta } from "../src/net/state-delta";
import { RoomSession } from "./multiplayer-server";

class RoomClient {
  state?: SerializedState;
  readonly socket = {
    readyState: WebSocket.OPEN,
    send: (raw: string): void => {
      const message = JSON.parse(raw) as
        | { type: "state_full"; state: SerializedState }
        | { type: "state_delta"; delta: StateDelta };
      if (message.type === "state_full") this.state = message.state;
      if (message.type === "state_delta" && this.state) {
        this.state = applyStateDelta(this.state, message.delta);
      }
    },
  } as WebSocket;

  constructor(readonly room: RoomSession) {
    room.addClient(this.socket, "Grower");
  }

  send(message: object): void {
    this.room.handleMessage(this.socket, Buffer.from(JSON.stringify(message)));
  }

  equipAndUse(slot: number, x: number, y: number): void {
    this.send({ type: "select_weapon", slot });
    this.send({
      type: "action",
      action: {
        type: "USE_ITEM",
        dx: 0,
        dy: 0,
        targetWorldX: x * 32 + 16,
        targetWorldY: y * 32 + 16,
      },
    });
    vi.advanceTimersByTime(100);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("replicates authoritatively grown crops and restores them on a new room instance", () => {
  vi.useFakeTimers();
  const directory = mkdtempSync(join(tmpdir(), "dark-war-farm-"));
  const reset = Game.prototype.resetToWorld;
  vi.spyOn(Game.prototype, "resetToWorld").mockImplementation(function (
    this: Game,
    address: WorldAddress,
  ): void {
    reset.call(this, address);
    const state = this.getState();
    state.entityManager.destroyWhere(
      (entity) => entity.kind !== EntityKind.PLAYER,
    );
    const [spawnX, spawnY] = state.playerStart;
    for (let y = spawnY - 1; y <= spawnY + 1; y++) {
      for (let x = spawnX - 1; x <= spawnX + 2; x++) {
        state.worldPlane.editCell(x, y, {
          ground: GroundType.GRASS,
          structure: StructureType.NONE,
          fixture: FixtureType.NONE,
          elevation: 0,
        });
      }
    }
  });

  try {
    const room = new RoomSession("garden", () => {}, directory);
    const host = new RoomClient(room);
    host.send({ type: "start_game" });
    const guest = new RoomClient(room);
    const x = Math.floor(host.state!.player.worldX / 32) + 1;
    const y = Math.floor(host.state!.player.worldY / 32);
    host.equipAndUse(4, x, y);
    host.equipAndUse(6, x, y);
    host.equipAndUse(5, x, y);
    vi.advanceTimersByTime(11_000);
    const plots = host.state!.plane.plots;
    expect(plots?.[0][1].crop?.stage).toBe("seedling");
    expect(guest.state!.plane.plots).toEqual(plots);
    expect(host.state!.player.wateringCanWater).toBe(11);
    expect(guest.state!.player.wateringCanWater).toBeUndefined();
    room.removeClient(guest.socket);
    room.removeClient(host.socket);

    vi.advanceTimersByTime(120_000);
    const restored = new RoomSession("garden", () => {}, directory);
    const grower = new RoomClient(restored);
    grower.send({ type: "start_game" });
    expect(grower.state!.plane.plots).toEqual(plots);
    expect(grower.state!.simulationSeed).toBe(host.state!.simulationSeed);
    restored.removeClient(grower.socket);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
