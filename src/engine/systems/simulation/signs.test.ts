import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../../core/game";
import { signViewFor } from "../../content/sign-defs";
import { CommandType, EventType, SignPlacement } from "../../types";
import { processEventQueue } from "./events";
import { resolveCommand } from "./commands";
import { RNG } from "../../utils/rng";

function readAt(game: Game, x: number, y: number): void {
  const state = game.getState();
  resolveCommand(state, {
    id: "read-sign",
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.INTERACT,
    data: { type: "INTERACT", x, y },
    priority: 1,
    source: "PLAYER",
  });
  const event = state.eventQueue[0];
  if (!event) return;
  expect(event.data.type).toBe("SIGN_READ");
  expect(event.type).toBe(EventType.SIGN_READ);
  processEventQueue(state);
}

describe("environmental signs", () => {
  beforeEach(() => RNG.reseed(424242));

  it("stamps authored and generated placements without changing collision", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const state = game.getState();

    expect(state.signs).toEqual(
      expect.arrayContaining([
        {
          id: "outside/surface:sign:park-welcome",
          definitionId: "surface.park-welcome",
          x: 13,
          y: 58,
        },
        {
          id: "settlement.workshop-garden@57,56:sign:4",
          definitionId: "settlement.workshop-notice",
          x: 61,
          y: 57,
        },
      ]),
    );
    expect(state.tiles.passable(13, 58)).toBe(true);
    expect(state.tiles.passable(61, 57)).toBe(true);
  });

  it("opens a visible sign from an adjacent interaction and blocks distant reads", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const state = game.getState();
    const sign = state.signs.find(
      (candidate) => candidate.id === "outside/surface:sign:park-welcome",
    );
    if (!sign) throw new Error("Expected the authored park sign");

    readAt(game, sign.x, sign.y);
    expect(game.getSignView()).toEqual(signViewFor(sign));

    game.clearSignView();
    readAt(game, sign.x + 4, sign.y);
    expect(game.getSignView()).toBeUndefined();
  });

  it("honors each player's visibility and never serializes the reader into a save", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const state = game.getState();
    const sign = state.signs[0];
    if (!sign) throw new Error("Expected an authored sign");

    state.visibilityByPlayer.set(state.player.id, new Set());
    state.visible.clear();
    readAt(game, sign.x, sign.y);
    expect(game.getSignView()).toBeUndefined();

    state.visibilityByPlayer.set(
      state.player.id,
      new Set([sign.x + sign.y * state.mapWidth]),
    );
    state.visible = new Set([sign.x + sign.y * state.mapWidth]);
    readAt(game, sign.x, sign.y);
    expect(game.getSignView()).toBeDefined();

    const serialized = game.serialize();
    expect(serialized.activeSign).toBeUndefined();
    const restored = new Game({ mode: "offline" });
    restored.deserialize(serialized);
    expect(restored.getState().signs).toEqual(state.signs);
    expect(restored.getSignView()).toBeUndefined();
  });

  it("keeps sign reader views private in online snapshots", () => {
    const game = new Game({ mode: "online" });
    game.reset(0);
    const state = game.getState();
    const secondPlayer = game.addNetworkPlayer("p2");
    const firstSign = state.signs[0];
    const secondSign = state.signs[1];
    if (!firstSign || !secondSign) throw new Error("Expected two signs");
    const firstView = signViewFor(firstSign);
    const secondView = signViewFor(secondSign);
    if (!firstView || !secondView) throw new Error("Expected sign definitions");

    state.activeSignViews.set(state.player.id, firstView);
    state.activeSignViews.set(secondPlayer.id, secondView);
    const firstSnapshot = game.serializeForPlayer(state.player.id);
    const secondSnapshot = game.serializeForPlayer(secondPlayer.id);

    expect(firstSnapshot.signs).toEqual(secondSnapshot.signs);
    expect(firstSnapshot.activeSign?.id).toBe(firstView.id);
    expect(secondSnapshot.activeSign?.id).toBe(secondView.id);
    expect(firstSnapshot.activeSign?.id).not.toBe(
      secondSnapshot.activeSign?.id,
    );
  });

  it("rejects duplicate or unknown placements before they enter state", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const serialized = game.serialize();
    const duplicate: SignPlacement = { ...serialized.signs[0] };
    serialized.signs = [...serialized.signs, duplicate];
    expect(() => new Game({ mode: "offline" }).deserialize(serialized)).toThrow(
      "Invalid sign placement id",
    );

    serialized.signs = [
      { ...duplicate, id: "bad-definition", definitionId: "missing" },
    ];
    expect(() => new Game({ mode: "offline" }).deserialize(serialized)).toThrow(
      "Unknown sign definition",
    );
  });
});
