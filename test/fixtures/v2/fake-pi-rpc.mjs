#!/usr/bin/env node
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

const idPath = process.env.FAKE_PI_PID_FILE;
if (!idPath) process.exit(2);
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
