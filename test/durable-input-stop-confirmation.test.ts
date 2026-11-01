import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("cleans an idle source before shutdown storage retry without repeating stop", async () => {
  let stops = 0;
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
    () => {
      stops++;
    },
  );
  const row = await manager.create({ cwd: process.cwd() });
  store.failStatus = "stopped";
  await expect(manager.shutdownOwned()).rejects.toMatchObject({
    code: "STORE_FAILED",
  });
  expect({ stops, unsubscribes }).toEqual({ stops: 1, unsubscribes: 1 });
  await manager.shutdownOwned();
  expect(manager.get(row.id).status).toBe("stopped");
  expect({ stops, unsubscribes }).toEqual({ stops: 1, unsubscribes: 1 });
});

it("closes an unresolved source once when durable stop finalization retries", async () => {
  let unsubscribes = 0;
  let emit!: (event: unknown) => void;
  const { manager, store } = configured({
    submit: async () => ({ kind: "accepted" }),
    cancel: async () => ({ kind: "accepted" }),
    subscribe: (listener) => {
      emit = listener;
      return () => {
        unsubscribes++;
      };
    },
  });
  const row = await manager.create({ cwd: process.cwd() });
  const states: string[] = [];
  manager.inputs.subscribe((event) => states.push(event.state));
  const input = await manager.inputs.submit(row.id, { text: "prompt" });
  store.failStatus = "stopped";
  await expect(manager.stop(row.id)).rejects.toMatchObject({
    code: "STORE_FAILED",
  });
  expect(unsubscribes).toBe(1);
  expect(states).toEqual(["pending", "accepted", "uncertain"]);
  emit({ inputId: input.inputId, state: "completed" });
  expect(states).toEqual(["pending", "accepted", "uncertain"]);
  await manager.shutdownOwned();
  expect(manager.get(row.id).status).toBe("stopped");
  expect(unsubscribes).toBe(1);
});
