import { describe, expect, it } from "vitest";
import { snapshotEffortCatalog } from "../src/core/effort-catalog.js";

describe("EffortCatalog snapshots", () => {
  it("preserves exact custom levels, order, empty arrays, and optional current", () => {
    const input = { levels: [" custom ", "vendor-level"], current: " custom " };
    const result = snapshotEffortCatalog(input);
    expect(result).toEqual(input);
    expect(result.levels).not.toBe(input.levels);
    expect(snapshotEffortCatalog({ levels: [] })).toEqual({ levels: [] });
    expect(snapshotEffortCatalog({ levels: [], current: "none" })).toEqual({
      levels: [],
      current: "none",
    });
  });
  it.each([
    { levels: ["ok", 2] },
    { levels: new Array(1) },
    { levels: Object.assign(["ok"], { extra: true }) },
    { levels: [], unexpected: true },
    { levels: [], current: null },
  ])("rejects malformed or unknown DTO fields", (value) => {
    expect(() => snapshotEffortCatalog(value)).toThrow(
      "INVALID_EFFORT_CATALOG",
    );
  });
  it("rejects accessors and non-plain DTOs without invoking accessors", () => {
    let invoked = false;
    const accessor = Object.defineProperty({}, "levels", {
      get() {
        invoked = true;
        return [];
      },
    });
    expect(() => snapshotEffortCatalog(accessor)).toThrow(
      "INVALID_EFFORT_CATALOG",
    );
    expect(invoked).toBe(false);
    expect(() =>
      snapshotEffortCatalog(Object.assign(Object.create({}), { levels: [] })),
    ).toThrow("INVALID_EFFORT_CATALOG");
  });
});
