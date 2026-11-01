import { describe, expect, it } from "vitest";
import { checkpoint, setup } from "./durable-manager-support.js";
describe("durable execution cleanup", () => {
  it("stops partial launch side effects after rejection", async () => {
    let live = false;
    let stops = 0;
    const { manager } = setup({
      launch: async () => {
        live = true;
        throw new Error("secret launch failure");
      },
      stop: async () => {
        stops++;
        live = false;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    expect(stops).toBe(1);
    expect(live).toBe(false);
    expect(row.status).toBe("failed");
  });
  it("cleans execution after invalid launch checkpoint", async () => {
    let live = false;
    let stops = 0;
    const { manager } = setup({
      launch: async () => {
        live = true;
        return {
          checkpoint: { ...checkpoint(1), namespace: "unknown.namespace" },
        };
      },
      stop: async () => {
        stops++;
        live = false;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    expect(stops).toBe(1);
    expect(live).toBe(false);
    expect(row.status).toBe("failed");
  });
});
