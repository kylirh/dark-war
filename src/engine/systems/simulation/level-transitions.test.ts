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
import {
  CommandType,
  EntityKind,
  EventType,
  HOLE_FALL_DAMAGE,
  MonsterType,
} from "../../types";
import { MonsterEntity } from "../../entities/monster-entity";
import { RNG } from "../../utils/rng";
import { idxFor, setPositionFromGrid } from "../../utils/helpers";
import { resolveCommand } from "./commands";
import { processEventQueue } from "./events";
import { stepSimulationTick } from "./tick";

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

/**
 * The flags above are set while commands resolve (step 1 of
 * `stepSimulationTick`) but consumed by the host only after the tick returns
 * (`src/client/main.ts:1616-1634`). `processEventQueue` runs in between at step
 * 4, so any damage landing in the same tick — a monster's melee, an explosive,
 * a hole fall — can kill the player after the transition is already committed.
 * `processPlayerDeathEvent` cancels it; each of the four fields it clears fails
 * a case here when dropped on its own.
 *
 * These are offline-only paths: the multiplayer server clears both flags after
 * every tick (`server/multiplayer-server.ts:880-883`) because per-player
 * migration is handled by the room, not the shared flags.
 */
describe("death during a pending transition", () => {
  beforeEach(() => RNG.reseed(11));

  function killPlayer(state: ReturnType<Game["getState"]>, id: string): void {
    state.eventQueue.push({
      id: "lethal-dmg",
      depth: state.depth,
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: id, amount: 100 },
    });
    processEventQueue(state);
  }

  it.each([
    [CommandType.DESCEND, "shouldDescend", DOWN_STAIRS_PORTAL],
    [CommandType.ASCEND, "shouldAscend", UP_STAIRS_PORTAL],
  ] as const)(
    "cancels a pending %s when the player dies",
    (type, flag, portalId) => {
      const { state, player } = startAtDepthOne();
      const stairs = state.portals.find((p) => p.id === portalId)!;
      setPositionFromGrid(player, stairs.source.x, stairs.source.y);

      resolveCommand(state, transitionCommand(player.id, type));
      expect(state[flag]).toBe(true);
      expect(state.pendingPortalId).toBe(portalId);

      killPlayer(state, player.id);

      expect(player.hp).toBeLessThanOrEqual(0);
      expect(state[flag]).toBe(false);
      expect(state.pendingPortalId).toBeUndefined();
    },
  );

  /**
   * `triggerPlayerFall` (`tick.ts:547-567`) sets `shouldDescend` *and* queues
   * `HOLE_FALL_DAMAGE` in the same tick, and the queue drains immediately
   * after `processHoleFalls`, so at low health the fall is its own lethal blow.
   * The transition is cancelled with every other one: the player dies on the
   * floor they fell from rather than arriving dead on the one below.
   */
  it("cancels the descend when the fall through a hole is itself lethal", () => {
    const { state, player } = startAtDepthOne();
    player.hp = HOLE_FALL_DAMAGE;
    state.holeCreatedTiles = new Set([
      idxFor(player.gridX, player.gridY, state.mapWidth),
    ]);

    stepSimulationTick(state);

    // Without this the assertions below pass vacuously: a player killed before
    // `processHoleFalls` runs never falls, so `shouldDescend` is never set and
    // there is nothing for the fix to cancel.
    expect(state.pendingAlerts.map((alert) => alert.message)).toContain(
      "You fall through the floor!",
    );
    expect(player.hp).toBe(0);
    expect(state.shouldDescend).toBe(false);
    expect(state.descendTarget).toBeUndefined();
  });
});
