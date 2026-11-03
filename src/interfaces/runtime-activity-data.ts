export type ActivityEvent =
  | {
      type:
        | "agent_start"
        | "agent_end"
        | "agent_settled"
        | "compaction_start"
        | "compaction_end"
        | "assistant_message_end";
    }
  | { type: "thinking"; active: boolean }
  | {
      type: "tool_start" | "tool_end";
      toolCallId: string;
      toolName?: string;
      failed?: boolean;
    };
