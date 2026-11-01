import { describe, expect, it } from "vitest";
import { validateCheckpoint } from "../src/core/adapter-checkpoint.js";
import { validateExtensionPayload } from "../src/core/adapter-extension.js";
import { SafeValidationError } from "../src/core/generic-json.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";

const adapter: HarnessAdapter = {
  descriptor: {
    id: "synthetic",
    aliases: [],
    capabilities: [],
    extensions: [
      {
        namespace: "synthetic.audit",
        version: 7,
        operations: [{ name: "inspect", effect: "read", guardRequired: false }],
        events: ["audit.finished"],
      },
    ],
  },
  checkpoint: { namespace: "synthetic.audit", version: 3 },
  validateCheckpoint: (value) =>
    !!value && typeof value === "object" && !Array.isArray(value),
  migrateCheckpoint: (from, data) =>
    from === 1 ? { namespace: "synthetic.audit", version: 3, data } : undefined,
  validateExtension: (_ns, version, _kind, value) => version === 7 && !!value,
  migrateExtension: (_ns, from, _kind, value) =>
    from === 6 ? { version: 7, value } : undefined,
};
describe("versioned adapter payloads", () => {
  it("migrates checkpoints and extensions through registered hooks", () => {
    expect(
      validateCheckpoint(
        { namespace: "synthetic.audit", version: 1, data: {} },
        adapter,
      ).version,
    ).toBe(3);
    expect(
      validateExtensionPayload(
        adapter,
        "synthetic.audit",
        6,
        "request",
        "inspect",
        {},
      ).version,
    ).toBe(7);
    expect(() =>
      validateExtensionPayload(
        adapter,
        "synthetic.audit",
        7,
        "request",
        "run-anything",
        {},
      ),
    ).toThrow("UNKNOWN_EXTENSION_OPERATION");
  });
  it("fails unknown checkpoint namespaces and versions explicitly", () => {
    expect(() =>
      validateCheckpoint({ namespace: "other", version: 1, data: {} }, adapter),
    ).toThrow(SafeValidationError);
    expect(() =>
      validateCheckpoint(
        { namespace: "synthetic.audit", version: 4, data: {} },
        adapter,
      ),
    ).toThrow("UNKNOWN_CHECKPOINT_VERSION");
  });
});
