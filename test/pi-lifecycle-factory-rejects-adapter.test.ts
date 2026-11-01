import { describe, expect, it } from "vitest";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "../src/harness/pi-lifecycle-factory.js";

describe("Pi lifecycle factory", () => {
  it("rejects a different adapter without launching", () => {
    const adapter = new PiLifecycleAdapter();
    const factory = new PiLifecycleExecutionFactory(adapter, {
      launch: () => {
        throw new Error("unexpected launch");
      },
    });
    expect(() => factory.create(new PiLifecycleAdapter())).toThrow(
      "UNSUPPORTED_ADAPTER",
    );
  });
});
