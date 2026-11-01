import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "../src/harness/pi-lifecycle-factory.js";
import { MemoryStore } from "./durable-memory-store.js";

export function createPiTestManager(
  provider: ProcessProvider,
  id: () => string,
  inputTimeoutMs = 1000,
) {
  const adapter = new PiLifecycleAdapter();
  return new DurableSessionManager(
    new MemoryStore(),
    new HarnessRegistry([adapter], "pi"),
    new PiLifecycleExecutionFactory(adapter, provider),
    { token: "test-owner", generation: 1 },
    id,
    1000,
    inputTimeoutMs,
  );
}
