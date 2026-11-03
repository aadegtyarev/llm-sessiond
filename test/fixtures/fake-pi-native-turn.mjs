export function fakePiPrompt(request, scenario, send, respond) {
  if (scenario === "no-response") return;
  if (scenario === "late-response") {
    setTimeout(() => respond(), 100);
    return;
  }
  if (scenario === "malformed-response") {
    process.stdout.write("{bad json}\n");
    return;
  }
  if (scenario === "reject")
    return send({
      type: "response",
      id: request.id,
      command: request.type,
      success: false,
    });
  send({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "safe text" },
  });
  send({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_start" },
  });
  send({
    type: "tool_execution_start",
    toolCallId: "tool-1",
    toolName: "safe-tool",
    args: { secret: "private" },
  });
  send({
    type: "extension_ui_request",
    method: "notify",
    message: "safe notice",
  });
  respond();
  const settle = () => send({ type: "agent_settled" });
  if (
    scenario === "slow-turn" ||
    scenario === "slow-effort" ||
    scenario === "abort-before-ack"
  )
    setTimeout(settle, 150);
  else settle();
}
