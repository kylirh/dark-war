/** Runtime action validation at the client/server boundary. */
import { describe, expect, it } from "vitest";
import { isNetworkAction, NetworkAction } from "./protocol";

describe("network action validation", () => {
  it.each([
    { type: "FIRE", dx: 1, dy: 0 },
    { type: "USE_ITEM", dx: 0, dy: 1, targetWorldX: 32 },
    { type: "INTERACT", dx: 1, dy: 0 },
    { type: "SIGN_CLOSE" },
    { type: "PICKUP" },
    { type: "RELOAD" },
    { type: "WAIT" },
    { type: "DESCEND" },
    { type: "ASCEND" },
    { type: "SHAPE_TERRAIN", tileX: 2, tileY: 3, delta: -1 },
    { type: "SPEAK", kind: "speech", text: "Hello!" },
    { type: "DIALOGUE_CHOICE", choiceId: "hello", expectedRevision: 0 },
    { type: "DIALOGUE_LEAVE", expectedRevision: 1 },
    { type: "TOGGLE_GOD_MODE" },
  ] satisfies NetworkAction[])("accepts valid $type", (action) => {
    expect(isNetworkAction(action)).toBe(true);
  });

  it.each([
    null,
    undefined,
    [],
    "FIRE",
    {},
    { type: "constructor" },
    { type: "__proto__" },
    { type: "FIRE" },
    { type: "FIRE", dx: NaN, dy: 0 },
    { type: "USE_ITEM", dx: 1, dy: 0, targetWorldX: Infinity },
    { type: "INTERACT", dx: "1", dy: 0 },
    { type: "SHAPE_TERRAIN", tileX: 0.5, tileY: 1, delta: 1 },
    { type: "SHAPE_TERRAIN", tileX: 0, tileY: 1, delta: 2 },
    { type: "SPEAK", kind: "speech", text: {} },
    { type: "DIALOGUE_CHOICE", choiceId: "hello", expectedRevision: -1 },
    { type: "DIALOGUE_LEAVE", expectedRevision: "1" },
  ])("rejects malformed payload %j", (action) => {
    expect(isNetworkAction(action)).toBe(false);
  });
});
