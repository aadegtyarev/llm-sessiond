#!/usr/bin/env node
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
import { handleFakeSigterm } from "./fake-pi-signals.mjs";
const sessionIndex = process.argv.indexOf("--session");
const nativeId =
  sessionIndex >= 0 ? process.argv[sessionIndex + 1] : "native-exact";
const lines = createInterface({ input: process.stdin });
const newline = process.argv.includes("--crlf") ? "\r\n" : "\n";
const write = (record) =>
  process.stdout.write(`${JSON.stringify(record)}${newline}`);
let held = false;
let abortMode = "";
let pendingPromptAck;
process.on("SIGTERM", () =>
  handleFakeSigterm(
    () => pendingPromptAck,
    () => {
      pendingPromptAck = undefined;
    },
    write,
  ),
);
lines.on("line", (line) => {
  let command;
  try {
    command = JSON.parse(line);
  } catch {
    write({ type: "broken" });
    return;
  }
  if (command.type === "get_state")
    write({
      type: "response",
      id: command.id,
      command: "get_state",
      success: true,
      data: { sessionId: nativeId },
    });
  else if (command.type === "prompt") {
    appendFileSync(`${process.cwd()}/prompt-count`, "1");
    abortMode = command.message;
    if (command.message === "uncertain") return;
    if (command.message === "settle-before-timeout") {
      write({ type: "agent_settled" });
      return;
    }
    if (command.message === "malformed") process.stdout.write("{not json}\n");
    if (command.message === "oversized")
      process.stdout.write(
        `${JSON.stringify({ type: "notice", padding: "x".repeat(1_048_576) })}\n`,
      );
    const response = {
      type: "response",
      id: command.id,
      command: "prompt",
      success: command.message !== "reject",
      data: {},
    };
    if (command.message === "delay-ack") {
      pendingPromptAck = response;
      setTimeout(() => {
        if (pendingPromptAck === response) {
          pendingPromptAck = undefined;
          write(response);
        }
      }, 100);
      return;
    }
    write(response);
    if (command.message === "tool") {
      write({
        type: "tool_execution_start",
        toolCallId: "tool-1",
        toolName: "bash",
      });
      write({
        type: "tool_execution_end",
        toolCallId: "tool-1",
        toolName: "bash",
        isError: true,
        result: "private",
      });
    }
    if (command.message === "hold" || command.message.startsWith("abort-"))
      held = true;
    else if (command.message !== "reject") {
      write({
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          delta: `echo:${command.message}`,
        },
      });
      write({ type: "message_end", message: { role: "assistant" } });
      write({ type: "agent_settled" });
    }
  } else if (command.type === "abort") {
    const settle = () => {
      held = false;
      write({ type: "agent_settled" });
    };
    const ack = (success) =>
      write({
        type: "response",
        id: command.id,
        command: "abort",
        success,
        data: {},
      });
    if (abortMode === "abort-delay-settle") {
      ack(true);
      setTimeout(settle, 100);
    } else if (abortMode === "abort-settle-before-reject") {
      setTimeout(settle, 10);
      setTimeout(() => ack(false), 30);
    } else if (abortMode === "abort-timeout-settled") setTimeout(settle, 10);
    else if (abortMode === "abort-timeout-late-settle") setTimeout(settle, 120);
    else {
      ack(true);
      if (held) settle();
    }
  }
});
