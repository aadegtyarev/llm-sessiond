#!/usr/bin/env node
import { createInterface } from "node:readline";
import { handleFakeSigterm } from "./fake-pi-signals.mjs";
import { handleFakeAbort } from "./fake-pi-abort.mjs";
import { handleFakePrompt } from "./fake-pi-prompt.mjs";
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
  else if (command.type === "prompt")
    handleFakePrompt(command, {
      write,
      setHeld: (value) => {
        held = value;
      },
      setAbortMode: (value) => {
        abortMode = value;
      },
      getPendingAck: () => pendingPromptAck,
      setPendingAck: (value) => {
        pendingPromptAck = value;
      },
    });
  else if (command.type === "abort") {
    handleFakeAbort(
      command,
      abortMode,
      held,
      (value) => {
        held = value;
      },
      write,
    );
  }
});
