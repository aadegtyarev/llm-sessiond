export type ControlPlaneErrorCode =
  | "NOT_FOUND"
  | "SESSION_ID_COLLISION"
  | "SESSION_NOT_STOPPED"
  | "SESSION_NOT_RUNNING"
  | "SESSION_UNAVAILABLE"
  | "SESSION_NOT_RESUMABLE"
  | "UNSUPPORTED_CAPABILITY"
  | "INVALID_CWD"
  | "INVALID_OPTIONS"
  | "INVALID_SESSION_ID"
  | "UNKNOWN_ADAPTER"
  | "UNKNOWN_CHECKPOINT"
  | "OPERATION_FAILED"
  | "OPERATION_TIMEOUT"
  | "STALE_OWNER"
  | "STORE_FAILED";
const MESSAGES: Record<ControlPlaneErrorCode, string> = {
  NOT_FOUND: "session not found",
  SESSION_ID_COLLISION: "session id collision",
  SESSION_NOT_STOPPED: "session must be stopped before deletion",
  SESSION_NOT_RUNNING: "session is not running",
  SESSION_UNAVAILABLE: "session execution is unavailable",
  SESSION_NOT_RESUMABLE: "session is not resumable",
  UNSUPPORTED_CAPABILITY: "capability is unsupported",
  INVALID_CWD: "working directory is invalid",
  INVALID_OPTIONS: "adapter options are invalid",
  INVALID_SESSION_ID: "session id is invalid",
  UNKNOWN_ADAPTER: "adapter is unavailable",
  UNKNOWN_CHECKPOINT: "checkpoint is unsupported",
  OPERATION_FAILED: "lifecycle operation failed",
  OPERATION_TIMEOUT: "lifecycle operation timed out",
  STALE_OWNER: "store owner is stale",
  STORE_FAILED: "durable store operation failed",
};
export class ControlPlaneError extends Error {
  constructor(readonly code: ControlPlaneErrorCode) {
    super(MESSAGES[code]);
    this.name = "ControlPlaneError";
  }
}
