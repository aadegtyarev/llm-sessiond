import type { ServerResponse } from "node:http";
import { ControlPlaneError } from "../core/control-plane-error.js";
import { InputRuntimeError } from "../core/input-runtime-error.js";
import { sendSessionError } from "./v2-session-http-support.js";

export function sendInputError(
  response: ServerResponse,
  error: unknown,
  submitted?: { inputId: string; resumed: boolean },
): void {
  const input = error instanceof InputRuntimeError ? error : undefined;
  const controlled = error instanceof ControlPlaneError ? error : undefined;
  const code = controlled?.code ?? "OPERATION_FAILED";
  const uncertain =
    !controlled || code === "INPUT_UNCERTAIN" || code === "STORE_FAILED";
  const notFound = code === "NOT_FOUND";
  const invalid = code === "INVALID_INPUT";
  const unsupported = code === "UNSUPPORTED_CAPABILITY";
  const inputId = input?.inputId ?? submitted?.inputId;
  sendSessionError(
    response,
    invalid ? 400 : notFound ? 404 : 409,
    code,
    "input submission failed",
    invalid
      ? "validation"
      : notFound
        ? "not-found"
        : unsupported
          ? "unsupported"
          : uncertain
            ? "uncertain"
            : "conflict",
    uncertain ? "unknown" : "not-applied",
    inputId
      ? {
          inputId,
          resumed: input?.resumed ?? submitted?.resumed ?? false,
          ...(input?.failureReason
            ? { failureReason: input.failureReason }
            : {}),
        }
      : undefined,
  );
}
