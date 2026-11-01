import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { HarnessRegistry } from "../src/core/adapter-registry.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { SafeValidationError } from "../src/core/generic-json.js";

const fixtureUrl = new URL(
  "./fixtures/v2/contracts/synthetic-harness.json",
  import.meta.url,
);
async function adapterFromFixture(): Promise<HarnessAdapter> {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
    descriptor: HarnessAdapter["descriptor"];
  };
  return {
    descriptor: fixture.descriptor,
    checkpoint: { namespace: "third-harness.audit", version: 3 },
    validateCheckpoint: (value) =>
      !!value && typeof value === "object" && !Array.isArray(value),
    migrateCheckpoint: (from, data) =>
      from === 2
        ? { namespace: "third-harness.audit", version: 3, data }
        : undefined,
  };
}
describe("generic adapter registry", () => {
  it("resolves custom aliases and accepts a capability subset", async () => {
    const adapter = await adapterFromFixture();
    const registry = new HarnessRegistry([adapter], "third");
    expect(registry.resolve().descriptor.id).toBe("third-harness");
    expect(registry.resolve("alt-third")).toBe(adapter);
    expect(adapter.descriptor.capabilities).toEqual([
      "input.submit",
      "harness.stop",
    ]);
    const namespaced = {
      ...adapter,
      descriptor: {
        ...adapter.descriptor,
        capabilities: [
          ...adapter.descriptor.capabilities,
          "third-harness/audit",
        ],
      },
    };
    expect(new HarnessRegistry([namespaced]).resolve("third-harness")).toBe(
      namespaced,
    );
  });
  it("rejects duplicate IDs, alias collisions, and malformed fixture descriptors", async () => {
    const adapter = await adapterFromFixture();
    expect(() => new HarnessRegistry([adapter, adapter])).toThrow(
      SafeValidationError,
    );
    const collision = {
      ...adapter,
      descriptor: { ...adapter.descriptor, id: "other", aliases: ["third"] },
    };
    expect(() => new HarnessRegistry([adapter, collision])).toThrow(
      "ADAPTER_ID_COLLISION",
    );
    const invalid = {
      ...adapter,
      descriptor: { ...adapter.descriptor, extra: true },
    };
    expect(() => new HarnessRegistry([invalid as HarnessAdapter])).toThrow(
      "INVALID_ADAPTER_REGISTRATION",
    );
  });
});
