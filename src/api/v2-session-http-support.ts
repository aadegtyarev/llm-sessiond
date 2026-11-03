import type { IncomingMessage, ServerResponse } from "node:http";
import { sendV2SessionError } from "./v2-error.js";

export function sendSessionError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  category:
    | "validation"
    | "not-found"
    | "unsupported"
    | "conflict"
    | "unavailable"
    | "uncertain"
    | "internal",
  outcome: "not-applied" | "unknown",
  input?: { inputId: string; resumed: boolean; failureReason?: string },
): void {
  sendV2SessionError(response, status, code, message, category, outcome, input);
}
export function matchesInstance(
  request: IncomingMessage,
  instanceId: string,
): boolean {
  return request.headers["x-llm-sessiond-instance"] === instanceId;
}
export function sendUnavailable(response: ServerResponse): void {
  sendSessionError(
    response,
    503,
    "UNAVAILABLE",
    "service unavailable",
    "unavailable",
    "not-applied",
  );
}
export function sendCreateUnknown(response: ServerResponse): void {
  sendSessionError(
    response,
    409,
    "OPERATION_UNCERTAIN",
    "session creation outcome is uncertain",
    "uncertain",
    "unknown",
  );
}
export function sendStopUnknown(response: ServerResponse): void {
  sendSessionError(
    response,
    409,
    "OPERATION_UNCERTAIN",
    "stop outcome is uncertain",
    "uncertain",
    "unknown",
  );
}
export function sendInvalidSessionPath(response: ServerResponse): void {
  sendSessionError(
    response,
    400,
    "VALIDATION_ERROR",
    "session id path is invalid",
    "validation",
    "not-applied",
  );
}
export function sendSessionNotFound(response: ServerResponse): void {
  sendSessionError(
    response,
    404,
    "NOT_FOUND",
    "session not found",
    "not-found",
    "not-applied",
  );
}
