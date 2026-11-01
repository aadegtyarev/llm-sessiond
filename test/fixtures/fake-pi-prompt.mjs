import { appendFileSync } from "node:fs";

function writeToolRecords(write) {
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
function writeCompletion(message, write) {
  write({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: `echo:${message}` },
  });
  write({ type: "message_end", message: { role: "assistant" } });
  write({ type: "agent_settled" });
}
export function handleFakePrompt(command, state) {
  appendFileSync(`${process.cwd()}/prompt-count`, "1");
  appendFileSync(
    `${process.cwd()}/prompt-requests.jsonl`,
    `${JSON.stringify(command)}\n`,
  );
  state.setAbortMode(command.message);
  if (command.message === "uncertain") return;
  if (command.message === "uncertain-then-settle") {
    setTimeout(() => state.write({ type: "agent_settled" }), 75);
    return;
  }
  if (command.message === "settle-before-timeout") {
    state.write({ type: "agent_settled" });
    return;
  }
  if (command.message === "settle-delay-ack") {
    const response = {
      type: "response",
      id: command.id,
      command: "prompt",
      success: true,
      data: {},
    };
    state.setPendingAck(response);
    setTimeout(() => state.write({ type: "agent_settled" }), 75);
    setTimeout(() => {
      if (state.getPendingAck() === response) {
        state.setPendingAck(undefined);
        appendFileSync(`${process.cwd()}/late-ack`, "sent");
        state.write(response);
      }
    }, 250);
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
  if (
    ["malformed-delay-ack", "oversized-delay-ack"].includes(command.message)
  ) {
    state.setPendingAck(response);
    const record =
      command.message === "malformed-delay-ack"
        ? "{not json}\n"
        : `${JSON.stringify({ type: "notice", padding: "x".repeat(1_048_576) })}\n`;
    process.stdout.write(record);
    return;
  }
  if (command.message === "delay-ack") {
    state.setPendingAck(response);
    setTimeout(() => {
      if (state.getPendingAck() === response) {
        state.setPendingAck(undefined);
        state.write(response);
      }
    }, 100);
    return;
  }
  state.write(response);
  if (command.message === "tool") writeToolRecords(state.write);
  if (command.message === "hold" || command.message.startsWith("abort-"))
    state.setHeld(true);
  else if (command.message !== "reject")
    writeCompletion(command.message, state.write);
}
