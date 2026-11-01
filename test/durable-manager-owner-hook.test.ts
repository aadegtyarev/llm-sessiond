import { describe, expect, it } from "vitest";
import { setup, synthetic } from "./durable-manager-support.js";
describe("durable manager safe boundaries", () => {
  it("rejects a stale owner before creating or launching", async () => {
    const { manager, store, calls } = setup({
      owner: { token: "stale", generation: 2 },
    });
    await expect(manager.create({ cwd: process.cwd() })).rejects.toMatchObject({
      code: "STALE_OWNER",
    });
    expect(store.list()).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("maps throwing resumability hooks safely without changing the row", async () => {
    const adapter = {
      ...synthetic,
      isResumable: () => {
        throw new Error("secret hook output");
      },
    };
    const { manager, store } = setup({ adapter });
    store.create({
      id: "failed",
      harnessId: "synthetic",
      cwd: "/work",
      status: "failed",
      failureReason: "LAUNCH_FAILED",
      failedAt: "then",
      createdAt: "then",
      adapterState: { namespace: "synthetic.audit", version: 3, data: {} },
    });
    const before = store.get("failed");
    const error = (await manager
      .resume("failed")
      .catch((reason: unknown) => reason)) as Error & { code: string };
    expect(error.code).toBe("OPERATION_FAILED");
    expect(error.message).not.toContain("secret");
    expect(store.get("failed")).toEqual(before);
  });
});
