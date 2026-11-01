import { describe, expect, it } from "vitest";
import { validateExtensionPayload } from "../src/core/adapter-extension.js";
import type { JsonValue } from "../src/core/generic-json.js";
import { syntheticExtensionAdapter } from "./synthetic-extension-adapter.js";

async function migrated(result: unknown) {
  const adapter = await syntheticExtensionAdapter();
  return { ...adapter, migrateExtension: () => result as never };
}
describe("extension migration bounds", () => {
  it("requires a positive safe input version and strict migration envelope", async () => {
    const adapter = await migrated({ version: 7, value: { scope: "x" } });
    for (const version of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        validateExtensionPayload(
          adapter,
          "third-harness.audit",
          version,
          "request",
          "inspect",
          { legacyScope: "x" },
        ),
      ).toThrow("UNKNOWN_EXTENSION_VERSION");
    for (const result of [
      { version: 0, value: { scope: "x" } },
      { version: 7, value: { scope: "x" }, extra: true },
      { version: 7, value: undefined },
    ]) {
      const broken = await migrated(result);
      expect(() =>
        validateExtensionPayload(
          broken,
          "third-harness.audit",
          6,
          "request",
          "inspect",
          { legacyScope: "x" },
        ),
      ).toThrow();
    }
  });
  it("revalidates migrated request, result, and event JSON for privacy and bounds", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let deep: unknown = true;
    for (let index = 0; index < 20; index++) deep = { nested: deep };
    const cases = [
      ["request", "inspect", { legacyScope: "x" }, { apiKey: "hidden" }],
      ["result", "inspect", { legacyItems: 1 }, "x".repeat(65536)],
      ["event", "audit.started", { legacyScope: "x" }, deep],
      ["request", "apply", { legacyEnabled: true }, cyclic],
    ] as const;
    for (const [kind, name, input, output] of cases) {
      const adapter = await migrated({
        version: 7,
        value: output as JsonValue,
      });
      expect(() =>
        validateExtensionPayload(
          adapter,
          "third-harness.audit",
          6,
          kind,
          name,
          input,
        ),
      ).toThrow();
    }
  });
});
