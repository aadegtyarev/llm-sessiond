import type { IncomingMessage, ServerResponse } from "node:http";
import type { V2DiscoveryRuntime } from "./v2-discovery.js";
import { v2SessionIdSchema } from "./v2-session-schema.js";
import { createV2Session } from "./v2-session-create-route.js";
import { stopV2Session } from "./v2-session-stop-route.js";
import {
  sendInvalidSessionPath,
  sendUnavailable,
} from "./v2-session-http-support.js";
import { getV2Session, listV2Sessions } from "./v2-session-read-route.js";

export async function v2SessionRoute(
  runtime: V2DiscoveryRuntime,
  instanceId: string,
  path: string,
  method: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const collection = path === "/api/v2/sessions";
  const match = /^\/api\/v2\/sessions\/([^/]+)(?:\/(stop))?$/.exec(path);
  const detail = method === "GET" && match !== null && !match[2];
  const stop = method === "POST" && match !== null && Boolean(match[2]);
  const list = method === "GET" && collection;
  const create = method === "POST" && collection;
  if (!list && !create && !detail && !stop) return false;
  const manager = runtime.manager;
  if (!manager) {
    sendUnavailable(response);
    return true;
  }
  if (list) {
    listV2Sessions(runtime, manager, response);
    return true;
  }
  if (create)
    return createV2Session(runtime, instanceId, manager, request, response);

  if (!match) return false;
  let id: string;
  try {
    id = decodeURIComponent(match[1] ?? "");
  } catch {
    sendInvalidSessionPath(response);
    return true;
  }
  if (!v2SessionIdSchema.safeParse(id).success) {
    sendInvalidSessionPath(response);
    return true;
  }
  if (method === "GET" && !match[2]) {
    getV2Session(runtime, manager, id, response);
    return true;
  }
  if (method === "POST" && match[2])
    return stopV2Session(runtime, instanceId, manager, id, request, response);
  return false;
}
