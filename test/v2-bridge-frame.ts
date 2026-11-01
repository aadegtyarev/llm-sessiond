import { z } from "zod";
import { callbackFrames } from "./v2-bridge-callback-schema.js";
import {
  cancelResult,
  controlFrames,
  controlRequest,
  controlResults,
} from "./v2-bridge-control-schema.js";
import {
  connectionFrames,
  failed,
  guardAck,
  openAck,
  succeeded,
} from "./v2-bridge-handshake-schema.js";

export function validateFrame(value: unknown): boolean {
  return (
    connectionFrames.safeParse(value).success ||
    controlFrames.safeParse(value).success ||
    callbackFrames.safeParse(value).success
  );
}
export function validateRequestPair(
  request: unknown,
  response: unknown,
): boolean {
  if (!request || typeof request !== "object" || Array.isArray(request))
    return false;
  const req = request as Record<string, unknown>;
  if (!validateFrame(request)) return false;
  if (
    !succeeded.safeParse(response).success ||
    req.requestId !== (response as Record<string, unknown>).requestId
  )
    return false;
  const result = (response as { result: unknown }).result;
  if (req.type === "client.open") return openAck.safeParse(result).success;
  if (req.type === "guard.set") return guardAck.safeParse(result).success;
  if (req.type === "callback.bind")
    return z
      .strictObject({ bindingId: z.string(), sessionId: z.string() })
      .safeParse(result).success;
  if (req.type === "callback.unbind")
    return z.strictObject({}).safeParse(result).success;
  if (req.type === "control.cancel")
    return cancelResult.safeParse(result).success;
  if (req.type !== "control.request" || !controlRequest.safeParse(req).success)
    return false;
  const operation = req.operation;
  const schema =
    operation === "reload"
      ? controlResults.reload
      : operation === "command.run"
        ? controlResults.command
        : controlResults.extension;
  return schema.safeParse(result).success;
}
export function validateFailureFrame(value: unknown): boolean {
  return failed.safeParse(value).success;
}
