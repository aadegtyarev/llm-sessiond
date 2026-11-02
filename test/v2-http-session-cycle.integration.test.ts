import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";

describe("injected v2 HTTP session cycle", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  async function bootId() {
    return (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
  }
  it("creates and returns a safe durable record, then stops it", async () => {
    fixture = await createSessionCycleFixture();
    const id = await bootId();
    const created = await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": id,
      },
      body: JSON.stringify({ cwd: fixture.dir, name: "safe" }),
    });
    expect(created.status).toBe(201);
    const value = (await created.json()) as {
      session: Record<string, unknown>;
    };
    expect(value.session).toMatchObject({
      id: "Session.Mixed-1",
      harnessId: "test",
      status: "running",
      name: "safe",
      nativeSessionId: "native-safe",
    });
    expect(value.session).not.toHaveProperty("adapterState");
    expect(value.session).not.toHaveProperty("createdAt");
    expect((await fetch(`${fixture.base}/api/v2/sessions`)).status).toBe(200);
    expect(
      (await fetch(`${fixture.base}/api/v2/sessions/Session.Mixed-1`)).status,
    ).toBe(200);
    const wrongCase = await fetch(
      `${fixture.base}/api/v2/sessions/session.Mixed-1`,
    );
    expect(wrongCase.status).toBe(404);
    const stopped = await fetch(
      `${fixture.base}/api/v2/sessions/Session.Mixed-1/stop`,
      {
        method: "POST",
        headers: {
          "x-llm-sessiond-instance": id,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(stopped.status).toBe(204);
    expect(fixture.runtime.manager.get("Session.Mixed-1").status).toBe(
      "stopped",
    );
  });
});
