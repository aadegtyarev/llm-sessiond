import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createPiDurableRuntime } from "../src/harness/pi-durable-runtime.js";
import { PiDurableInputPort } from "../src/harness/pi-durable-input-port.js";
import type { ProcessProvider } from "../src/core/ports.js";
import { MemoryStore } from "./durable-memory-store.js";
import { fixture, tempDir } from "./helpers.js";

const owner = { token: "test-owner", generation: 1 };
describe("Pi durable text input", () => {
  it("rejects direct image and cancel calls without a live RPC link", async () => {
    const port = new PiDurableInputPort();
    expect(
      await port.submit({
        inputId: "input-1",
        text: "text",
        images: [{ mimeType: "image/png", data: "AA==" }],
      }),
    ).toEqual({ kind: "rejected", reason: "prompt_rejected" });
    await expect(port.cancel("input-1")).rejects.toThrow(
      "UNSUPPORTED_CAPABILITY",
    );
  });
  it("submits via lifecycle-owned port and settles the exact generic ID", async () => {
    const cwd = await tempDir();
    let nextId = 0;
    const provider: ProcessProvider = {
      launch: (_executable, args, workingDir) =>
        spawn(process.execPath, [fixture, ...args], {
          cwd: workingDir,
          stdio: ["pipe", "pipe", "ignore"],
        }),
    };
    const runtime = createPiDurableRuntime({
      store: new MemoryStore(),
      owner,
      id: () => `opaque-${++nextId}`,
      provider,
    });
    try {
      const session = await runtime.manager.create({ cwd });
      await expect(
        runtime.manager.inputs.cancel(session.id, "opaque-2"),
      ).rejects.toThrow();
      const states: string[] = [];
      let resolveCompleted!: () => void;
      const completed = new Promise<void>((resolve) => {
        resolveCompleted = resolve;
      });
      runtime.manager.inputs.subscribe((event) => {
        states.push(event.state);
        if (event.state === "completed") resolveCompleted();
      });
      const result = await runtime.manager.inputs.submit(session.id, {
        text: "opaque text",
      });
      expect(result.inputId).toBe("opaque-2");
      await completed;
      expect(states).toEqual(["pending", "accepted", "completed"]);
      const wire = await readFile(`${cwd}/prompt-requests.jsonl`, "utf8");
      expect(JSON.parse(wire)).toEqual({
        type: "prompt",
        id: expect.any(String),
        message: "opaque text",
        streamingBehavior: "steer",
      });
      await expect(
        runtime.manager.inputs.submit(session.id, { text: "reject" }),
      ).rejects.toMatchObject({
        code: "INPUT_REJECTED",
        failureReason: "prompt_rejected",
      });
      await expect(
        runtime.manager.inputs.submit(session.id, {
          text: "image request",
          images: [{ mimeType: "image/png", data: "AA==" }],
        }),
      ).rejects.toThrow();
      expect(await readFile(`${cwd}/prompt-count`, "utf8")).toBe("11");
      await runtime.manager.stop(session.id);
    } finally {
      await runtime.shutdown();
    }
  });
});
