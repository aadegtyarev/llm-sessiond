import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { BoundaryHarness } from "./session-runtime-fakes.js";

describe("session runtime input admission", () => {
  it("honors owner loss at the native pre-write guard and retains uncertainty", async () => {
    const owner = { current: true };
    const store = new MemorySessionStore(() => owner.current);
    store.write({
      id: "RunGuard",
      harnessId: "fake",
      cwd: "/tmp",
      status: "running",
    });
    const harness = new BoundaryHarness();
    harness.beforeSubmit = () => {
      owner.current = false;
    };
    const core = new SessionRuntime(store, harness, () => "InputGuard");
    expect(await core.submit("RunGuard", "prompt")).toMatchObject({
      outcome: "unknown",
    });
    expect(harness.writes).toEqual([]);
    owner.current = true;
    await expect(core.submit("RunGuard", "again")).rejects.toThrow(
      "Input busy",
    );
  });

  it("rejects unsupported image input before resuming a stopped session", async () => {
    const store = new MemorySessionStore();
    store.write({
      id: "StoppedX",
      harnessId: "fake",
      cwd: "/tmp",
      status: "stopped",
    });
    const harness = new BoundaryHarness();
    const core = new SessionRuntime(store, harness, () => "InputX");
    await expect(
      core.submit("StoppedX", "prompt", [
        { mimeType: "image/png", data: "YQ==" },
      ]),
    ).rejects.toThrow("Image input unsupported");
    expect(harness.starts).toEqual([]);
  });

  it("holds uncertain delivery when stop cannot confirm cleanup", async () => {
    const store = new MemorySessionStore();
    store.write({
      id: "RunUncertain",
      harnessId: "fake",
      cwd: "/tmp",
      status: "running",
    });
    const harness = new BoundaryHarness();
    harness.submit = async () => ({ kind: "uncertain" });
    const core = new SessionRuntime(store, harness, () => "InputUncertain");
    expect(await core.submit("RunUncertain", "prompt")).toMatchObject({
      outcome: "unknown",
    });
    expect(await core.stop("RunUncertain")).toBe(false);
    expect((await core.get("RunUncertain"))?.status).toBe("uncertain");
    await expect(core.submit("RunUncertain", "again")).rejects.toThrow(
      "Input busy",
    );
  });
});
