import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import { ConfirmedProcessProvider } from "../src/process/confirmed-provider.js";

describe("confirmed process provider", () => {
  it("retains unconfirmed children and retries shutdown after exit", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: () => true,
    }) as unknown as ChildProcess;
    let delegatedShutdowns = 0;
    const provider = new ConfirmedProcessProvider(
      {
        launch: () => child,
        shutdown: async () => {
          delegatedShutdowns++;
        },
      },
      2,
    );
    provider.launch("fake", [], process.cwd());
    await expect(provider.shutdown()).rejects.toThrow(
      "PROCESS_SHUTDOWN_UNCONFIRMED",
    );
    expect(delegatedShutdowns).toBe(0);
    Object.assign(child, { exitCode: 0 });
    child.emit("exit", 0, null);
    await provider.shutdown();
    expect(delegatedShutdowns).toBe(1);
  });
});
