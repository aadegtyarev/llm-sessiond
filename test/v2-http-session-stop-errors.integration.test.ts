import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { safeError } from "./v2-schema-common.js";

describe("v2 session HTTP validation and stop", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("rejects strict and oversized bodies; failed stop stays uncertain", async () => {
    fixture = await createSessionCycleFixture();
    const id = (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
    const missing = await fetch(
      `${fixture.base}/api/v2/sessions/missing/stop`,
      {
        method: "POST",
        headers: { "x-llm-sessiond-instance": id },
        body: "{}",
      },
    );
    expect(missing.status).toBe(404);
    expect(safeError.parse(await missing.json())).toMatchObject({
      category: "not-found",
      outcome: "not-applied",
    });
    for (const body of [
      '{"cwd":"x","unknown":1}',
      "{",
      '{"cwd":"x","callbackConnectionId":""}',
    ]) {
      const response = await fetch(`${fixture.base}/api/v2/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-llm-sessiond-instance": id,
        },
        body,
      });
      expect([400, 409]).toContain(response.status);
    }
    const oversized = await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": id,
      },
      body: JSON.stringify({ cwd: "x".repeat(24 * 1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);
    const created = (await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": id,
      },
      body: JSON.stringify({ cwd: fixture.dir }),
    }).then((r) => r.json())) as { session: { id: string } };
    fixture.failStop(true);
    const stopped = await fetch(
      `${fixture.base}/api/v2/sessions/${created.session.id}/stop`,
      {
        method: "POST",
        headers: { "x-llm-sessiond-instance": id },
        body: "{}",
      },
    );
    expect(stopped.status).toBe(409);
    const error = safeError.parse(await stopped.json());
    expect(error).toMatchObject({
      code: "OPERATION_UNCERTAIN",
      message: "stop outcome is uncertain",
      category: "uncertain",
      outcome: "unknown",
    });
    expect(fixture.runtime.manager.get(created.session.id).status).toBe(
      "uncertain",
    );
  });
});
