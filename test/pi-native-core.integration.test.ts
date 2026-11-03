import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { children, cleanupPiTests, setupPi } from "./pi-native-core-support.js";

afterEach(cleanupPiTests);

describe("Pi native adapter to new runtime core", () => {
  it("owns RPC child, checkpoint, input, queries, effort, command inventory, and confirmed cleanup", async () => {
    const { cwd, journal, store, runtime, launchArgs, port } = await setupPi();
    expect(port.descriptor.capabilities).toEqual([
      "harness.launch",
      "harness.resume",
      "harness.stop",
      "input.submit",
      "input.submit-images",
      "input.cancel",
      "input.cancel-current",
      "status.read",
      "usage.read",
      "models.read",
      "effort.read",
      "effort.change",
      "commands.read",
    ]);
    const session = await runtime.create({ cwd });
    expect(session).toMatchObject({
      status: "running",
      nativeSessionId: "pi-native-opaque",
    });
    const seen: string[] = [];
    const inputIds: string[] = [];
    const outputEvents: Array<Record<string, unknown>> = [];
    runtime.subscribe((event) => {
      seen.push(event.kind);
      if (event.kind === "input.state")
        inputIds.push(event.input?.inputId ?? "");
      if (event.kind === "output")
        outputEvents.push(event as unknown as Record<string, unknown>);
    });
    const submitted = await runtime.submit(session.id, "private prompt", [
      { mimeType: "image/png", data: "AQ==" },
    ]);
    expect(submitted).not.toHaveProperty("outcome");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toContain("output");
    expect(seen).toContain("input.state");
    expect(inputIds).toContain(submitted.inputId);
    expect(outputEvents[0]).toMatchObject({
      kind: "output",
      sessionId: session.id,
      text: "safe text",
    });
    expect(outputEvents[0]).not.toHaveProperty("inputId");
    expect(seen).not.toContain("activity");
    expect(seen).not.toContain("notification");
    expect(await runtime.status(session.id)).toMatchObject({
      model: { id: "model-1" },
      effort: "high",
      usage: { totalTokens: 3 },
    });
    expect(await runtime.models(session.id)).toEqual({
      models: [
        { provider: "test", id: "model-1", name: "model-1" },
        { provider: "test", id: "model-2", name: "Model 2" },
      ],
    });
    expect(await runtime.efforts(session.id)).toEqual({
      levels: ["low", "high"],
    });
    expect(await runtime.commands(session.id)).toEqual({
      commands: [
        { name: "review", description: "Review" },
        { name: "help", description: "" },
      ],
    });
    expect(await runtime.changeEffort(session.id, "low")).toBe("applied");
    const rpcLog = await readFile(journal, "utf8");
    expect(rpcLog).not.toContain("private prompt");
    expect(rpcLog).toContain('"exactText":true');
    expect(rpcLog).toContain('"streamingBehavior":"steer"');
    expect(rpcLog).toContain('"imageShapeValid":true');
    expect(rpcLog).toContain('"hasInputId":false');
    expect(store.read(session.id)?.checkpoint).toEqual({
      namespace: "pi.session",
      version: 1,
      data: { sessionId: "pi-native-opaque" },
    });
    expect(await runtime.stop(session.id)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      children[0]?.exitCode !== null || children[0]?.signalCode !== null,
    ).toBe(true);
    expect((await runtime.resume(session.id)).status).toBe("running");
    expect(launchArgs[1]).toContain("pi-native-opaque");
    expect(await runtime.stop(session.id)).toBe(true);
  });
});
