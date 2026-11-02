import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import type { LifecycleExecutionFactory } from "../src/core/lifecycle-execution.js";
import type { DurableSession } from "../src/persistence/session-record.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { MemoryStore } from "./durable-memory-store.js";

export const resultAdapter: HarnessAdapter = {
  descriptor: {
    id: "result-test",
    aliases: [],
    capabilities: ["harness.launch", "harness.resume", "harness.stop"],
  },
  validateCheckpoint: () => true,
};
export class PublicationStore extends MemoryStore {
  readonly writes: DurableSession["status"][] = [];
  beforeExecutionUpdate: (() => void) | undefined;
  override updateExecution(
    ...args: Parameters<MemoryStore["updateExecution"]>
  ) {
    this.beforeExecutionUpdate?.();
    super.updateExecution(...args);
  }
  override setStatus(
    id: string,
    status: DurableSession["status"],
    reason: string | null = null,
    at: string | null = null,
  ) {
    this.writes.push(status);
    super.setStatus(id, status, reason, at);
  }
}
export function publicationRuntime(
  store: PublicationStore,
  factory: LifecycleExecutionFactory,
) {
  return createDurableRuntime({
    store,
    owner: { token: "test-owner", generation: 1 },
    defaultId: resultAdapter.descriptor.id,
    bindings: [{ adapter: resultAdapter, factory }],
  });
}
