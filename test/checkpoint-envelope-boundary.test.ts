import { describe, expect, it } from "vitest";
import { validateCheckpoint } from "../src/core/adapter-checkpoint.js";
import { validateCheckpointEnvelope } from "../src/core/durable-validation.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { encodeCheckpoint } from "../src/persistence/encode-json.js";

const adapter: HarnessAdapter = {
  descriptor: { id: "test", aliases: [], capabilities: [] },
  checkpoint: { namespace: "test.checkpoint", version: 2 },
  validateCheckpoint: (value) => typeof value === "string",
  migrateCheckpoint: (_from, data) => ({
    namespace: "test.checkpoint",
    version: 2,
    data,
  }),
};
const envelope = (data: unknown, version = 2) => ({
  namespace: "test.checkpoint",
  version,
  data,
});
describe("shared checkpoint envelope boundary", () => {
  it("accepts exactly 64 KiB across core and persistence validators", () => {
    const overhead = Buffer.byteLength(JSON.stringify(envelope("")));
    const exact = envelope("x".repeat(65536 - overhead));
    expect(Buffer.byteLength(JSON.stringify(exact))).toBe(65536);
    expect(validateCheckpointEnvelope(exact)).toBeUndefined();
    expect(validateCheckpoint(exact, adapter).data).toBe(exact.data);
    expect(encodeCheckpoint(exact as never)).toBe(JSON.stringify(exact));
    const oversized = envelope("x".repeat(65537 - overhead));
    expect(() => validateCheckpointEnvelope(oversized)).toThrow(
      "JSON_SIZE_LIMIT",
    );
    expect(() => encodeCheckpoint(oversized as never)).toThrow(
      "JSON_SIZE_LIMIT",
    );
  });
  it("uses the same depth limit and rejects malformed envelopes", () => {
    let depthBoundary: unknown = "leaf";
    for (let index = 0; index < 19; index++) depthBoundary = [depthBoundary];
    expect(() =>
      validateCheckpointEnvelope(envelope(depthBoundary)),
    ).not.toThrow();
    expect(() =>
      encodeCheckpoint(envelope(depthBoundary) as never),
    ).not.toThrow();
    expect(() => validateCheckpointEnvelope(envelope([depthBoundary]))).toThrow(
      "JSON_DEPTH_LIMIT",
    );
    for (const invalid of [
      { ...envelope({}), extra: true },
      { namespace: 3, version: 2, data: {} },
      { namespace: "bad/name", version: 2, data: {} },
      {
        namespace: "test.checkpoint",
        version: Number.MAX_SAFE_INTEGER + 1,
        data: {},
      },
    ])
      expect(() => validateCheckpointEnvelope(invalid)).toThrow(
        "INVALID_CHECKPOINT",
      );
  });
  it("revalidates migrated checkpoint envelopes including strict keys and bounds", () => {
    const withExtra: HarnessAdapter = {
      ...adapter,
      migrateCheckpoint: (_from, data) =>
        ({ ...envelope(data), extra: true }) as never,
    };
    expect(() => validateCheckpoint(envelope("old", 1), withExtra)).toThrow(
      "CHECKPOINT_MIGRATION_FAILED",
    );
    const tooLarge: HarnessAdapter = {
      ...adapter,
      migrateCheckpoint: () =>
        envelope(
          "x".repeat(
            65536 - Buffer.byteLength(JSON.stringify(envelope(""))) + 1,
          ),
        ) as never,
    };
    expect(() => validateCheckpoint(envelope("old", 1), tooLarge)).toThrow(
      "CHECKPOINT_MIGRATION_FAILED",
    );
    let deep: unknown = "leaf";
    for (let index = 0; index < 20; index++) deep = [deep];
    const tooDeep: HarnessAdapter = {
      ...adapter,
      migrateCheckpoint: () => envelope(deep) as never,
    };
    expect(() => validateCheckpoint(envelope("old", 1), tooDeep)).toThrow(
      "CHECKPOINT_MIGRATION_FAILED",
    );
  });
});
