import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateLifecycleCwd } from "../src/core/lifecycle-cwd-validation.js";
import { setup } from "./durable-manager-support.js";
describe("lifecycle cwd canonical validation", () => {
  it("resolves a directory symlink before persistence and launch", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(path.join(os.tmpdir(), "cwd-canonical-"));
    try {
      const target = path.join(root, "target");
      const alias = path.join(root, "alias");
      await mkdir(target);
      await symlink(target, alias, "dir");
      expect(await validateLifecycleCwd(alias)).toBe(await realpath(target));
      let launched = "";
      const { manager } = setup({
        launch: async ({ cwd }) => {
          launched = cwd;
          return {};
        },
      });
      const row = await manager.create({ cwd: alias });
      expect(row.cwd).toBe(await realpath(target));
      expect(launched).toBe(row.cwd);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects relative, missing, and non-directory paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cwd-invalid-"));
    try {
      const file = path.join(root, "file");
      await writeFile(file, "x");
      await expect(validateLifecycleCwd("relative")).rejects.toMatchObject({
        code: "INVALID_CWD",
      });
      await expect(
        validateLifecycleCwd(path.join(root, "missing")),
      ).rejects.toMatchObject({ code: "INVALID_CWD" });
      await expect(validateLifecycleCwd(file)).rejects.toMatchObject({
        code: "INVALID_CWD",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
