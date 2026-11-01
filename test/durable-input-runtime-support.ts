import type { ExecutionInputPort } from "../src/core/execution-input-port.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { setup, synthetic } from "./durable-manager-support.js";

export function configured(
  inputs: Pick<ExecutionInputPort, "submit" | "cancel"> &
    Partial<Pick<ExecutionInputPort, "subscribe">>,
  ids = ["session-1", "input.custom"],
  inputTimeout = 5000,
  imageSupport = true,
  onFactoryCreate?: () => void,
  onStop?: () => void,
  stopExecution?: () => Promise<void>,
  stopTimeout = 25,
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
  const port = inputs as ExecutionInputPort;
  port.subscribe ??= () => () => {};
  return setup({
    adapter,
    id: () => ids.shift() ?? "input.next",
    inputTimeout,
    timeout: stopTimeout,
    factory: () => {
      onFactoryCreate?.();
      return {
        inputs: port,
        launch: async () => ({
          nativeSessionId: "native",
          checkpoint: { namespace: "synthetic.audit", version: 3, data: {} },
        }),
        resume: async () => ({
          nativeSessionId: "native",
          checkpoint: { namespace: "synthetic.audit", version: 3, data: {} },
        }),
        stop: async () => {
          onStop?.();
          await stopExecution?.();
        },
      };
    },
  });
}
