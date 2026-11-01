import { describe, expect, it } from "vitest";
import { load } from "./v2-fixture-support.js";

describe("v2 bridge and persistence fixtures", () => {
  it("validates callback leases, deadlines, and uncertainty", () => {
    const f = load("bridge-callbacks-guards.json");
    expect(f.lease.conflict).toMatchObject({ status: 409, effect: "no-steal" });
    expect(f.lease.disconnect).toMatchObject({
      session: "continues",
      process: "continues",
      pendingCallback: "not-reassigned",
    });
    expect(f.callbacks[0]).toMatchObject({
      deadlineSeconds: 60,
      uiDeadlineSeconds: 55,
      lateAfterCancel: "ignored",
    });
    expect(f.callbacks[1]).toMatchObject({
      overallDeadlineSeconds: 300,
      partial: { delivered: 1, recipients: 2 },
      lostAfterDispatch: "unknown",
    });
  });
  it("validates guard invalidation and write races", () => {
    const guards = load("bridge-callbacks-guards.json").guards;
    expect(guards[0].invalidateAckBeforeSelectionChange).toBe(true);
    expect(guards[1].queuedWrite).toBe("reject-before-write");
    expect(guards[2]).toMatchObject({
      beforeWrite: "reject",
      afterWrite: "unknown-no-replay",
    });
    expect(guards[3].cancelControl.isInputCancel).toBe(false);
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
