import type { LifecycleExecution } from "../src/core/lifecycle-execution.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { setup, synthetic } from "./durable-manager-support.js";

export function configured(
  inputs: NonNullable<LifecycleExecution["inputs"]>,
  ids = ["session-1", "input.custom"],
  inputTimeout = 5000,
  imageSupport = true,
) {
  const inputCapabilities = [
    "input.submit",
    ...(imageSupport ? ["input.submit-images"] : []),
    "input.cancel",
    "input.cancel-current",
  ];
  const adapter: HarnessAdapter = {
    ...synthetic,
    descriptor: {
      ...synthetic.descriptor,
      capabilities: [
        ...synthetic.descriptor.capabilities,
        ...inputCapabilities,
      ],
    },
  };
  return setup({
    adapter,
    id: () => ids.shift() ?? "input.next",
    inputTimeout,
    factory: () => ({
      inputs,
      launch: async () => ({
        nativeSessionId: "native",
        checkpoint: { namespace: "synthetic.audit", version: 3, data: {} },
      }),
      resume: async () => ({
        nativeSessionId: "native",
        checkpoint: { namespace: "synthetic.audit", version: 3, data: {} },
      }),
      stop: async () => {},
    }),
  });
}
