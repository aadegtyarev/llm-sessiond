import { describe, expect, it } from "vitest";
import { createDiscoveryFixture } from "./v2-http-discovery-fixture.js";
import { expectSafeError } from "./v2-http-discovery-support.js";

describe("v2 harness descriptor HTTP snapshot", () => {
  it("detaches nested option and extension data before the final readiness fence", async () => {
    const fixture = await createDiscoveryFixture();
    let hooks = 0;
    const fence = fixture.runtime.assertReady.bind(fixture.runtime);
    let checks = 0;
    fixture.runtime.assertReady = () => {
      fence();
      if (++checks !== 2) return;
      const option = fixture.adapter.descriptor.options![0]!;
      const extension = fixture.adapter.descriptor.extensions![0]!;
      const hook = () => {
        hooks++;
        void fixture.runtime.shutdown();
        return ["changed-after-fence"];
      };
      for (const key of ["values", "dangerousValues"]) {
        Object.defineProperty(option[key], "toJSON", { value: hook });
      }
      Object.defineProperty(option.defaultValue, "toJSON", { value: hook });
      Object.defineProperty(extension.operations, "toJSON", { value: hook });
      Object.defineProperty(extension.events, "toJSON", { value: hook });
    };
    try {
      const response = await fetch(`${fixture.base}/api/v2/harnesses`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.harnesses[0].options[0]).toEqual({
        key: "mode",
        label: "Mode",
        values: [{ nested: ["safe"] }],
        defaultValue: { selected: ["one"] },
        dangerousValues: [{ selected: "no" }],
      });
      expect(body.harnesses[0].extensions[0].operations).toEqual([
        { name: "inspect", effect: "read", guardRequired: false },
      ]);
      expect(body.harnesses[0].extensions[0].events).toEqual(["changed"]);
      expect(hooks).toBe(0);
    } finally {
      await fixture.dispose();
    }
  });
  it("rejects mutated option, extension, operation, event, ID, alias, and capability shapes", async () => {
    const fixture = await createDiscoveryFixture();
    const descriptor = fixture.adapter.descriptor;
    const ext = descriptor.extensions![0]!;
    const malformed = [
      { ...descriptor, options: [{ unexpected: true }] },
      { ...descriptor, extensions: [{ namespace: "vendor.bad" }] },
      {
        ...descriptor,
        extensions: [
          { ...ext, operations: [{ name: "read", effect: "read" }] },
        ],
      },
      { ...descriptor, extensions: [{ ...ext, events: [42] }] },
      { ...descriptor, id: "INVALID ID" },
      { ...descriptor, aliases: ["INVALID ALIAS"] },
      { ...descriptor, capabilities: ["not a capability"] },
    ];
    try {
      for (const invalid of malformed) {
        fixture.adapter.descriptor = invalid as typeof descriptor;
        const response = await fetch(`${fixture.base}/api/v2/harnesses`);
        const error = await expectSafeError(response, 503, "unavailable");
        expect(JSON.stringify(error)).not.toMatch(/private|stack|token/i);
      }
    } finally {
      await fixture.dispose();
    }
  });
});
