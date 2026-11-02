import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { isCleanStartupCancellation, startV2 } from "../src/v2-bootstrap.js";

afterEach(() => vi.restoreAllMocks());

describe("v2 startup cancellation", () => {
  it.each([
    { phase: "after lease acquisition", checks: 1 },
    { phase: "after reconciliation", checks: 2 },
    { phase: "after listen", checks: 3 },
  ])("rolls back cancellation $phase", async ({ checks: phase }) => {
    const home = await mkdtemp(path.join(os.tmpdir(), "v2-cancel-"));
    let checks = 0;
    try {
      await expect(
        startV2(() => ++checks === phase, {
          HOME: home,
          LLM_SESSIOND_STATE_DIR: path.join(home, "state"),
          PORT: "0",
        }),
      ).rejects.toThrow("STARTUP_CANCELLED");
      expect(checks).toBe(phase);
      await expect(
        stat(path.join(home, "state", "owner.lock")),
      ).rejects.toThrow();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
  it("does not classify failed rollback as clean signal cancellation", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "v2-cancel-fail-"));
    vi.spyOn(OwnedStoreLease.prototype, "release").mockImplementation(
      async function (this: OwnedStoreLease) {
        this.db.close();
        throw Error("injected release fault");
      },
    );
    try {
      await expect(
        startV2(() => true, {
          HOME: home,
          LLM_SESSIOND_STATE_DIR: path.join(home, "state"),
          PORT: "0",
        }),
      ).rejects.toThrow("STARTUP_ROLLBACK_UNCONFIRMED");
      expect(
        isCleanStartupCancellation(new Error("STARTUP_ROLLBACK_UNCONFIRMED")),
      ).toBe(false);
      expect(isCleanStartupCancellation(new Error("STARTUP_CANCELLED"))).toBe(
        true,
      );
      await expect(
        stat(path.join(home, "state", "owner.lock")),
      ).resolves.toBeDefined();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
