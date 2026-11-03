import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";

describe("v2 text input route", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("rejects non-text fields and wrong boot before input effects", async () => {
    fixture = await createSessionCycleFixture();
    const health = (await fetch(`${fixture.base}/api/v2/health`).then((r) =>
      r.json(),
    )) as { instanceId: string };
    const created = await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": health.instanceId,
      },
      body: JSON.stringify({ cwd: fixture.dir }),
    });
    expect(created.status).toBe(201);
    const headers = {
      "content-type": "application/json",
      "x-llm-sessiond-instance": health.instanceId,
    };
    const unsupported = await fetch(
      `${fixture.base}/api/v2/sessions/Session.Mixed-1/inputs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ text: "x", images: [] }),
      },
    );
    expect(unsupported.status).toBe(400);
    const stale = await fetch(
      `${fixture.base}/api/v2/sessions/Session.Mixed-1/inputs`,
      {
        method: "POST",
        headers: { ...headers, "x-llm-sessiond-instance": "old-boot" },
        body: JSON.stringify({ text: "x" }),
      },
    );
    expect(stale.status).toBe(503);
    const noCapability = await fetch(
      `${fixture.base}/api/v2/sessions/Session.Mixed-1/inputs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ text: "x" }),
      },
    );
    expect(noCapability.status).toBe(409);
    expect(await noCapability.json()).toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
      outcome: "not-applied",
    });
    expect(fixture.effects().launches).toBe(1);
  });
});
