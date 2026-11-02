import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startV2 } from "../scripts/v2-smoke-process.mjs";

describe("portable smoke process cleanup", () => {
  it("reaps a child whose partial readiness line never completes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "v2-smoke-partial-"));
    const entry = path.join(root, "dist", "main-v2.js");
    await mkdir(path.dirname(entry));
    await writeFile(
      entry,
      'process.stdout.write("llm-sessiond v2 listening on 127.0.0.1:4318");',
    );
    try {
      await expect(startV2(root, {})).rejects.toThrow("did not become ready");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
