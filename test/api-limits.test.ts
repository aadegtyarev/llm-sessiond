import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readBody, BODY_LIMIT } from "../src/api/http-support.js";
import { afterEach } from "vitest";
import { closeApi, json, startApi, tempDir, cleanup } from "./helpers.js";

afterEach(cleanup);
describe("API bounds", () => {
  it("rejects JSON bodies over 24 MiB", async () => {
    const stream = Readable.from([Buffer.alloc(BODY_LIMIT + 1)]);
    await expect(readBody(stream as never)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("rejects decoded images above 20 MiB", async () => {
    const { service, server, base } = await startApi();
    try {
      const made = await json(
        await fetch(`${base}/api/v1/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ harnessId: "pi", cwd: await tempDir() }),
        }),
      );
      const session = made.session as Record<string, unknown>;
      const data = Buffer.alloc(20 * 1024 * 1024 + 1).toString("base64");
      await expect(
        service.input(String(session.id), {
          text: "",
          images: [{ mimeType: "image/png", data }],
        }),
      ).rejects.toMatchObject({ status: 413 });
    } finally {
      await closeApi(server, service);
    }
  });
  it("rejects prompts above the UTF-8 text limit", async () => {
    const { service, server, base } = await startApi();
    try {
      const made = await json(
        await fetch(`${base}/api/v1/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ harnessId: "pi", cwd: await tempDir() }),
        }),
      );
      const session = made.session as Record<string, unknown>;
      const response = await fetch(
        `${base}/api/v1/sessions/${String(session.id)}/inputs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "x".repeat(256 * 1024 + 1) }),
        },
      );
      expect(response.status).toBe(413);
      expect(await json(response)).toMatchObject({
        error: { code: "LIMIT_EXCEEDED" },
      });
    } finally {
      await closeApi(server, service);
    }
  });
});
