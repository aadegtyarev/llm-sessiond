import { describe, expect, it } from "vitest";
import { answer, processFor } from "./pi-durable-model-catalog-support.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

describe("Pi durable command catalog RPC", () => {
  it("filters to eligible extensions and preserves exact native order and values", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : {
              commands: [
                { source: "prompt", name: "prompt" },
                { source: "extension", name: "reload", description: "ignored" },
                { source: "extension", name: "Upper" },
                {
                  source: "extension",
                  name: "first",
                  description: "  exact  ",
                  extra: "drop",
                },
                { source: "extension", name: "second" },
                {
                  source: "extension",
                  name: "long-name-012345678901234567890123456",
                },
              ],
            },
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readCommandCatalog()).resolves.toEqual({
        commands: [
          { name: "first", description: "  exact  " },
          { name: "second", description: "" },
        ],
      });
      expect(child.writes.map((request) => request.type)).toEqual([
        "get_state",
        "get_commands",
      ]);
    } finally {
      await process.stop();
    }
  });

  it("rejects a correlated reply when the child exits in the same turn", async () => {
    const child = new FakePiChild();
    child.onWrite = (request) => {
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { commands: [] },
      );
      if (request.type === "get_commands") child.confirmExit();
    };
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readCommandCatalog()).rejects.toThrow(
        "RPC_UNAVAILABLE",
      );
    } finally {
      await process.stop();
    }
  });

  it("returns an empty catalog and fails safely on malformed eligible descriptions", async () => {
    const child = new FakePiChild();
    let commands: unknown[] = [];
    child.onWrite = (request) =>
      answer(
        child,
        request,
        request.type === "get_state"
          ? { sessionId: "native-test" }
          : { commands },
      );
    const process = processFor(child);
    try {
      await process.start("/tmp", []);
      await expect(process.readCommandCatalog()).resolves.toEqual({
        commands: [],
      });
      commands = [{ source: "extension", name: "allowed", description: null }];
      await expect(process.readCommandCatalog()).rejects.toThrow(
        "INVALID_COMMAND_CATALOG",
      );
    } finally {
      await process.stop();
    }
  });
});
