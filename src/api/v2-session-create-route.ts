import type { IncomingMessage, ServerResponse } from "node:http";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import type { JsonValue } from "../core/generic-json.js";
import type { V2DiscoveryRuntime } from "./v2-discovery.js";
import { parseBody, readBody, sendJson } from "./http-support.js";
import {
  sendSessionError,
  matchesInstance,
  sendCreateUnknown,
} from "./v2-session-http-support.js";
import {
  rejectUnsupportedConfiguration,
  sendCreatePreflightError,
} from "./v2-session-create-errors.js";
import { snapshotV2Session } from "./v2-session-snapshot.js";
import {
  v2SessionCreateSchema,
  v2SessionResponseSchema,
} from "./v2-session-schema.js";

export async function createV2Session(
  runtime: V2DiscoveryRuntime,
  instanceId: string,
  manager: DurableSessionManager,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  let body;
  try {
    body = parseBody(v2SessionCreateSchema, await readBody(request));
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : 400;
    sendSessionError(
      response,
      status === 413 ? 413 : 400,
      status === 413 ? "LIMIT_EXCEEDED" : "VALIDATION_ERROR",
      status === 413
        ? "request body too large"
        : "request does not match schema",
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
  if (rejectUnsupportedConfiguration(body, response)) return true;
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
  let session;
  try {
    session = await manager.create({
      cwd: body.cwd,
      ...(body.harnessId !== undefined ? { harnessId: body.harnessId } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.adapterOptions !== undefined
        ? { options: {} as JsonValue }
        : {}),
    });
  } catch (error) {
    if (!sendCreatePreflightError(error, response)) sendCreateUnknown(response);
    return true;
  }
  try {
    const snapshot = snapshotV2Session(session);
    runtime.assertReady();
    sendJson(response, 201, { session: snapshot }, v2SessionResponseSchema);
  } catch {
    sendCreateUnknown(response);
  }
  return true;
}
