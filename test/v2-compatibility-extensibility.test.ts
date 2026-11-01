import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { load } from "./v2-fixture-support.js";

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
    expect(f.descriptor.id).toBe("third-harness");
    expect(f.descriptor.capabilities).toEqual(["input.submit", "harness.stop"]);
    expect(f.descriptor.options[0].key).toBe("layout");
    expect(f.checkpoint.namespace).toBe("third-harness.audit");
    expect(f.extension.event.namespace).toBe(f.checkpoint.namespace);
    expect(f.schemaConstraint.registrationAccepted).toBe(true);
    expect(f.schemaConstraint.forbiddenFixedEnums).toEqual(["pi", "claude"]);
    expect(f.schemaConstraint.forbiddenDatabaseFields).toEqual([
      "pi_*",
      "claude_*",
    ]);
    expect(f.schemaConstraint.forbiddenDtoCases).toEqual([
      "PiSession",
      "ClaudeSession",
    ]);
    expect(f.schemaConstraint.forbiddenRouteAdditions).toBe(true);
  });
});
