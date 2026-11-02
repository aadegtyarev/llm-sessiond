import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/core/api-error.js";
import { ControlPlaneError } from "../src/core/control-plane-error.js";
import { createSessionCycleFixture } from "./v2-http-session-cycle-fixture.js";
import { safeError } from "./v2-schema-common.js";

describe("v2 create failure code projection", () => {
  let fixture: Awaited<ReturnType<typeof createSessionCycleFixture>>;
  afterEach(async () => {
    if (fixture) await fixture.dispose();
  });
  it.each(["changing", "throwing", "api-error"] as const)(
    "contains %s code extraction after create dispatch",
    async (kind) => {
      fixture = await createSessionCycleFixture();
      const instanceId = (
        (await fetch(`${fixture.base}/api/v2/health`).then((r) =>
          r.json(),
        )) as { instanceId: string }
      ).instanceId;
      let getterReads = 0;
      let failure: Error;
      if (kind === "api-error")
        failure = new ApiError(400, "PRIVATE_API_CODE", "PRIVATE API MESSAGE");
      else {
        failure = new ControlPlaneError("INVALID_CWD");
        Object.defineProperty(failure, "code", {
          configurable: true,
          get() {
            getterReads++;
            if (kind === "throwing") throw new Error("PRIVATE GETTER FAILURE");
            return getterReads === 1 ? "INVALID_CWD" : "PRIVATE CODE";
          },
        });
      }
      const create = fixture.runtime.manager.create.bind(
        fixture.runtime.manager,
      );
      fixture.runtime.manager.create = async (input) => {
        await create(input);
        throw failure;
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
        message: "session creation outcome is uncertain",
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
      expect(error.reference.length).toBeGreaterThan(0);
      expect(JSON.stringify(error)).not.toContain("PRIVATE");
      expect(getterReads).toBe(0);
      expect(fixture.effects()).toEqual({ launches: 1, stops: 0 });
    },
  );
});
