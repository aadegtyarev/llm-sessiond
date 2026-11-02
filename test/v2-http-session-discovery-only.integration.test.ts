import { afterEach, describe, expect, it } from "vitest";
import { createApiServer } from "../src/api/server.js";
import { SessionService } from "../src/core/session-service.js";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { close, listen } from "./v2-http-discovery-support.js";
import { safeError } from "./v2-schema-common.js";

describe("discovery-only session route boundary", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("returns 404 for unsupported paths/methods before optional manager lookup", async () => {
    fixture = await createSessionCycleFixture();
    const runtime = {
      registry: fixture.runtime.registry,
      assertReady: () => fixture.runtime.assertReady(),
    };
    const server = createApiServer(
      new SessionService({} as never),
      "127.0.0.1",
      runtime,
    );
    const base = await listen(server);
    try {
      for (const [path, method] of [
        ["/api/v2/sessions/x/options", "GET"],
        ["/api/v2/sessions/x/stop", "GET"],
        ["/api/v2/sessions", "PUT"],
        ["/api/v2/sessions/x", "DELETE"],
      ] as const)
        expect((await fetch(`${base}${path}`, { method })).status).toBe(404);
      for (const [path, method] of [
        ["/api/v2/sessions", "GET"],
        ["/api/v2/sessions/x", "GET"],
        ["/api/v2/sessions", "POST"],
        ["/api/v2/sessions/x/stop", "POST"],
      ] as const) {
        const response = await fetch(`${base}${path}`, { method });
        expect(response.status).toBe(503);
        expect(safeError.parse(await response.json())).toMatchObject({
          category: "unavailable",
          outcome: "not-applied",
        });
      }
    } finally {
      await close(server);
    }
  });
});
