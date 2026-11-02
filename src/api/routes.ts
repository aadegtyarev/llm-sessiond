import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "../core/api-error.js";
import type { SessionService } from "../core/session-service.js";
import { harnessesResponseSchema, healthResponseSchema } from "./schemas.js";
import { sendJson } from "./http-support.js";
import { sessionRoute } from "./session-routes.js";

export type RouteResult = "v2-not-found" | undefined;
export async function route(
  service: SessionService,
  request: IncomingMessage,
  response: ServerResponse,
  v2Discover?: (
    path: string,
    method: string,
    response: ServerResponse,
  ) => Promise<boolean>,
): Promise<RouteResult> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";
  const path = url.pathname;
  if (v2Discover && (path === "/api/v2" || path.startsWith("/api/v2/"))) {
    const handled = await v2Discover(path, method, response);
    if (!handled) return "v2-not-found";
    return;
  }
  if (method === "GET" && path === "/api/v1/health") {
    sendJson(
      response,
      200,
      {
        apiVersion: "v1",
        status: "ready",
        version: process.env.npm_package_version ?? "0.1.0",
      },
      healthResponseSchema,
    );
    return;
  }
  if (method === "GET" && path === "/api/v1/harnesses") {
    sendJson(
      response,
      200,
      {
        harnesses: [
          {
            id: "pi",
            label: "Pi",
            capabilities: [
              "input.submit",
              "harness.cancel",
              "harness.stop",
              "harness.resume",
            ],
          },
        ],
      },
      harnessesResponseSchema,
    );
    return;
  }
  if (path.startsWith("/api/v1/sessions")) {
    await sessionRoute(service, request, response, path);
    return;
  }
  throw new ApiError(404, "NOT_FOUND", "route not found");
}
