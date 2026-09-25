import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { resolveCommand } from "./commands";
import { setPositionFromGrid } from "../../utils/helpers";

describe("transition commands (getTransitionPortal)", () => {
  beforeEach(() => RNG.reseed(7));

  it("fails to descend when not standing on a portal and alerts the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    // Ensure there are no portals at the player's position
    state.portals = [];
    const startAlerts = state.pendingAlerts.length;

    resolveCommand(state, {
      id: "cmd1",
      type: CommandType.DESCEND,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: player.id,
      priority: 0,
      data: { type: "DESCEND" },
    });

    expect(state.shouldDescend).toBe(false);
    expect(state.pendingAlerts.length).toBeGreaterThan(startAlerts);
    expect(
      state.pendingAlerts.some((a) => a.message === "No stairs here."),
    ).toBe(true);
  });

  it("fails to ascend when not standing on a portal and alerts the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    // Ensure there are no portals at the player's position
    state.portals = [];
    const startAlerts = state.pendingAlerts.length;

    resolveCommand(state, {
      id: "cmd2",
      type: CommandType.ASCEND,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: player.id,
      priority: 0,
      data: { type: "ASCEND" },
    });

    expect(state.shouldAscend).toBe(false);
    expect(state.pendingAlerts.length).toBeGreaterThan(startAlerts);
    expect(
      state.pendingAlerts.some((a) => a.message === "No stairs here."),
    ).toBe(true);
  });
  it("refuses to ascend through a downward staircase", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    let state = game.getState();

    // Visit depth 2 and come back, so its snapshot is resident in `levels`.
    // Without that, Game.ascend() bails on the missing snapshot and the bug
    // is masked by an unrelated early return rather than actually prevented.
    const down = state.portals.find((p) => p.id.endsWith(":stairs-down"))!;
    setPositionFromGrid(state.player, down.source.x, down.source.y);
    state.pendingPortalId = down.id;
    game.descend();
    state = game.getState();
    expect(state.depth).toBe(2);

    const up = state.portals.find((p) => p.id.endsWith(":stairs-up"))!;
    setPositionFromGrid(state.player, up.source.x, up.source.y);
    state.pendingPortalId = up.id;
    game.ascend();
    state = game.getState();
    expect(state.depth).toBe(1);

    // Stand on the downward staircase and press ascend.
    const downAgain = state.portals.find((p) => p.id.endsWith(":stairs-down"))!;
    setPositionFromGrid(state.player, downAgain.source.x, downAgain.source.y);
    state.pendingPortalId = undefined;

    resolveCommand(state, {
      id: "cmd3",
      type: CommandType.ASCEND,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: state.player.id,
      priority: 0,
      data: { type: "ASCEND" },
    });

    expect(state.shouldAscend).toBe(false);
    expect(state.pendingPortalId).toBeUndefined();

    if (state.shouldAscend) game.ascend();
    expect(game.getState().depth).toBe(1);
  });

  it("still descends through that same downward staircase", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();

    const down = state.portals.find((p) => p.id.endsWith(":stairs-down"))!;
    setPositionFromGrid(state.player, down.source.x, down.source.y);

    resolveCommand(state, {
      id: "cmd4",
      type: CommandType.DESCEND,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: state.player.id,
      priority: 0,
      data: { type: "DESCEND" },
    });

    expect(state.shouldDescend).toBe(true);
    expect(state.pendingPortalId).toBe(down.id);
  });

  it("keeps same-depth portals usable from either command", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const state = game.getState();

    // The outside surface carries a cave mouth and a workshop door, both of
    // which land in spaces that have no depth of their own. They are lateral,
    // so neither command may be direction-filtered out.
    const lateral = state.portals.filter(
      (p) => p.kind === "cave-mouth" || p.kind === "door",
    );
    expect(lateral.length).toBeGreaterThan(0);

    for (const [i, portal] of lateral.entries()) {
      for (const type of [CommandType.DESCEND, CommandType.ASCEND] as const) {
        const fresh = game.getState();
        fresh.shouldDescend = false;
        fresh.shouldAscend = false;
        fresh.pendingPortalId = undefined;
        setPositionFromGrid(fresh.player, portal.source.x, portal.source.y);

        resolveCommand(fresh, {
          id: `lateral-${i}-${type}`,
          type,
          tick: fresh.sim.nowTick,
          source: "PLAYER",
          actorId: fresh.player.id,
          priority: 0,
          data: { type } as never,
        });

        expect(fresh.pendingPortalId).toBe(portal.id);
      }
    }
  });
});
