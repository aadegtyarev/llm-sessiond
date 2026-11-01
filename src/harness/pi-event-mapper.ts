export interface MappedEvent {
  type: string;
  data: Record<string, unknown>;
}
const lifecycle = new Set([
  "agent_start",
  "agent_end",
  "agent_settled",
  "compaction_start",
  "compaction_end",
]);
export function mapPiRecord(record: Record<string, unknown>): MappedEvent[] {
  if (record.type === "message_update") {
    const update = record.assistantMessageEvent as
      Record<string, unknown> | undefined;
    if (update?.type === "text_delta" && typeof update.delta === "string")
      return [{ type: "assistant.delta", data: { text: update.delta } }];
    if (update?.type === "thinking_start" || update?.type === "thinking_end")
      return [
        {
          type: "activity",
          data: { type: "thinking", active: update.type === "thinking_start" },
        },
      ];
  }
  if (
    record.type === "message_end" &&
    (record.message as Record<string, unknown> | undefined)?.role ===
      "assistant"
  )
    return [{ type: "activity", data: { type: "assistant_message_end" } }];
  if (
    record.type === "tool_execution_start" ||
    record.type === "tool_execution_end"
  ) {
    if (typeof record.toolCallId !== "string") return [];
    return [
      {
        type: "activity",
        data: {
          type:
            record.type === "tool_execution_start" ? "tool_start" : "tool_end",
          toolCallId: record.toolCallId,
          ...(typeof record.toolName === "string"
            ? { toolName: record.toolName }
            : {}),
          ...(record.type === "tool_execution_end" &&
          typeof record.isError === "boolean"
            ? { failed: record.isError }
            : {}),
        },
      },
    ];
  }
  if (typeof record.type === "string" && lifecycle.has(record.type))
    return [{ type: "activity", data: { type: record.type } }];
  if (
    record.type === "extension_ui_request" &&
    record.method === "notify" &&
    typeof record.message === "string"
  )
    return [{ type: "notification", data: { text: record.message } }];
  return [];
}
