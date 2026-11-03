import { describe, expect, it } from "vitest";
import { DurableSessionEvents } from "../src/core/durable-session-events.js";
import { SafeSessionStore } from "../src/core/safe-session-store.js";
import { MemoryStore } from "./durable-memory-store.js";
import { flushEvents } from "./durable-manager-support.js";

describe("durable session event availability", () => {
  it("fails the feed once when the revision space is exhausted", async () => {
    const events = new DurableSessionEvents(new MemoryStore(), {
      token: "test-owner",
      generation: 1,
    });
    let unavailable = 0;
    events.subscribe(
      () => {},
      () => unavailable++,
    );
    Object.defineProperty(events, "revision", {
      value: Number.MAX_SAFE_INTEGER,
    });
    expect(() =>
      events.publish({ kind: "session.deleted", sessionId: "id" }),
    ).toThrow("SESSION_EVENT_FEED_UNAVAILABLE");
    await flushEvents();
    expect(unavailable).toBe(1);
  });
  it("notifies active and late subscribers once and preserves committed mutations", async () => {
    const store = new MemoryStore();
    const events = new DurableSessionEvents(store, {
      token: "test-owner",
      generation: 1,
    });
    let failCapture = false;
    const safe = new SafeSessionStore(store, (id, deleted, snapshot) =>
      events.commitSession(
        id,
        deleted,
        failCapture
          ? new Proxy(snapshot!, {
              get(target, key, receiver) {
                if (key === "cwd") throw new Error("private capture failure");
                return Reflect.get(target, key, receiver);
              },
            })
          : snapshot,
      ),
    );
    let data = 0;
    let unavailable = 0;
    let throwing = 0;
    let canceled = 0;
    events.subscribe(
      () => data++,
      () => unavailable++,
    );
    events.subscribe(
      () => {},
      () => {
        throwing++;
        throw Error("ignored");
      },
    );
    const unsubscribe = events.subscribe(
      () => {},
      () => canceled++,
    );
    unsubscribe();
    const row = (id: string) => ({
      id,
      harnessId: "synthetic",
      cwd: "/tmp",
      status: "starting" as const,
      createdAt: "now",
    });
    safe.create(row("before"));
    failCapture = true;
    safe.create(row("failing"));
    expect(store.get("failing")).toBeDefined();
    await flushEvents();
    expect(data).toBe(0);
    expect(unavailable).toBe(1);
    expect(throwing).toBe(1);
    expect(canceled).toBe(0);
    safe.rename("before", "still-committed");
    await flushEvents();
    expect(data).toBe(0);
    let late = 0;
    const stopLate = events.subscribe(
      () => data++,
      () => late++,
    );
    await flushEvents();
    stopLate();
    expect(late).toBe(1);
    expect(data).toBe(0);
    expect(store.get("before")?.name).toBe("still-committed");
    expect(() => events.snapshot()).toThrow("SNAPSHOT_UNAVAILABLE");
  });
});
