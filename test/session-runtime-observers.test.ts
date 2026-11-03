import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { BoundaryHarness } from "./session-runtime-fakes.js";

describe("session runtime observers", () => {
  it("isolates and detaches a throwing observer", async () => {
    let id = 0;
    const core = new SessionRuntime(
      new MemorySessionStore(),
      new BoundaryHarness(),
      () => ["RunObserver", "InputObserver"][id++]!,
    );
    let healthy = 0;
    core.subscribe(() => {
      throw new Error("observer private");
    });
    core.subscribe(() => {
      healthy += 1;
    });
    const session = await core.create({ cwd: "/tmp" });
    await core.submit(session.id, "prompt");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(healthy).toBeGreaterThan(0);
  });
});
