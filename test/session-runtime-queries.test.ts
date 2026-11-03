import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../src/adapters/memory-store.js";
import { SessionRuntime } from "../src/kernel/index.js";
import { BoundaryHarness } from "./session-runtime-fakes.js";

describe("session runtime queries", () => {
  it("returns whitelisted live and catalog DTOs and exact effort outcome", async () => {
    const core = new SessionRuntime(
      new MemorySessionStore(),
      new BoundaryHarness(),
      () => "RunQuery",
    );
    const session = await core.create({ cwd: "/tmp" });
    expect(await core.status(session.id)).toEqual({
      model: { provider: "p", id: "m", name: "Model" },
      usage: { inputTokens: 3 },
    });
    expect(await core.models(session.id)).toEqual({
      models: [{ provider: "p", id: "m", name: "Model" }],
    });
    expect(await core.efforts(session.id)).toEqual({ levels: ["low", "high"] });
    expect(await core.changeEffort(session.id, "high")).toBe("applied");
  });
});
