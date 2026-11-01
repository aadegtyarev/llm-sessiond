import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareStateDirectory } from "../src/persistence/private-state-directory.js";

describe("POSIX private state directory", () => {
  it.skipIf(process.platform === "win32")(
    "corrects 0777 mode and returns canonical safe path",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "state-dir-mode-"));
      const directory = path.join(root, "state");
      try {
        await mkdir(directory);
        await chmod(directory, 0o777);
        expect(await prepareStateDirectory(directory)).toBe(
          await realpath(directory),
        );
        expect((await stat(directory)).mode & 0o077).toBe(0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it("rejects a directory not owned by the provided current-uid seam", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "state-dir-owner-"));
    try {
      await expect(
        prepareStateDirectory(root, {
          getuid: () => (process.getuid?.() ?? 0) + 1,
        }),
      ).rejects.toThrow("STATE_DIRECTORY_OWNER_MISMATCH");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform === "win32")(
    "rejects a symlink at the configured final path",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "state-dir-link-"));
      const target = path.join(root, "target");
      const link = path.join(root, "link");
      try {
        await mkdir(target);
        await symlink(target, link);
        await expect(prepareStateDirectory(link)).rejects.toThrow(
          "STATE_DIRECTORY_NOT_SAFE",
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
