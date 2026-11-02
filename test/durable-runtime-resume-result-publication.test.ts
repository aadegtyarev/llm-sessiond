import { expect, it } from "vitest";
import type { LifecycleExecutionFactory } from "../src/core/lifecycle-execution.js";
import {
  PublicationStore,
  publicationRuntime,
} from "./durable-runtime-result-publication-support.js";

it("does not publish running when resumed identity capture closes runtime", async () => {
  const store = new PublicationStore();
  let shutdown: Promise<void> | undefined;
  let stops = 0;
  let calls = 0;
  let closedAt = -1;
  const factory: LifecycleExecutionFactory = {
    create: () => {
      calls++;
      return {
        launch: async () => ({ nativeSessionId: "native.initial" }),
        resume: async () => ({
          get nativeSessionId() {
            shutdown = runtime.shutdown();
            closedAt = store.writes.length;
            return "native.replaced";
          },
        }),
        stop: async () => {
          stops++;
        },
      };
    },
  };
  const runtime = publicationRuntime(store, factory);
  const session = await runtime.manager.create({ cwd: process.cwd() });
  await runtime.manager.stop(session.id);
  store.writes.length = 0;
  const outcome = runtime.manager.resume(session.id).then(
    () => null,
    (error: unknown) => error,
  );
  const operationError = await outcome;
  await shutdown;
  expect(operationError).toMatchObject({ code: "OPERATION_FAILED" });
  expect(runtime.manager.get(session.id).status).toBe("failed");
  expect(calls).toBe(2);
  expect(stops).toBe(2);
  expect(store.writes.slice(closedAt)).not.toContain("running");
  expect(store.writes.slice(closedAt)).toContain("failed");
});
