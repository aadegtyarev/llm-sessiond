import { describe, expect, it } from "vitest";
import { evaluateGuards } from "./v2-guard-evaluator.js";
import { evaluateLease } from "./v2-lease-evaluator.js";
import { load } from "./v2-fixture-support.js";

describe("v2 bridge scenarios and persistence fixtures", () => {
  it("computes lease conflict, wrong connection, duplicate, late, and detach outcomes", () => {
    const result = evaluateLease(load("lease-transcript.json").steps);
    expect(result).toEqual([
      "connected",
      "bound:B1",
      "pending",
      "connected",
      "conflict",
      "wrong-connection",
      "accepted",
      "duplicate",
      "pending",
      "time-advanced",
      "late",
      "unbound",
      "bound:B2",
      "pending",
      "canceled",
      "canceled-late-ignored",
      "detached",
      "connected",
      "bound:B3",
      "wrong-connection",
      "running/process-owned",
    ]);
  });
  it("computes generation invalidation and write-boundary uncertainty", () => {
    const result = evaluateGuards(load("guard-transcript.json").steps);
    expect(result).toEqual([
      "awaiting-invalidate-ack",
      "acknowledged",
      "awaiting-invalidate-ack",
      "rejected-before-write",
      "acknowledged",
      "awaiting-invalidate-ack",
      "acknowledged",
      "generation-rejected",
      "awaiting-invalidate-ack",
      "rejected-before-write",
      "acknowledged",
      "disconnected-invalidated",
      "rejected-before-write",
      "unknown-after-write",
    ]);
  });
  it("validates migration, reconciliation, checkpoints, and bounds", () => {
    const p = load("persistence-restart.json");
    const b = load("platform-bounds-privacy.json");
    expect(p.migrations[0]).toMatchObject({
      transactional: true,
      pragma: "user_version",
      journalMode: "WAL",
    });
    expect(p.genericColumns).not.toContain("pi_session_id");
    expect(p.reconciliation[0]).toMatchObject({ to: "stopped", launch: false });
    expect(p.checkpoints[2].staleInstanceWrite).toBe("reject");
    expect(p.shutdown.clientDetach).toBe("does-not-stop-session-or-process");
    expect(b.platforms).toMatchObject({
      relativeCwd: "reject",
      driveRelativeCwd: "reject",
      cwdIsSandbox: false,
    });
    expect(b.bounds).toMatchObject({
      httpJsonBytes: 25165824,
      attachmentBytes: 20971520,
      oversize: "reject-no-truncate",
    });
    expect(b.privacy.neverLogOrPersist).toContain("reasoning");
  });
});
