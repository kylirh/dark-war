import { describe, it, expect } from "vitest";
import { deepCloneSerializable } from "./deep-clone";

describe("deepCloneSerializable", () => {
  it("returns primitives unchanged", () => {
    expect(deepCloneSerializable(5)).toBe(5);
    expect(deepCloneSerializable("x")).toBe("x");
    expect(deepCloneSerializable(null)).toBe(null);
    expect(deepCloneSerializable(undefined)).toBe(undefined);
  });

  it("clones nested objects with no shared references", () => {
    const src = { a: 1, nested: { b: 2, list: [{ c: 3 }] } };
    const copy = deepCloneSerializable(src);
    expect(copy).toEqual(src);
    expect(copy).not.toBe(src);
    expect(copy.nested).not.toBe(src.nested);
    expect(copy.nested.list).not.toBe(src.nested.list);
    expect(copy.nested.list[0]).not.toBe(src.nested.list[0]);
  });

  it("mutating the clone never affects the original", () => {
    const src = { list: [1, 2], obj: { k: "v" } };
    const copy = deepCloneSerializable(src);
    copy.list.push(3);
    copy.obj.k = "changed";
    expect(src.list).toEqual([1, 2]);
    expect(src.obj.k).toBe("v");
  });

  it("preserves undefined values (unlike JSON round-trips)", () => {
    const src = { a: undefined as number | undefined, b: 1 };
    const copy = deepCloneSerializable(src);
    expect("a" in copy).toBe(true);
    expect(copy.a).toBe(undefined);
  });

  it("deep-clones Map and Set independently", () => {
    const src = { m: new Map([["k", { v: 1 }]]), s: new Set([1, 2]) };
    const copy = deepCloneSerializable(src);
    expect(copy.m).not.toBe(src.m);
    expect(copy.m.get("k")).not.toBe(src.m.get("k"));
    copy.s.add(3);
    expect(src.s.has(3)).toBe(false);
  });
});
