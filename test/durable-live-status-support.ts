import type { DurableSessionManager } from "../src/core/durable-session-manager.js";
import { synthetic } from "./durable-manager-support.js";

export const statusAdapter = {
  ...synthetic,
  descriptor: {
    ...synthetic.descriptor,
    capabilities: [
      ...synthetic.descriptor.capabilities,
      "status.read",
      "usage.read",
    ],
  },
};
export function internals(manager: DurableSessionManager) {
  return manager as unknown as {
    locks: { run<T>(id: string, action: () => Promise<T>): Promise<T> };
    context: {
      owned: Map<string, object>;
      pending: Map<string, object>;
      lifecycleIntents: Map<string, Set<object>>;
      inputState: {
        trackExecution(id: string, execution: object): unknown;
      };
    };
  };
}
