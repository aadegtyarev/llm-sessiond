import type { ChildProcess } from "node:child_process";
import {
  ClaudeLifetimeDispatch,
  type ClaudeLifetimeHooks,
  type ClaudeLifetimeTerminal,
  writeClaudeInitialize,
  removeClaudeStartupListeners,
} from "./claude-lifecycle-dispatch.js";

export function initializeClaude(
  child: ChildProcess,
  expectedId: string,
  timeoutMs: number,
  hooks: ClaudeLifetimeHooks = {},
): Promise<void> {
  if (!child.stdout || !child.stdin)
    return Promise.reject(new Error("CLAUDE_STARTUP_FAILED"));
  const requestId = `llm-sessiond-${expectedId}`;
  const dispatch = new ClaudeLifetimeDispatch(expectedId, requestId, hooks);
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
  const fail = (reason: ClaudeLifetimeTerminal): void => {
    dispatch.terminalOnce(reason);
    finish(new Error("CLAUDE_STARTUP_FAILED"));
  };
  const failProtocol = (): void => {
    fail("protocol_error");
    if (dispatch.initialized) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  };
  const onData = (chunk: Buffer): void => {
    if (dispatch.isTerminal) return;
    try {
      if (dispatch.push(chunk)) finish();
    } catch {
      failProtocol();
    }
  };
  const onStdinError = (): void => fail("stdin_error");
  const onStreamError = (): void => fail("stream_error");
  const onExit = (): void => fail("process_exit");
  const cleanup = (): void => {
    clearTimeout(timer);
    removeClaudeStartupListeners(child, {
      data: onData,
      end: onStdoutEnd,
      streamError: onStreamError,
      stdinError: onStdinError,
      exit: onExit,
    });
  };
  const onStdoutEnd = (): void => fail("stdout_end");
  const onClose = (): void => {
    try {
      dispatch.finish();
      if (!dispatch.initialized) finish(new Error("CLAUDE_STARTUP_FAILED"));
      dispatch.terminalOnce("stdout_close");
    } catch {
      failProtocol();
    }
    cleanup();
  };
  const timer = setTimeout(() => fail("readiness_timeout"), timeoutMs);
  child.stdin.on("error", onStdinError);
  child.stdout.on("error", onStreamError);
  child.on("error", onStreamError);
  child.stdout.on("data", onData);
  child.stdout.once("end", onStdoutEnd);
  child.once("exit", onExit);
  child.once("close", onClose);
  try {
    writeClaudeInitialize(child.stdin, requestId, () => fail("stdin_error"));
  } catch {
    fail("stdin_error");
  }
  return result;
}
