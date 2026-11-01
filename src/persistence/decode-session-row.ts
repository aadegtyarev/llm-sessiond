import {
  decodeCheckpointEnvelope,
  validateHarnessId,
  validateSessionId,
} from "../core/durable-validation.js";
import { validateJson } from "../core/json-bounds.js";
import { SafeValidationError, type JsonValue } from "../core/generic-json.js";
import type { AdapterCheckpoint } from "../core/adapter-contracts.js";
import type { DurableSession } from "./session-record.js";

export function decodeSessionRow(row: Record<string, unknown>): DurableSession {
  const status = row.status;
  if (
    !["starting", "running", "stopped", "failed", "uncertain"].includes(
      String(status),
    )
  )
    throw new SafeValidationError("CORRUPT_SESSION_RECORD");
  const result: DurableSession = {
    id: text(row.id),
    harnessId: text(row.harness_id),
    cwd: text(row.cwd),
    status: status as DurableSession["status"],
    createdAt: text(row.created_at),
  };
  optionalText(row.name, (value) => (result.name = value));
  optionalText(
    row.native_session_id,
    (value) => (result.nativeSessionId = value),
  );
  optionalText(row.failure_reason, (value) => (result.failureReason = value));
  optionalText(row.failed_at, (value) => (result.failedAt = value));
  try {
    validateSessionId(result.id);
    validateHarnessId(result.harnessId);
  } catch {
    throw new SafeValidationError("CORRUPT_SESSION_RECORD");
  }
  if (row.adapter_options !== null)
    result.adapterOptions = parseJson(row.adapter_options, 8192, 5);
  if (row.adapter_state !== null)
    result.adapterState = parseCheckpoint(row.adapter_state);
  return result;
}
function text(value: unknown): string {
  if (typeof value !== "string")
    throw new SafeValidationError("CORRUPT_SESSION_RECORD");
  return value;
}
function optionalText(value: unknown, set: (value: string) => void): void {
  if (value !== null) set(text(value));
}
function parseJson(value: unknown, bytes: number, depth: number): JsonValue {
  if (typeof value !== "string")
    throw new SafeValidationError("CORRUPT_SESSION_RECORD");
  const parsed = parseJsonText(value);
  validateJson(parsed, bytes, depth);
  return parsed as JsonValue;
}
function parseJsonText(value: unknown): unknown {
  if (typeof value !== "string")
    throw new SafeValidationError("CORRUPT_SESSION_RECORD");
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SafeValidationError("CORRUPT_SESSION_RECORD");
  }
}
function parseCheckpoint(value: unknown): AdapterCheckpoint {
  try {
    return decodeCheckpointEnvelope(value);
  } catch {
    throw new SafeValidationError("CORRUPT_SESSION_RECORD");
  }
}
