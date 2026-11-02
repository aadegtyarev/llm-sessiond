import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { safeError } from "./v2-schema-common.js";

describe("v2 session create outcomes", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("preserves failed launch state without exposing backend details", async () => {
    fixture = await createSessionCycleFixture();
    fixture.failLaunch(true);
    const id = (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
    const response = await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": id,
      },
      body: JSON.stringify({ cwd: fixture.dir }),
    });
    expect(response.status).toBe(201);
    const value = (await response.json()) as {
      session: Record<string, unknown>;
    };
    expect(value.session.status).toBe("failed");
    expect(value.session.failureReason).not.toContain("PRIVATE");
    expect(value.session).not.toHaveProperty("createdAt");
  });
  it("does not trust backend error messages after mutation dispatch", async () => {
    fixture = await createSessionCycleFixture();
    const id = (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
    fixture.runtime.manager.create = async () => {
      throw new Error("PRIVATE BACKEND DETAIL");
    };
    const response = await fetch(`${fixture.base}/api/v2/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-llm-sessiond-instance": id,
      },
      body: JSON.stringify({ cwd: fixture.dir }),
    });
    expect(response.status).toBe(409);
    const error = safeError.parse(await response.json());
    expect(error).toMatchObject({
      category: "uncertain",
      outcome: "unknown",
      message: "session creation outcome is uncertain",
    });
    expect(JSON.stringify(error)).not.toContain("PRIVATE");
  });
});
