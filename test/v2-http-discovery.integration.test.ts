import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApiServer } from "../src/api/server.js";
import { SessionService } from "../src/core/session-service.js";
import type { HarnessAdapter } from "../src/core/adapter-contracts.js";
import { createDurableRuntime } from "../src/harness/durable-runtime.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { SessionRepository } from "../src/persistence/session-repository.js";
import {
  assertFreshBootAndClosing,
  assertLegacyV1,
  close,
  expectSafeError,
  listen,
} from "./v2-http-discovery-support.js";

describe("prepared-runtime v2 HTTP discovery", () => {
  it("serves real registry discovery and readiness only when injected", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "v2-discovery-"));
    const db = openSessionDatabase(path.join(dir, "state.sqlite"));
    const lease = await OwnedStoreLease.acquire(dir, db);
    const adapter: HarnessAdapter = {
      descriptor: {
        id: "third-party",
        aliases: ["third"],
        capabilities: ["harness.launch"],
        metadata: { kind: "fixture" },
        options: [{ key: "mode", label: "Mode", values: ["safe"] }],
        extensions: [
          { namespace: "vendor.extra", version: 1, operations: [], events: [] },
        ],
      },
      validateCheckpoint: () => true,
      isResumable: () => false,
    };
    const runtime = createDurableRuntime({
      store: new SessionRepository(db),
      owner: lease.generation,
      defaultId: "third",
      bindings: [
        {
          adapter,
          factory: {
            create: () => {
              throw Error("not called");
            },
          },
        },
      ],
    });
    const service = new SessionService({} as never);
    const server = createApiServer(service, "127.0.0.1", runtime);
    const base = await listen(server);
    try {
      const health = await fetch(`${base}/api/v2/health`).then((r) => r.json());
      expect(health).toMatchObject({
        apiVersion: "v2",
        protocolRevision: 1,
        status: "ready",
        serviceVersion: "0.1.0",
        supportedApiVersions: ["v1", "v2"],
        features: [],
      });
      const again = await fetch(`${base}/api/v2/health`).then((r) => r.json());
      expect(again.instanceId).toBe(health.instanceId);
      const registry = await fetch(`${base}/api/v2/harnesses`).then((r) =>
        r.json(),
      );
      expect(registry).toEqual({
        defaultHarnessId: "third-party",
        harnesses: [adapter.descriptor],
      });
      await expectSafeError(
        await fetch(`${base}/api/v2/unsupported`),
        404,
        "not-found",
      );
      await expectSafeError(
        await fetch(`${base}/api/v2/health`, { method: "POST" }),
        404,
        "not-found",
      );
      await assertLegacyV1(service);
      await assertFreshBootAndClosing(
        service,
        runtime,
        base,
        health.instanceId,
      );
    } finally {
      await close(server);
      await lease.release();
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
