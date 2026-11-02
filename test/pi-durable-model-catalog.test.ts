import { describe, expect, it } from "vitest";
import { answer, processFor } from "./pi-durable-model-catalog-support.js";
import { FakePiChild } from "./pi-durable-fake-child.js";
describe("Pi durable model catalog RPC", () => {
  it("rejects a missing process link before issuing an RPC", async () => {
    const child = new FakePiChild();
    const process = processFor(child);
    expect(() => process.readModelCatalog()).toThrow("RPC_UNAVAILABLE");
    expect(child.writes).toEqual([]);
  });
  it("queries the existing correlated reader and projects exact models", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : {
              models: [
                {
                  provider: " p ",
                  id: "vendor/x",
                  name: "X",
                  secret: "hide",
                },
              ],
            },
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readModelCatalog()).resolves.toEqual({
        models: [{ provider: " p ", id: "vendor/x", name: "X" }],
      });
      expect(child.writes.map((request) => request.type)).toEqual([
        "get_state",
        "get_available_models",
      ]);
    } finally {
      await process.stop();
    }
  });
  it("preserves an empty catalog and uses native ID only as missing-name fallback", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { models: [] },
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readModelCatalog()).resolves.toEqual({ models: [] });
      child.onWrite = (request) =>
        answer(child, request, { models: [{ provider: "p", id: "exact" }] });
      await expect(process.readModelCatalog()).resolves.toEqual({
        models: [{ provider: "p", id: "exact", name: "exact" }],
      });
    } finally {
      await process.stop();
    }
  });
  it("rejects malformed native model entries", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { models: [{ provider: "p" }] },
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readModelCatalog()).rejects.toThrow(
        "INVALID_MODEL_CATALOG",
      );
    } finally {
      await process.stop();
    }
  });
});
