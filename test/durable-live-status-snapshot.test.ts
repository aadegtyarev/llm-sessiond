import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
import { statusAdapter } from "./durable-live-status-support.js";

async function query(value: unknown) {
  const { manager } = setup({
    adapter: statusAdapter,
    liveStatus: { readLiveStatus: async () => value as never },
  });
  const session = await manager.create({ cwd: process.cwd() });
  return manager.readLiveStatus(session.id);
}
describe("generic LiveStatus DTO snapshots", () => {
  it("rejects changing and throwing getters without executing them", async () => {
    let reads = 0;
    const changing = Object.defineProperty({}, "effort", {
      get: () => (++reads === 1 ? "high" : "secret"),
    });
    const throwingModel = { provider: "p", id: "m" };
    Object.defineProperty(throwingModel, "name", {
      get: () => {
        reads++;
        throw new Error("secret");
      },
    });
    const throwingUsage = Object.defineProperty({}, "totalTokens", {
      get: () => {
        reads++;
        throw new Error("secret");
      },
    });
    for (const value of [
      changing,
      { model: throwingModel },
      { usage: throwingUsage },
    ]) {
      await expect(query(value)).rejects.toMatchObject({
        code: "OPERATION_FAILED",
      });
    }
    expect(reads).toBe(0);
  });
  it("rejects inherited toJSON hooks at each DTO level", async () => {
    let calls = 0;
    const hooked = (fields: object) =>
      Object.assign(
        Object.create({
          toJSON: () => {
            calls++;
            return { secret: "raw" };
          },
        }),
        fields,
      );
    for (const value of [
      hooked({ effort: "high" }),
      { model: hooked({ provider: "p", id: "m", name: "M" }) },
      { usage: hooked({ totalTokens: 0 }) },
    ]) {
      await expect(query(value)).rejects.toMatchObject({
        code: "OPERATION_FAILED",
      });
    }
    expect(calls).toBe(0);
  });
  it("returns an immutable-by-source plain snapshot of approved fields", async () => {
    const original = {
      effort: "high",
      model: { provider: "p", id: "m", name: "M" },
      usage: { totalTokens: 0, contextTokens: null },
    };
    const snapshot = await query(original);
    original.effort = "changed";
    original.model.name = "changed";
    original.usage.totalTokens = 99;
    expect(snapshot).toEqual({
      effort: "high",
      model: { provider: "p", id: "m", name: "M" },
      usage: { totalTokens: 0, contextTokens: null },
    });
    expect(snapshot).not.toBe(original);
    expect(snapshot.model).not.toBe(original.model);
    expect(snapshot.usage).not.toBe(original.usage);
    expect(JSON.stringify(snapshot)).not.toContain("changed");
  });
});
