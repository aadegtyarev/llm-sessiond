import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { load } from "./v2-fixture-support.js";
import { validateRegistration } from "./v2-registration-schema.js";

describe("v2 compatibility and extensibility fixtures", () => {
  it("asserts v1 contracts remain isolated and unchanged", () => {
    const f = load("v1-unchanged.json");
    const doc = readFileSync(
      new URL("../docs/contracts/surfaces/api-v1.md", import.meta.url),
      "utf8",
    );
    for (const route of f.routes)
      expect(doc).toContain(
        route.endsWith("/resume") ? "and `/resume`" : route,
      );
    for (const sentinel of f.sentinels) expect(doc).toContain(sentinel);
    expect(f.compatibility).toMatchObject({
      memoryBacked: true,
      sessionId: "uuid",
      eventReplay: false,
      durableRecovery: false,
      v2IsolatedNamespace: true,
    });
    expect(f.websocket).toBe("/api/v1/events");
  });
  it("accepts a third harness without closed core cases", () => {
    const f = load("synthetic-harness.json");
    expect(validateRegistration(f)).toBe(true);
    expect(
      validateRegistration({
        ...f,
        descriptor: { ...f.descriptor, id: "arbitrary-third-party" },
      }),
    ).toBe(true);
    expect(f.descriptor.capabilities).toEqual(["input.submit", "harness.stop"]);
    expect(f.descriptor.options[0].key).toBe("layout");
    expect(f.descriptor.extensions[0].version).toBe(7);
    expect(f.checkpoint.version).toBe(3);
    expect(f.sample.output.items).toBe(2);
    const mutations = load("negative-registration.json").mutations;
    for (const mutation of mutations) {
      const candidate = structuredClone(f);
      if (mutation.kind === "unknown-root") candidate.extra = true;
      if (mutation.kind === "missing-capabilities")
        delete candidate.descriptor.capabilities;
      if (mutation.kind === "unregistered-operation")
        candidate.sample.operation = "not-registered";
      if (mutation.kind === "checkpoint-namespace-mismatch")
        candidate.checkpoint.namespace = "other.namespace";
      expect(validateRegistration(candidate)).toBe(false);
    }
  });
});
