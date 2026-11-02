import type { IncomingMessage, ServerResponse } from "node:http";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import {
  controlPlaneCode,
  isPayloadTooLarge,
} from "./v2-session-error-facts.js";
import type { V2DiscoveryRuntime } from "./v2-discovery.js";
import { parseBody, readBody } from "./http-support.js";
import {
  matchesInstance,
  sendSessionError,
  sendStopUnknown,
  sendUnavailable,
  sendSessionNotFound,
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
    const tooLarge = isPayloadTooLarge(error);
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
    manager.get(id);
  } catch (error) {
    if (controlPlaneCode(error) === "NOT_FOUND") sendSessionNotFound(response);
    else sendUnavailable(response);
    return true;
  }
  let session;
  try {
    session = await manager.stop(id);
  } catch {
    sendStopUnknown(response);
    return true;
  }
  try {
    runtime.assertReady();
    if (session.status !== "stopped") {
      sendStopUnknown(response);
      return true;
    }
    response.statusCode = 204;
    response.end();
  } catch {
    sendStopUnknown(response);
  }
  return true;
}
