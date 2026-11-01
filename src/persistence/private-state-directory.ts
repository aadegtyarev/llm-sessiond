import { chmod, lstat, mkdir, realpath, stat } from "node:fs/promises";
import { SafeValidationError } from "../core/generic-json.js";

export interface DirectoryInfo {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  mode: number;
  uid?: number;
}
export interface StateDirectoryFileSystem {
  mkdir(
    path: string,
    options: { recursive: true; mode: number },
  ): Promise<unknown>;
  lstat(path: string): Promise<DirectoryInfo>;
  realpath(path: string): Promise<string>;
  chmod(path: string, mode: number): Promise<void>;
  stat(path: string): Promise<DirectoryInfo>;
}
const nativeFs: StateDirectoryFileSystem = {
  mkdir,
  lstat,
  realpath,
  chmod,
  stat,
};
export interface StateDirectoryOptions {
  fs?: StateDirectoryFileSystem;
  platform?: NodeJS.Platform;
  getuid?: () => number | undefined;
}
export async function prepareStateDirectory(
  directory: string,
  options: StateDirectoryOptions = {},
): Promise<string> {
  const fs = options.fs ?? nativeFs;
  const platform = options.platform ?? process.platform;
  const getuid = options.getuid ?? (() => process.getuid?.());
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const finalPath = await fs.lstat(directory);
  assertDirectory(finalPath, getuid);
  const canonical = await fs.realpath(directory);
  assertDirectory(await fs.lstat(canonical), getuid);
  if (platform !== "win32") {
    await fs.chmod(canonical, 0o700);
    const linkInfo = await fs.lstat(canonical);
    assertDirectory(linkInfo, getuid);
    const verified = await fs.stat(canonical);
    assertDirectory(verified, getuid);
    if ((verified.mode & 0o077) !== 0)
      throw new SafeValidationError("STATE_DIRECTORY_MODE_UNSAFE");
  }
  return canonical;
}
function assertDirectory(
  info: DirectoryInfo,
  getuid: () => number | undefined,
): void {
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new SafeValidationError("STATE_DIRECTORY_NOT_SAFE");
  const uid = getuid();
  if (uid !== undefined && info.uid !== uid)
    throw new SafeValidationError("STATE_DIRECTORY_OWNER_MISMATCH");
}
