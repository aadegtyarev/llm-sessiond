import { expect, it } from "vitest";
import { configured } from "./durable-input-runtime-support.js";

it("fences a replacement pending input before shutdown and late acknowledgement", async () => {
  let stopCount = 0;
  let releaseOldStop!: () => void;
  let oldStopStarted!: () => void;
  let releaseAck!: (value: { kind: "accepted" }) => void;
  let ackStarted!: () => void;
  let unsubscribeCount = 0;
  const started = new Promise<void>((resolve) => {
    oldStopStarted = resolve;
  });
  const ackStart = new Promise<void>((resolve) => {
    ackStarted = resolve;
  });
  const { manager } = configured(
    {
      submit: async () => {
        ackStarted();
        return new Promise((resolve) => {
          releaseAck = resolve;
        });
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
  const submit = manager.inputs.submit(row.id, { text: "prompt" });
  const submitResult = submit.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const shutdown = manager.shutdownOwned();
  releaseOldStop();
  try {
    await Promise.all([stop, resume, ackStart, shutdown]);
    expect(unsubscribeCount).toBe(2);
    expect(states).toEqual(["pending", "uncertain"]);
    releaseAck({ kind: "accepted" });
    await expect(submitResult).resolves.toMatchObject({
      error: {
        code: "INPUT_UNCERTAIN",
        inputId: "input.custom",
        resumed: false,
      },
    });
    expect(states).toEqual(["pending", "uncertain"]);
  } finally {
    releaseOldStop();
    releaseAck?.({ kind: "accepted" });
  }
});
