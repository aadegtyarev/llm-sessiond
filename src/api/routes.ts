import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "../core/api-error.js";
import type { SessionService } from "../core/session-service.js";
import { harnessesResponseSchema, healthResponseSchema } from "./schemas.js";
import { sendJson } from "./http-support.js";
import { sessionRoute } from "./session-routes.js";

export async function route(
  service: SessionService,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";
  const path = url.pathname;
  if (method === "GET" && path === "/api/v1/health")
    return sendJson(
      response,
      200,
      {
        apiVersion: "v1",
        status: "ready",
        version: process.env.npm_package_version ?? "0.1.0",
      },
      healthResponseSchema,
    );
  if (method === "GET" && path === "/api/v1/harnesses")
    return sendJson(
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
  if (path.startsWith("/api/v1/sessions"))
    return sessionRoute(service, request, response, path);
  throw new ApiError(404, "NOT_FOUND", "route not found");
}
