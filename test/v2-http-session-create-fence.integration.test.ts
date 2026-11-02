import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { safeError } from "./v2-schema-common.js";

describe("v2 create HTTP fences", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it("closes create admission while a matching-header body is delayed", async () => {
    fixture = await createSessionCycleFixture();
    const instanceId = (
      (await fetch(`${fixture.base}/api/v2/health`).then((r) => r.json())) as {
        instanceId: string;
      }
    ).instanceId;
    const bodyReceived = new Promise<void>((resolve) =>
      fixture.server.once("request", (request) =>
        request.once("data", () => resolve()),
      ),
    );
    let client!: ReturnType<typeof httpRequest>;
    const responsePromise = new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        client = httpRequest(
          new URL(`${fixture.base}/api/v2/sessions`),
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-llm-sessiond-instance": instanceId,
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        client.on("error", reject);
      },
    );
    client.write('{"cwd":"');
    await bodyReceived;
    await fixture.runtime.shutdown();
    client.end(`${fixture.dir}"}`);
    const result = await responsePromise;
    expect(result.status).toBe(503);
    expect(safeError.parse(JSON.parse(result.body))).toMatchObject({
      category: "unavailable",
      outcome: "not-applied",
    });
    expect(fixture.effects()).toEqual({ launches: 0, stops: 0 });
    expect(fixture.runtime.manager.list()).toHaveLength(0);
  });
});
