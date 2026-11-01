import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  closeApi,
  json,
  postJson,
  startApi,
  tempDir,
} from "./helpers.js";

afterEach(cleanup);
describe("same-session submits", () => {
  it("maps a concurrent pending submit to 409 INPUT_BUSY", async () => {
    const { service, server, base } = await startApi();
    try {
      const created = await json(
        await postJson(base, "/api/v1/sessions", {
          harnessId: "pi",
          cwd: await tempDir(),
        }),
      );
      const id = String((created.session as Record<string, unknown>).id);
      const submit = () =>
        postJson(base, `/api/v1/sessions/${id}/inputs`, { text: "delay-ack" });
      const responses = await Promise.all([submit(), submit()]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        202, 409,
      ]);
      const busy = responses.find((response) => response.status === 409);
      expect(await json(busy!)).toMatchObject({
        error: { code: "INPUT_BUSY" },
      });
    } finally {
      await closeApi(server, service);
    }
  });
});
