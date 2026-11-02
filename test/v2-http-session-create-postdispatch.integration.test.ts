import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { safeError } from "./v2-schema-common.js";

describe("v2 create post-dispatch fence", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("returns unknown after a post-dispatch readiness fence failure", async () => {
    fixture = await createSessionCycleFixture();
    const instanceId = (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
    const ready = fixture.runtime.assertReady.bind(fixture.runtime);
    let checks = 0;
    let managerCalls = 0;
    fixture.runtime.assertReady = () => {
      if (++checks === 2) throw new Error("PRIVATE OWNER LOSS");
      ready();
    };
    const create = fixture.runtime.manager.create.bind(fixture.runtime.manager);
    fixture.runtime.manager.create = async (input) => {
      managerCalls++;
      return create(input);
    };
    const response = await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": instanceId,
      },
      body: JSON.stringify({ cwd: fixture.dir }),
    });
    expect(response.status).toBe(409);
    const error = safeError.parse(await response.json());
    expect(error).toMatchObject({
      code: "OPERATION_UNCERTAIN",
      category: "uncertain",
      outcome: "unknown",
    });
    expect(JSON.stringify(error)).not.toContain("PRIVATE");
    expect(managerCalls).toBe(1);
    expect(fixture.effects()).toEqual({ launches: 1, stops: 0 });
    expect(fixture.runtime.manager.get("Session.Mixed-1").status).toBe(
      "running",
    );
  });
});
