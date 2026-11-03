import type { DurableSession } from "../persistence/session-record.js";
import type { JsonValue } from "./generic-json.js";
import { validateJson } from "./json-bounds.js";
import { validateHarnessId, validateSessionId } from "./durable-validation.js";

export type ManagedSessionView = Pick<
  DurableSession,
  | "id"
  | "harnessId"
  | "cwd"
  | "status"
  | "name"
  | "nativeSessionId"
  | "adapterOptions"
  | "failureReason"
  | "failedAt"
>;
export function captureSession(value: DurableSession): ManagedSessionView {
  const id = value.id;
  const harnessId = value.harnessId;
  const cwd = value.cwd;
  const status = value.status;
  const name = value.name;
  const nativeSessionId = value.nativeSessionId;
  const adapterOptions = value.adapterOptions;
  const failureReason = value.failureReason;
  const failedAt = value.failedAt;
  validateSessionId(id);
  validateHarnessId(harnessId);
  if (
    typeof cwd !== "string" ||
    !["starting", "running", "stopped", "failed", "uncertain"].includes(status)
  )
    throw new Error("INVALID_SESSION_VIEW");
  if (
    [name, nativeSessionId, failureReason, failedAt].some(
      (item) => item !== undefined && typeof item !== "string",
    )
  )
    throw new Error("INVALID_SESSION_VIEW");
  const session: ManagedSessionView = {
    id,
    harnessId,
    cwd,
    status,
    ...(name !== undefined ? { name } : {}),
    ...(nativeSessionId !== undefined ? { nativeSessionId } : {}),
    ...(adapterOptions !== undefined
      ? { adapterOptions: cloneJson(adapterOptions) }
      : {}),
    ...(failureReason !== undefined ? { failureReason } : {}),
    ...(failedAt !== undefined ? { failedAt } : {}),
  };
  return Object.freeze(session);
}
function cloneJson(value: JsonValue): JsonValue {
  validateJson(value, 8192, 5);
  return structuredClone(value);
}
