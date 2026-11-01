import { describe, expect, it } from "vitest";
import { evaluateLease } from "./v2-lease-evaluator.js";
import { load } from "./v2-fixture-support.js";
import type { LeaseOp } from "./v2-lease-operations.js";

describe("lease unbind invalidates pending callbacks", () => {
  it("rejects stale results without rebind, after same-connection rebind, and after transfer", () => {
    const fixture = load("lease-unbind-cases.json") as {
      noRebind: LeaseOp[];
      sameConnectionRebind: LeaseOp[];
      transferWhileOldLive: LeaseOp[];
    };
    for (const steps of Object.values(fixture))
      expect(evaluateLease(steps)).toEqual(
        expect.arrayContaining(["unbound", "stale-binding"]),
      );
    expect(evaluateLease(fixture.noRebind).at(-1)).toBe("stale-binding");
    expect(evaluateLease(fixture.sameConnectionRebind).at(-2)).toBe("bound:B2");
    expect(evaluateLease(fixture.sameConnectionRebind).at(-1)).toBe(
      "stale-binding",
    );
    expect(evaluateLease(fixture.transferWhileOldLive).at(-1)).toBe(
      "stale-binding",
    );
  });
});
