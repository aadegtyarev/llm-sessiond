import { access, constants, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ControlPlaneError } from "./control-plane-error.js";
export function isQualifiedWindowsCwd(cwd: string): boolean {
  return (
    /^[A-Za-z]:[\\/]/.test(cwd) ||
    /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+(?:[\\/].*)?$/.test(cwd)
  );
}
export async function validateLifecycleCwd(
  cwd: string,
  platform = process.platform,
): Promise<string> {
  if (platform === "win32" && !isQualifiedWindowsCwd(cwd))
    throw new ControlPlaneError("INVALID_CWD");
  if (!path.isAbsolute(cwd)) throw new ControlPlaneError("INVALID_CWD");
  try {
    const canonical = await realpath(cwd);
    if (!(await stat(canonical)).isDirectory())
      throw new ControlPlaneError("INVALID_CWD");
    await access(canonical, constants.R_OK | constants.X_OK);
    return canonical;
  } catch {
    throw new ControlPlaneError("INVALID_CWD");
  }
}
