import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "../src/harness/pi-lifecycle-factory.js";
import { TrackedLifecycleFactory } from "../src/harness/tracked-lifecycle-factory.js";
import { MemoryStore } from "./durable-memory-store.js";
import { FakePiChild } from "./pi-durable-fake-child.js";

export function createTrackedPiImageManager() {
  const adapter = new PiLifecycleAdapter();
  const children: FakePiChild[] = [];
  const launches: string[][] = [];
  const executionFactory = new PiLifecycleExecutionFactory(adapter, {
    launch: (_executable, args) => {
      launches.push(args);
      const child = new FakePiChild();
      const original = child.onWrite;
      child.onWrite = (request) => {
        original?.(request);
        if (request.type !== "prompt") return;
        child.send({
          type: "response",
          id: request.id,
          command: "prompt",
          success: true,
        });
        child.send({ type: "agent_settled" });
      };
      children.push(child);
      return child.child;
    },
  });
  const factory = new TrackedLifecycleFactory([
    { adapter, factory: executionFactory },
  ]);
  let sequence = 0;
  const manager = new DurableSessionManager(
    new MemoryStore(),
    new HarnessRegistry([adapter], "pi"),
    factory,
    { token: "test-owner", generation: 1 },
    () => `opaque-${++sequence}`,
  );
  return { manager, children, launches };
}
