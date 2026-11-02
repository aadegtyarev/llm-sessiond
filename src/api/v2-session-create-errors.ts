import type { ServerResponse } from "node:http";
import { sendSessionError } from "./v2-session-http-support.js";
import { controlPlaneCode } from "./v2-session-error-facts.js";
import type { ControlPlaneErrorCode } from "../core/control-plane-error.js";

const PREFLIGHT_ERRORS: Partial<
  Record<
    ControlPlaneErrorCode,
    {
      status: number;
      code: string;
      message: string;
      category: "validation" | "unsupported" | "conflict";
    }
  >
> = {
  INVALID_CWD: {
    status: 400,
    code: "INVALID_CWD",
    message: "working directory is invalid",
    category: "validation",
  },
  INVALID_SESSION_ID: {
    status: 400,
    code: "INVALID_SESSION_ID",
    message: "session id is invalid",
    category: "validation",
  },
  INVALID_OPTIONS: {
    status: 400,
    code: "INVALID_OPTIONS",
    message: "adapter options are invalid",
    category: "validation",
  },
  UNSUPPORTED_CAPABILITY: {
    status: 409,
    code: "UNSUPPORTED_CAPABILITY",
    message: "requested capability is unsupported",
    category: "unsupported",
  },
  UNKNOWN_ADAPTER: {
    status: 409,
    code: "UNKNOWN_ADAPTER",
    message: "harness is unavailable",
    category: "conflict",
  },
  SESSION_ID_COLLISION: {
    status: 409,
    code: "SESSION_ID_COLLISION",
    message: "session id conflicts with existing state",
    category: "conflict",
  },
};

export function sendCreatePreflightError(
  error: unknown,
  response: ServerResponse,
): boolean {
  const code = controlPlaneCode(error);
  const facts = code ? PREFLIGHT_ERRORS[code] : undefined;
  if (!facts) return false;
  sendSessionError(
    response,
    facts.status,
    facts.code,
    facts.message,
    facts.category,
    "not-applied",
  );
  return true;
}
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
