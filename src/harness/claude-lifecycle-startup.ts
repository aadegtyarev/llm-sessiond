import type { ChildProcess } from "node:child_process";
import { ClaudeJsonlDecoder } from "./claude-jsonl-decoder.js";
import { isClaudeInitializeAck } from "./claude-lifecycle-protocol.js";

export function initializeClaude(
  child: ChildProcess,
  expectedId: string,
  timeoutMs: number,
): Promise<void> {
  if (!child.stdout || !child.stdin)
    return Promise.reject(new Error("CLAUDE_STARTUP_FAILED"));
  const requestId = `llm-sessiond-${expectedId}`;
  const decoder = new ClaudeJsonlDecoder();
  let ready = false;
  let settled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const result = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const finish = (error?: Error): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) rejectReady(new Error("CLAUDE_STARTUP_FAILED"));
    else resolveReady();
  };
  const failProtocol = (): void => {
    finish(new Error("CLAUDE_STARTUP_FAILED"));
    if (ready) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  };
  const onData = (chunk: Buffer): void => {
    let acknowledged = false;
    try {
      for (const line of decoder.push(chunk)) {
        if (isClaudeInitializeAck(line, expectedId, requestId))
          acknowledged = true;
      }
      if (acknowledged) {
        ready = true;
        finish();
      }
    } catch {
      failProtocol();
    }
  };
  const onStdinError = (): void => finish(new Error("CLAUDE_STARTUP_FAILED"));
  const onStreamError = (): void => finish(new Error("CLAUDE_STARTUP_FAILED"));
  const onExit = (): void => finish(new Error("CLAUDE_STARTUP_FAILED"));
  const cleanup = (): void => {
    clearTimeout(timer);
    child.stdout?.removeListener("data", onData);
    child.stdout?.removeListener("error", onStreamError);
    child.stdin?.removeListener("error", onStdinError);
    child.removeListener("error", onStreamError);
    child.removeListener("exit", onExit);
  };
  const onClose = (): void => {
    try {
      decoder.finish();
      if (!ready) finish(new Error("CLAUDE_STARTUP_FAILED"));
    } catch {
      finish(new Error("CLAUDE_STARTUP_FAILED"));
    }
    cleanup();
  };
  const timer = setTimeout(
    () => finish(new Error("CLAUDE_STARTUP_FAILED")),
    timeoutMs,
  );
  child.stdin.on("error", onStdinError);
  child.stdout.on("error", onStreamError);
  child.on("error", onStreamError);
  child.stdout.on("data", onData);
  child.once("exit", onExit);
  child.once("close", onClose);
  try {
    child.stdin.write(
      `${JSON.stringify({ type: "control_request", request_id: requestId, request: { subtype: "initialize", hooks: null } })}\n`,
      (error) => {
        if (error) finish(new Error("CLAUDE_STARTUP_FAILED"));
      },
    );
  } catch {
    finish(new Error("CLAUDE_STARTUP_FAILED"));
  }
  return result;
}
