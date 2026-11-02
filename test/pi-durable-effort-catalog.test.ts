import { describe, expect, it } from "vitest";
import { answer, processFor } from "./pi-durable-model-catalog-support.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi durable effort catalog RPC", () => {
  it("queries the correlated reader and preserves exact custom strings", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { levels: ["custom", "vendor/high"] },
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readEffortCatalog()).resolves.toEqual({
        levels: ["custom", "vendor/high"],
      });
      expect(child.writes.map((request) => request.type)).toEqual([
        "get_state",
        "get_available_thinking_levels",
      ]);
    } finally {
      await process.stop();
    }
  });
  it("preserves empty levels and strips native extra attributes", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { levels: [], private: "discard" },
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readEffortCatalog()).resolves.toEqual({
        levels: [],
      });
    } finally {
      await process.stop();
    }
  });
  it.each([
    { levels: ["ok", 4] },
    { levels: new Array(1) },
    { levels: "high" },
  ])("rejects malformed native levels", async (data) => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state" ? { sessionId: "native-test" } : data,
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readEffortCatalog()).rejects.toThrow(
        "INVALID_EFFORT_CATALOG",
      );
    } finally {
      await process.stop();
    }
  });
});
