export function isClaudeInitializeAck(
  line: string,
  expectedId: string,
  requestId: string,
): boolean {
  const parsed: unknown = JSON.parse(line);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("CLAUDE_STARTUP_FAILED");
  const record = parsed as Record<string, unknown>;
  if (typeof record.type !== "string") throw new Error("CLAUDE_STARTUP_FAILED");
  if (hasMismatchedSessionId(record, expectedId))
    throw new Error("CLAUDE_STARTUP_FAILED");
  if (record.type === "result") throw new Error("CLAUDE_STARTUP_FAILED");
  if (record.type !== "control_response") return false;
  const response = record.response as Record<string, unknown> | undefined;
  if (!response || response.request_id !== requestId)
    throw new Error("CLAUDE_STARTUP_FAILED");
  if (response.subtype !== "success" || !isObject(response.response))
    throw new Error("CLAUDE_STARTUP_FAILED");
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function hasMismatchedSessionId(
  root: Record<string, unknown>,
  expected: string,
): boolean {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) pending.push(...value);
    else
      for (const [key, child] of Object.entries(value)) {
        if (key === "session_id" && child !== expected) return true;
        pending.push(child);
      }
  }
  return false;
}
