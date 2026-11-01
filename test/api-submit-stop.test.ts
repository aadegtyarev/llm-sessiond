import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  closeApi,
  json,
  postEmpty,
  postJson,
  startApi,
  tempDir,
} from "./helpers.js";

afterEach(cleanup);
describe("pending submit and stop", () => {
  it("invalidates a submit while stop advances the runtime generation", async () => {
    const { service, server, base } = await startApi();
    try {
      const created = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const id = String((created.session as Record<string, unknown>).id);
      const submitting = postJson(base, `/api/v1/sessions/${id}/inputs`, {
        text: "delay-ack",
      });
      const deadline = Date.now() + 2000;
      while (service.get(id).pendingSubmit === undefined) {
        if (Date.now() > deadline)
          throw new Error("submit did not become pending");
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      expect(
        (await postEmpty(base, `/api/v1/sessions/${id}/stop`)).status,
      ).toBe(204);
      const result = await submitting;
      expect(result.status).toBe(409);
      expect(await json(result)).toMatchObject({
        error: { code: "INPUT_UNCERTAIN" },
      });
      expect(service.get(id).currentInput).toBeUndefined();
    } finally {
      await closeApi(server, service);
    }
  });
});
