import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { HarnessRegistry } from "../core/adapter-registry.js";
import type { DurableSessionManager } from "../core/durable-session-manager.js";
import { SERVICE_VERSION } from "./service-version.js";
import { snapshotDiscoveryDescriptor } from "./v2-discovery-descriptor.js";
import { sendJson } from "./http-support.js";
import type { IncomingMessage } from "node:http";
import { v2SessionRoute } from "./v2-session-routes.js";

export interface V2DiscoveryRuntime {
  registry: HarnessRegistry;
  assertReady(): void;
  manager?: DurableSessionManager;
}

export function createV2Discovery(runtime: V2DiscoveryRuntime) {
  const instanceId = randomUUID();
  return async function discover(
    path: string,
    method: string,
    response: ServerResponse,
    request: IncomingMessage,
  ): Promise<boolean> {
    if (method === "GET" && path === "/api/v2/health") {
      runtime.assertReady();
      sendJson(response, 200, {
        apiVersion: "v2",
        protocolRevision: 1,
        status: "ready",
        serviceVersion: SERVICE_VERSION,
        instanceId,
        supportedApiVersions: ["v1", "v2"],
        features: [],
      });
      return true;
    }
    if (path === "/api/v2/sessions" || path.startsWith("/api/v2/sessions/")) {
      return v2SessionRoute(
        runtime,
        instanceId,
        path,
        method,
        request,
        response,
      );
    }
    if (method === "GET" && path === "/api/v2/harnesses") {
      runtime.assertReady();
      const defaultAdapter = runtime.registry.resolve(
        runtime.registry.defaultId,
      );
      const adapters = runtime.registry.list();
      const defaultIndex = adapters.indexOf(defaultAdapter);
      if (defaultIndex < 0)
        throw new TypeError("default harness is not registered");
      const harnesses = adapters.map((adapter) =>
        snapshotDiscoveryDescriptor(adapter.descriptor),
      );
      const defaultHarnessId = harnesses[defaultIndex]!.id;
      const value = { defaultHarnessId, harnesses };
      runtime.assertReady();
      sendJson(response, 200, value);
      return true;
    }
    return false;
  };
}
