import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import type { HarnessRegistry } from "../core/adapter-registry.js";
import { validateJson } from "../core/json-bounds.js";
import { sendJson } from "./http-support.js";

export interface V2DiscoveryRuntime {
  registry: HarnessRegistry;
  assertReady(): void;
}

const descriptorSchema = z.strictObject({
  id: z.string(),
  aliases: z.array(z.string()),
  capabilities: z.array(z.string()),
  metadata: z.record(z.string(), z.string()).optional(),
  options: z.array(z.record(z.string(), z.unknown())).optional(),
  extensions: z.array(z.record(z.string(), z.unknown())).optional(),
});
const harnessesSchema = z.strictObject({
  defaultHarnessId: z.string(),
  harnesses: z.array(descriptorSchema),
});

export function createV2Discovery(runtime: V2DiscoveryRuntime) {
  const instanceId = randomUUID();
  return async function discover(
    path: string,
    method: string,
    response: ServerResponse,
  ): Promise<boolean> {
    if (path !== "/api/v2" && !path.startsWith("/api/v2/")) return false;
    runtime.assertReady();
    if (method === "GET" && path === "/api/v2/health") {
      sendJson(response, 200, {
        apiVersion: "v2",
        protocolRevision: 1,
        status: "ready",
        serviceVersion: process.env.npm_package_version ?? "0.1.0",
        instanceId,
        supportedApiVersions: ["v1", "v2"],
        features: [],
      });
      return true;
    }
    if (method === "GET" && path === "/api/v2/harnesses") {
      const defaultHarnessId = runtime.registry.resolve(
        runtime.registry.defaultId,
      ).descriptor.id;
      const harnesses = runtime.registry.list().map((adapter) => {
        const source: unknown = adapter.descriptor;
        validateJson(source, 65536, 20);
        return descriptorSchema.parse(source);
      });
      const value = { defaultHarnessId, harnesses };
      harnessesSchema.parse(value);
      runtime.assertReady();
      sendJson(response, 200, value);
      return true;
    }
    return false;
  };
}
