import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, provider, tempDir } from "./helpers.js";
import { RpcLink } from "../src/harness/rpc-link.js";
import { startPiProcess } from "../src/harness/pi-startup.js";
import { PiInputController } from "../src/harness/pi-input-controller.js";
import { EventBus } from "../src/core/event-bus.js";

afterEach(cleanup);
describe("Pi RPC compatibility", () => {
  it("preserves correlated commands, malformed record handling, and uncertain no-retry", async () => {
    const cwd = await tempDir();
    const child = provider.launch("fake", ["--mode", "rpc"], cwd);
    const rpc = new RpcLink(child);
    const state = await rpc.command("get_state");
    expect((state.data as Record<string, unknown>).sessionId).toBe(
      "native-exact",
    );
    const command = rpc.command.bind(rpc);
    rpc.command = (name, args, timeout) =>
      command(name, args, name === "prompt" ? 100 : timeout);
    const states: Record<string, unknown>[] = [];
    const bus = new EventBus();
    const emit = (type: string, data: Record<string, unknown>) => {
      if (type === "input.state") {
        states.push(data);
        bus.publish("00000000-0000-4000-8000-000000000001", type, data);
      }
    };
    const input = new PiInputController(rpc, emit);
    await expect(input.submit("uncertain")).rejects.toThrow(
      "INPUT_DELIVERY_UNCERTAIN",
    );
    await expect(input.submit("uncertain-again")).rejects.toThrow(
      "SESSION_INPUT_BUSY",
    );
    expect(states.at(-1)).toMatchObject({
      state: "uncertain",
      reason: "prompt response was not received",
    });
    expect(await readFile(path.join(cwd, "prompt-count"), "utf8")).toBe("1");
    const rejected = new PiInputController(rpc, emit);
    await expect(rejected.submit("reject")).rejects.toThrow(
      "PI_PROMPT_REJECTED",
    );
    expect(states.at(-1)).toMatchObject({
      state: "failed",
      reason: "prompt was rejected",
    });
    expect(await readFile(path.join(cwd, "prompt-count"), "utf8")).toBe("11");
    const malformed = new Promise<void>((resolve) =>
      rpc.once("malformed", resolve),
    );
    await rpc.command("prompt", { message: "malformed" });
    await malformed;
    expect(await readFile(path.join(cwd, "prompt-count"), "utf8")).toBe("111");
    const oversized = new Promise<void>((resolve) =>
      rpc.once("malformed", resolve),
    );
    await rpc.command("prompt", { message: "oversized" });
    await oversized;
    expect(await readFile(path.join(cwd, "prompt-count"), "utf8")).toBe("1111");
    child.kill("SIGKILL");
    const crlfPi = await startPiProcess(
      provider.launch("fake", ["--mode", "rpc", "--crlf"], cwd),
    );
    expect(crlfPi.nativeSessionId).toBe("native-exact");
    await crlfPi.stop();
    const pi = await startPiProcess(
      provider.launch("fake", ["--mode", "rpc"], cwd),
    );
    const error = new Promise<void>((resolve) =>
      pi.onEvent((type) => {
        if (type === "session.error") resolve();
      }),
    );
    await pi.submit("malformed");
    await error;
    await pi.stop();
  });
});
