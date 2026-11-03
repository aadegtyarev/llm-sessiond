#!/usr/bin/env node
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

const idPath = process.env.FAKE_PI_PID_FILE;
const promptCountPath = process.env.FAKE_PI_PROMPT_COUNT_FILE;
if (!idPath || !promptCountPath) process.exit(2);
let promptCount = 0;
writeFileSync(idPath, String(process.pid));
const input = createInterface({ input: process.stdin });
const send = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
input.on("line", (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    process.exit(3);
  }
  if (request.type === "get_state") {
    send({
      type: "response",
      id: request.id,
      command: request.type,
      success: true,
      data: { sessionId: "fake-native-session" },
    });
    return;
  }
  if (request.type === "prompt") {
    writeFileSync(promptCountPath, String(++promptCount));
    send({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "fake observable text",
      },
    });
    send({
      type: "response",
      id: request.id,
      command: request.type,
      success: true,
    });
    send({ type: "agent_settled" });
    return;
  }
  send({
    type: "response",
    id: request.id,
    command: request.type,
    success: false,
  });
});
