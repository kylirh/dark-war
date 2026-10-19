import { describe, expect, it } from "vitest";
import {
  NETWORK_ACTION_TYPES,
  NetworkAction,
  isNetworkAction,
} from "./protocol";

describe("isNetworkAction", () => {
  // The tags are enumerated from NETWORK_ACTION_TYPES rather than restated, so
  // this stays exhaustive as the union grows. The compile-time half of the
  // guard is the `Record<NetworkAction["type"], true>` in protocol.ts: a member
  // added to the union without an entry there is a type error, which is what
  // keeps this list and the union in step.
  it("accepts every tag the NetworkAction union declares", () => {
    expect(NETWORK_ACTION_TYPES.length).toBeGreaterThan(0);
    for (const type of NETWORK_ACTION_TYPES) {
      expect(isNetworkAction({ type })).toBe(true);
    }
  });

  it("rejects a tag the union does not declare", () => {
    expect(isNetworkAction({ type: "DROP_ITEM" })).toBe(false);
    expect(isNetworkAction({ type: "" })).toBe(false);
  });

  it("rejects payloads that are not tagged records", () => {
    expect(isNetworkAction(null)).toBe(false);
    expect(isNetworkAction(undefined)).toBe(false);
    expect(isNetworkAction("FIRE")).toBe(false);
    expect(isNetworkAction(42)).toBe(false);
    expect(isNetworkAction({})).toBe(false);
    expect(isNetworkAction({ type: 42 })).toBe(false);
  });

  // `in`/`hasOwnProperty` confusion is the trap here: a prototype-chain lookup
  // would accept "toString" and "constructor" as action tags and hand them to
  // applyAction, which switches on the tag and would fall through to no case.
  it("does not accept inherited object properties as tags", () => {
    expect(isNetworkAction({ type: "toString" })).toBe(false);
    expect(isNetworkAction({ type: "constructor" })).toBe(false);
    expect(isNetworkAction({ type: "hasOwnProperty" })).toBe(false);
    expect(isNetworkAction({ type: "__proto__" })).toBe(false);
  });

  // An array is an object, so the record check alone would let one through.
  it("rejects arrays", () => {
    expect(isNetworkAction([])).toBe(false);
    expect(isNetworkAction([{ type: "FIRE" }])).toBe(false);
  });

  it("narrows to NetworkAction so a tagged payload reaches a handler", () => {
    const payload: unknown = { type: "SHAPE_TERRAIN", tileX: 3, tileY: 4 };
    if (!isNetworkAction(payload)) throw new Error("expected a NetworkAction");
    const action: NetworkAction = payload;
    expect(action.type).toBe("SHAPE_TERRAIN");
  });
});
