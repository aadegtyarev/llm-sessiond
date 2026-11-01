import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { reconcileStartup } from "../src/core/startup-reconciliation.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";

describe("deterministic startup reconciliation", () => {
  it("reconciles statuses without invoking execution hooks and preserves unsupported records", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sessiond-reconcile-"));
    const db = openSessionDatabase(path.join(dir, "db.sqlite"));
    let executions = 0;
    const adapter = {
      descriptor: { id: "synthetic", aliases: [], capabilities: [] },
      checkpoint: { namespace: "synthetic.state", version: 2 },
      validateCheckpoint: (value) => !!value && typeof value === "object" && !Array.isArray(value),
      isResumable: () => true,
      launch: () => executions++, resume: () => executions++,
    } as HarnessAdapter & { launch: () => number; resume: () => number };
    try {
      const repo = new SessionRepository(db);
      repo.create({ id: "running", harnessId: "synthetic", cwd: "/w", status: "running", createdAt: "1" });
      repo.create({ id: "starting", harnessId: "synthetic", cwd: "/w", status: "starting", createdAt: "2" });
      repo.create({ id: "failed-resumable", harnessId: "synthetic", cwd: "/w", status: "failed", failureReason: "exit", failedAt: "now", adapterState: { namespace: "synthetic.state", version: 2, data: {} }, createdAt: "3" });
      repo.create({ id: "failed-unknown-version", harnessId: "synthetic", cwd: "/w", status: "failed", adapterState: { namespace: "synthetic.state", version: 9, data: {} }, createdAt: "4" });
      repo.create({ id: "missing-adapter", harnessId: "absent", cwd: "/w", status: "failed", createdAt: "5" });
      const report = reconcileStartup(repo, new HarnessRegistry([adapter]));
      expect(repo.get("running")?.status).toBe("stopped");
      expect(repo.get("starting")?.status).toBe("stopped");
      expect(repo.get("failed-resumable")).toMatchObject({ status: "stopped", failureReason: "exit", failedAt: "now" });
      expect(repo.get("failed-unknown-version")?.status).toBe("failed");
      expect(report.preserved.map((item) => item.reason)).toEqual(["UNKNOWN_CHECKPOINT_VERSION", "UNKNOWN_ADAPTER"]);
      expect(executions).toBe(0);
    } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
  });
});
