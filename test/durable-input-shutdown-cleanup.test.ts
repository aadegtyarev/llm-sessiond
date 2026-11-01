import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("retains input state and listeners after failed shutdown stop until retry", async () => {
  let mode: "timeout" | "success" = "timeout";
  let releaseTimedStop!: () => void;
  let unsubscribes = 0;
  const { manager } = configured(
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
    undefined,
    async () => {
      if (mode === "timeout")
        await new Promise<void>((resolve) => {
          releaseTimedStop = resolve;
        });
    },
    3,
  );
  const row = await manager.create({ cwd: process.cwd() });
  const states: string[] = [];
  manager.inputs.subscribe((event) => states.push(event.state));
  await manager.inputs.submit(row.id, { text: "prompt" });
  await expect(manager.shutdownOwned()).resolves.toBeUndefined();
  expect(states).toEqual(["pending", "accepted", "uncertain"]);
  expect(unsubscribes).toBe(0);
  expect(manager.get(row.id).status).toBe("uncertain");
  await expect(
    manager.inputs.submit(row.id, { text: "still active" }),
  ).rejects.toMatchObject({ code: "INPUT_BUSY" });
  mode = "success";
  await expect(manager.shutdownOwned()).resolves.toBeUndefined();
  expect(unsubscribes).toBe(1);
  expect(manager.get(row.id).status).toBe("stopped");
  releaseTimedStop();
});
