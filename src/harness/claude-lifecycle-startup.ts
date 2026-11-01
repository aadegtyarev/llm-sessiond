import type { ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const MAX_RECORD_BYTES = 1024 * 1024;
export async function initializeClaude(
  child: ChildProcess,
  expectedId: string,
  timeoutMs: number,
): Promise<void> {
  if (!child.stdout || !child.stdin) throw new Error("CLAUDE_STARTUP_FAILED");
  const requestId = `llm-sessiond-${expectedId}`;
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let settled = false;
  let resolveResult!: () => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<void>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const finish = (error?: Error): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    child.stdout?.removeListener("data", onData);
    child.removeListener("exit", onExit);
    if (error) rejectResult(error);
    else resolveResult();
  };
  const onExit = (): void => finish(new Error("CLAUDE_STARTUP_FAILED"));
  const onData = (chunk: Buffer | string): void => {
    pending += typeof chunk === "string" ? chunk : decoder.write(chunk);
    if (
      Buffer.byteLength(pending) > MAX_RECORD_BYTES &&
      !pending.includes("\n")
    )
      return finish(new Error("CLAUDE_STARTUP_FAILED"));
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      let line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (Buffer.byteLength(line) > MAX_RECORD_BYTES)
        return finish(new Error("CLAUDE_STARTUP_FAILED"));
      try {
        const parsed: unknown = JSON.parse(line);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          return finish(new Error("CLAUDE_STARTUP_FAILED"));
        const record = parsed as Record<string, unknown>;
        if (typeof record.type !== "string")
          return finish(new Error("CLAUDE_STARTUP_FAILED"));
        if (record.type === "result")
          return finish(new Error("CLAUDE_STARTUP_FAILED"));
        if (record.type === "system" && record.subtype === "init") {
          if (record.session_id !== expectedId)
            return finish(new Error("CLAUDE_STARTUP_FAILED"));
          continue;
        }
        if (record.type !== "control_response") continue;
        const response = record.response as Record<string, unknown> | undefined;
        if (
          !response ||
          response.request_id !== requestId ||
          (response.subtype !== "success" && response.subtype !== "error")
        )
          return finish(new Error("CLAUDE_STARTUP_FAILED"));
        if (
          response.subtype !== "success" ||
          !response.response ||
          typeof response.response !== "object" ||
          Array.isArray(response.response)
        )
          return finish(new Error("CLAUDE_STARTUP_FAILED"));
        const body = response.response as Record<string, unknown>;
        if (body.session_id !== undefined && body.session_id !== expectedId)
          return finish(new Error("CLAUDE_STARTUP_FAILED"));
        return finish();
      } catch {
        return finish(new Error("CLAUDE_STARTUP_FAILED"));
      }
    }
    if (Buffer.byteLength(pending) > MAX_RECORD_BYTES)
      finish(new Error("CLAUDE_STARTUP_FAILED"));
  };
  const timer = setTimeout(
    () => finish(new Error("CLAUDE_STARTUP_FAILED")),
    timeoutMs,
  );
  child.stdout.on("data", onData);
  child.once("exit", onExit);
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
  await result;
}
