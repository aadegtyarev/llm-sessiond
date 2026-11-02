import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ProcessCleanupUnconfirmed,
  spawnChild,
  stopChild,
  waitChild,
} from "../scripts/v2-smoke-child.mjs";

describe("portable smoke child ownership", () => {
  it("recognizes an already exited nonzero process as failure", async () => {
    const child = spawnChild(process.execPath, ["-e", "process.exit(7)"], {
      stdio: "ignore",
    });
    const outcome = await waitChild(child, 2000);
    expect(outcome?.code).toBe(7);
    await expect(stopChild(child)).rejects.toBeInstanceOf(
      ProcessCleanupUnconfirmed,
    );
  });
  it("reaps spawn errors without mistaking them for clean exits", async () => {
    const missing = path.join(os.tmpdir(), `missing-smoke-${process.pid}.exe`);
    const child = spawnChild(missing, [], { stdio: "ignore" });
    const outcome = await waitChild(child, 2000);
    expect(outcome?.error).toBeTruthy();
    await expect(stopChild(child)).rejects.toBeInstanceOf(
      ProcessCleanupUnconfirmed,
    );
  });
});
