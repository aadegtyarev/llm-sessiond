import type { ServerResponse } from "node:http";
import { ControlPlaneError } from "../core/control-plane-error.js";
import { sendSessionError } from "./v2-session-http-support.js";

export function rejectUnsupportedConfiguration(
  body: {
    callbackConnectionId?: string | undefined;
    adapterOptions?: Record<string, unknown> | undefined;
    confirmedDangerousOptions?: string[] | undefined;
  },
  response: ServerResponse,
): boolean {
  if (
    body.callbackConnectionId === undefined &&
    Object.keys(body.adapterOptions ?? {}).length === 0 &&
    (body.confirmedDangerousOptions?.length ?? 0) === 0
  )
    return false;
  sendSessionError(
    response,
    409,
    "UNSUPPORTED_CAPABILITY",
    "requested session configuration is unsupported",
    "unsupported",
    "not-applied",
  );
  return true;
}
export function sendCreatePreflightError(
  error: unknown,
  response: ServerResponse,
): boolean {
  if (!(error instanceof ControlPlaneError)) return false;
  const validation = [
    "INVALID_CWD",
    "INVALID_SESSION_ID",
    "INVALID_OPTIONS",
  ].includes(error.code);
  const unsupported = error.code === "UNSUPPORTED_CAPABILITY";
  const conflict = ["UNKNOWN_ADAPTER", "SESSION_ID_COLLISION"].includes(
    error.code,
  );
  if (!validation && !unsupported && !conflict) return false;
  sendSessionError(
    response,
    validation ? 400 : 409,
    error.code,
    validation
      ? "session request is invalid"
      : unsupported
        ? "requested capability is unsupported"
        : "session request conflicts with current state",
    validation ? "validation" : unsupported ? "unsupported" : "conflict",
    "not-applied",
  );
  return true;
}
