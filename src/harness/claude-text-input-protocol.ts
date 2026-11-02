export type ClaudeInputRecord =
  "ack" | "success" | "failure" | "ignore" | "invalid";

// CLI stream-json exposes no proven daemon-input correlation ID; root replay/result
// association relies on one active input and native ordered turn delivery.
export function classifyClaudeInputRecord(
  line: string,
  sessionId: string,
  expectedText: string,
): ClaudeInputRecord {
  let root: unknown;
  try {
    root = JSON.parse(line);
  } catch {
    return "invalid";
  }
  if (!object(root)) return "invalid";
  if (root.session_id !== undefined && root.session_id !== sessionId)
    return "invalid";
  if (root.type === "user") return replay(root, sessionId, expectedText);
  if (root.type === "result") return result(root, sessionId);
  if (root.type === "control_request") return "invalid";
  return "ignore";
}

function replay(
  root: Record<string, unknown>,
  sessionId: string,
  expectedText: string,
): ClaudeInputRecord {
  if (root.session_id !== sessionId) return "ignore";
  if (root.isReplay !== true || nested(root)) return "ignore";
  if (!object(root.message) || root.message.role !== "user") return "ignore";
  return root.message.content === expectedText ? "ack" : "ignore";
}
function result(
  root: Record<string, unknown>,
  sessionId: string,
): ClaudeInputRecord {
  if (root.session_id !== sessionId || nested(root)) return "ignore";
  return root.is_error === false && root.subtype === "success"
    ? "success"
    : "failure";
}
function nested(root: Record<string, unknown>): boolean {
  return (
    root.parent_tool_use_id !== undefined && root.parent_tool_use_id !== null
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
