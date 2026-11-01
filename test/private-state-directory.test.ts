import { describe, expect, it } from "vitest";
import {
  prepareStateDirectory,
  type DirectoryInfo,
  type StateDirectoryFileSystem,
} from "../src/persistence/private-state-directory.js";

const currentUid = () => process.getuid?.();
function injectedFs(
  failure: "chmod" | "stat" | "unsafe-mode",
): StateDirectoryFileSystem {
  const uid = currentUid();
  const info: DirectoryInfo = {
    isDirectory: () => true,
    isSymbolicLink: () => false,
    mode: 0o40700,
    ...(uid === undefined ? {} : { uid }),
  };
  return {
    mkdir: async () => undefined,
    lstat: async () => info,
    realpath: async (value) => value,
    chmod: async () => {
      if (failure === "chmod") throw new Error("chmod failed");
    },
    stat: async () => {
      if (failure === "stat") throw new Error("stat failed");
      return failure === "unsafe-mode" ? { ...info, mode: 0o40777 } : info;
    },
  };
}
describe("private state directory", () => {
  it("propagates chmod and post-chmod stat failures", async () => {
    await expect(
      prepareStateDirectory("/synthetic", {
        fs: injectedFs("chmod"),
        platform: "linux",
        getuid: currentUid,
      }),
    ).rejects.toThrow("chmod failed");
    await expect(
      prepareStateDirectory("/synthetic", {
        fs: injectedFs("stat"),
        platform: "linux",
        getuid: currentUid,
      }),
    ).rejects.toThrow("stat failed");
    await expect(
      prepareStateDirectory("/synthetic", {
        fs: injectedFs("unsafe-mode"),
        platform: "linux",
        getuid: currentUid,
      }),
    ).rejects.toThrow("STATE_DIRECTORY_MODE_UNSAFE");
  });
});
