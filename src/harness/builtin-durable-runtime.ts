import type { DurableSessionStore } from "../core/session-manager-store.js";
import type { OwnerGeneration } from "../persistence/session-record.js";
import type { ProcessProvider } from "../core/ports.js";
import { ConfirmedProcessProvider } from "../process/confirmed-provider.js";
import { NodeProcessProvider } from "../process/node-provider.js";
import { ClaudeLifecycleAdapter } from "./claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecutionFactory } from "./claude-lifecycle-factory.js";
import { createDurableRuntime } from "./durable-runtime.js";
import { PiLifecycleAdapter } from "./pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "./pi-lifecycle-factory.js";

export function createBuiltinDurableRuntime(input: {
  store: DurableSessionStore;
  owner: OwnerGeneration;
  provider?: ProcessProvider;
  id?: () => string;
  nativeId?: () => string;
  stopTimeoutMs?: number;
  readinessTimeoutMs?: number;
}) {
  const provider = new ConfirmedProcessProvider(
    input.provider ?? new NodeProcessProvider(),
  );
  const pi = new PiLifecycleAdapter();
  const claude = new ClaudeLifecycleAdapter();
  const runtime = createDurableRuntime({
    store: input.store,
    owner: input.owner,
    defaultId: "pi",
    providers: [provider],
    ...(input.id ? { id: input.id } : {}),
    ...(input.stopTimeoutMs ? { stopTimeoutMs: input.stopTimeoutMs } : {}),
    bindings: [
      {
        adapter: pi,
        factory: new PiLifecycleExecutionFactory(
          pi,
          provider,
          undefined,
          input.readinessTimeoutMs,
        ),
      },
      {
        adapter: claude,
        factory: new ClaudeLifecycleExecutionFactory(
          claude,
          provider,
          undefined,
          input.readinessTimeoutMs,
          input.nativeId,
        ),
      },
    ],
  });
  return { ...runtime, pi, claude };
}
