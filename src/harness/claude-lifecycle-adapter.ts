import type { HarnessAdapter } from "../core/adapter-contracts.js";
import type { JsonValue } from "../core/generic-json.js";

export const CLAUDE_CHECKPOINT = {
  namespace: "claude.session",
  version: 1,
} as const;
export const claudeDescriptor = {
  id: "claude-code",
  aliases: ["claude"],
  capabilities: ["harness.launch", "harness.resume", "harness.stop"],
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function claudeCheckpoint(sessionId: string) {
  return { ...CLAUDE_CHECKPOINT, data: { sessionId } };
}
export function isClaudeCheckpoint(value: JsonValue): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, JsonValue>;
  return (
    Object.keys(data).length === 1 &&
    typeof data.sessionId === "string" &&
    uuid.test(data.sessionId)
  );
}
export function isClaudeSessionId(value: string): boolean {
  return uuid.test(value);
}

export class ClaudeLifecycleAdapter implements HarnessAdapter {
  readonly descriptor = claudeDescriptor;
  readonly checkpoint = CLAUDE_CHECKPOINT;
  validateCheckpoint(value: JsonValue): boolean {
    return isClaudeCheckpoint(value);
  }
  isResumable(checkpoint: {
    namespace: string;
    version: number;
    data: JsonValue;
  }): boolean {
    return (
      checkpoint.namespace === CLAUDE_CHECKPOINT.namespace &&
      checkpoint.version === CLAUDE_CHECKPOINT.version &&
      isClaudeCheckpoint(checkpoint.data)
    );
  }
}
