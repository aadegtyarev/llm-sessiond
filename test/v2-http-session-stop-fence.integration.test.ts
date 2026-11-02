import { afterEach, describe, expect, it } from "vitest";
import { ControlPlaneError } from "../src/core/control-plane-error.js";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { safeError } from "./v2-schema-common.js";

describe("v2 stop post-dispatch outcomes", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  async function createSession() {
    const instanceId = (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
    const response = await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": instanceId,
      },
      body: JSON.stringify({ cwd: fixture.dir }),
    });
    return {
      instanceId,
      id: ((await response.json()) as { session: { id: string } }).session.id,
    };
  }
  it.each(["final-read", "readiness", "status"] as const)(
    "reports unknown after %s failure despite NOT_FOUND",
    async (stage) => {
      fixture = await createSessionCycleFixture();
      const created = await createSession();
      const stop = fixture.runtime.manager.stop.bind(fixture.runtime.manager);
      if (stage === "final-read") {
        const storeGet = fixture.repository.get.bind(fixture.repository);
        let reads = 0;
        fixture.repository.get = (id) => {
          if (++reads === 4) throw new ControlPlaneError("NOT_FOUND");
          return storeGet(id);
        };
      }
      if (stage === "readiness") {
        const ready = fixture.runtime.assertReady.bind(fixture.runtime);
        let calls = 0;
        fixture.runtime.assertReady = () => {
          if (++calls === 2) throw new ControlPlaneError("NOT_FOUND");
          ready();
        };
      }
      if (stage === "status")
        fixture.runtime.manager.stop = async (id) => {
          const session = await stop(id);
          return Object.defineProperty(session, "status", {
            get() {
              throw new ControlPlaneError("NOT_FOUND");
            },
          });
        };
      const response = await fetch(
        `${fixture.base}/api/v2/sessions/${created.id}/stop`,
        {
          method: "POST",
          headers: { "x-llm-sessiond-instance": created.instanceId },
          body: "{}",
        },
      );
      expect(response.status).toBe(409);
      const error = safeError.parse(await response.json());
      expect(error).toMatchObject({
        code: "OPERATION_UNCERTAIN",
        message: "stop outcome is uncertain",
        category: "uncertain",
        outcome: "unknown",
      });
      expect(Object.keys(error).sort()).toEqual([
        "category",
        "code",
        "message",
        "outcome",
        "reference",
      ]);
      expect(fixture.runtime.manager.get(created.id).status).toBe("stopped");
      expect(fixture.effects()).toEqual({ launches: 1, stops: 1 });
    },
  );
});
