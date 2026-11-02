import type { ServerResponse } from "node:http";
import { ControlPlaneError } from "../core/control-plane-error.js";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import type { V2DiscoveryRuntime } from "./v2-discovery.js";
import { sendJson } from "./http-support.js";
import { snapshotV2Session } from "./v2-session-snapshot.js";
import {
  v2SessionResponseSchema,
  v2SessionsResponseSchema,
} from "./v2-session-schema.js";
import {
  sendSessionNotFound,
  sendUnavailable,
} from "./v2-session-http-support.js";

export function listV2Sessions(
  runtime: V2DiscoveryRuntime,
  manager: DurableSessionManager,
  response: ServerResponse,
): void {
  try {
    runtime.assertReady();
    const sessions = manager.list().map(snapshotV2Session);
    runtime.assertReady();
    sendJson(response, 200, { sessions }, v2SessionsResponseSchema);
  } catch {
    sendUnavailable(response);
  }
}
export function getV2Session(
  runtime: V2DiscoveryRuntime,
  manager: DurableSessionManager,
  id: string,
  response: ServerResponse,
): void {
  try {
    runtime.assertReady();
    const session = snapshotV2Session(manager.get(id));
    runtime.assertReady();
    sendJson(response, 200, { session }, v2SessionResponseSchema);
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === "NOT_FOUND")
      sendSessionNotFound(response);
    else sendUnavailable(response);
  }
}
