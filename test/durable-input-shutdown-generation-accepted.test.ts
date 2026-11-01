import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("stops and unsubscribes the accepted replacement behind an old stop", async () => {
  let stopCount = 0;
  let releaseOldStop!: () => void;
  let oldStopStarted!: () => void;
  let unsubscribeCount = 0;
  let writes = 0;
  const started = new Promise<void>((resolve) => {
    oldStopStarted = resolve;
  });
  const { manager } = configured(
    {
      submit: async () => {
        writes++;
        return { kind: "accepted" };
      },
      cancel: async () => ({ kind: "accepted" }),
      subscribe: () => () => {
        unsubscribeCount++;
      },
    },
    undefined,
    5000,
    true,
    undefined,
    undefined,
    async () => {
      if (++stopCount === 1) {
        oldStopStarted();
        await new Promise<void>((resolve) => {
          releaseOldStop = resolve;
        });
      }
    },
    5000,
  );
  const row = await manager.create({ cwd: process.cwd() });
  const states: string[] = [];
  manager.inputs.subscribe((event) => states.push(event.state));
  const stop = manager.stop(row.id);
  await started;
  const resume = manager.resume(row.id);
  const submit = manager.inputs.submit(row.id, { text: "prompt" }).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const shutdown = manager.shutdownOwned();
  releaseOldStop();
  try {
    const [result] = await Promise.all([submit, stop, resume, shutdown]);
    expect("value" in result ? result.value : result.error).toMatchObject({
      inputId: "input.custom",
    });
    if ("error" in result)
      expect(result.error).toMatchObject({ code: "INPUT_UNCERTAIN" });
    expect(writes).toBe(1);
    expect(stopCount).toBe(2);
    expect(unsubscribeCount).toBe(2);
    expect(states.at(-1)).toBe("uncertain");
    expect(states.slice(states.lastIndexOf("uncertain") + 1)).not.toContain(
      "accepted",
    );
  } finally {
    releaseOldStop();
  }
});
