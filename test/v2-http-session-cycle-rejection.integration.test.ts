import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";

describe("v2 session create rejection", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("rejects stale identity and unsupported configuration before execution", async () => {
    fixture = await createSessionCycleFixture();
    const body = { cwd: fixture.dir };
    for (const header of [undefined, "stale"]) {
      const response = await fetch(`${fixture.base}/api/v2/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(header ? { "x-llm-sessiond-instance": header } : {}),
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(503);
    }
    const instanceId = (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
    for (const extra of [
      { callbackConnectionId: "lease" },
      { adapterOptions: { mode: "unsafe" } },
      { confirmedDangerousOptions: ["mode"] },
    ]) {
      const response = await fetch(`${fixture.base}/api/v2/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-llm-sessiond-instance": instanceId,
        },
        body: JSON.stringify({ ...body, ...extra }),
      });
      expect(response.status).toBe(409);
    }
    expect(fixture.effects()).toEqual({ launches: 0, stops: 0 });
    expect(fixture.runtime.manager.list()).toHaveLength(0);
  });
});
