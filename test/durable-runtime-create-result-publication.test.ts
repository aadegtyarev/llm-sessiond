import { expect, it } from "vitest";
import type { LifecycleExecutionFactory } from "../src/core/lifecycle-execution.js";
import {
  PublicationStore,
  publicationRuntime,
} from "./durable-runtime-result-publication-support.js";

it("rechecks admission after store execution update before status publication", async () => {
  const store = new PublicationStore();
  let shutdown: Promise<void> | undefined;
  let closedAt = -1;
  const runtime = publicationRuntime(store, {
    create: () => ({
      launch: async () => ({ nativeSessionId: "native.exact" }),
      resume: async () => ({}),
      stop: async () => {},
    }),
  });
  store.beforeExecutionUpdate = () => {
    shutdown = runtime.shutdown();
    closedAt = store.writes.length;
  };
  const outcome = runtime.manager.create({ cwd: process.cwd() }).then(
    () => null,
    (error: unknown) => error,
  );
  const operationError = await outcome;
  await shutdown;
  expect(operationError).toMatchObject({ code: "OPERATION_FAILED" });
  expect(store.writes.slice(closedAt)).not.toContain("running");
  expect(store.writes.slice(closedAt)).toContain("failed");
});

it("does not publish running when native identity capture closes runtime", async () => {
  const store = new PublicationStore();
  let shutdown: Promise<void> | undefined;
  let stops = 0;
  let closedAt = -1;
  const factory: LifecycleExecutionFactory = {
    create: () => ({
      launch: async () => ({
        get nativeSessionId() {
          shutdown = runtime.shutdown();
          closedAt = store.writes.length;
          return "native.exact";
        },
      }),
      resume: async () => ({}),
      stop: async () => {
        stops++;
      },
    }),
  };
  const runtime = publicationRuntime(store, factory);
  const outcome = runtime.manager.create({ cwd: process.cwd() }).then(
    () => null,
    (error: unknown) => error,
  );
  const operationError = await outcome;
  await shutdown;
  expect(operationError).toMatchObject({ code: "OPERATION_FAILED" });
  expect(store.list()[0]?.status).toBe("failed");
  expect(stops).toBe(1);
  expect(store.writes.slice(closedAt)).not.toContain("running");
  expect(store.writes.slice(closedAt)).toContain("failed");
});
