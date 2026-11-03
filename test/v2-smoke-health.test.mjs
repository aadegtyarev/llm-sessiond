import { describe, expect, it } from "vitest";
import { assertHealthyBoot } from "../scripts/v2-smoke-health.mjs";

describe("portable smoke health proof", () => {
  it("rejects a wrong-path or non-health response as a boot proof", () => {
    expect(() =>
      assertHealthyBoot({ status: 404, instanceId: "new" }, "old"),
    ).toThrow("new process returned no healthy v2 boot");
    expect(() => assertHealthyBoot({}, "old")).toThrow();
  });
  it("requires a ready v2 health response with a different boot ID", () => {
    const health = {
      apiVersion: "v2",
      status: "ready",
      instanceId: "new",
      supportedApiVersions: ["v1", "v2"],
      features: ["events.live"],
    };
    expect(assertHealthyBoot(health, "old")).toBe(health);
    expect(() => assertHealthyBoot(health, "new")).toThrow();
    expect(() =>
      assertHealthyBoot({ ...health, features: ["callbacks"] }, "old"),
    ).toThrow();
  });
});
