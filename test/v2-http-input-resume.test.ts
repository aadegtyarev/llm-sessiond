import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";

async function createStopped(
  fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>,
) {
  const instanceId = (
    (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
      instanceId: string;
    }
  ).instanceId;
  const created = await fetch(`${fixture.base}/api/v2/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-llm-sessiond-instance": instanceId,
    },
    body: JSON.stringify({ cwd: fixture.dir }),
  });
  expect(created.status).toBe(201);
  await fixture.runtime.manager?.stop("Session.Mixed-1");
  return instanceId;
}

describe("v2 input submit resumes exactly once", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("submits once and returns the command result, not model completion", async () => {
    fixture = await createSessionCycleFixture(true);
    const instanceId = await createStopped(fixture);
    const response = await fetch(
      `${fixture.base}/api/v2/sessions/Session.Mixed-1/inputs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-llm-sessiond-instance": instanceId,
        },
        body: JSON.stringify({ text: " exact text \n" }),
      },
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      inputId: "input-2",
      resumed: true,
    });
    expect(fixture.inputEffects()).toEqual({
      resumes: 1,
      submits: 1,
      texts: [" exact text \n"],
    });
  });
  it("retains input identity and resumed after definite rejection", async () => {
    fixture = await createSessionCycleFixture(true);
    const instanceId = await createStopped(fixture);
    fixture.failInput(true);
    const response = await fetch(
      `${fixture.base}/api/v2/sessions/Session.Mixed-1/inputs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-llm-sessiond-instance": instanceId,
        },
        body: JSON.stringify({ text: "reject" }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "INPUT_REJECTED",
      inputId: "input-2",
      resumed: true,
      failure: { reason: "prompt_rejected" },
      outcome: "not-applied",
    });
    expect(fixture.inputEffects()).toMatchObject({ resumes: 1, submits: 1 });
  });
});
