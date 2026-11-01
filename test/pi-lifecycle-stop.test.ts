import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ProcessProvider } from "../src/core/ports.js";
import { PiLifecycleAdapter } from "../src/harness/pi-lifecycle-adapter.js";
import { PiLifecycleExecution } from "../src/harness/pi-lifecycle-execution.js";
import { terminateChild } from "../src/process/terminate-child.js";
import { fixture } from "./helpers.js";

function provider(): ProcessProvider {
  return {
    launch: (_executable, args, cwd) =>
      spawn(process.execPath, [fixture, ...args], {
        cwd,
        stdio: ["pipe", "pipe", "ignore"],
      }),
  };
}
function execution(
  terminate: (child: ReturnType<ProcessProvider["launch"]>) => Promise<void>,
) {
  return new PiLifecycleExecution(
    new PiLifecycleAdapter(),
    provider(),
    "fake",
    1000,
    terminate,
  );
}

describe("Pi v2 stop coalescing", () => {
  it("makes concurrent stop callers await the same cleanup", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const instance = execution(async (child) => {
      calls++;
      await gate;
      await terminateChild(child);
    });
    await instance.launch({ cwd: process.cwd() });
    let finished = 0;
    const first = instance.stop().then(() => finished++);
    const second = instance.stop().then(() => finished++);
    expect(calls).toBe(1);
    expect(finished).toBe(0);
    release();
    await Promise.all([first, second]);
    expect(finished).toBe(2);
    expect(calls).toBe(1);
  });
  it("retries cleanup after termination rejection", async () => {
    let calls = 0;
    const instance = execution(async (child) => {
      if (++calls === 1) throw new Error("transient termination failure");
      await terminateChild(child);
    });
    await instance.launch({ cwd: process.cwd() });
    await expect(instance.stop()).rejects.toThrow(
      "transient termination failure",
    );
    await instance.stop();
    expect(calls).toBe(2);
  });
  it("keeps stop-before-start terminal without spawning", async () => {
    let calls = 0;
    const instance = new PiLifecycleExecution(
      new PiLifecycleAdapter(),
      {
        launch: () => {
          calls++;
          throw new Error("should not spawn");
        },
      },
      "fake",
      10,
    );
    await instance.stop();
    await expect(instance.launch({ cwd: process.cwd() })).rejects.toThrow(
      "EXECUTION_ALREADY_STARTED",
    );
    expect(calls).toBe(0);
  });
});
