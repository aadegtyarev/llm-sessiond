import { describe, expect, it } from "vitest";
import { flushEvents, setup } from "./durable-manager-support.js";

describe("durable session event lifecycle", () => {
  it("publishes committed lifecycle snapshots and ordered events", async () => {
    const { manager } = setup();
    const records: Array<{ revision: number; event: { kind: string } }> = [];
    const names: Array<string | undefined> = [];
    const statuses: string[] = [];
    manager.events.subscribe(({ event }) => {
      if (event.kind === "session.changed") event.session.name = "mutated";
    });
    manager.events.subscribe(({ event }) => {
      if (event.kind === "session.changed") {
        names.push(event.session.name);
        statuses.push(event.session.status);
      }
    });
    manager.events.subscribe((record) => records.push(record));
    const created = await manager.create({
      cwd: process.cwd(),
      name: "start",
      options: null,
    });
    const visible = manager.events.snapshot();
    const late: unknown[] = [];
    manager.events.subscribe((record) => late.push(record));
    expect(late).toEqual([]);
    expect(visible.sessions[0]).toMatchObject({
      id: created.id,
      name: "start",
      adapterOptions: null,
    });
    expect(Object.keys(visible.sessions[0] ?? {})).not.toContain(
      "adapterState",
    );
    expect(Object.keys(visible.sessions[0] ?? {})).not.toContain("createdAt");
    await manager.rename(created.id, "renamed");
    await manager.stop(created.id);
    await manager.resume(created.id);
    await manager.stop(created.id);
    await manager.delete(created.id);
    await flushEvents();
    const snapshot = manager.events.snapshot();
    expect(snapshot.sessions).toEqual([]);
    expect(snapshot.afterRevision).toBe(records.at(-1)?.revision);
    expect(records.map((item) => item.revision)).toEqual(
      records.map((item) => item.revision).sort((a, b) => a - b),
    );
    expect(records.map((item) => item.event.kind)).toContain("session.deleted");
    expect(names).toContain("start");
    expect(names).toContain("renamed");
    expect(statuses).toContain("running");
    expect(statuses).toContain("stopped");
    expect(
      records.every((item) => !JSON.stringify(item).includes("createdAt")),
    ).toBe(true);
  });
  it("detaches output after owner loss", async () => {
    let deliver: ((event: unknown) => void) | undefined;
    const { manager, store } = setup({
      events: {
        subscribe: (listener) => {
          deliver = listener;
          return () => {
            deliver = undefined;
          };
        },
      },
    });
    const seen: string[] = [];
    manager.events.subscribe(({ event }) => {
      if (event.kind === "harness.event") seen.push(event.event.kind);
    });
    await manager.create({ cwd: process.cwd() });
    store.stale = true;
    expect(() => manager.events.snapshot()).toThrow("SNAPSHOT_UNAVAILABLE");
    deliver?.({ kind: "output", text: "stale" });
    await flushEvents();
    store.stale = false;
    deliver?.({ kind: "output", text: "detached" });
    expect(seen).toEqual([]);
  });
});
