import { describe, expect, it } from "vitest";
import { load } from "./v2-fixture-support.js";

describe("v2 negotiation fixtures", () => {
  it("covers negotiation, opaque IDs, aliases, and instance mismatch", () => {
    const f = load("negotiation.json");
    expect(f.health).toMatchObject({
      apiVersion: "v2",
      protocolRevision: 1,
      status: "ready",
      supportedApiVersions: ["v1", "v2"],
    });
    expect(f.opaqueIds.sessionId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
    expect(f.opaqueIds.caseDistinct[0]).not.toBe(f.opaqueIds.caseDistinct[1]);
    expect(f.registry.harnesses[0].aliases).toContain("alt-third");
    expect(f.instanceMismatch).toMatchObject({
      expectedStatus: 503,
      expectedOutcome: "not-applied",
    });
  });
});
