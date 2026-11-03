import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import type { SessionRecord } from "../src/interfaces/runtime-ports.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { BoundaryHarness } from "./session-runtime-fakes.js";

describe("session runtime privacy and ownership", () => {
  it("projects prepopulated private checkpoints out of all public data", async () => {
    const store = new MemorySessionStore();
    const row: SessionRecord = {
      id: "MixCase",
      harnessId: "fake",
      cwd: "/tmp",
      status: "stopped",
      checkpoint: {
        namespace: "private",
        version: 1,
        data: { internal: "checkpoint-only" },
      },
    };
    store.write(row);
    const core = new SessionRuntime(
      store,
      new BoundaryHarness(),
      () => "Inputx",
    );
    const events: unknown[] = [];
    core.subscribe((event) => events.push(event));
    expect(core.snapshot().sessions).toEqual([
      { id: "MixCase", harnessId: "fake", cwd: "/tmp", status: "stopped" },
    ]);
    expect(await core.get("MixCase")).not.toHaveProperty("checkpoint");
    await core.submit("MixCase", "private prompt");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.stringify(events)).not.toContain("checkpoint-only");
    expect(JSON.stringify(events)).not.toContain("createdAt");
    expect(JSON.stringify(store.list())).not.toContain("private prompt");
  });

  it("does not inspect hostile exception messages or dispatch after owner loss", async () => {
    const owner = { current: true };
    const store = new MemorySessionStore(() => owner.current);
    store.write({
      id: "RunX",
      harnessId: "fake",
      cwd: "/tmp",
      status: "running",
    });
    const harness = new BoundaryHarness();
    let reads = 0;
    harness.submit = async () => {
      throw Object.defineProperty({}, "message", {
        get() {
          reads += 1;
          throw new Error("private");
        },
      });
    };
    const core = new SessionRuntime(store, harness, () => "InputX");
    owner.current = false;
    await expect(core.submit("RunX", "prompt")).rejects.toThrow(
      "Runtime unavailable",
    );
    expect(reads).toBe(0);
    expect(harness.writes).toEqual([]);
  });

  it("maps hostile harness exceptions without reading message properties", async () => {
    const store = new MemorySessionStore();
    store.write({
      id: "RunError",
      harnessId: "fake",
      cwd: "/tmp",
      status: "running",
    });
    const harness = new BoundaryHarness();
    let reads = 0;
    harness.submit = async () => {
      throw Object.defineProperty({}, "message", {
        get() {
          reads += 1;
          throw new Error("private");
        },
      });
    };
    const core = new SessionRuntime(store, harness, () => "InputError");
    expect(await core.submit("RunError", "prompt")).toMatchObject({
      outcome: "unknown",
    });
    expect(reads).toBe(0);
  });
});
