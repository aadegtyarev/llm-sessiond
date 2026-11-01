import { describe, expect, it } from "vitest";
import { checkpoint, setup } from "./durable-manager-support.js";
describe("retained uncertain executions", () => {
  it("cleans partial resume rejection and refuses another resume", async () => {
    let live = false;
    let resumes = 0;
    let failStop = false;
    const { manager } = setup({
      launch: async () => {
        live = true;
        return { nativeSessionId: "n", checkpoint: checkpoint(1) };
      },
      resume: async () => {
        resumes++;
        live = true;
        throw new Error("secret partial resume");
      },
      stop: async () => {
        if (failStop) throw new Error("secret cleanup");
        live = false;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    failStop = true;
    const uncertain = await manager.resume(row.id);
    expect(uncertain.status).toBe("uncertain");
    expect(live).toBe(true);
    await expect(manager.resume(row.id)).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    expect(resumes).toBe(1);
    failStop = false;
    await manager.shutdownOwned();
    expect(live).toBe(false);
    expect(manager.get(row.id).status).toBe("failed");
  });
  it("cleans invalid checkpoint after resume side effect", async () => {
    let live = false;
    const { manager } = setup({
      launch: async () => {
        live = true;
        return { checkpoint: checkpoint(1) };
      },
      resume: async () => {
        live = true;
        return { checkpoint: { ...checkpoint(2), namespace: "bad.namespace" } };
      },
      stop: async () => {
        live = false;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    const failed = await manager.resume(row.id);
    expect(live).toBe(false);
    expect(failed.status).toBe("failed");
  });
});
