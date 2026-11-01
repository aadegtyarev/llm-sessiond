import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("rejects stale-owner stop before marking an input uncertain or stopping", async () => {
  let stops = 0;
  const { manager, store } = configured(
    {
      submit: async () => ({ kind: "accepted" }),
      cancel: async () => ({ kind: "accepted" }),
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
  await manager.inputs.submit(row.id, { text: "prompt" });
  const events: string[] = [];
  manager.inputs.subscribe((event) => events.push(event.state));
  store.stale = true;
  await expect(manager.stop(row.id)).rejects.toMatchObject({
    code: "STALE_OWNER",
  });
  expect(stops).toBe(0);
  expect(events).toEqual([]);
});
