import { describe, expect, it } from "vitest";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import type {
  LifecycleExecution,
  LifecycleExecutionFactory,
} from "../src/core/lifecycle-execution.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { ClaudeLifecycleAdapter } from "../src/harness/claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecutionFactory } from "../src/harness/claude-lifecycle-factory.js";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecutionFactory } from "../src/harness/pi-lifecycle-factory.js";
import { MemoryStore } from "./durable-memory-store.js";

const owner = { token: "test-owner", generation: 1 };
const execution: LifecycleExecution = {
  launch: async () => ({}),
  resume: async () => ({}),
  stop: async () => {},
};
describe("open durable runtime registry", () => {
  it("binds built-ins and a third adapter without core changes, stopping manager before providers", async () => {
    const order: string[] = [];
    const provider = {
      launch: () => {
        throw new Error("unexpected process");
      },
      shutdown: async () => {
        order.push("provider");
      },
    };
    const pi = new PiLifecycleAdapter();
    const claude = new ClaudeLifecycleAdapter();
    const third: HarnessAdapter = {
      descriptor: {
        id: "third",
        aliases: [],
        capabilities: ["harness.launch", "harness.resume", "harness.stop"],
      },
      validateCheckpoint: () => true,
    };
    const synthetic: LifecycleExecutionFactory = {
      create: () => ({
        ...execution,
        stop: async () => {
          order.push("manager");
        },
      }),
    };
    const runtime = createDurableRuntime({
      store: new MemoryStore(),
      owner,
      defaultId: "pi",
      providers: [provider],
      bindings: [
        { adapter: pi, factory: new PiLifecycleExecutionFactory(pi, provider) },
        {
          adapter: claude,
          factory: new ClaudeLifecycleExecutionFactory(claude, provider),
        },
        { adapter: third, factory: synthetic },
      ],
    });
    expect(
      runtime.registry.list().map((adapter) => adapter.descriptor.id),
    ).toEqual(["pi", "claude-code", "third"]);
    const created = await runtime.manager.create({
      cwd: process.cwd(),
      harnessId: "third",
    });
    expect(created.status).toBe("running");
    await runtime.shutdown();
    expect(order).toEqual(["manager", "provider"]);
  });
});
