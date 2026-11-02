import { describe, expect, it } from "vitest";
import type { EffortChangeCallContext } from "../src/core/effort-change-port.js";
import { setup, synthetic } from "./durable-manager-support.js";

async function runInvalidation(
  writeBefore: boolean,
  invalidate: "owner" | "source",
) {
  const adapter = {
    ...synthetic,
    descriptor: {
      ...synthetic.descriptor,
      capabilities: [...synthetic.descriptor.capabilities, "effort.change"],
    },
  };
  let event: ((value: unknown) => void) | undefined;
  const inputs = {
    submit: async () => ({ kind: "uncertain" as const }),
    cancel: async () => ({ kind: "uncertain" as const }),
    subscribe: (listener: (value: unknown) => void) => {
      event = listener;
      return () => {};
    },
  };
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  const effortChange = {
    changeEffort: async (_level: string, context: EffortChangeCallContext) => {
      if (writeBefore) {
        expect(context.beforeMutationWrite()).toBe(true);
        writes += 1;
      }
      started();
      await gate;
      if (!writeBefore && context.beforeMutationWrite()) writes += 1;
      return { outcome: "applied" };
    },
  };
  const configured = setup({ adapter, inputs, effortChange });
  const session = await configured.manager.create({ cwd: process.cwd() });
  const operation = configured.manager.changeEffort(session.id, "exact");
  const rejection = expect(operation).rejects.toMatchObject({
    code: "SESSION_UNAVAILABLE",
    outcome: writeBefore ? "unknown" : "not-applied",
  });
  await entered;
  if (invalidate === "owner") configured.store.stale = true;
  else event?.({ kind: "execution-ended" });
  release();
  await rejection;
  expect(writes).toBe(writeBefore ? 1 : 0);
}

describe("durable effort change invalidation", () => {
  it.each(["owner", "source"] as const)(
    "blocks a stale pre-write operation: %s",
    (kind) => runInvalidation(false, kind),
  );
  it.each(["owner", "source"] as const)(
    "reports unknown after mutation then invalidation: %s",
    (kind) => runInvalidation(true, kind),
  );
});
