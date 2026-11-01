import { describe, expect, it } from "vitest";
import { validateCheckpoint } from "../src/core/adapter-checkpoint.js";
import { SafeValidationError } from "../src/core/generic-json.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";

const adapter: HarnessAdapter = {
  descriptor: {
    id: "synthetic",
    aliases: [],
    capabilities: [],
  },
  checkpoint: { namespace: "synthetic.audit", version: 3 },
  validateCheckpoint: (value) =>
    !!value && typeof value === "object" && !Array.isArray(value),
  migrateCheckpoint: (from, data) =>
    from === 1 ? { namespace: "synthetic.audit", version: 3, data } : undefined,
};
describe("versioned adapter checkpoints", () => {
  it("migrates checkpoints through the registered adapter hook", () => {
    expect(
      validateCheckpoint(
        { namespace: "synthetic.audit", version: 1, data: {} },
        adapter,
      ).version,
    ).toBe(3);
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
