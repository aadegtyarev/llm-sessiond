import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("closes an idle source when confirmed stop loses owner before finalization", async () => {
  let unsubscribes = 0;
  let emit!: (event: unknown) => void;
  let stale = () => {};
  const { manager, store } = configured(
    {
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: (listener) => {
        emit = listener;
        return () => {
          unsubscribes++;
        };
      },
    },
    undefined,
    5000,
    true,
    undefined,
    () => {
      stale();
    },
  );
  stale = () => {
    store.stale = true;
  };
  const row = await manager.create({ cwd: process.cwd() });
  await expect(manager.stop(row.id)).rejects.toMatchObject({
    code: "STALE_OWNER",
  });
  expect(unsubscribes).toBe(1);
  emit({ kind: "execution-ended" });
  expect(manager.get(row.id).status).toBe("running");
});

it("preserves stale-owner when failed stop finalization cannot persist", async () => {
  let invalidation = () => {};
  let unsubscribes = 0;
  const { manager, store } = configured(
    {
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: () => () => {
        unsubscribes++;
      },
    },
    undefined,
    5000,
    true,
    undefined,
    () => invalidation(),
    async () => {
      throw new Error("stop failed");
    },
  );
  invalidation = () => {
    store.stale = true;
  };
  const row = await manager.create({ cwd: process.cwd() });
  await expect(manager.shutdownOwned()).rejects.toMatchObject({
    code: "STALE_OWNER",
  });
  expect(unsubscribes).toBe(0);
  expect(manager.get(row.id).status).toBe("running");
});

it("preserves stale-owner error after shutdown confirms the physical stop", async () => {
  let unsubscribes = 0;
  const storeRef: { current?: { stale: boolean } } = {};
  const { manager, store } = configured(
    {
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
      subscribe: () => () => {
        unsubscribes++;
      },
    },
    undefined,
    5000,
    true,
    undefined,
    () => {
      if (storeRef.current) storeRef.current.stale = true;
    },
  );
  storeRef.current = store;
  const row = await manager.create({ cwd: process.cwd() });
  await expect(manager.shutdownOwned()).rejects.toMatchObject({
    code: "STALE_OWNER",
  });
  expect(unsubscribes).toBe(1);
  expect(manager.get(row.id).status).toBe("running");
});
