#!/usr/bin/env node
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const sessionIndex = process.argv.indexOf("--session");
const nativeId =
  sessionIndex >= 0 ? process.argv[sessionIndex + 1] : "native-exact";
const lines = createInterface({ input: process.stdin });
const newline = process.argv.includes("--crlf") ? "\r\n" : "\n";
const write = (record) =>
  process.stdout.write(`${JSON.stringify(record)}${newline}`);
let held = false;
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
    if (command.message === "uncertain") return;
    if (command.message === "malformed") process.stdout.write("{not json}\n");
    if (command.message === "oversized")
      process.stdout.write(
        `${JSON.stringify({ type: "notice", padding: "x".repeat(1_048_576) })}\n`,
      );
    write({
      type: "response",
      id: command.id,
      command: "prompt",
      success: command.message !== "reject",
      data: {},
    });
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
    if (command.message === "hold") held = true;
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
    write({
      type: "response",
      id: command.id,
      command: "abort",
      success: true,
      data: {},
    });
    if (held) {
      held = false;
      write({ type: "agent_settled" });
    }
  }
});
