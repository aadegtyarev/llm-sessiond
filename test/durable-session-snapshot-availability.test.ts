import { describe, expect, it } from "vitest";
import { DurableSessionEvents } from "../src/core/durable-session-events.js";
import { MemoryStore } from "./durable-memory-store.js";

describe("durable session snapshot availability", () => {
  it("does not inspect a hostile error message while snapshotting", () => {
    const store = new MemoryStore();
    const events = new DurableSessionEvents(store, {
      token: "test-owner",
      generation: 1,
    });
    const list = store.list.bind(store);
    let reads = 0;
    store.list = () => {
      const error = new Error();
      Object.defineProperty(error, "message", {
        get() {
          reads++;
          throw new Error("hostile getter");
        },
      });
      throw error;
    };
    expect(() => events.snapshot()).toThrow("SNAPSHOT_UNAVAILABLE");
    expect(reads).toBe(0);
    store.list = list;
    expect(events.snapshot().sessions).toEqual([]);
  });
});
