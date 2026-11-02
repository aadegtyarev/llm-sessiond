import { describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { ProcessProvider } from "../src/core/ports.js";
import { ClaudeLifecycleAdapter } from "../src/harness/claude-lifecycle-adapter.js";
import { ClaudeLifecycleExecution } from "../src/harness/claude-lifecycle-execution.js";
import { fakeClaudeTextProcess } from "./claude-text-input-fake-process.js";

const id = "12345678-abcd-4abc-8abc-1234567890ab";

describe("Claude text input process binding", () => {
  it("subscribes before launch and routes native replay through startup reader", async () => {
    const fake = fakeClaudeTextProcess();
    const provider: ProcessProvider = {
      launch: (_exe, args) => {
        expect(args).toContain("--replay-user-messages");
        return fake.child;
      },
    };
    const execution = new ClaudeLifecycleExecution(
      new ClaudeLifecycleAdapter(),
      provider,
      "claude",
      500,
      () => id,
      async (child) => {
        const target = child as ChildProcess & { exitCode: number | null };
        target.exitCode = 0;
        child.emit("exit", 0, null);
        child.stdout?.emit("end");
        child.emit("close", 0, null);
      },
    );
    const events: unknown[] = [];
    execution.inputs!.subscribe((event) => events.push(event));
    const launch = execution.launch({ cwd: process.cwd() });
    await expect(
      execution.inputs!.submit({ inputId: "early", text: "no prompt" }),
    ).resolves.toEqual({ kind: "uncertain" });
    expect(fake.userRecord()).toBe("");
    fake.stdout.write(
      `${JSON.stringify({ type: "control_response", response: { request_id: `llm-sessiond-${id}`, subtype: "success", response: {} } })}\n`,
    );
    await launch;
    const submitted = execution.inputs!.submit({
      inputId: "opaque/id",
      text: "native text",
    });
    expect(fake.userRecord()).toBe(
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "native text" },
      }) + "\n",
    );
    fake.writeDone();
    fake.stdout.write(
      JSON.stringify({
        type: "user",
        isReplay: true,
        session_id: id,
        parent_tool_use_id: null,
        message: { role: "user", content: "native text" },
      }) + "\n",
    );
    await expect(submitted).resolves.toEqual({ kind: "accepted" });
    fake.stdout.write(
      JSON.stringify({
        type: "result",
        session_id: id,
        parent_tool_use_id: null,
        subtype: "success",
        is_error: false,
        result: "native result",
      }) + "\n",
    );
    expect(events).toContainEqual({ inputId: "opaque/id", state: "completed" });
    await execution.stop();
  });
});
