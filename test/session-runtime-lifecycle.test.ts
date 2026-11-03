import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { BoundaryHarness } from "./session-runtime-fakes.js";

describe("session runtime lifecycle", () => {
  it("renames and deletes only after confirmed stop", async () => {
    let id = 0;
    const harness = new BoundaryHarness();
    harness.stop = async () => ({ kind: "confirmed" });
    const core = new SessionRuntime(
      new MemorySessionStore(),
      harness,
      () => ["RunLife", "InputLife"][id++]!,
    );
    const session = await core.create({
      cwd: "/tmp",
      name: "before",
      adapterOptions: { safe: true },
    });
    await expect(core.delete(session.id)).rejects.toThrow("Session busy");
    expect((await core.rename(session.id, "after")).name).toBe("after");
    await core.rename(session.id, null);
    expect((await core.get(session.id))?.name).toBeUndefined();
    expect(await core.stop(session.id)).toBe(true);
    expect(await core.get(session.id)).toMatchObject({ status: "stopped" });
    await core.delete(session.id);
    expect(await core.get(session.id)).toBeUndefined();
  });

  it("resumes the exact checkpoint once and then submits once", async () => {
    const store = new MemorySessionStore();
    store.write({
      id: "SessionX",
      harnessId: "fake",
      cwd: "/tmp",
      status: "stopped",
      checkpoint: { namespace: "resume", version: 4, data: { id: "NativeX" } },
    });
    const harness = new BoundaryHarness();
    let next = 0;
    const core = new SessionRuntime(
      store,
      harness,
      () => ["InputX", "unused"][next++]!,
    );
    const result = await core.submit("SessionX", "prompt");
    expect(result).toEqual({ inputId: "InputX", resumed: true });
    expect(harness.starts).toEqual([4]);
    expect(harness.writes).toEqual(["InputX"]);
  });

  it("reports failed resume without dispatching input", async () => {
    const store = new MemorySessionStore();
    store.write({
      id: "ResumeFail",
      harnessId: "fake",
      cwd: "/tmp",
      status: "stopped",
      checkpoint: { namespace: "resume", version: 2, data: {} },
    });
    const harness = new BoundaryHarness();
    harness.start = async () => ({ kind: "failed" });
    const core = new SessionRuntime(store, harness, () => "InputFail");
    expect(await core.submit("ResumeFail", "prompt")).toEqual({
      inputId: "InputFail",
      resumed: true,
      outcome: "unknown",
    });
    expect(harness.writes).toEqual([]);
    expect((await core.get("ResumeFail"))?.status).toBe("failed");
  });
});
