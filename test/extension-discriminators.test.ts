import { describe, expect, it } from "vitest";
import { validateExtensionPayload } from "../src/core/adapter-extension.js";
import { syntheticExtensionAdapter } from "./synthetic-extension-adapter.js";

const ns = "third-harness.audit";
describe("extension discriminator routing", () => {
  it("validates distinct request/result schemas by operation name", async () => {
    const adapter = await syntheticExtensionAdapter();
    expect(
      validateExtensionPayload(adapter, ns, 7, "request", "inspect", {
        scope: "current",
      }).value,
    ).toEqual({ scope: "current" });
    expect(
      validateExtensionPayload(adapter, ns, 7, "request", "apply", {
        enabled: true,
      }).value,
    ).toEqual({ enabled: true });
    expect(
      validateExtensionPayload(adapter, ns, 7, "result", "inspect", {
        items: 2,
      }).value,
    ).toEqual({ items: 2 });
    expect(
      validateExtensionPayload(adapter, ns, 7, "result", "apply", {
        applied: true,
      }).value,
    ).toEqual({ applied: true });
    expect(() =>
      validateExtensionPayload(adapter, ns, 7, "request", "apply", {
        scope: "wrong",
      }),
    ).toThrow("INVALID_EXTENSION_PAYLOAD");
    expect(() =>
      validateExtensionPayload(adapter, ns, 7, "result", "inspect", {
        applied: true,
      }),
    ).toThrow("INVALID_EXTENSION_PAYLOAD");
  });
  it("validates distinct events and selects migration by kind and name", async () => {
    const adapter = await syntheticExtensionAdapter();
    expect(
      validateExtensionPayload(adapter, ns, 7, "event", "audit.finished", {
        count: 2,
      }).value,
    ).toEqual({ count: 2 });
    expect(
      validateExtensionPayload(adapter, ns, 7, "event", "audit.started", {
        scope: "x",
      }).value,
    ).toEqual({ scope: "x" });
    const old = [
      ["request", "inspect", { legacyScope: "x" }, { scope: "x" }],
      ["request", "apply", { legacyEnabled: true }, { enabled: true }],
      ["result", "inspect", { legacyItems: 2 }, { items: 2 }],
      ["result", "apply", { legacyApplied: true }, { applied: true }],
      ["event", "audit.finished", { legacyCount: 3 }, { count: 3 }],
      ["event", "audit.started", { legacyScope: "y" }, { scope: "y" }],
    ] as const;
    for (const [kind, name, input, expected] of old)
      expect(
        validateExtensionPayload(adapter, ns, 6, kind, name, input).value,
      ).toEqual(expected);
    expect(() =>
      validateExtensionPayload(adapter, ns, 6, "request", "apply", {
        legacyScope: "wrong",
      }),
    ).toThrow("EXTENSION_MIGRATION_FAILED");
    expect(() =>
      validateExtensionPayload(adapter, ns, 7, "event", "audit.finished", {
        scope: "wrong",
      }),
    ).toThrow("INVALID_EXTENSION_PAYLOAD");
  });
});
