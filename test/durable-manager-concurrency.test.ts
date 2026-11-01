import { describe, expect, it } from "vitest";
import { setup } from "./durable-manager-support.js";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("durable lifecycle per-session serialization", () => {
  it("coalesces concurrent stop calls without duplicate adapter calls", async () => {
    const gate = deferred();
    let stops = 0;
    const { manager } = setup({
      stop: async () => {
        stops++;
        await gate.promise;
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    const first = manager.stop(row.id);
    const second = manager.stop(row.id);
    await Promise.resolve();
    expect(stops).toBe(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(stops).toBe(1);
  });
  it("serializes concurrent resume and never invokes resume twice", async () => {
    const gate = deferred();
    let resumes = 0;
    const { manager } = setup({
      resume: async ({ checkpoint, nativeSessionId }) => {
        resumes++;
        await gate.promise;
        return {
          ...(checkpoint ? { checkpoint } : {}),
          ...(nativeSessionId ? { nativeSessionId } : {}),
        };
      },
    });
    const row = await manager.create({ cwd: process.cwd() });
    await manager.stop(row.id);
    const first = manager.resume(row.id);
    const second = manager.resume(row.id);
    await Promise.resolve();
    expect(resumes).toBe(1);
    gate.resolve();
    await first;
    await expect(second).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    expect(resumes).toBe(1);
  });
});
