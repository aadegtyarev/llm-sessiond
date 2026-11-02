import type { IncomingMessage, ServerResponse } from "node:http";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import { ApiError } from "../core/api-error.js";
import { ControlPlaneError } from "../core/control-plane-error.js";
import type { V2DiscoveryRuntime } from "./v2-discovery.js";
import { parseBody, readBody } from "./http-support.js";
import {
  matchesInstance,
  sendSessionError,
} from "./v2-session-http-support.js";
import { v2EmptySchema } from "./v2-session-schema.js";

export async function stopV2Session(
  runtime: V2DiscoveryRuntime,
  instanceId: string,
  manager: DurableSessionManager,
  id: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  try {
    const body = await readBody(request);
    if (body !== undefined) parseBody(v2EmptySchema, body);
  } catch (error) {
    const tooLarge = error instanceof ApiError && error.status === 413;
    sendSessionError(
      response,
      tooLarge ? 413 : 400,
      tooLarge ? "LIMIT_EXCEEDED" : "VALIDATION_ERROR",
      tooLarge ? "request body too large" : "request does not match schema",
      "validation",
      "not-applied",
    );
    return true;
  }
  if (!matchesInstance(request, instanceId)) {
    sendSessionError(
      response,
      503,
      "INSTANCE_CHANGED",
      "service instance changed",
      "unavailable",
      "not-applied",
    );
    return true;
  }
  try {
    runtime.assertReady();
  } catch {
    sendSessionError(
      response,
      503,
      "UNAVAILABLE",
      "service unavailable",
      "unavailable",
      "not-applied",
    );
    return true;
  }
  try {
    const session = await manager.stop(id);
    runtime.assertReady();
    if (session.status !== "stopped") {
      sendSessionError(
        response,
        503,
        "OPERATION_UNCERTAIN",
        "stop outcome is uncertain",
        "uncertain",
        "unknown",
      );
      return true;
    }
    response.statusCode = 204;
    response.end();
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === "NOT_FOUND")
      sendSessionError(
        response,
        404,
        "NOT_FOUND",
        "session not found",
        "not-found",
        "not-applied",
      );
    else
      sendSessionError(
        response,
        503,
        "OPERATION_UNCERTAIN",
        "stop outcome is uncertain",
        "uncertain",
        "unknown",
      );
  }
  return true;
}
