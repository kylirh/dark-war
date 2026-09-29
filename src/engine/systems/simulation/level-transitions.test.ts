/**
 * Tests for the descend and ascend command resolution path.
 *
 * `resolveDescendCommand` and `resolveAscendCommand` share
 * `getTransitionPortal`, so a single mistake in that helper takes out both
 * stairways at once. Before these tests, making the helper return `null`
 * unconditionally — which disables every stairway in the game — left the whole
 * suite green.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { CommandType, EntityKind, MonsterType } from "../../types";
import { MonsterEntity } from "../../entities/monster-entity";
import { RNG } from "../../utils/rng";
import { setPositionFromGrid } from "../../utils/helpers";
import { resolveCommand } from "./commands";

const DOWN_STAIRS_PORTAL = "megacorp/floor-1:stairs-down";
const UP_STAIRS_PORTAL = "megacorp/floor-1:stairs-up";

/**
 * Depth 1 puts the up-stairs under the player's spawn and the down-stairs in
 * the farthest room, so both portals are reachable from one fixture.
 */
function startAtDepthOne() {
  const game = new Game({ mode: "offline" });
  game.reset(1);
  const state = game.getState();
  return { game, state, player: state.player };
}

function transitionCommand(
  actorId: string,
  type: CommandType.DESCEND | CommandType.ASCEND,
) {
  return {
    id: `${type.toLowerCase()}-test`,
    tick: 0,
    actorId,
    type,
    data: { type: type === CommandType.DESCEND ? "DESCEND" : "ASCEND" },
    priority: 0,
    source: "PLAYER",
  } as const;
}

describe("descend and ascend commands", () => {
  beforeEach(() => RNG.reseed(11));

  it("flags a descent and records the portal when standing on down-stairs", () => {
    const { state, player } = startAtDepthOne();
    const stairs = state.portals.find((p) => p.id === DOWN_STAIRS_PORTAL);
    expect(stairs).toBeDefined();
    setPositionFromGrid(player, stairs!.source.x, stairs!.source.y);

    resolveCommand(state, transitionCommand(player.id, CommandType.DESCEND));

    expect(state.shouldDescend).toBe(true);
    expect(state.pendingPortalId).toBe(DOWN_STAIRS_PORTAL);
  });

  // `Game.descend` reads `descendTarget` as the fall position and, when it is
  // set, lands the player at the nearest passable tile to it instead of at the
  // stairs (`game.ts:1309`, `:1336-1341`). Clearing it is therefore the only
  // thing that distinguishes taking the stairs from dropping through a hole,
  // and it is the sole line that differs between the two command resolvers.
  it("clears a stale hole-fall target so a stairs descent lands at the stairs", () => {
    const { state, player } = startAtDepthOne();
    const stairs = state.portals.find((p) => p.id === DOWN_STAIRS_PORTAL)!;
    setPositionFromGrid(player, stairs.source.x, stairs.source.y);
    state.descendTarget = [3, 4];

    resolveCommand(state, transitionCommand(player.id, CommandType.DESCEND));

    expect(state.descendTarget).toBeUndefined();
    expect(state.shouldDescend).toBe(true);
  });

  it("flags an ascent and records the portal when standing on up-stairs", () => {
    const { state, player } = startAtDepthOne();
    const stairs = state.portals.find((p) => p.id === UP_STAIRS_PORTAL);
    expect(stairs).toBeDefined();
    setPositionFromGrid(player, stairs!.source.x, stairs!.source.y);

    resolveCommand(state, transitionCommand(player.id, CommandType.ASCEND));

    expect(state.shouldAscend).toBe(true);
    expect(state.pendingPortalId).toBe(UP_STAIRS_PORTAL);
  });

  it.each([
    [CommandType.DESCEND, "shouldDescend"],
    [CommandType.ASCEND, "shouldAscend"],
  ] as const)(
    "alerts instead of %s-ing when there is no portal underfoot",
    (type, flag) => {
      const { state, player } = startAtDepthOne();
      const occupied = new Set(
        state.portals.map((p) => `${p.source.x},${p.source.y}`),
      );
      // Any tile that is not a portal; the resolver never checks passability.
      let target: [number, number] | null = null;
      for (let y = 1; y < state.mapHeight && !target; y++) {
        for (let x = 1; x < state.mapWidth; x++) {
          if (!occupied.has(`${x},${y}`)) {
            target = [x, y];
            break;
          }
        }
      }
      setPositionFromGrid(player, target![0], target![1]);

      resolveCommand(state, transitionCommand(player.id, type));

      expect(state[flag]).toBe(false);
      expect(state.pendingAlerts.at(-1)?.message).toBe("No stairs here.");
    },
  );

  it("ignores a transition command whose actor is not a player", () => {
    const { state } = startAtDepthOne();
    const stairs = state.portals.find((p) => p.id === DOWN_STAIRS_PORTAL)!;
    const monster = new MonsterEntity(
      stairs.source.x,
      stairs.source.y,
      MonsterType.MUTANT,
      1,
    );
    state.entityManager.spawn(monster);
    expect(monster.kind).toBe(EntityKind.MONSTER);

    resolveCommand(state, {
      ...transitionCommand(monster.id, CommandType.DESCEND),
      source: "AI",
    });

    expect(state.shouldDescend).toBe(false);
    expect(state.pendingAlerts).toEqual([]);
  });
});
